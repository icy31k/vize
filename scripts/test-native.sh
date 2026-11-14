#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
test_dir="$(mktemp -d)"
trap 'rm -rf -- "$test_dir"' EXIT

xcrun swiftc -module-cache-path "$test_dir/modules" \
  -target "$(uname -m)-apple-macosx14.0" \
  macos/vize-macOS/CapturePolicy.swift macos/vize-macOS/ForegroundApp.swift macos/vize-macOS/Store.swift macos/vize-macOS/TimerState.swift tests/NativeChecks.swift \
  -lsqlite3 -o "$test_dir/checks"
"$test_dir/checks" "$test_dir/activity.sqlite3"
