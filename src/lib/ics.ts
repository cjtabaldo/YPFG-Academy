// Calendar file: a daily study reminder at the chosen time, plus the target exam date.
const LA_VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:America/Los_Angeles',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Lines longer than 75 octets must be folded.
const fold = (line: string) => line.length <= 74 ? line : line.match(/.{1,73}/g)!.join('\r\n ');

export function buildIcs(opts: { reminderTime: string; timezone: string; targetDate: string | null; appUrl: string; startDate: string }): string {
  const [hh, mm] = opts.reminderTime.split(':');
  const start = `${opts.startDate.replace(/-/g, '')}T${hh.padStart(2, '0')}${(mm ?? '00').padStart(2, '0')}00`;
  const tz = opts.timezone || 'America/Los_Angeles';
  const now = stamp(new Date());
  const uidBase = `${Date.now()}@ypfg-academy`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//YPFG Academy//Study Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:YPFG Academy'];
  if (tz === 'America/Los_Angeles') lines.push(...LA_VTIMEZONE);
  lines.push(
    'BEGIN:VEVENT', `UID:daily-${uidBase}`, `DTSTAMP:${now}`, `DTSTART;TZID=${tz}:${start}`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
    `SUMMARY:${esc('Study for your license (5 min)')}`,
    `DESCRIPTION:${esc(`Five minutes in YPFG Academy keeps your streak alive. ${opts.appUrl}`)}`,
    `URL:${opts.appUrl}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Time to study')}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT',
  );
  if (opts.targetDate) {
    const d = opts.targetDate.replace(/-/g, '');
    const next = new Date(Date.parse(`${opts.targetDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:exam-${uidBase}`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc('Target exam date: Nevada real estate salesperson exam')}`,
      `DESCRIPTION:${esc('Your target date from YPFG Academy. Confirm your actual appointment with Pearson VUE.')}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
