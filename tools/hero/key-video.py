"""Remove the white studio backing; retain the moving can and soft liquid edges."""
import subprocess
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

source, destination = map(Path, sys.argv[1:3])
w, h = 1280, 720
def ff(args, **kwargs):
    return subprocess.Popen(['ffmpeg', '-v', 'error', '-y', *args], **kwargs)
reader = ff(['-i', str(source), '-map', '0:v', '-vf', f'scale={w}:{h}:flags=lanczos',
             '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
writer = ff(['-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', f'{w}x{h}', '-framerate','24',
             '-i','-', '-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-row-mt','1','-threads','6',
             '-deadline','realtime','-cpu-used','6','-crf','27','-b:v','0','-auto-alt-ref','0',
             str(destination/'vr-splash.webm')],stdin=subprocess.PIPE)
frame=0
while True:
    data=reader.stdout.read(w*h*3)
    if not data: break
    rgb=np.frombuffer(data,np.uint8).reshape(h,w,3)
    # Estimate the actual off-white for each row from the clean starting frame.
    if frame==0:
        paper=np.median(rgb[:h-36,:80],axis=1)
        paper=np.pad(paper,((0,36),(0,0)),mode='edge').astype('f')[:,None,:]
    darkness=np.max(paper-rgb,axis=2)
    # Track the aluminium lid by its wide, dark horizontal rim.
    center=darkness[:,w//2-80:w//2+80]
    top=int(np.flatnonzero((center>75).sum(axis=1)>85)[0])
    if frame==0: settled_top=top
    settled_top=max(settled_top,top)
    if frame==0:
        start=top
        body=np.zeros((h,w),np.float32)
        for y in range(h-40):
            xs=np.flatnonzero(darkness[y,w//3:2*w//3]>28)+w//3
            if len(xs)>4: body[y,xs[0]+1:xs[-1]]=1
        body=gaussian_filter(body,.7)
    mask=np.zeros_like(body)
    dy=settled_top-start
    if dy>=0:mask[dy:]=body[:h-dy]
    else:mask[:h+dy]=body[-dy:]
    # Undo white compositing at the liquid edges and in translucent sheets.
    d=np.maximum(darkness-6,0)
    alpha=np.maximum(mask,np.minimum(1,d/201))
    color=np.clip(paper+(rgb-paper)/np.maximum(alpha[:,:,None],.002),0,255)
    out=np.empty((h,w,4),np.uint8);out[:,:,:3]=color;out[:,:,3]=np.rint(alpha*255)
    writer.stdin.write(out.tobytes())
    if frame==0:Image.fromarray(out).save(destination/'vr-start.webp',quality=94,method=4)
    frame+=1
if frame==0:raise ValueError('Video contains no frames')
Image.fromarray(out).save(destination/'vr-final.webp',quality=94,method=4)
writer.stdin.close()
if reader.wait() or writer.wait():raise RuntimeError('Video conversion failed')
print(frame, 'frames')
