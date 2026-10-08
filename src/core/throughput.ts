// Network speed (pure): turns two readings of the adapters' byte counters into download/upload
// rates. Counters come from Get-NetAdapterStatistics on Windows and /proc/net/dev on Linux.

export interface CounterSample {
  /** Milliseconds (monotonic or wall clock — only differences are used). */
  t: number;
  adapters: Array<{ name: string; rx: number; tx: number }>;
}

export interface Rates {
  /** Bytes per second, summed over adapters present in both samples; null when not computable. */
  rx: number | null;
  tx: number | null;
  adapters: string[];
}

/** Rates between two samples. A counter that went backwards (adapter reset/reconnected) is skipped. */
export function ratesBetween(prev: CounterSample, next: CounterSample): Rates {
  const dt = (next.t - prev.t) / 1000;
  const names = next.adapters.map((a) => a.name);
  if (!(dt > 0.2)) return { rx: null, tx: null, adapters: names };
  const before = new Map(prev.adapters.map((a) => [a.name, a]));
  let rx = 0;
  let tx = 0;
  let counted = 0;
  for (const a of next.adapters) {
    const b = before.get(a.name);
    if (!b || a.rx < b.rx || a.tx < b.tx) continue;
    rx += a.rx - b.rx;
    tx += a.tx - b.tx;
    counted++;
  }
  if (counted === 0) return { rx: null, tx: null, adapters: names };
  return { rx: rx / dt, tx: tx / dt, adapters: names };
}

// Virtual interfaces would count the same traffic twice (bridges, containers, tunnels' carriers).
const LINUX_SKIP = /^(lo|ifb|docker\d*|veth|br-|virbr|vnet|tun|tap|wg|zt|cni|flannel|kube)/;

/** /proc/net/dev → counters of the real interfaces. */
export function parseProcNetDev(text: string, t: number): CounterSample {
  const adapters: CounterSample['adapters'] = [];
  for (const line of text.split('\n').slice(2)) {
    const m = /^\s*([^:\s]+):\s*(\d+)\s+(?:\d+\s+){7}(\d+)/.exec(line);
    if (!m || LINUX_SKIP.test(m[1] as string)) continue;
    adapters.push({ name: m[1] as string, rx: Number(m[2]), tx: Number(m[3]) });
  }
  return { t, adapters };
}

/** One JSON line from the Windows sampler: {"t":…, "a":[{"n":…, "rx":…, "tx":…}]} (a single adapter may arrive as an object). */
export function parseWindowsSample(line: string): CounterSample | null {
  try {
    const o = JSON.parse(line) as { t?: unknown; a?: unknown };
    if (typeof o.t !== 'number') return null;
    const list = Array.isArray(o.a) ? o.a : o.a && typeof o.a === 'object' ? [o.a] : [];
    const adapters = list
      .map((x) => x as { n?: unknown; rx?: unknown; tx?: unknown })
      .filter((x) => typeof x.n === 'string' && typeof x.rx === 'number' && typeof x.tx === 'number')
      .map((x) => ({ name: x.n as string, rx: x.rx as number, tx: x.tx as number }));
    return { t: o.t, adapters };
  } catch {
    return null;
  }
}
