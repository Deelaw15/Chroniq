#!/usr/bin/env bash
#
# Builds Chroniq.app on macOS. Run from anywhere with your project
# venv activated:
#
#     source .venv/bin/activate
#     build_macos/build.sh
#
# Output: build_macos/dist/Chroniq.app
#
# This must run on a Mac - PyInstaller cannot cross-compile. It builds
# for whatever architecture your Python is (arm64 on Apple Silicon,
# x86_64 on Intel). For a universal build, use a universal2 Python and
# set target_arch="universal2" in chroniq.spec.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing build dependencies"
python -m pip install --quiet --upgrade pip
python -m pip install --quiet pyinstaller
python -m pip install --quiet -r requirements.txt

echo "==> Generating app icon"
bash build_macos/make_icns.sh || echo "   (icon generation failed - continuing without a custom icon)"

echo "==> Running PyInstaller"
pyinstaller build_macos/chroniq.spec \
    --distpath build_macos/dist \
    --workpath build_macos/build \
    --noconfirm

echo
if [ -d "build_macos/dist/Chroniq.app" ]; then
    echo "Build succeeded: build_macos/dist/Chroniq.app"
    echo
    echo "Test it:   open build_macos/dist/Chroniq.app"
    echo "Logs:      ~/Library/Application Support/Chroniq/logs/tracker.log"
    echo
    echo "Unsigned builds are quarantined when downloaded. To run a copy"
    echo "that came from another Mac / the internet:"
    echo "    xattr -dr com.apple.quarantine /path/to/Chroniq.app"
    echo
    echo "For real distribution, sign + notarize:  build_macos/sign_and_notarize.sh"
else
    echo "Build failed - check the output above."
    exit 1
fi
