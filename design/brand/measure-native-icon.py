#!/usr/bin/env python3
"""Fit the macOS icon mask's corner as a superellipse QUADRANT of radius R and
exponent n (straight edges elsewhere). Prints best (R, n) and rms error.
Usage: measure-native-icon.py <icon.png>  (e.g. sips -s format png -Z 1024 /System/Applications/Notes.app/Contents/Resources/AppIcon.icns --out notes.png)"""
import sys, math, argparse, numpy as np
sys.argv[1:] or sys.exit(__doc__)
ap=argparse.ArgumentParser(description=__doc__); ap.add_argument("png"); a=ap.parse_args()
import subprocess, struct, os, tempfile
def load(p):
    t=tempfile.mktemp(suffix=".bmp")
    subprocess.run(["sips","-s","format","bmp",p,"--out",t],capture_output=True,check=True)
    b=open(t,"rb").read(); os.unlink(t)
    off=struct.unpack_from("<I",b,10)[0]; w,h=struct.unpack_from("<ii",b,18); bpp=struct.unpack_from("<H",b,28)[0]
    px=np.frombuffer(b,dtype=np.uint8,offset=off,count=abs(h)*w*bpp//8).reshape(abs(h),w,bpp//8)
    return px[::-1] if h>0 else px
px=load(a.png); m=px[...,3]>128; ys,xs=np.where(m); x0,y0=xs.min(),ys.min(); bw=xs.max()-x0+1
prof=[(dy,np.where(m[y0+dy])[0].min()-x0) for dy in range(0,300)]
def inset(dy,R,n):
    if dy>=R: return 0.0
    t=(R-dy-0.5)/R
    return R-R*(1-t**n)**(1/n)
best=(1e18,0,0)
for R in range(150,420,2):
    for n10 in range(15,60):
        n=n10/10; e=sum((ins-inset(dy,R,n))**2 for dy,ins in prof)
        if e<best[0]: best=(e,R,n)
e,R,n=best
print(f"body {bw}px  corner R={R} ({R/bw:.4f} of body)  n={n}  rms {math.sqrt(e/len(prof)):.2f}px")
