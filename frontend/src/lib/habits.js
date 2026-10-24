// Daily habits: water, sleep, steps, reading, anything you want to tick off once a day.
//
// Two stamped maps, merged per key like day notes (lib/sync-merge.js STAMPED_MAPS):
//
//   S.habits   = { [id]: { name, c, at, _ts } }        c: colour slot, at: when it was added (ms)
//   S.habitLog = { 'YYYY-MM-DD:id': { done: 1, _ts } }  one tick per habit per day
//
// A removed habit and an unticked day are stamped empty entries (`{ _ts }`), not deleted keys:
// a delete would come straight back from the other device's copy on the next sync. Two devices
// that each ticked a different habit keep both ticks, and the same tick keeps the later choice.
//
// Only today and the days before can be ticked; a habit counts towards a day from the day it was
// added, so adding one tonight does not turn last month's calendar half-done.
import { todayISO, isoOf, dateOfISO, uid } from './format.js'

export const HABIT_NAME_MAX = 60
export const HABIT_MAX = 24

// The colour each habit is drawn in on the calendar, by slot. Earth tones from the palette, in the
// order a new habit takes them, so the first few are the most distinct.
export const HABIT_COLORS = ['var(--green)', 'var(--blue)', 'var(--orange)', 'var(--purple)', 'var(--pink)', 'var(--teal)', 'var(--yellow)', 'var(--red)', 'var(--mint)', 'var(--brown)']

// Quick picks on the add sheet. Labels are English source strings.
export const HABIT_SUGGESTIONS = {
  Fitness: ['Drink 2 L of water', 'Sleep 8 hours', '10,000 steps', 'Hit my protein', 'Stretch for 10 minutes', 'Take creatine'],
  Life: ['Read for 20 minutes', 'Meditate', 'Journal', 'No phone in bed', 'Make the bed', 'Go outside'],
}

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const cleanName = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, HABIT_NAME_MAX) : '')

/** A stored habit read back: { id, name, c, at }, or null for a removed or malformed one. */
export function readHabit(id, entry) {
  if (!isMap(entry)) return null
  const name = cleanName(entry.name)
  if (!name) return null
  const c = Number.isInteger(entry.c) && entry.c >= 0 ? entry.c % HABIT_COLORS.length : 0
  const at = Number.isFinite(entry.at) ? entry.at : 0
  return { id, name, c, at }
}

/** The habits you have, in the order they were added. */
export function habitList(S) {
  const map = isMap(S?.habits) ? S.habits : {}
  return Object.entries(map).map(([id, e]) => readHabit(id, e)).filter(Boolean)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export const habitColor = h => HABIT_COLORS[(h?.c || 0) % HABIT_COLORS.length]

/** The first colour slot no current habit uses, so a new habit never shares one while any is free. */
function freeSlot(map) {
  const used = new Set(Object.entries(map).map(([id, e]) => readHabit(id, e)).filter(Boolean).map(h => h.c))
  for (let i = 0; i < HABIT_COLORS.length; i++) if (!used.has(i)) return i
  return used.size % HABIT_COLORS.length
}

/**
 * S.habits with a new habit called `name`, or the same map when the name is empty, already taken
 * (case and spacing aside) or the list is full. Returns { map, id } — id null when nothing was added.
 */
export function withHabit(map, name, now = Date.now(), id = uid()) {
  const m = isMap(map) ? map : {}
  const n = cleanName(name)
  const current = Object.entries(m).map(([k, e]) => readHabit(k, e)).filter(Boolean)
  if (!n || current.length >= HABIT_MAX || current.some(h => h.name.toLowerCase() === n.toLowerCase())) return { map: m, id: null }
  return { map: { ...m, [id]: { name: n, c: freeSlot(m), at: now, _ts: now } }, id }
}

/** S.habits with `id` renamed. An empty name leaves it as it was. */
export function withHabitName(map, id, name, now = Date.now()) {
  const m = isMap(map) ? map : {}
  const h = readHabit(id, m[id]), n = cleanName(name)
  if (!h || !n) return m
  return { ...m, [id]: { ...m[id], name: n, _ts: now } }
}

/** S.habits with `id` taken away, as a stamped clear so the removal syncs. */
export const withoutHabit = (map, id, now = Date.now()) => ({ ...(isMap(map) ? map : {}), [id]: { _ts: now } })

/** S.habits with a removed habit put back as it was (Undo). */
export const withHabitRestored = (map, habit, now = Date.now()) =>
  ({ ...(isMap(map) ? map : {}), [habit.id]: { name: habit.name, c: habit.c, at: habit.at, _ts: now } })

export const logKey = (iso, id) => iso + ':' + id

/** Whether `iso` can be ticked: a real date, today or earlier. */
export const canTickDay = (iso, today = todayISO()) => ISO.test(String(iso || '')) && iso <= today

/** Whether habit `id` is ticked on `iso`. */
export const isDone = (S, iso, id) => {
  const e = isMap(S?.habitLog) ? S.habitLog[logKey(iso, id)] : null
  return isMap(e) && e.done === 1
}

/** S.habitLog with habit `id` ticked (or unticked) on `iso`, stamped `now`. */
export function withTick(log, iso, id, done, now = Date.now()) {
  return { ...(isMap(log) ? log : {}), [logKey(iso, id)]: done ? { done: 1, _ts: now } : { _ts: now } }
}

/** The day a habit was added, as an ISO date (local time). */
export const addedOn = h => (h?.at ? isoOf(new Date(h.at)) : '0000-00-00')

/** The habits that count on `iso`: every current habit added on or before that day. */
export const habitsOn = (S, iso) => habitList(S).filter(h => addedOn(h) <= iso)

/** How `iso` went: { done, total, ids } over the habits that counted that day. */
export function dayHabits(S, iso) {
  const hs = habitsOn(S, iso)
  const ids = hs.filter(h => isDone(S, iso, h.id)).map(h => h.id)
  return { done: ids.length, total: hs.length, ids }
}

const shift = (iso, days) => { const d = dateOfISO(iso); d.setDate(d.getDate() + days); return isoOf(d) }

/**
 * The run of days in a row habit `id` was ticked, up to today. Today still open does not break it:
 * a streak that ran through yesterday stands until today is over.
 */
export function streakOf(S, id, today = todayISO()) {
  let day = isDone(S, today, id) ? today : shift(today, -1)
  let n = 0
  while (isDone(S, day, id)) { n++; day = shift(day, -1) }
  return n
}

/** The longest run of ticked days habit `id` ever had. */
export function bestStreakOf(S, id) {
  const days = Object.keys(isMap(S?.habitLog) ? S.habitLog : {})
    .filter(k => k.endsWith(':' + id)).map(k => k.slice(0, 10))
    .filter(d => ISO.test(d) && isDone(S, d, id)).sort()
  let best = 0, run = 0, prev = null
  for (const d of days) {
    run = prev && shift(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}

/** The `weeks` × 7 days ending with the week of `today`, as ISO dates, the week starting on `ws` (0 Sun, 1 Mon). */
export function recentDays(today = todayISO(), weeks = 5, ws = 1) {
  const end = dateOfISO(today)
  const back = (end.getDay() - ws + 7) % 7
  const first = new Date(end); first.setDate(end.getDate() - back - (weeks - 1) * 7)
  const out = []
  for (let i = 0; i < weeks * 7; i++) { const d = new Date(first); d.setDate(first.getDate() + i); out.push(isoOf(d)) }
  return out
}
