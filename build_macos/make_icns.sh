#!/usr/bin/env bash
#
# Generates build_macos/Chroniq.icns from frontend/logo.png using the
# macOS-only `sips` and `iconutil` tools. Run before build.sh (build.sh
# calls it for you).
#
# NOTE: logo.png is only 256x256, so the 512@2x (1024px) slice is
# upscaled and will look soft. Drop a 1024x1024 source in as
# build_macos/icon_src.png and it'll be used instead.
set -euo pipefail
cd "$(dirname "$0")"

SRC="icon_src.png"
[ -f "$SRC" ] || SRC="../frontend/logo.png"
[ -f "$SRC" ] || { echo "no icon source found ($SRC)"; exit 1; }

WORK="$(mktemp -d)/Chroniq.iconset"
mkdir -p "$WORK"

for size in 16 32 128 256 512; do
    sips -z "$size" "$size"           "$SRC" --out "$WORK/icon_${size}x${size}.png"    >/dev/null
    sips -z "$((size*2))" "$((size*2))" "$SRC" --out "$WORK/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$WORK" -o Chroniq.icns
echo "wrote build_macos/Chroniq.icns (source: $SRC)"
