#!/usr/bin/env python3
"""EchoPrism mark geometry (v4, owner spec 2026-10-19 17:28).

Video (orange) enters the LEFT face from above, audio (teal) from below (as
in an editing timeline: video track over audio track). Both refract toward
the face normal (Snell, index n) and CROSS at the triangle's centroid, the
focus. Past the focus the merged light widens as a wedge to the right face
and leaves as a parallel band at --exit-deg (0 = level, + = rising). The
colours keep going straight through the focus, so their order is INVERTED on
the way out: teal fringe on top, orange below. Both fringes start AT the
focus, as thin slivers of the wedge.

All rays are solved backwards from their constraints, so the crossing point
and the exit angle are exact. Output: TS constants for a 120x64 viewBox,
ready to paste into src/components/ui/PrismLogo.tsx.

Usage: prism-geometry.py [--apex DEG] [--h H] [--n N] [--exit-deg DEG]
                         [--uv U] [--ua U] [--band W] [--check]
  --uv/--ua   video/audio entry points along the left face (0 apex, 1 base)
  --band      perpendicular width of the exit band, viewBox units
  --check     print angles + sanity checks instead of TS constants
"""
import argparse, math
ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("--apex", type=float, default=56)
ap.add_argument("--h", type=float, default=48, help="triangle height")
ap.add_argument("--cx", type=float, default=60, help="apex x (60 = centred in the 120 box)")
ap.add_argument("--n", type=float, default=1.5)
ap.add_argument("--exit-deg", type=float, default=6)
ap.add_argument("--uv", type=float, default=0.56, help="video entry (upper)")
ap.add_argument("--ua", type=float, default=0.68, help="audio entry (lower)")
ap.add_argument("--band", type=float, default=9.0)
ap.add_argument("--bleed", type=float, default=6)
ap.add_argument("--check", action="store_true")
ap.add_argument("--json", action="store_true", help="print the geometry object as JSON (for preview harnesses)")
a = ap.parse_args()

W, H = 120, 64
top = (H - a.h) / 2
half = a.h * math.tan(math.radians(a.apex / 2))
A, BL, BR = (a.cx, top), (a.cx - half, top + a.h), (a.cx + half, top + a.h)
F = ((A[0] + BL[0] + BR[0]) / 3, (A[1] + BL[1] + BR[1]) / 3)   # centroid = focus

def lerp(p, q, t): return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
def nz(v): l = math.hypot(*v); return (v[0] / l, v[1] / l)
def dot(p, q): return p[0] * q[0] + p[1] * q[1]
def cross(p, q): return p[0] * q[1] - p[1] * q[0]
def ang(v): return -math.degrees(math.atan2(v[1], v[0]))  # + = rising (y is down)
def refract(d, nrm, eta):
    if dot(nrm, d) > 0: nrm = (-nrm[0], -nrm[1])
    c = -dot(nrm, d); k = 1 - eta * eta * (1 - c * c)
    if k < 0: raise SystemExit("total internal reflection: adjust parameters")
    t = eta * c - math.sqrt(k)
    return nz((eta * d[0] + t * nrm[0], eta * d[1] + t * nrm[1]))
def hit_x(p, d, x): s = (x - p[0]) / d[0]; return (x, p[1] + d[1] * s)
def hit_seg(p, d, a1, a2):
    e = (a2[0] - a1[0], a2[1] - a1[1]); den = d[0] * e[1] - d[1] * e[0]
    t = ((a1[0] - p[0]) * e[1] - (a1[1] - p[1]) * e[0]) / den
    u = ((a1[0] - p[0]) * d[1] - (a1[1] - p[1]) * d[0]) / den
    return (p[0] + d[0] * t, p[1] + d[1] * t), u

lf = nz((BL[0] - A[0], BL[1] - A[1])); nL = (-lf[1], lf[0])
rf = nz((BR[0] - A[0], BR[1] - A[1])); nR = (rf[1], -rf[0])

# Exit band: pick the outside direction, reverse-refract to the inside one;
# the band's centre leaves the face where that inside ray from F lands, and
# its edges sit +/- half a band width away along the face.
d_out = nz((1, -math.tan(math.radians(a.exit_deg))))
d_glass = refract((-d_out[0], -d_out[1]), nR, 1 / a.n)
d_glass = (-d_glass[0], -d_glass[1])
E, ue = hit_seg(F, d_glass, A, BR)
s = (a.band / 2) / abs(cross(rf, d_out))
ET, EB = (E[0] - rf[0] * s, E[1] - rf[1] * s), (E[0] + rf[0] * s, E[1] + rf[1] * s)
uT, uB = ue - s / math.dist(A, BR), ue + s / math.dist(A, BR)

beams = {}
for name, u in (("VIDEO", a.uv), ("AUDIO", a.ua)):
    P = lerp(A, BL, u)
    dg = nz((F[0] - P[0], F[1] - P[1]))
    back = refract((-dg[0], -dg[1]), nL, a.n)
    inc = (-back[0], -back[1])
    beams[name] = (hit_x(P, inc, -a.bleed), P, inc, dg)

vis = lambda p, d: hit_x(p, d, 0)[1]
ok = (0 <= uT and uB <= 1 and all(0 <= vis(b[1], b[2]) <= H for b in beams.values())
      and beams["VIDEO"][0][1] < beams["AUDIO"][0][1])
if a.check:
    for k, (S, P, inc, dg) in beams.items():
        print(f"{k}: in {ang(inc):+6.1f}deg -> glass {ang(dg):+6.1f}deg  enters y={vis(P, inc):.1f}")
    print(f"BAND: glass {ang(d_glass):+.1f}deg -> out {ang(d_out):+.1f}deg  on face u={uT:.2f}..{uB:.2f}")
    print(f"focus {F[0]:.1f},{F[1]:.1f}  valid: {ok}")
    raise SystemExit(0 if ok else 1)

f = lambda p: f"{p[0]:.2f} {p[1]:.2f}"
P2 = lambda p: {"x": round(p[0], 2), "y": round(p[1], 2)}
geo = {
    "triangle": f"{A[0]:.2f},{A[1]:.2f} {BR[0]:.2f},{BR[1]:.2f} {BL[0]:.2f},{BL[1]:.2f}",
    "meet": P2(F),
    "video": {"entry": P2(beams["VIDEO"][1]), "beam": f"M {f(beams['VIDEO'][0])} L {f(beams['VIDEO'][1])} L {f(F)}"},
    "audio": {"entry": P2(beams["AUDIO"][1]), "beam": f"M {f(beams['AUDIO'][0])} L {f(beams['AUDIO'][1])} L {f(F)}"},
    "exitTop": P2(ET), "exitBottom": P2(EB),
    "exitDir": {"x": round(d_out[0], 5), "y": round(d_out[1], 5)},
}
import json
if a.json:
    print(json.dumps(geo)); raise SystemExit(0)
args = f"--apex {a.apex:g} --h {a.h:g} --n {a.n:g} --exit-deg {a.exit_deg:g} --uv {a.uv:g} --ua {a.ua:g} --band {a.band:g}"
print(f"// generated by design/brand/prism-geometry.py {args}")
print("export const PRISM_GEOMETRY: PrismGeometry = " + json.dumps(geo, indent=2).replace('"x"', 'x').replace('"y"', 'y')
      .replace('"triangle"', 'triangle').replace('"meet"', 'meet').replace('"video"', 'video').replace('"audio"', 'audio')
      .replace('"entry"', 'entry').replace('"beam"', 'beam').replace('"exitTop"', 'exitTop').replace('"exitBottom"', 'exitBottom')
      .replace('"exitDir"', 'exitDir').replace('"', "'") + ";")
