#!/usr/bin/env bash
#
# Zips build_macos/dist/Chroniq.app into build_macos/dist/Chroniq.zip
# the RIGHT way - using `ditto`, which is macOS-aware.
#
# Only use a zip if something downstream requires it (e.g. a GitHub
# release asset, or `notarytool` which accepts .zip). For handing the
# app to a person, prefer the DMG (make_dmg.sh).
#
# NEVER use Finder "Compress" or plain `zip` on a .app: they create a
# "__MACOSX" folder full of ._ files and can strip the symlinks /
# exec bit, which makes the other Mac report "Chroniq is damaged".
set -euo pipefail
cd "$(dirname "$0")"

APP="dist/Chroniq.app"
ZIP="dist/Chroniq.zip"
[ -d "$APP" ] || { echo "build first: build_macos/build.sh"; exit 1; }

xattr -cr "$APP"
rm -f "$ZIP"
# --keepParent keeps "Chroniq.app" as the top entry; --sequesterRsrc
# stores mac metadata in an AppleDouble sidecar the way the OS expects
# (this is NOT the same as the "__MACOSX" mess a plain zip makes).
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"

echo
echo "wrote build_macos/$ZIP  (unsigned - quarantined on other Macs;"
echo "recipients need: xattr -dr com.apple.quarantine Chroniq.app)"
