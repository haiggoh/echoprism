"""Forward-traced prism mark: two near-horizontal beams (audio above, video
below) hit the prism's LEFT face, refract toward the normal (Snell, index n),
and meet at one point E on the RIGHT face, where a single white beam refracts
out. The video entry is solved by bisection so both rays hit the same E.
Prints SVG data for a 120x64 viewBox. --help for options."""
import math, argparse
ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("--h", type=float, default=50); ap.add_argument("--apex", type=float, default=56)
ap.add_argument("--cx", type=float, default=58)
ap.add_argument("--ua", type=float, default=0.42, help="audio entry along left face (0 apex,1 base)")
ap.add_argument("--aa", type=float, default=10, help="audio incoming angle, deg below horizontal")
ap.add_argument("--av", type=float, default=-10, help="video incoming angle (negative = rising)")
ap.add_argument("--n", type=float, default=1.5, help="index for the white exit (mean)"); ap.add_argument("--na", type=float, default=None, help="audio index (dispersion)"); ap.add_argument("--nv", type=float, default=None, help="video index (dispersion)"); ap.add_argument("--x0", type=float, default=4)
ap.add_argument("--x1", type=float, default=116)
a = ap.parse_args()
top=(64-a.h)/2; half=a.h*math.tan(math.radians(a.apex/2))
A=(a.cx,top); BL=(a.cx-half,top+a.h); BR=(a.cx+half,top+a.h)
lerp=lambda p,q,t:(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t)
nz=lambda v:(lambda l:(v[0]/l,v[1]/l))(math.hypot(*v)); dot=lambda p,q:p[0]*q[0]+p[1]*q[1]
def refract(d,nrm,eta):
    if dot(nrm,d)>0: nrm=(-nrm[0],-nrm[1])
    c=-dot(nrm,d); k=1-eta*eta*(1-c*c)
    if k<0: return None
    t=eta*c-math.sqrt(k); return nz((eta*d[0]+t*nrm[0],eta*d[1]+t*nrm[1]))
def hit(p,d,a1,a2):
    e=(a2[0]-a1[0],a2[1]-a1[1]); den=d[0]*e[1]-d[1]*e[0]
    u=((a1[0]-p[0])*d[1]-(a1[1]-p[1])*d[0])/den; t=((a1[0]-p[0])*e[1]-(a1[1]-p[1])*e[0])/den
    return (p[0]+d[0]*t,p[1]+d[1]*t),u
lf=nz((BL[0]-A[0],BL[1]-A[1])); nL=(-lf[1],lf[0]); rf=nz((BR[0]-A[0],BR[1]-A[1])); nR=(rf[1],-rf[0])
dirdeg=lambda g:nz((1,math.tan(math.radians(g))))
ang=lambda v:math.degrees(math.atan2(v[1],v[0]))
def trace(u,g,n):
    P=lerp(A,BL,u); din=refract(dirdeg(g),nL,1/n); E,ue=hit(P,din,A,BR); return P,din,E,ue
na=a.na or a.n; nv=a.nv or a.n
Pa,da,E,ue=trace(a.ua,a.aa,na)
lo,hi=0.0,1.0
f=lambda u:trace(u,a.av,nv)[3]-ue
for _ in range(80):
    m=(lo+hi)/2
    (lo,hi)=(m,hi) if (f(lo)<0)==(f(m)<0) else (lo,m)
Pv,dv,Ev,uev=trace((lo+hi)/2,a.av,nv)
mid=nz((da[0]+dv[0],da[1]+dv[1])); dout=refract(mid,nR,a.n)
X=(a.x1,E[1]+dout[1]*(a.x1-E[0])/dout[0])
def start(P,g): d=dirdeg(g); s=(P[0]-a.x0)/d[0]; return (P[0]-d[0]*s,P[1]-d[1]*s)
Sa,Sv=start(Pa,a.aa),start(Pv,a.av)
print(f"# audio {a.aa:+.0f} -> {ang(da):+.1f}  video {a.av:+.0f} -> {ang(dv):+.1f}  white {ang(mid):+.1f} -> {ang(dout):+.1f}  uv={(lo+hi)/2:.2f} ue={ue:.2f} E-mismatch={math.dist(E,Ev):.3f}")
F=lambda p:f"{p[0]:.1f} {p[1]:.1f}"
print(f"TRI={A[0]:.1f},{A[1]:.1f} {BR[0]:.1f},{BR[1]:.1f} {BL[0]:.1f},{BL[1]:.1f}")
print(f"AUDIO_IN=M {F(Sa)} L {F(Pa)}\nAUDIO_GLASS=M {F(Pa)} L {F(E)}\nVIDEO_IN=M {F(Sv)} L {F(Pv)}\nVIDEO_GLASS=M {F(Pv)} L {F(E)}\nWHITE=M {F(E)} L {F(X)}")
