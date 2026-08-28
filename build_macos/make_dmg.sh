#!/usr/bin/env bash
#
# Packages build_macos/dist/Chroniq.app into a drag-to-install DMG at
# build_macos/dist/Chroniq.dmg. Run build.sh first.
set -euo pipefail
cd "$(dirname "$0")"

APP="dist/Chroniq.app"
DMG="dist/Chroniq.dmg"
[ -d "$APP" ] || { echo "build first: build_macos/build.sh"; exit 1; }

STAGING="$(mktemp -d)/Chroniq"
mkdir -p "$STAGING"
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

rm -f "$DMG"
hdiutil create \
    -volname "Chroniq" \
    -srcfolder "$STAGING" \
    -ov -format UDZO \
    "$DMG"

echo "wrote build_macos/$DMG"
