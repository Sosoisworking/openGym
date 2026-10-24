// Calendar events (calendar-events.js) as an iCalendar file (RFC 5545), for the subscription link:
// Google Calendar ("From URL"), Apple Calendar and Outlook all read one and fetch it again on their
// own schedule. Only what the events need: timed events in UTC, all-day events as dates, text
// escaped and lines folded at 75 octets.
const pad = n => String(n).padStart(2, '0');
const utc = ms => {
  const d = new Date(ms);
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
};
const dateOnly = iso => iso.replace(/-/g, '');
const nextDay = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/** Text as a property value: backslash, semicolon and comma escaped, newlines as \n. */
export const escapeText = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** One content line folded at 75 octets (not characters): a continuation starts with a space. */
export function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0, limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // never cut a multi-byte character: back up to the start of one
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;   // the leading space takes one
  }
  return out.join('\r\n ');
}

export function toICS(events, { name = 'Tarnished', now = Date.now(), domain = 'tarnished' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tarnished//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeText(name),
    // a hint for apps that honour it: look again every few hours
    'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H',
  ];
  const stamp = utc(now);
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${escapeText(e.uid)}@${domain}`, 'DTSTAMP:' + stamp);
    if (Number.isFinite(e.start)) {
      lines.push('DTSTART:' + utc(e.start), 'DTEND:' + utc(Number.isFinite(e.end) ? e.end : e.start + 3600000));
    } else {
      lines.push('DTSTART;VALUE=DATE:' + dateOnly(e.day), 'DTEND;VALUE=DATE:' + dateOnly(nextDay(e.day)), 'TRANSP:TRANSPARENT');
    }
    lines.push('SUMMARY:' + escapeText(e.summary));
    if (e.description) lines.push('DESCRIPTION:' + escapeText(e.description));
    lines.push('CATEGORIES:' + escapeText(e.kind), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
