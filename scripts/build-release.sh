#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
build_dir="$PWD/build/macos"
app="$build_dir/Build/Products/Release/Vize.app"

xcodebuild -workspace macos/vize.xcworkspace -scheme vize-macOS \
  -configuration Release -destination "platform=macOS,arch=$(uname -m)" \
  -derivedDataPath "$build_dir" CODE_SIGN_IDENTITY=- CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO \
  VIZE_API_BASE_URL="${VIZE_API_BASE_URL:-}" build

test -s "$app/Contents/Resources/main.jsbundle"
# Xcode can skip signing on an incremental build that only replaces the JS bundle.
if ! codesign --verify --strict "$app" 2>/dev/null; then
  codesign --force --sign - "$app"
fi
codesign --verify --deep --strict "$app"
printf '\n%s\n' "$app"
