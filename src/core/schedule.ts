// Scheduled checkup (pure): the Windows Task Scheduler task that starts Blazma with
// `--scheduled-checkup` once a day or once a week, and reading that task back.
//
// The task belongs to the signed-in user, runs only while they are signed in, never elevated, and
// does nothing but open Blazma (hidden) to run the read-only checkup and show a notification.

export const SCHEDULED_FLAG = '--scheduled-checkup';
export const TASK_FOLDER = '\\Blazma Cyber\\';
export const TASK_NAME = 'Scheduled checkup';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0, like Date#getDay
export interface ScheduleConfig {
  frequency: 'daily' | 'weekly';
  /** Only for weekly. */
  day: Weekday;
  /** 24-hour local time "HH:MM". */
  time: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validates a schedule coming from the (untrusted) renderer. */
export function sanitizeSchedule(x: unknown): ScheduleConfig | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (o.frequency !== 'daily' && o.frequency !== 'weekly') return null;
  if (typeof o.time !== 'string' || !TIME_RE.test(o.time)) return null;
  const day = o.frequency === 'weekly' ? o.day : 1;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) return null;
  return { frequency: o.frequency, day: day as Weekday, time: o.time };
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Task Scheduler XML (schema 1.2). `today` gives the first day the trigger counts from (local date). */
export function buildTaskXml(cfg: ScheduleConfig, exe: string, today: Date): string {
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const schedule =
    cfg.frequency === 'daily'
      ? '<ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>'
      : `<ScheduleByWeek><DaysOfWeek><${DAYS[cfg.day]} /></DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek>`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Blazma Cyber</Author>
    <Description>Opens Blazma Cyber in the background to run its read-only checkup and show the result as a notification. Created from Blazma Cyber's Full checkup page; remove it there.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${d}T${cfg.time}:00</StartBoundary>
      <Enabled>true</Enabled>
      ${schedule}
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEscape(exe)}</Command>
      <Arguments>${SCHEDULED_FLAG}</Arguments>
    </Exec>
  </Actions>
</Task>`;
}

const xmlUnescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml);
  return m ? xmlUnescape(m[1] ?? '').trim() : null;
};

export interface ScheduledTaskInfo {
  /** The schedule, when the task's trigger is one Blazma writes (otherwise it was edited elsewhere). */
  config: ScheduleConfig | null;
  command: string | null;
  args: string | null;
}

/** Reads back a task exported as XML (Export-ScheduledTask), whoever last edited it. */
export function parseTaskXml(xml: string): ScheduledTaskInfo {
  const command = tag(xml, 'Command');
  const args = tag(xml, 'Arguments');
  const triggers = xml.match(/<CalendarTrigger>[\s\S]*?<\/CalendarTrigger>/g) ?? [];
  let config: ScheduleConfig | null = null;
  if (triggers.length === 1) {
    const t = triggers[0] as string;
    const start = /<StartBoundary>\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(t);
    if (start && /<ScheduleByDay>\s*<DaysInterval>1<\/DaysInterval>\s*<\/ScheduleByDay>/.test(t)) {
      config = { frequency: 'daily', day: 1, time: start[1] as string };
    } else if (start && /<WeeksInterval>1<\/WeeksInterval>/.test(t)) {
      const days = /<DaysOfWeek>([\s\S]*?)<\/DaysOfWeek>/.exec(t)?.[1] ?? '';
      const found = DAYS.map((d, i) => (new RegExp(`<${d}\\s*/>`).test(days) ? i : -1)).filter((i) => i >= 0);
      if (found.length === 1) config = { frequency: 'weekly', day: found[0] as Weekday, time: start[1] as string };
    }
  }
  return { config, command, args };
}

/** True when the task still starts this copy of Blazma with the scheduled-checkup flag. */
export function taskMatches(info: ScheduledTaskInfo, exe: string): boolean {
  return !!info.command && info.command.toLowerCase() === exe.toLowerCase() && (info.args ?? '').trim() === SCHEDULED_FLAG;
}
