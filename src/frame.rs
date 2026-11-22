//! A frame POB drew: draw commands in paint order, ready for the canvas.

use std::sync::Arc;

use crate::text::Color;

#[derive(Debug, Clone, PartialEq)]
pub enum Cmd {
    /// A rectangle of colour.
    Rect { rect: [f32; 4], color: Color },
    /// Part of an image (`src` in its pixels) into `dst`.
    Image { uri: Arc<str>, src: [f32; 4], dst: [f32; 4], alpha: f32 },
    /// Part of an image mapped by an affine transform from its pixels.
    ImageAffine { uri: Arc<str>, src: [f32; 4], dst: [f32; 4], m: [f32; 6], clip: [f32; 8], alpha: f32 },
    /// A filled quadrilateral of colour.
    Poly { pts: [f32; 8], color: Color },
    /// A run of text, its top-left at (`x`, `y`) and its baseline below.
    Text { x: f32, y: f32, baseline: f32, font: Arc<str>, text: Arc<str>, color: Color },
}

#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    /// The viewport: drawing is offset to its corner and clipped to it.
    pub viewport: [f32; 4],
    pub cmd: Cmd,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Frame {
    pub width: f32,
    pub height: f32,
    pub clear: Color,
    pub items: Vec<Item>,
}
