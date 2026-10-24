import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO, weekStartOf, weekOrder, DAYS, fmtDate } from '../lib/format.js'
import {
  habitList, habitColor, isDone, canTickDay, addedOn, streakOf, bestStreakOf, recentDays, dayHabits,
  HABIT_SUGGESTIONS, withHabitName,
} from '../lib/habits.js'
import { HabitRows, HabitAdd, addHabit, removeHabit, tickHabit } from '../components/Habits.jsx'
import Icon from '../components/Icon.jsx'
import { Button, TextField } from '../components/ui.jsx'
import { useUI } from '../store/useUI.js'

const WEEKS = 5

// Renaming is a small sheet of its own: the name is the only thing a habit has to edit.
function RenameHabit({ h, close }) {
  const [name, setName] = useState(h.name)
  const save = () => { useStore.getState().update(s => { s.habits = withHabitName(s.habits, h.id, name) }); close() }
  return <>
    <h3>{t('Rename habit')}</h3>
    <form onSubmit={e => { e.preventDefault(); save() }}>
      <TextField value={name} autoFocus maxLength={60} onChange={e => setName(e.target.value)} aria-label={t('Habit name')} />
      <div style={{ height: 12 }} />
      <Button variant="primary" type="submit" disabled={!name.trim()}>{t('Save')}</Button>
    </form>
  </>
}
const renameSheet = h => useUI.getState().openSheet(close => <RenameHabit h={h} close={close} />)

// One habit: its streaks and the last few weeks, a square per day to tick or untick.
function HabitCard({ S, h, days }) {
  const today = todayISO()
  const streak = streakOf(S, h.id), best = bestStreakOf(S, h.id)
  const since = addedOn(h)
  const doneIn = days.filter(d => isDone(S, d, h.id)).length
  return <div className="card" style={{ '--hc': habitColor(h) }}>
    <div className="habit-card-head">
      <span className="habit-swatch" style={{ background: habitColor(h) }} />
      <div className="ttl">{h.name}</div>
      <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 14 }} onClick={() => renameSheet(h)} aria-label={t('Rename {0}', h.name)}><Icon name="pencil" /></button>
      <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 14 }} onClick={() => removeHabit(h)} aria-label={t('Remove {0}', h.name)}><Icon name="trash" /></button>
    </div>
    <div className="habit-meta">
      {streak > 0 ? tn('{0}-day streak', '{0}-day streak', streak) : t('No streak yet')}
      {best > 1 && ' · ' + t('best {0}', best)}
      {' · ' + t('{0} of the last {1} days', doneIn, days.filter(d => d <= today && d >= since).length)}
    </div>
    <div className="habit-grid">
      {days.map(d => {
        const done = isDone(S, d, h.id)
        const before = d < since
        return <button key={d} disabled={!canTickDay(d) || before}
          className={(done ? 'on' : '') + (d === today ? ' today' : '') + (before ? ' off' : '')}
          title={fmtDate(d, true)} aria-label={fmtDate(d, true) + (done ? ', ' + t('done') : '')} aria-pressed={done}
          onClick={() => tickHabit(d, h.id, !done)}>{Number(d.slice(8))}</button>
      })}
    </div>
  </div>
}

export default function Habits() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [editing, setEditing] = useState(false)
  const habits = habitList(S)
  const today = todayISO()
  const { done, total } = dayHabits(S, today)
  const ws = weekStartOf(S)
  const days = recentDays(today, WEEKS, ws)
  const taken = new Set(habits.map(h => h.name.toLowerCase()))
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Habits')}</h1>
        <div className="sub">{total ? t('{0} of {1} done today', done, total) : t('Tick them off once a day')}</div></div>
    </div>

    <div className="card">
      <div className="habit-head">
        <h2>{t('Today')}</h2>
        {habits.length > 0 && <button className="iconbtn" onClick={() => setEditing(v => !v)} aria-pressed={editing}
          aria-label={editing ? t('Done') : t('Edit habits')}><Icon name={editing ? 'check' : 'pencil'} /></button>}
      </div>
      <HabitRows iso={today} editing={editing} />
      <HabitAdd />
    </div>

    {habits.length > 0 && <>
      <h2 className="sect-t">{t('The last {0} weeks', WEEKS)}</h2>
      <div className="cal-grid" style={{ margin: '0 16px 8px', gap: 4 }} aria-hidden="true">
        {weekOrder(ws).map(d => <div key={d} className="cal-h">{t(DAYS[d])}</div>)}
      </div>
      {habits.map(h => <HabitCard key={h.id} S={S} h={h} days={days} />)}
    </>}

    <h2 className="sect-t">{t('Ideas')}</h2>
    {Object.entries(HABIT_SUGGESTIONS).map(([group, names]) => {
      const left = names.filter(n => !taken.has(n.toLowerCase()))
      if (!left.length) return null
      return <div key={group} className="card">
        <h2 style={{ marginBottom: 0 }}>{t(group)}</h2>
        <div className="habit-ideas">{left.map(n => <button key={n} className="chip" onClick={() => addHabit(t(n))}><Icon name="plus" /> {t(n)}</button>)}</div>
      </div>
    })}
  </div>
}
