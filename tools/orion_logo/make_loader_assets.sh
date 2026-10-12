#!/bin/zsh
# Loader assets for the Orion splash from the loop frames: animated WebP (all browsers), WebM VP9 alpha (Chromium/Firefox), still WebP.
set -e
FRAMES="$1"; OUT="$2"; SIZE="${3:-540}"; SP="$4"
mkdir -p "$OUT" "$SP/loop_small"
for f in "$FRAMES"/frame_*.png; do sips -Z "$SIZE" "$f" --out "$SP/loop_small/$(basename "$f")" >/dev/null; done
img2webp -loop 0 -mixed -q 62 -m 6 -d 40 "$SP"/loop_small/frame_*.png -o "$OUT/orion-loader-motion.webp"
cwebp -q 92 -alpha_q 100 "$SP/loop_small/frame_0001.png" -o "$OUT/orion-loader-still.webp" >/dev/null 2>&1
ls -la "$OUT"/orion-loader-*
