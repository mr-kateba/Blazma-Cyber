import { describe, expect, it } from 'vitest';
import { apply, lerpView, parseLatLon, project, subsolarPoint, toVector, viewMatrix, wrapLon } from '../src/core/globe';

describe('globe math', () => {
  it('parses ipinfo coordinates and rejects anything else', () => {
    expect(parseLatLon('52.5200,13.4050')).toEqual({ lat: 52.52, lon: 13.405 });
    expect(parseLatLon(' -33.8688 , 151.2093 ')).toEqual({ lat: -33.8688, lon: 151.2093 });
    for (const bad of [null, '', '91,0', '0,181', '1,2,3', 'abc', '1e2,3', '52.5;13.4']) expect(parseLatLon(bad)).toBeNull();
  });

  it('brings the chosen centre to the front of the globe', () => {
    for (const c of [{ lat: 0, lon: 0 }, { lat: 52.52, lon: 13.405 }, { lat: -33.87, lon: 151.21 }, { lat: 40.7, lon: -74 }]) {
      const [x, y, z] = apply(viewMatrix(c), toVector(c));
      expect(x).toBeCloseTo(0, 9);
      expect(y).toBeCloseTo(0, 9);
      expect(z).toBeCloseTo(1, 9);
    }
  });

  it('keeps north up and east on the right', () => {
    const m = viewMatrix({ lat: 0, lon: 0 });
    const east = project(m, { lat: 0, lon: 30 });
    const north = project(m, { lat: 30, lon: 0 });
    expect(east.x).toBeGreaterThan(0);
    expect(north.y).toBeGreaterThan(0);
    expect(project(m, { lat: 0, lon: 180 }).visible).toBe(false);
  });

  it('places the subsolar point where the Sun really is', () => {
    // June solstice 2024 (20:51 UTC) and December solstice 2024 (09:20 UTC): ±23.44°.
    expect(subsolarPoint(new Date('2024-06-20T20:51:00Z')).lat).toBeCloseTo(23.44, 1);
    expect(subsolarPoint(new Date('2024-12-21T09:20:00Z')).lat).toBeCloseTo(-23.44, 1);
    // March equinox 2024, 12:00 UTC: Sun over the equator, ~2° east of Greenwich
    // (equation of time −7.5 min: solar noon in Greenwich comes at 12:07 UTC).
    const eq = subsolarPoint(new Date('2024-03-20T12:00:00Z'));
    expect(Math.abs(eq.lat)).toBeLessThan(0.5);
    expect(eq.lon).toBeGreaterThan(1);
    expect(eq.lon).toBeLessThan(3);
    // Six hours later the Sun is ~90° further west.
    expect(wrapLon(subsolarPoint(new Date('2024-03-20T18:00:00Z')).lon - eq.lon)).toBeCloseTo(-90, 0);
  });

  it('wraps longitudes and flies the short way around', () => {
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-190)).toBe(170);
    expect(wrapLon(-180)).toBe(180);
    const mid = lerpView({ lat: 0, lon: 170 }, { lat: 10, lon: -170 }, 0.5);
    expect(mid.lat).toBeCloseTo(5);
    expect(Math.abs(mid.lon)).toBeCloseTo(180);
  });
});
