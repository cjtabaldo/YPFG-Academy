import { describe, expect, it } from 'vitest';
import { buildIcs } from '../../src/lib/ics';
import { toCsv } from '../../src/lib/csv';

describe('calendar file', () => {
  const ics = buildIcs({ reminderTime: '19:30', timezone: 'America/Los_Angeles', targetDate: '2027-01-15', appUrl: 'https://ypfg.example', startDate: '2026-10-13' });
  it('is a valid iCalendar file Apple and Google accept', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('DTSTART;TZID=America/Los_Angeles:20261013T193000');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270115');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
  });
});

describe('CSV export', () => {
  it('opens cleanly in Excel and Google Sheets', () => {
    const csv = toCsv([{ id: 'q1', prompt: 'He said "hi", then left', options: ['A', 'B'], formula: '=1+1' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM so Excel reads accents
    expect(csv).toContain('"He said ""hi"", then left"');
    expect(csv).toContain('"[""A"",""B""]"');
    expect(csv).toContain(`"'=1+1"`); // not executed as a formula
    expect(csv.split('\r\n').length).toBe(3);
  });
});
