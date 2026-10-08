import { describe, expect, it } from 'vitest';
import { parseProcNetDev, parseWindowsSample, ratesBetween } from '../src/core/throughput';

const DEV = (eth: [number, number], docker: [number, number]) => `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 9999999    100    0    0    0     0          0         0  9999999    100    0    0    0     0       0          0
  eth0: ${eth[0]}    2000    0    0    0     0          0         0  ${eth[1]}    1500    0    0    0     0       0          0
docker0: ${docker[0]}    10    0    0    0     0          0         0  ${docker[1]}    10    0    0    0     0       0          0
`;

describe('network speed', () => {
  it('reads the real interfaces from /proc/net/dev (no loopback, no container bridges)', () => {
    expect(parseProcNetDev(DEV([1000, 500], [7, 7]), 0)).toEqual({ t: 0, adapters: [{ name: 'eth0', rx: 1000, tx: 500 }] });
  });

  it('turns two readings into bytes per second', () => {
    const a = parseProcNetDev(DEV([1_000_000, 200_000], [0, 0]), 10_000);
    const b = parseProcNetDev(DEV([3_500_000, 700_000], [0, 0]), 12_000);
    expect(ratesBetween(a, b)).toEqual({ rx: 1_250_000, tx: 250_000, adapters: ['eth0'] });
  });

  it('never invents a rate: too short an interval, a reset counter or a new adapter give no number', () => {
    const a = { t: 0, adapters: [{ name: 'Wi-Fi', rx: 5000, tx: 5000 }] };
    expect(ratesBetween(a, { t: 100, adapters: [{ name: 'Wi-Fi', rx: 9000, tx: 9000 }] }).rx).toBeNull();
    expect(ratesBetween(a, { t: 1000, adapters: [{ name: 'Wi-Fi', rx: 10, tx: 10 }] }).rx).toBeNull();
    expect(ratesBetween(a, { t: 1000, adapters: [{ name: 'Ethernet', rx: 10, tx: 10 }] })).toEqual({ rx: null, tx: null, adapters: ['Ethernet'] });
    // Two adapters, one reset: only the steady one counts.
    const two = { t: 0, adapters: [{ name: 'Wi-Fi', rx: 0, tx: 0 }, { name: 'Ethernet', rx: 100, tx: 100 }] };
    expect(ratesBetween(two, { t: 1000, adapters: [{ name: 'Wi-Fi', rx: 800, tx: 80 }, { name: 'Ethernet', rx: 5, tx: 5 }] })).toMatchObject({ rx: 800, tx: 80 });
  });

  it('parses the Windows sampler lines, including PowerShell collapsing a one-item array', () => {
    expect(parseWindowsSample('{"t":1700000000000,"a":[{"n":"Wi-Fi","rx":12,"tx":34}]}')).toEqual({ t: 1700000000000, adapters: [{ name: 'Wi-Fi', rx: 12, tx: 34 }] });
    expect(parseWindowsSample('{"t":1,"a":{"n":"Ethernet","rx":1,"tx":2}}')!.adapters).toHaveLength(1);
    expect(parseWindowsSample('{"t":1,"a":[]}')!.adapters).toEqual([]);
    expect(parseWindowsSample('WARNING: something')).toBeNull();
    expect(parseWindowsSample('{"a":[]}')).toBeNull();
  });
});
