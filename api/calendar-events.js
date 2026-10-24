// What a profile looks like as calendar events, for the two ways out to a calendar app: the
// subscription link (ics.js) and the Google Calendar sync (google-calendar.js). Pure: a state in,
// a list of events out, so both ways show the same thing and it can be tested without a server.
//
//   workouts   every logged workout of the last WORKOUT_DAYS, at the time it was trained
//   plan       the session planned for each of the next PLAN_DAYS that has nothing logged yet,
//              as an all-day event (the plan has no time of day)
//   habits     each of the last HABIT_DAYS with at least one habit ticked: one all-day event
//              listing what was done and what was not
//
// Which of the three go out is the profile's own choice (`S.calSync`, all on by default). Every
// event has a `uid` that stays the same for the same thing (the workout's id, the day), so a
// calendar that reads the feed again, or a sync that runs again, updates instead of duplicating.
//
// The habit reading is a hand copy of the few rules it needs from frontend/src/lib/habits.js
// (as queue.js copies the plan rules): a habit counts from the day it was added, a removed habit
// or an unticked day is a stamped empty entry, and only `done: 1` is a tick.
import { effectiveRoutineId } from './queue.js';

export const WORKOUT_DAYS = 90;
export const PLAN_DAYS = 14;
export const HABIT_DAYS = 30;

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = n => String(n).padStart(2, '0');
const isoOfUTC = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());

/** `iso` moved by `days`, as an ISO date. */
export function shiftDay(iso, days) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return isoOfUTC(d);
}

/** Today's date in `tz` (an IANA zone), or in UTC when the zone is missing or unknown. */
export function todayIn(tz, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const g = t => parts.find(p => p.type === t)?.value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch { return isoOfUTC(now); }
}

/** The profile's calendar choices with the defaults filled in. */
export function calSyncPrefs(S) {
  const c = isMap(S?.calSync) ? S.calSync : {};
  return { workouts: c.workouts !== false, plan: c.plan !== false, habits: c.habits !== false, tz: typeof c.tz === 'string' ? c.tz : (S?.reminder?.tz || 'UTC') };
}

// ---- habits (hand copy of frontend/src/lib/habits.js, read side only) ----
function habitList(S) {
  return Object.entries(isMap(S?.habits) ? S.habits : {})
    .map(([id, e]) => (isMap(e) && typeof e.name === 'string' && e.name.trim() ? { id, name: e.name.trim().slice(0, 60), at: Number(e.at) || 0 } : null))
    .filter(Boolean)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}
const addedOn = (h, tz) => (h.at ? todayIn(tz, new Date(h.at)) : '0000-00-00');
const ticked = (S, iso, id) => { const e = isMap(S?.habitLog) ? S.habitLog[iso + ':' + id] : null; return isMap(e) && e.done === 1; };

// ---- workouts ----
const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
function workoutDay(w, tz) {
  if (typeof w.d === 'string' && ISO.test(w.d)) return w.d;
  return Number.isFinite(w.start) ? todayIn(tz, new Date(w.start)) : null;
}
function setsDone(w) {
  let n = 0;
  for (const e of list(w.entries)) for (const s of list(e.sets)) if (s.done) n++;
  return n;
}
function workoutLines(w, unit) {
  const exercises = list(w.entries).length;
  const sets = setsDone(w);
  const lines = [];
  const parts = [];
  if (exercises) parts.push(exercises === 1 ? '1 exercise' : `${exercises} exercises`);
  if (sets) parts.push(sets === 1 ? '1 set' : `${sets} sets`);
  if (Number.isFinite(w.vol) && w.vol > 0) parts.push(`${Math.round(w.vol).toLocaleString('en-US')} ${unit === 'lb' ? 'lb' : 'kg'} lifted`);
  if (parts.length) lines.push(parts.join(' · '));
  const prs = Array.isArray(w.prs) ? w.prs.length : 0;
  if (prs) lines.push(prs === 1 ? '1 personal record' : `${prs} personal records`);
  if (typeof w.note === 'string' && w.note.trim()) lines.push(w.note.trim().slice(0, 500));
  lines.push('Logged in Tarnished');
  return lines.join('\n');
}

/**
 * The profile as events. `today` is the profile's own date (todayIn with its zone). Each event:
 *   { uid, kind: 'workout' | 'plan' | 'habits', day, summary, description, start?, end? }
 * with `start`/`end` (ms) for a timed event and neither for an all-day one on `day`.
 */
export function calendarEvents(S, { today, prefs = calSyncPrefs(S) } = {}) {
  if (!S || typeof S !== 'object') return [];
  const out = [];
  const trainedOn = new Set();
  if (prefs.workouts) {
    const from = shiftDay(today, -WORKOUT_DAYS);
    for (const w of list(S.workouts)) {
      const day = workoutDay(w, prefs.tz);
      if (!day || (typeof w.id !== 'string' && typeof w.id !== 'number')) continue;
      trainedOn.add(day);
      if (day < from || day > today) continue;
      const start = Number.isFinite(w.start) ? w.start : Date.parse(day + 'T18:00:00Z');
      let end = Number.isFinite(w.end) && w.end > start ? w.end : start + 3600000;
      if (end - start > 12 * 3600000) end = start + 12 * 3600000;   // a session left running overnight
      out.push({ uid: 'w-' + w.id, kind: 'workout', day, summary: String(w.name || 'Workout').slice(0, 120), description: workoutLines(w, S.unit), start, end });
    }
  } else {
    for (const w of list(S.workouts)) { const day = workoutDay(w, prefs.tz); if (day) trainedOn.add(day); }
  }
  if (prefs.plan) {
    for (let i = 0; i < PLAN_DAYS; i++) {
      const day = shiftDay(today, i);
      if (trainedOn.has(day)) continue;
      let id = null;
      try { id = effectiveRoutineId(S, day); } catch { id = null; }
      const named = rid => list(S.routines).find(x => x.id === rid);
      if (!named(id)) continue;
      // A weekday can hold several routines (Push + Abs); a per-day override or a coach queue names one.
      const wd = new Date(day + 'T12:00:00Z').getUTCDay();
      const week = [].concat(S.week?.[wd] || []).filter(named);
      const ids = S.dayPlan?.[day] === undefined && week.includes(id) ? week : [id];
      const name = ids.map(rid => String(named(rid).name || 'Workout')).join(' + ').slice(0, 100);
      out.push({ uid: 'p-' + day, kind: 'plan', day, summary: 'Planned: ' + name, description: 'From your plan in Tarnished' });
    }
  }
  if (prefs.habits) {
    const habits = habitList(S);
    if (habits.length) {
      for (let i = HABIT_DAYS; i >= 0; i--) {
        const day = shiftDay(today, -i);
        const counted = habits.filter(h => addedOn(h, prefs.tz) <= day);
        const done = counted.filter(h => ticked(S, day, h.id));
        if (!done.length) continue;
        out.push({
          uid: 'h-' + day, kind: 'habits', day,
          summary: `Habits ${done.length}/${counted.length}`,
          description: counted.map(h => (ticked(S, day, h.id) ? '✓ ' : '○ ') + h.name).join('\n'),
        });
      }
    }
  }
  return out;
}

/** The days each kind of event covers for `today`: what a sync may remove when it is gone. */
export function windowOf(kind, today) {
  if (kind === 'workout') return [shiftDay(today, -WORKOUT_DAYS), today];
  if (kind === 'plan') return [today, shiftDay(today, PLAN_DAYS - 1)];
  if (kind === 'habits') return [shiftDay(today, -HABIT_DAYS), today];
  return [today, today];
}
