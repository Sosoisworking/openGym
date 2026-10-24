// A month as a grid of days: what was trained, planned or rescheduled (the dot), a day off with a
// note, and the habits done that day (a dot per habit, in its colour). Home's calendar card shows
// it when switched to Month, and the calendar sheet wraps it with a month summary. Tapping a day
// is the caller's: both open the day sheet (sheets.jsx daySheet).
import { todayISO, weekStartOf, weekDayOffset, weekOrder, DAYS } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { effectiveRoutineIds, workoutDay } from '../lib/history.js'
import { pinState } from '../lib/queue.js'
import { dayNoteOf, dayNoteLine } from '../lib/day-notes.js'
import { dayHabits, habitList, habitColor } from '../lib/habits.js'
import { HabitDots } from './Habits.jsx'

const pad = n => String(n).padStart(2, '0')

/** `month` is any Date in the month to show. */
export default function MonthCalendar({ S, month, onDay, legend = true }) {
  const y = month.getFullYear(), mo = month.getMonth()
  const prefix = y + '-' + pad(mo + 1)
  const today = todayISO()
  const trained = new Set(S.workouts.map(w => workoutDay(w)).filter(Boolean))
  const ws = weekStartOf(S)
  const startOffset = weekDayOffset(new Date(y, mo, 1).getDay(), ws)
  const daysIn = new Date(y, mo + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(<div key={'e' + i} />)
  let noted = false, habitDays = false
  for (let d = 1; d <= daysIn; d++) {
    const iso = prefix + '-' + pad(d)
    const done = trained.has(iso)
    const planned = effectiveRoutineIds(S, iso).length > 0
    // A fulfilled pin (a coach session pinned here and since done) reads as no override, as it does everywhere else.
    const ovr = S.dayPlan[iso] !== undefined && pinState(S, S.dayPlan[iso]) !== 'done'
    // A day off with a note on it (#261) shows the note's dot instead of the plan's, and its note as the tooltip.
    const note = !done && dayNoteOf(S, iso)
    if (note) noted = true
    const habits = iso <= today ? dayHabits(S, iso) : null
    if (habits?.done) habitDays = true
    const dotCls = done ? 'done' : note ? 'noted' : ovr && planned ? 'ovr' : planned ? 'plan' : ''
    const label = [note ? dayNoteLine(note, t) : '', habits?.total ? t('{0} of {1} habits', habits.done, habits.total) : ''].filter(Boolean).join(' · ')
    cells.push(<button key={d} className={'cal-d' + (done ? ' has' : '') + (note ? ' noted' : '') + (iso === today ? ' today' : '') + (iso > today ? ' future' : '')}
      title={label || undefined} onClick={() => onDay(iso)}>
      <span>{d}</span><i className={dotCls} />
      {habits && <HabitDots S={S} ids={habits.ids} max={4} />}
    </button>)
  }
  const habits = habitList(S)
  return <>
    <div className="cal-grid">{weekOrder(ws).map(d => <div key={d} className="cal-h">{t(DAYS[d])}</div>)}{cells}</div>
    {legend && <div className="cal-legend">
      <span><i style={{ background: 'var(--acc)' }} />{t('Trained')}</span>
      <span><i style={{ background: 'var(--label-3)' }} />{t('Planned')}</span>
      <span><i style={{ background: 'var(--orange)' }} />{t('Rescheduled')}</span>
      {noted && <span><i style={{ background: 'var(--indigo)' }} />{t('Day note')}</span>}
      {habitDays && habits.map(h => <span key={h.id}><i style={{ background: habitColor(h) }} />{h.name}</span>)}
    </div>}
  </>
}
