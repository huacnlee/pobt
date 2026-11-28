//! DDS textures (optionally zstd-compressed, as POB2 ships them): the
//! uncompressed and BCn formats POB uses, every array layer of mip 0.

use std::path::Path;

use image::RgbaImage;

const DDPF_FOURCC: u32 = 0x4;

fn u32_at(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

#[derive(Clone, Copy, Debug)]
enum Format {
    Rgba8,
    Bgra8,
    Bc1,
    Bc2,
    Bc3,
    Bc4,
    Bc5,
    Bc7,
}

impl Format {
    fn block_bytes(self) -> Option<usize> {
        match self {
            Format::Bc1 | Format::Bc4 => Some(8),
            Format::Bc2 | Format::Bc3 | Format::Bc5 | Format::Bc7 => Some(16),
            _ => None,
        }
    }
}

fn dxgi(f: u32) -> Option<Format> {
    Some(match f {
        28 | 29 => Format::Rgba8,
        87 | 91 => Format::Bgra8,
        71 | 72 => Format::Bc1,
        74 | 75 => Format::Bc2,
        77 | 78 => Format::Bc3,
        80 | 81 => Format::Bc4,
        83 | 84 => Format::Bc5,
        98 | 99 => Format::Bc7,
        _ => return None,
    })
}

/// All layers of mip 0.
pub fn decode_layers(path: &Path) -> Option<Vec<RgbaImage>> {
    let raw = std::fs::read(path).ok()?;
    let data = if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("zst")) {
        zstd::stream::decode_all(raw.as_slice()).ok()?
    } else {
        raw
    };
    if data.len() < 128 || &data[0..4] != b"DDS " {
        return None;
    }
    let height = u32_at(&data, 12) as usize;
    let width = u32_at(&data, 16) as usize;
    let mips = (u32_at(&data, 28) as usize).max(1);
    let pf_flags = u32_at(&data, 80);
    let fourcc = &data[84..88];
    let mut offset = 128;
    let mut layers = 1usize;
    let format = if pf_flags & DDPF_FOURCC != 0 {
        match fourcc {
            b"DXT1" => Format::Bc1,
            b"DXT2" | b"DXT3" => Format::Bc2,
            b"DXT4" | b"DXT5" => Format::Bc3,
            b"ATI1" | b"BC4U" => Format::Bc4,
            b"ATI2" | b"BC5U" => Format::Bc5,
            b"DX10" => {
                offset += 20;
                layers = (u32_at(&data, 128 + 12) as usize).max(1);
                dxgi(u32_at(&data, 128))?
            }
            _ => return None,
        }
    } else {
        let rmask = u32_at(&data, 92);
        if rmask == 0x00ff0000 { Format::Bgra8 } else { Format::Rgba8 }
    };

    let level_size = |w: usize, h: usize| match format.block_bytes() {
        Some(bb) => w.div_ceil(4).max(1) * h.div_ceil(4).max(1) * bb,
        None => w * h * 4,
    };
    let layer_size: usize = (0..mips).map(|m| level_size((width >> m).max(1), (height >> m).max(1))).sum();

    let mut out = Vec::with_capacity(layers);
    for layer in 0..layers {
        let start = offset + layer * layer_size;
        let bytes = data.get(start..start + level_size(width, height))?;
        let mut pixels = vec![0u32; width * height];
        let ok = match format {
            Format::Rgba8 | Format::Bgra8 => {
                for (i, px) in bytes.chunks_exact(4).enumerate() {
                    let (r, b) = if matches!(format, Format::Bgra8) { (px[2], px[0]) } else { (px[0], px[2]) };
                    pixels[i] = u32::from_le_bytes([b, px[1], r, px[3]]);
                }
                Ok(())
            }
            Format::Bc1 => texture2ddecoder::decode_bc1(bytes, width, height, &mut pixels),
            Format::Bc2 => texture2ddecoder::decode_bc2(bytes, width, height, &mut pixels),
            Format::Bc3 => texture2ddecoder::decode_bc3(bytes, width, height, &mut pixels),
            Format::Bc4 => texture2ddecoder::decode_bc4(bytes, width, height, &mut pixels),
            Format::Bc5 => texture2ddecoder::decode_bc5(bytes, width, height, &mut pixels),
            Format::Bc7 => texture2ddecoder::decode_bc7(bytes, width, height, &mut pixels),
        };
        ok.ok()?;
        // texture2ddecoder writes BGRA as little-endian u32s.
        let mut rgba = Vec::with_capacity(width * height * 4);
        for p in pixels {
            let [b, g, r, a] = p.to_le_bytes();
            rgba.extend_from_slice(&[r, g, b, a]);
        }
        out.push(RgbaImage::from_raw(width as u32, height as u32, rgba)?);
    }
    Some(out)
}

pub fn decode(path: &Path) -> Option<RgbaImage> {
    decode_layers(path)?.into_iter().next()
}
