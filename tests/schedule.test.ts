import { describe, expect, it, vi } from 'vitest';

const shown: Array<{ title: string; body: string }> = [];
vi.mock('electron', () => ({
  app: { quit: vi.fn(), getPath: () => '/tmp' },
  Notification: class {
    static isSupported = () => true;
    constructor(private o: { title: string; body: string }) {}
    on() {}
    show() {
      shown.push(this.o);
    }
  },
}));

import { buildTaskXml, parseTaskXml, sanitizeSchedule, SCHEDULED_FLAG, taskMatches } from '../src/core/schedule';
import { ScheduledRun } from '../src/main/scheduled-run';
import { scheduleStatus } from '../src/main/services/schedule';

const EXE = 'C:\\Users\\محمد\\AppData\\Local\\Programs\\Blazma Cyber\\Blazma Cyber.exe';
const day = new Date(2026, 9, 8);

describe('scheduled checkup task', () => {
  it('accepts only real schedules from the renderer', () => {
    expect(sanitizeSchedule({ frequency: 'daily', time: '09:30' })).toEqual({ frequency: 'daily', day: 1, time: '09:30' });
    expect(sanitizeSchedule({ frequency: 'weekly', day: 6, time: '23:59' })).toEqual({ frequency: 'weekly', day: 6, time: '23:59' });
    for (const bad of [null, {}, { frequency: 'hourly', time: '09:00' }, { frequency: 'daily', time: '24:00' }, { frequency: 'daily', time: '9:00' }, { frequency: 'weekly', day: 7, time: '09:00' }, { frequency: 'weekly', day: 1.5, time: '09:00' }, { frequency: 'daily', time: '09:00; calc' }]) {
      expect(sanitizeSchedule(bad)).toBeNull();
    }
  });

  it('builds a least-privilege, interactive, per-user task that starts this program with the flag', () => {
    const xml = buildTaskXml({ frequency: 'daily', day: 1, time: '09:30' }, EXE, day);
    expect(xml).toContain('<StartBoundary>2026-10-08T09:30:00</StartBoundary>');
    expect(xml).toContain('<RunLevel>LeastPrivilege</RunLevel>');
    expect(xml).toContain('<LogonType>InteractiveToken</LogonType>');
    expect(xml).toContain('<StartWhenAvailable>true</StartWhenAvailable>');
    expect(xml).toContain(`<Arguments>${SCHEDULED_FLAG}</Arguments>`);
    expect(xml).not.toMatch(/HighestAvailable|<UserId>|<Password>/);
  });

  it('escapes the program path in the XML', () => {
    const xml = buildTaskXml({ frequency: 'daily', day: 1, time: '09:30' }, 'C:\\a&b\\<x>.exe', day);
    expect(xml).toContain('<Command>C:\\a&amp;b\\&lt;x&gt;.exe</Command>');
    expect(parseTaskXml(xml).command).toBe('C:\\a&b\\<x>.exe');
  });

  it('reads back what it wrote, daily and weekly', () => {
    const d = parseTaskXml(buildTaskXml({ frequency: 'daily', day: 1, time: '07:05' }, EXE, day));
    expect(d).toEqual({ config: { frequency: 'daily', day: 1, time: '07:05' }, command: EXE, args: SCHEDULED_FLAG });
    expect(taskMatches(d, EXE.toUpperCase())).toBe(true);
    expect(taskMatches(d, 'D:\\Portable\\Blazma Cyber.exe')).toBe(false);
    const w = parseTaskXml(buildTaskXml({ frequency: 'weekly', day: 6, time: '21:00' }, EXE, day));
    expect(w.config).toEqual({ frequency: 'weekly', day: 6, time: '21:00' });
  });

  it('reads an exported task (Windows adds its own fields) and reports edits it does not recognise', () => {
    const exported = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Author>Blazma Cyber</Author><URI>\\Blazma Cyber\\Scheduled checkup</URI></RegistrationInfo>
  <Triggers><CalendarTrigger><StartBoundary>2026-10-08T10:00:00</StartBoundary><Enabled>true</Enabled><ScheduleByWeek><DaysOfWeek><Monday /></DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek></CalendarTrigger></Triggers>
  <Actions Context="Author"><Exec><Command>${EXE}</Command><Arguments>${SCHEDULED_FLAG}</Arguments></Exec></Actions>
</Task>`;
    expect(parseTaskXml(exported).config).toEqual({ frequency: 'weekly', day: 1, time: '10:00' });
    const twoDays = exported.replace('<Monday />', '<Monday /><Friday />');
    expect(parseTaskXml(twoDays).config).toBeNull();
    const hourly = exported.replace(/<ScheduleByWeek>[\s\S]*<\/ScheduleByWeek>/, '<Repetition><Interval>PT1H</Interval></Repetition>');
    expect(parseTaskXml(hourly).config).toBeNull();
  });

  it.runIf(process.platform !== 'win32')('is Windows-only and needs an installed build', async () => {
    expect(await scheduleStatus(EXE)).toMatchObject({ supported: false, reason: 'unsupported_platform' });
  });
});

describe('scheduled run', () => {
  const t = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ''}`;
  const win = () => ({ webContents: { send: vi.fn(), setBackgroundThrottling: vi.fn() }, isVisible: () => false }) as never;

  it('hands the run to the renderer once and notifies when it is saved', () => {
    const run = new ScheduledRun(win, false);
    expect(run.take()).toBe(false);
    run.request();
    expect(run.take()).toBe(true);
    expect(run.take()).toBe(false);
    shown.length = 0;
    run.finished({ at: 'x', verdict: 'attention', areas: [{ area: 'device', state: 'attention', count: 2 }, { area: 'wifi', state: 'ok', count: 0 }] }, t);
    expect(shown).toEqual([{ title: 'checkup.notify.attention{"n":1}', body: 'checkup.notify.body' }]);
    // A checkup the user starts by hand afterwards sends nothing.
    run.finished({ at: 'y', verdict: 'ok', areas: [] }, t);
    expect(shown).toHaveLength(1);
  });
});
