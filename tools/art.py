"""Produce replaceable studio packshots and seamless typographic demo wraps."""
import json, math, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageColor, ImageFilter
root=Path(__file__).resolve().parents[1]/'dist'
products=json.loads((root/'catalog.js').read_text().split('window.catalog = ')[1].strip()[:-1])
fontdir='/usr/share/fonts/opentype/urw-base35/'
def lettering(canvas, text, y, w, font, color, x=1024):
    f=ImageFont.truetype(str(font),190)
    box=f.getbbox(text,stroke_width=1)
    layer=Image.new('RGBA',(box[2]-box[0]+10,box[3]-box[1]+10))
    ImageDraw.Draw(layer).text((5-box[0],5-box[1]),text,font=f,fill=color,stroke_width=1,stroke_fill=color)
    layer=layer.resize((w,round(w*layer.height/layer.width)),Image.Resampling.LANCZOS)
    canvas.paste(layer,(x-w//2,round(y-layer.height/2)),layer)
for p in products:
    if p.get('aspect'): continue
    w,h=2048,1152
    im=Image.new('RGB',(w,h),p['color']); d=ImageDraw.Draw(im)
    cola=p['brand']=='Coca-Cola'
    for x in range(w):
        a=x/w*math.tau
        y=780+int(100*math.sin(a+.4)+52*math.sin(2*a-.8))
        thick=int(28+24*math.cos(a-.2))
        d.line((x,y,x,y+thick),fill='#fff4e9')
        d.line((x,y+thick+6,x,y+thick+9),fill='#ffcbb0')
    ink='#fffaf0'
    lettering(im,p['variant'].upper(),247,300,root/'upright.ttf',ink)
    lettering(im,p['brand'],532,840 if cola else 687,fontdir+'Z003-MediumItalic.otf' if cola else root/'display.ttf',ink)
    lettering(im,'330 ml',967,112,root/'upright.ttf',ink)
    for pos in [120,1928]:
        lettering(im,p['kind'].upper(),472,178,root/'upright.ttf',ink,pos)
        lettering(im,'330 ml',585,95,root/'upright.ttf',ink,pos)
    random.seed(7)
    for i in range(340):
        x=random.randrange(w);y=random.randrange(h);r=random.choice([1,2,2,3,4])
        d.arc((x-r,y-r,x+r,y+r),25,148,fill='#ceaaa1',width=1)
        d.arc((x-r,y-r,x+r,y+r),205,290,fill='#fff3db',width=1)
    im.save(root/p['wrap'],quality=94)
    # Orthographic cylindrical projection for the WebGL fallback and shop photos.
    W,H=560,980; yy,xx=np.mgrid[:H,:W]; x=(xx-W/2)/249; v=(yy-41)/895
    rad=np.interp(v,[0,.018,.045,.08,.90,.955,.98,1],[.866,.866,.918,.993,1,.972,.893,.86])
    theta=np.arcsin(np.clip(x/rad,-1,1)); normal=np.cos(theta)
    u=np.mod(.5+theta/(2*np.pi),1)
    pixels=np.array(im)[np.clip((v*h).astype(int),0,h-1),np.clip((u*w).astype(int),0,w-1)]
    light=.42+.51*normal+.32*np.exp(-((x+.49)/.16)**2)+.18*np.exp(-((x-.79)/.09)**2)
    spec=37*np.exp(-((x+.72)/.055)**2)+24*np.exp(-((x-.69)/.035)**2)
    rgb=np.uint8(np.clip(pixels*light[:,:,None]+spec[:,:,None],0,255))
    mask=(np.abs(x)<rad)&(v>=0)&(v<=1)
    out=Image.fromarray(np.dstack([rgb,mask.astype('uint8')*255])); draw=ImageDraw.Draw(out)
    for cy,ry in [(931,11),(42,17)]:
        for j in range(ry*2):
            lum=int(118+105*math.sin(j/(ry*2)*math.pi)**2)
            draw.ellipse((64,cy-ry+j*.4,496,cy+ry-j*.43),fill=(lum,lum,lum+1,255))
    draw.ellipse((71,27,490,52),fill='#b8b9b8',outline='#646563',width=2)
    draw.ellipse((239,30,320,44),outline='#676868',fill='#dddeda',width=3)
    draw.ellipse((259,32,286,39),fill='#888a88')
    out.thumbnail((336,588),Image.Resampling.LANCZOS);out.save(root/p['image'])
