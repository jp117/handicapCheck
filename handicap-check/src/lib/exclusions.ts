export interface Exclusion {
  start_time: string | null;
  end_time: string | null;
}

function normalizeTime(str: string | null): string | null {
  if (!str) return null;
  // Remove seconds if present, handle AM/PM
  let s = str.trim();
  let ampm = '';
  if (/am|pm/i.test(s)) {
    ampm = s.match(/am|pm/i)?.[0].toUpperCase() || '';
    s = s.replace(/am|pm/i, '').trim();
  }
  const [timePart] = s.split(' ');
  const [h, m] = timePart.split(':');
  if (!h || !m) return str;
  let hour = parseInt(h, 10);
  const minute = m.length > 2 ? m.slice(0, 2) : m;
  if (ampm) {
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
  }
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function isTeeTimeExcluded(
  teeTimeStr: string,
  exclusions: Exclusion[]
): boolean {
  if (!exclusions || exclusions.length === 0) return false;
  const t = teeTimeStr.trim();
  let time: string | null = null;
  if (/\d{1,2}:\d{2}/.test(t)) {
    time = t.match(/\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APMapm]{2})?/g)?.[0] || null;
  }
  time = normalizeTime(time);
  for (const ex of exclusions) {
    const start = normalizeTime(ex.start_time);
    const end = normalizeTime(ex.end_time);
    if (!start && !end) return true; // full day exclusion
    if (time) {
      if (start && end) {
        if (time >= start && time <= end) return true;
      } else if (start && time >= start) {
        return true;
      } else if (end && time <= end) {
        return true;
      }
    }
  }
  return false;
} 