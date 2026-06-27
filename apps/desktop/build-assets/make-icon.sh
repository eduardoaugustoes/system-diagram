#!/usr/bin/env bash
# Generates icon.icns: a dark rounded square (matches the in-app logo mark).
set -euo pipefail
cd "$(dirname "$0")"
ICONSET="icon.iconset"
rm -rf "$ICONSET" && mkdir "$ICONSET"

# Base 1024px PNG via Swift/CoreGraphics (no external deps on macOS).
cat > /tmp/mkicon.swift <<'SWIFT'
import AppKit
let size = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
NSColor(red: 0.96, green: 0.96, blue: 0.95, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()
let inset: CGFloat = 200
let rect = NSRect(x: inset, y: inset, width: CGFloat(size)-2*inset, height: CGFloat(size)-2*inset)
let path = NSBezierPath(roundedRect: rect, xRadius: 90, yRadius: 90)
NSColor(red: 0.11, green: 0.10, blue: 0.09, alpha: 1).setFill()
path.fill()
img.unlockFocus()
let tiff = img.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: "/tmp/icon-1024.png"))
SWIFT
swift /tmp/mkicon.swift

for s in 16 32 64 128 256 512 1024; do
  sips -z $s $s /tmp/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
done
cp "$ICONSET/icon_32x32.png"     "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_64x64.png"     "$ICONSET/icon_32x32@2x.png"
cp "$ICONSET/icon_256x256.png"   "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_512x512.png"   "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_1024x1024.png" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o icon.icns
rm -rf "$ICONSET" /tmp/mkicon.swift /tmp/icon-1024.png
echo "wrote icon.icns"
