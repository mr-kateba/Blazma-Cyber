// IP Intelligence globe: the pure math behind the 3D Earth view (no DOM, no WebGL).
//
// Frames: Earth-fixed unit vectors with +Y = north pole, +Z = (0°N, 0°E), +X = (0°N, 90°E).
// The view looks along -Z at a sphere whose centre faces the viewer; screen +X is right, +Y up.

export interface LatLon {
  lat: number;
  lon: number;
}
export type Vec3 = [number, number, number];
/** Row-major 3×3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

const RAD = Math.PI / 180;

/** ipinfo's `loc` ("52.5200,13.4050") → coordinates, or null when it isn't a valid pair. */
export function parseLatLon(loc: string | null | undefined): LatLon | null {
  if (!loc) return null;
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(loc);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function toVector({ lat, lon }: LatLon): Vec3 {
  const la = lat * RAD;
  const lo = lon * RAD;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

/** Rotation that brings the point `center` to the front of the globe (screen 0,0,1):
 *  first spin around the pole by -lon, then tilt around the screen X axis by lat. */
export function viewMatrix(center: LatLon): Mat3 {
  const a = -center.lon * RAD;
  const b = center.lat * RAD;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  // Rx(b) · Ry(a), with Ry(a) = [[ca,0,sa],[0,1,0],[-sa,0,ca]] and Rx(b) = [[1,0,0],[0,cb,-sb],[0,sb,cb]]
  return [ca, 0, sa, sb * sa, cb, -sb * ca, -cb * sa, sb, cb * ca];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

/** Where a point lands on screen, in globe radii from the centre (y up), and whether it faces the viewer. */
export function project(m: Mat3, p: LatLon): { x: number; y: number; visible: boolean } {
  const [x, y, z] = apply(m, toVector(p));
  return { x, y, visible: z > 0 };
}

/** The point on Earth where the Sun is directly overhead at `date` (NOAA low-precision formulas,
 *  accurate to a fraction of a degree — plenty for shading day and night). */
export function subsolarPoint(date: Date): LatLon {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  // Greenwich mean sidereal time (degrees) → the longitude where the Sun's hour angle is zero.
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  return { lat: decl / RAD, lon: wrapLon(ra / RAD - gmst) };
}

export function wrapLon(lon: number): number {
  const w = ((((lon + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}

/** Interpolates the view centre along the shorter way around the globe (t in 0..1). */
export function lerpView(from: LatLon, to: LatLon, t: number): LatLon {
  const dLon = wrapLon(to.lon - from.lon);
  return { lat: from.lat + (to.lat - from.lat) * t, lon: wrapLon(from.lon + dLon * t) };
}
