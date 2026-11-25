#!/usr/bin/env bash
# Installs the NSH CLI of the commit `ext/pobt-native/Cargo.lock` locks nsh-core to (NSH's `nightly` tag), into
# `.nsh/cli`, and adds its `bin` to GitHub Actions' PATH. nsh stops on an app whose nsh-core is from another commit,
# so the CLI must be exactly that one: the prebuilt nightly while it is still that commit, else built from source.
set -euo pipefail
cd "$(dirname "$0")/.."

revision=$(sed -n 's|^source = "git+https://github.com/longbridge/nsh?tag=nightly#\([0-9a-f]\{40\}\)"$|\1|p' \
  ext/pobt-native/Cargo.lock | sort -u)
[ "$(printf '%s\n' "$revision" | wc -l)" -eq 1 ] && [ -n "$revision" ] ||
  { echo "Cargo.lock locks no single nsh revision: '$revision'" >&2; exit 1; }
echo "NSH revision: $revision"

dir="$PWD/.nsh/cli"
windows=false
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) windows=true ;; esac
nsh="$dir/bin/nsh"
$windows && nsh="$nsh.exe"

matches() { [ -x "$nsh" ] && "$nsh" --version | grep -q " (${revision:0:7} "; }

if ! matches; then
  nightly=$(curl -fsSL https://github.com/longbridge/nsh/releases/download/nightly/nsh-release.json | jq -r .commit || true)
  if [ "$nightly" = "$revision" ]; then
    echo "Installing the prebuilt nightly"
    if $windows; then
      NSH_VERSION=nightly NSH_INSTALL_DIR="$(cygpath -w "$dir")" \
        powershell -NoProfile -ExecutionPolicy Bypass -Command 'irm https://nsh.dev/install.ps1 | iex'
    else
      curl -fsSL https://nsh.dev/install.sh | NSH_INSTALL_DIR="$dir" sh -s -- --nightly
    fi
  fi
fi

if ! matches; then
  echo "The prebuilt nightly is ${nightly:-unknown}: building $revision"
  src="$PWD/.nsh/toolchain/$revision"
  [ -d "$src/.git" ] || git init -q "$src"
  git -C "$src" cat-file -e "$revision^{commit}" 2> /dev/null ||
    git -C "$src" fetch -q --depth 1 https://github.com/longbridge/nsh.git "$revision"
  git -C "$src" checkout -q --detach "$revision"
  (cd "$src" && cargo build --locked --release -p nsh-cli --target-dir target)
  rm -rf "$dir"
  mkdir -p "$dir/bin"
  cp "$src/target/release/nsh$($windows && echo .exe)" "$dir/bin/"
fi

matches || { echo "nsh is not $revision: $("$nsh" --version)" >&2; exit 1; }
"$nsh" --version
[ -z "${GITHUB_PATH:-}" ] || echo "$dir/bin" >> "$GITHUB_PATH"
