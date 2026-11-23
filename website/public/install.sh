#!/usr/bin/env bash
# Installs POBT on macOS or Linux, or updates it:
#   curl -fsSL https://huacnlee.github.io/pobt/install.sh | bash
# POBT_BASE_URL  where the release assets are (default: the latest GitHub release)
set -euo pipefail

BASE="${POBT_BASE_URL:-https://github.com/huacnlee/pobt/releases/latest/download}"

if [ -t 1 ]; then B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; R=$'\e[31m'; N=$'\e[0m'; else B= D= G= R= N=; fi
step() { printf "  %s%-22s%s" "$D" "$1" "$N"; }
ok()   { printf "%s✓%s %s\n" "$G" "$N" "${1:-}"; }
die()  { printf "%s✗%s %s\n" "$R" "$N" "$1"; exit 1; }

printf "\n%sPOBT%s — Path of Building, in your language\n\n" "$B" "$N"

step "platform"
case "$(uname -s)" in
  Darwin) OS=macos ;;
  Linux) OS=linux ;;
  *) die "POBT runs on macOS and Linux here; on Windows use install.ps1" ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH=x86_64 ;;
  arm64|aarch64) ARCH=aarch64 ;;
  *) die "unsupported CPU: $(uname -m)" ;;
esac
[ "$OS-$ARCH" = "macos-x86_64" ] && die "POBT for macOS needs Apple silicon (arm64)"
ASSET="pobt-$OS-$ARCH.tar.gz"
ok "$OS $ARCH"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

step "download"
curl -fsSL -o "$WORK/$ASSET" "$BASE/$ASSET" || die "could not download $BASE/$ASSET"
curl -fsSL -o "$WORK/sha256sums" "$BASE/sha256sums" || die "could not download $BASE/sha256sums"
ok "$ASSET"

step "checksum"
want="$(awk -v a="$ASSET" '{ f = $2; sub(/^\*/, "", f); if (f == a) { print $1; exit } }' "$WORK/sha256sums")"
if command -v sha256sum >/dev/null; then have="$(sha256sum "$WORK/$ASSET" | awk '{print $1}')"; else have="$(shasum -a 256 "$WORK/$ASSET" | awk '{print $1}')"; fi
[ -n "$want" ] && [ "$want" = "$have" ] || die "the checksum of $ASSET does not match; nothing was installed"
ok

mkdir -p "$WORK/unpacked"
tar -xzf "$WORK/$ASSET" -C "$WORK/unpacked"

step "install"
if [ "$OS" = macos ]; then
  [ -d "$WORK/unpacked/POBT.app" ] || die "$ASSET holds no POBT.app"
  if [ -w /Applications ]; then APPS=/Applications; else APPS="$HOME/Applications"; mkdir -p "$APPS"; fi
  pkill -f "$APPS/POBT.app/Contents/MacOS/POBT" 2>/dev/null || true
  rm -rf "$APPS/POBT.app"
  mv "$WORK/unpacked/POBT.app" "$APPS/POBT.app"
  xattr -dr com.apple.quarantine "$APPS/POBT.app" 2>/dev/null || true
  ok "$APPS/POBT.app"
  printf "\n  Open POBT from Launchpad or %s. It needs Path of Building Community installed.\n\n" "$APPS"
else
  [ -x "$WORK/unpacked/POBT/POBT" ] || die "$ASSET holds no POBT/POBT"
  DIR="${XDG_DATA_HOME:-$HOME/.local/share}/pobt"
  BIN="$HOME/.local/bin"
  APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  pkill -f "$DIR/POBT" 2>/dev/null || true
  rm -rf "$DIR"
  mkdir -p "$(dirname "$DIR")" "$BIN" "$APPS"
  mv "$WORK/unpacked/POBT" "$DIR"
  ln -sf "$DIR/POBT" "$BIN/pobt"
  cat > "$APPS/com.huacnlee.pobt.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=POBT
Comment=Path of Building, in your language
Exec=$DIR/POBT
Path=$DIR
Icon=$DIR/com.huacnlee.pobt.png
Categories=Game;Utility;
Terminal=false
DESKTOP
  ok "$DIR"
  printf "\n  Open POBT from your app launcher or run pobt. It needs Path of Building Community installed.\n"
  case ":$PATH:" in *":$BIN:"*) ;; *) printf "  %sAdd ~/.local/bin to your PATH to use the pobt command.%s\n" "$D" "$N" ;; esac
  echo
fi
