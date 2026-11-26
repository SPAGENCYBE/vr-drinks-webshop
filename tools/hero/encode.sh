#!/bin/sh
set -eu
: "${VR_RENDER_DIR:?Stel de renderwerkmap in}"
frames="$VR_RENDER_DIR/frames"
grade='hqdn3d=5:4:3:2,nlmeans=s=4:p=5:r=7'
ffmpeg -hide_banner -loglevel error -y -framerate 30 -i "$frames/%03d.png" -vf "$grade" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart dist/hero/impact-film.mp4
for item in '000 start' '024 peak'; do
  set -- $item
  ffmpeg -hide_banner -loglevel error -y -i "$frames/$1.png" -vf "$grade" -frames:v 1 -c:v libwebp -quality 92 "dist/hero/impact-$2.webp"
done
