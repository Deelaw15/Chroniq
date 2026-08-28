#!/usr/bin/env bash
#
# Signs, notarizes and staples Chroniq.app + Chroniq.dmg so Gatekeeper
# lets other people open it without scary warnings.
#
# Prerequisites (one-time):
#   1. Apple Developer Program membership ($99/yr).
#   2. A "Developer ID Application" certificate in your login keychain
#      (Xcode -> Settings -> Accounts -> Manage Certificates -> +).
#   3. A notarytool credential profile stored in the keychain:
#        xcrun notarytool store-credentials chroniq-notary \
#          --apple-id "you@example.com" \
#          --team-id "YOURTEAMID" \
#          --password "app-specific-password"   # appleid.apple.com -> App-Specific Passwords
#
# Usage:
#   export DEV_ID="Developer ID Application: Your Name (YOURTEAMID)"
#   build_macos/build.sh
#   build_macos/sign_and_notarize.sh
set -euo pipefail
cd "$(dirname "$0")"

APP="dist/Chroniq.app"
DMG="dist/Chroniq.dmg"
ENTITLEMENTS="entitlements.plist"
: "${DEV_ID:?set DEV_ID to your 'Developer ID Application: NAME (TEAMID)' identity}"
NOTARY_PROFILE="${NOTARY_PROFILE:-chroniq-notary}"

[ -d "$APP" ] || { echo "build first: build_macos/build.sh"; exit 1; }

echo "==> Signing bundled binaries + app (hardened runtime)"
# Sign nested Mach-O first, then the app itself.
find "$APP/Contents" \( -name "*.so" -o -name "*.dylib" \) -print0 \
    | xargs -0 -I{} codesign --force --timestamp --options runtime --sign "$DEV_ID" "{}"
codesign --force --deep --timestamp --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign "$DEV_ID" "$APP"
codesign --verify --strict --verbose=2 "$APP"

echo "==> Building DMG"
./make_dmg.sh

echo "==> Signing DMG"
codesign --force --timestamp --sign "$DEV_ID" "$DMG"

echo "==> Notarizing (this uploads the DMG to Apple and waits)"
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait

echo "==> Stapling the notarization ticket"
xcrun stapler staple "$APP"
xcrun stapler staple "$DMG"

echo "==> Verifying Gatekeeper acceptance"
spctl --assess --type execute --verbose=2 "$APP" || true
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG" || true

echo
echo "Done. Ship build_macos/$DMG"
