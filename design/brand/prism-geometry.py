#!/usr/bin/env python3
"""EchoPrism mark geometry (v3, owner spec 2026-10-19 17:02).

Two streams enter the prism's LEFT face, refract toward the normal (Snell,
index n), and CROSS at the triangle's centroid (its centre of gravity). The
merged white beam continues to the RIGHT face and refracts out at a chosen
exit angle: horizontal or slightly RISING (a falling line reads as a negative
trend). Because the streams crossed, their colour order is inverted on exit,
which the mark shows as thin chromatic-aberration fringes on the white beam.

All rays are solved backwards from their constraints, so the crossing point
and the exit angle are exact. Output: TS constants for a 120x64 viewBox,
ready to paste into src/components/ui/PrismLogo.tsx.

Usage: prism-geometry.py [--apex DEG] [--h H] [--n N] [--exit-deg DEG]
                         [--ua U] [--uv U] [--check]
  --exit-deg  exit beam angle above horizontal (default 3; 0 = flat)
  --ua/--uv   audio/video entry points along the left face (0 apex, 1 base)
  --check     print angles + sanity checks instead of TS constants
"""
import argparse, math
ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("--apex", type=float, default=54)
ap.add_argument("--h", type=float, default=48, help="triangle height")
ap.add_argument("--cx", type=float, default=56, help="apex x")
ap.add_argument("--n", type=float, default=1.5)
ap.add_argument("--exit-deg", type=float, default=3)
ap.add_argument("--ua", type=float, default=0.58)
ap.add_argument("--uv", type=float, default=0.68)
ap.add_argument("--bleed", type=float, default=6, help="extend beams this far past the viewBox (clipped there, so they read as infinite)")
ap.add_argument("--check", action="store_true")
a = ap.parse_args()

W, H = 120, 64
top = (H - a.h) / 2
half = a.h * math.tan(math.radians(a.apex / 2))
A, BL, BR = (a.cx, top), (a.cx - half, top + a.h), (a.cx + half, top + a.h)
C = ((A[0] + BL[0] + BR[0]) / 3, (A[1] + BL[1] + BR[1]) / 3)   # centroid

def lerp(p, q, t): return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
def nz(v): l = math.hypot(*v); return (v[0] / l, v[1] / l)
def dot(p, q): return p[0] * q[0] + p[1] * q[1]
def ang(v): return -math.degrees(math.atan2(v[1], v[0]))  # + = rising (y is down)
def refract(d, nrm, eta):
    if dot(nrm, d) > 0: nrm = (-nrm[0], -nrm[1])
    c = -dot(nrm, d); k = 1 - eta * eta * (1 - c * c)
    if k < 0: raise SystemExit("total internal reflection: adjust parameters")
    t = eta * c - math.sqrt(k)
    return nz((eta * d[0] + t * nrm[0], eta * d[1] + t * nrm[1]))
def hit_x(p, d, x):  # point where ray p + s*d reaches vertical line x
    s = (x - p[0]) / d[0]; return (x, p[1] + d[1] * s)
def hit_seg(p, d, a1, a2):
    e = (a2[0] - a1[0], a2[1] - a1[1]); den = d[0] * e[1] - d[1] * e[0]
    t = ((a1[0] - p[0]) * e[1] - (a1[1] - p[1]) * e[0]) / den
    u = ((a1[0] - p[0]) * d[1] - (a1[1] - p[1]) * d[0]) / den
    return (p[0] + d[0] * t, p[1] + d[1] * t), u

lf = nz((BL[0] - A[0], BL[1] - A[1])); nL = (-lf[1], lf[0])
rf = nz((BR[0] - A[0], BR[1] - A[1])); nR = (rf[1], -rf[0])

# Exit: choose the OUTSIDE direction, reverse-refract to the inside direction,
# then the exit point is where that inside ray from the centroid meets the face.
d_out = nz((1, -math.tan(math.radians(a.exit_deg))))
d_glass = refract((-d_out[0], -d_out[1]), nR, 1 / a.n)       # reversed: air -> glass
d_glass = (-d_glass[0], -d_glass[1])
E, ue = hit_seg(C, d_glass, A, BR)
X = hit_x(E, d_out, W + a.bleed)

# Entries: inside ray P -> C is fixed by the two points; reverse-refract it
# out through the left face to get the incoming direction, extend to x=0.
beams = {}
for name, u in (("AUDIO", a.ua), ("VIDEO", a.uv)):
    P = lerp(A, BL, u)
    d_in_glass = nz((C[0] - P[0], C[1] - P[1]))
    back = refract((-d_in_glass[0], -d_in_glass[1]), nL, a.n)  # glass -> air, reversed
    inc = (-back[0], -back[1])
    S = hit_x(P, inc, -a.bleed)
    beams[name] = (S, P, inc, d_in_glass)

ok = 0 <= ue <= 1 and all(0 <= hit_x(b[1], b[2], 0)[1] <= H for b in beams.values()) and 0 <= hit_x(E, d_out, W)[1] <= H
if a.check:
    for k, (S, P, inc, dg) in beams.items():
        print(f"{k}: in {ang(inc):+6.1f}deg -> glass {ang(dg):+6.1f}deg  start y={S[1]:.1f}")
    print(f"WHITE: glass {ang(d_glass):+.1f}deg -> out {ang(d_out):+.1f}deg  exit on face u={ue:.2f}  end y={X[1]:.1f}")
    print(f"centroid {C[0]:.1f},{C[1]:.1f}  inside viewBox: {ok}")
    raise SystemExit(0 if ok else 1)

f = lambda p: f"{p[0]:.1f} {p[1]:.1f}"
pt = lambda p: f"{{ x: {p[0]:.1f}, y: {p[1]:.1f} }}"
print(f"export const PRISM_TRIANGLE = '{A[0]:.1f},{A[1]:.1f} {BR[0]:.1f},{BR[1]:.1f} {BL[0]:.1f},{BL[1]:.1f}';")
print(f"export const PRISM_MEET = {pt(C)};")
print(f"export const PRISM_EXIT_POINT = {pt(E)};")
print(f"export const PRISM_AUDIO_ENTRY = {pt(beams['AUDIO'][1])};")
print(f"export const PRISM_VIDEO_ENTRY = {pt(beams['VIDEO'][1])};")
for k, (S, P, _, _) in beams.items():
    print(f"export const PRISM_{k}_BEAM = 'M {f(S)} L {f(P)} L {f(C)}';")
print(f"export const PRISM_GLASS_BEAM = 'M {f(C)} L {f(E)}';")
print(f"export const PRISM_EXIT_BEAM = 'M {f(E)} L {f(X)}';")
print(f"/** Unit normal of the exit beam (fringe offsets), y-down. */")
print(f"export const PRISM_EXIT_NORMAL = {{ x: {d_out[1]:.4f}, y: {-d_out[0]:.4f} }};")
