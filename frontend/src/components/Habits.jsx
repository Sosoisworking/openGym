// The habit pieces every screen shares: the tick-off rows for one day, the field that adds a
// habit, and the coloured dots a calendar day shows for the habits done on it. The rules live in
// lib/habits.js; this file only draws them and writes through the store.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import {
  habitList, habitsOn, habitColor, isDone, canTickDay, streakOf, withTick, withHabit, withoutHabit,
  withHabitRestored, HABIT_NAME_MAX, HABIT_MAX,
} from '../lib/habits.js'
import Icon from './Icon.jsx'
import { Check } from './ui.jsx'

const update = fn => useStore.getState().update(fn)
const toast = (msg, opts) => useUI.getState().toast(msg, opts)

export function tickHabit(iso, id, done) {
  update(s => { s.habitLog = withTick(s.habitLog, iso, id, done) })
}

/** Adds a habit; says why when it cannot. Returns whether it was added. */
export function addHabit(name) {
  const S = useStore.getState().S
  const clean = String(name || '').trim()
  if (!clean) return false
  if (habitList(S).length >= HABIT_MAX) { toast(t('That’s {0} habits already. Remove one to add another.', HABIT_MAX)); return false }
  const { id } = withHabit(S.habits, clean)
  if (!id) { toast(t('You already track “{0}”.', clean)); return false }
  update(s => { s.habits = withHabit(s.habits, clean, Date.now(), id).map })
  return true
}

/** Removes a habit, with an Undo that puts it back with its colour and its ticks. */
export function removeHabit(h) {
  update(s => { s.habits = withoutHabit(s.habits, h.id) })
  toast(t('Removed “{0}”', h.name), { action: t('Undo'), onAction: () => update(s => { s.habits = withHabitRestored(s.habits, h) }) })
}

/** One day's habits as rows to tick off. A done habit is struck through, in its calendar colour. */
export function HabitRows({ iso = todayISO(), editing = false, showStreak = true }) {
  const S = useStore(s => s.S)
  const habits = habitsOn(S, iso)
  const open = canTickDay(iso)
  if (!habits.length) return null
  return <div className="habit-rows">
    {habits.map(h => {
      const done = isDone(S, iso, h.id)
      const streak = showStreak && iso === todayISO() ? streakOf(S, h.id) : 0
      return <div key={h.id} className={'habit-row' + (done ? ' done' : '')} style={{ '--hc': habitColor(h) }}>
        <Check checked={done} label={h.name} className="habit-chk" onChange={v => open && tickHabit(iso, h.id, v)} />
        <span className="habit-name">{h.name}</span>
        {streak > 1 && <span className="habit-streak" title={tn('{0}-day streak', '{0}-day streak', streak)}><Icon name="flame" />{streak}</span>}
        {editing && <button className="iconbtn habit-x" onClick={() => removeHabit(h)} aria-label={t('Remove {0}', h.name)}><Icon name="xmark" /></button>}
      </div>
    })}
  </div>
}

/** The field a new habit is typed into. */
export function HabitAdd({ autoFocus = false, placeholder }) {
  const [name, setName] = useState('')
  const submit = () => { if (addHabit(name)) setName('') }
  return <form className="habit-add" onSubmit={e => { e.preventDefault(); submit() }}>
    <input className="input" value={name} maxLength={HABIT_NAME_MAX} autoFocus={autoFocus}
      placeholder={placeholder || t('Add a habit, e.g. Drink 2 L of water')} aria-label={t('New habit')}
      onChange={e => setName(e.target.value)} enterKeyHint="done" />
    <button type="submit" className="iconbtn habit-plus" disabled={!name.trim()} aria-label={t('Add habit')}><Icon name="plus" /></button>
  </form>
}

/** The dots a calendar day shows: one per habit done that day, in the habit's colour. */
export function HabitDots({ S, ids, max = 5 }) {
  if (!ids?.length) return null
  const byId = new Map(habitList(S).map(h => [h.id, h]))
  const shown = ids.map(id => byId.get(id)).filter(Boolean)
  return <span className="habit-dots" aria-hidden="true">
    {shown.slice(0, max).map(h => <b key={h.id} style={{ background: habitColor(h) }} />)}
    {shown.length > max && <b className="more" />}
  </span>
}
