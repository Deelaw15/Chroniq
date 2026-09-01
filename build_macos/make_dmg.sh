#!/usr/bin/env bash
#
# Packages build_macos/dist/Chroniq.app into a drag-to-install DMG at
# build_macos/dist/Chroniq.dmg. Run build.sh first.
#
# A DMG is the right way to ship a Mac app: it's a real disk image, so
# it preserves the bundle's symlinks, executable bits and resource
# forks. Do NOT zip the .app with Finder "Compress" or plain `zip` -
# that produces a "__MACOSX" folder of ._ files AND can break the
# bundle so the other Mac says "Chroniq is damaged". Use this, or
# build_macos/make_zip.sh if you specifically need a zip.
#
# This DMG is NOT signed or notarized. On another Mac it will be
# quarantined and refuse to open until you either:
#   - run:  xattr -dr com.apple.quarantine /Applications/Chroniq.app
#   - or:   System Settings > Privacy & Security > "Open Anyway"
# The permanent fix is build_macos/sign_and_notarize.sh (needs an
# Apple Developer account).
set -euo pipefail
cd "$(dirname "$0")"

APP="dist/Chroniq.app"
DMG="dist/Chroniq.dmg"
[ -d "$APP" ] || { echo "build first: build_macos/build.sh"; exit 1; }

STAGING="$(mktemp -d)"
# ditto copies the bundle faithfully (symlinks, perms, forks).
ditto "$APP" "$STAGING/Chroniq.app"
ln -s /Applications "$STAGING/Applications"

# Strip extended attributes (quarantine, provenance, Finder junk) so
# they don't ride along into the image.
xattr -cr "$STAGING/Chroniq.app"
find "$STAGING" -name '.DS_Store' -delete

rm -f "$DMG"
hdiutil create \
    -volname "Chroniq" \
    -srcfolder "$STAGING" \
    -ov -format UDZO \
    "$DMG"

rm -rf "$STAGING"
echo
echo "wrote build_macos/$DMG  (unsigned - see the note at the top of this script)"
