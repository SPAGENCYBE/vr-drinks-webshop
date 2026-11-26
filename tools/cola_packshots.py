"""Project an official front packshot onto the front half of a cylindrical UV map."""
from pathlib import Path
from PIL import Image
import numpy as np
import sys

def prepare(source, stem, back=(181,9,25)):
    dest = Path(__file__).resolve().parents[1] / 'dist' / 'art'
    original = Image.open(source).convert('RGBA')
    original = original.crop(original.getchannel('A').getbbox())
    photo = original.copy()
    photo.thumbnail((700, 1400), Image.Resampling.LANCZOS)
    photo.save(dest / (stem + '.png'), optimize=True)
    width, height = 2048, 1536
    angle = (np.arange(width) / width - .5) * 2 * np.pi
    # Front pixels originate from the manufacturer's photo. The unseen half has a plain finish.
    y = np.linspace(.025,.971,height) * (original.height-1)
    src = np.asarray(original)
    texture = np.empty((height,width,3), dtype=np.uint8)
    for j, sy in enumerate(y.astype(int)):
        row=src[sy]
        outline=np.flatnonzero(row[:,3]>220)
        left,right=outline[0],outline[-1]
        center=(left+right)/2
        x=np.clip((center + (right-left)*.496*np.sin(angle)).astype(int),left,right)
        weight=np.clip((np.pi/2-abs(angle))/.12,0,1)[:,None]
        texture[j]=row[x,:3]*weight + np.array(back)*(1-weight)
    Image.fromarray(texture).save(dest / (stem+'.jpg'),quality=94,subsampling=0)

if __name__=='__main__':
    for stem, source in zip(['original','zero'],sys.argv[1:]):
        prepare(source,stem)
