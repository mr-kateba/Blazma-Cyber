import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { lerpView, project, subsolarPoint, toVector, viewMatrix, type LatLon } from '../../core/globe';
import { softwarePainter, webglPainter, type Painter } from './globe-painters';
import { useI18n } from '../i18n/I18nProvider';
import { Notice } from './ui';
import earthDay from '../assets/earth/earth-day.jpg';
import earthNight from '../assets/earth/earth-night.jpg';

// A real-looking Earth: NASA Blue Marble (day) and Black Marble (city lights) on a sphere, lit by
// where the Sun actually is right now (WebGL 2 when available, otherwise drawn on the CPU). Everything is bundled and drawn locally — showing
// the globe never makes a network request. Only the coordinates the user looked up are marked.

const ACCENT = '#ff6d00';
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function EarthGlobe({ lat, lon, label, timezone }: { lat: number; lon: number; label: string; timezone: string | null }) {
  const { t, locale } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const target = useMemo<LatLon>(() => ({ lat, lon }), [lat, lon]);
  const targetRef = useRef(target);

  // Mutable view state shared by the render loop and the input handlers.
  const view = useRef({ center: { lat: target.lat * 0.4 + 12, lon: target.lon + 75 } as LatLon, zoom: 1, dirty: true, fly: null as null | { from: LatLon; start: number } });

  const flyTo = () => {
    targetRef.current = target;
    const v = view.current;
    if (reducedMotion()) {
      v.center = { ...target };
      v.fly = null;
    } else v.fly = { from: { ...v.center }, start: performance.now() };
    v.dirty = true;
  };

  useEffect(flyTo, [target]);

  useEffect(() => {
    const canvas = glRef.current;
    const overlay = overlayRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !overlay || !wrap) return;
    let raf = 0;
    let disposed = false;
    let sunAt = 0;

    let painter: Painter | null = null;
    try {
      painter = webglPainter(canvas, earthDay, earthNight);
    } catch {
      painter = null; // a driver that can't compile the shader: fall back to the CPU
    }
    painter ??= softwarePainter(canvas, earthDay, earthNight);
    if (!painter) {
      setFailed(true);
      return;
    }
    const p = painter;
    wrap.dataset.renderer = p.kind;
    const g2 = overlay.getContext('2d');
    let size = { w: 0, h: 0, dpr: 1 };

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w, h, dpr };
      canvas.width = Math.round(w * p.pixelRatio);
      canvas.height = Math.round(h * p.pixelRatio);
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
      view.current.dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    let texturesReady = false;
    p.ready
      .then(() => {
        if (disposed) return;
        texturesReady = true;
        view.current.dirty = true;
      })
      .catch(() => !disposed && setFailed(true));

    canvas.addEventListener('webglcontextlost', () => setFailed(true));

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const v = view.current;
      if (v.fly) {
        const k = Math.min(1, (now - v.fly.start) / 1800);
        const ease = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
        v.center = lerpView(v.fly.from, targetRef.current, ease);
        if (k >= 1) v.fly = null;
        v.dirty = true;
      }
      if (now - sunAt > 60000) v.dirty = true; // the terminator moves: refresh once a minute
      const radius = Math.min(size.w, size.h) * 0.42 * v.zoom;
      const m = viewMatrix(v.center);
      if (v.dirty && texturesReady && size.w > 0 && size.h > 0) {
        sunAt = now;
        p.draw(m, toVector(subsolarPoint(new Date())), size.w, size.h, radius);
        v.dirty = false;
      }
      if (g2) drawMarker(g2, overlay, labelRef.current, m, targetRef.current, size, radius, texturesReady ? now : null);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      p.dispose();
    };
  }, []);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const rotateBy = (dLonDeg: number, dLatDeg: number) => {
    const v = view.current;
    v.fly = null;
    v.center = { lat: Math.max(-85, Math.min(85, v.center.lat + dLatDeg)), lon: v.center.lon + dLonDeg };
    v.dirty = true;
  };
  const zoomBy = (f: number) => {
    const v = view.current;
    v.zoom = Math.max(0.8, Math.min(3, v.zoom * f));
    v.dirty = true;
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !wrapRef.current) return;
    const radius = Math.min(wrapRef.current.clientWidth, wrapRef.current.clientHeight) * 0.42 * view.current.zoom;
    const k = 180 / Math.PI / radius;
    rotateBy(-(e.clientX - drag.current.x) * k, (e.clientY - drag.current.y) * k);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 6 / view.current.zoom;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => rotateBy(step, 0),
      ArrowRight: () => rotateBy(-step, 0),
      ArrowUp: () => rotateBy(0, step),
      ArrowDown: () => rotateBy(0, -step),
      '+': () => zoomBy(1.25),
      '=': () => zoomBy(1.25),
      '-': () => zoomBy(0.8),
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const localTime = useMemo(() => {
    if (!timezone) return null;
    try {
      return new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date());
    } catch {
      return null; // not a valid IANA zone
    }
  }, [timezone, locale]);

  const coords = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  if (failed) return <Notice tone="gray">{t('ipintel.globe.unavailable')}</Notice>;

  return (
    <div className="col" style={{ gap: 10 }}>
      <div
        ref={wrapRef}
        className="globe-wrap"
        tabIndex={0}
        role="img"
        aria-label={t('ipintel.globe.aria', { place: label, coords })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
      >
        <canvas ref={glRef} className="globe-canvas" />
        <canvas ref={overlayRef} className="globe-canvas" />
        <div ref={labelRef} className="globe-label" hidden>{label}</div>
      </div>
      <div className="row-wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={flyTo}><LocateFixed size={14} /> {t('ipintel.globe.recenter')}</button>
          <button type="button" className="btn sm" aria-label={t('ipintel.globe.zoomIn')} title={t('ipintel.globe.zoomIn')} onClick={() => zoomBy(1.25)}><Plus size={14} /></button>
          <button type="button" className="btn sm" aria-label={t('ipintel.globe.zoomOut')} title={t('ipintel.globe.zoomOut')} onClick={() => zoomBy(0.8)}><Minus size={14} /></button>
        </div>
        <div className="tiny dim">{t('ipintel.globe.hint')}</div>
      </div>
      {localTime && <div className="small">{t('ipintel.globe.localTime', { time: localTime })}</div>}
      <div className="tiny dim">{t('ipintel.globe.credit')}</div>
    </div>
  );
}

function drawMarker(
  g: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  label: HTMLDivElement | null,
  m: ReturnType<typeof viewMatrix>,
  target: LatLon,
  size: { w: number; h: number; dpr: number },
  radius: number,
  now: number | null,
) {
  g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  const p = project(m, target);
  const show = now !== null && p.visible;
  if (label) label.hidden = !show;
  if (!show) return;
  const x = size.w / 2 + p.x * radius;
  const y = size.h / 2 - p.y * radius;
  const phase = reducedMotion() ? 0.35 : (now / 1600) % 1;
  for (const k of [phase, (phase + 0.5) % 1]) {
    g.beginPath();
    g.arc(x, y, 6 + 22 * k, 0, Math.PI * 2);
    g.strokeStyle = `rgba(255, 109, 0, ${(1 - k) * 0.85})`;
    g.lineWidth = 2;
    g.stroke();
  }
  g.beginPath();
  g.arc(x, y, 5.5, 0, Math.PI * 2);
  g.fillStyle = ACCENT;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#ffffff';
  g.stroke();
  if (label) label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 18)}px) translate(-50%, -100%)`;
}
