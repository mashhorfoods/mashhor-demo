#!/bin/sh
# The About page's photographs: full size (1672 wide) plus 640 and 1280 wide
# copies, 16:9, into overlay/assets. Run once when an image changes:
#   FFMPEG=/path/to/ffmpeg tools/about-images/encode.sh <folder with about-hero.png about-team.png about-process.png>
set -e
FF=${FFMPEG:-ffmpeg}
IN=${1:?folder with the source PNGs}
OUT="$(dirname "$0")/../../overlay/assets"
for name in about-hero about-team about-process; do
  "$FF" -v error -y -i "$IN/$name.png" -vf "crop=1672:940:0:0" -c:v libwebp -quality 82 -compression_level 6 "$OUT/$name.webp"
  for w in 640 1280; do
    "$FF" -v error -y -i "$IN/$name.png" -vf "crop=1672:940:0:0,scale=$w:-2:flags=lanczos" -c:v libwebp -quality 80 -compression_level 6 "$OUT/$name-$w.webp"
  done
  echo "$name"
done
