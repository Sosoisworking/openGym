import { describe, expect, it } from 'vitest'
import {
  readHabit, habitList, withHabit, withHabitName, withoutHabit, withHabitRestored, withTick, isDone,
  canTickDay, dayHabits, habitsOn, streakOf, bestStreakOf, recentDays, HABIT_MAX, HABIT_COLORS, logKey,
} from './habits.js'
import { mergeStampedMap } from './sync-merge.js'

const at = iso => new Date(iso + 'T08:00:00').getTime()
const add = (S, name, iso, id) => { S.habits = withHabit(S.habits, name, at(iso), id).map; return S }
const tick = (S, iso, id, done = true) => { S.habitLog = withTick(S.habitLog, iso, id, done, at(iso)); return S }

describe('adding and removing habits', () => {
  it('adds a habit with its name tidied, and keeps them in the order they were added', () => {
    const S = {}
    add(S, '  Drink   water ', '2026-10-01', 'w')
    add(S, 'Read', '2026-10-02', 'r')
    expect(habitList(S).map(h => [h.id, h.name])).toEqual([['w', 'Drink water'], ['r', 'Read']])
  })

  it('refuses an empty name, a name already there in another case, and a full list', () => {
    let S = add({}, 'Stretch', '2026-10-01', 'a')
    expect(withHabit(S.habits, '   ', 1, 'b').id).toBe(null)
    expect(withHabit(S.habits, 'stretch', 1, 'b').id).toBe(null)
    S = {}
    for (let i = 0; i < HABIT_MAX; i++) add(S, 'Habit ' + i, '2026-10-01', 'h' + i)
    expect(withHabit(S.habits, 'One more', 1, 'x').id).toBe(null)
  })

  it('gives each new habit a colour no other habit has while one is free', () => {
    const S = {}
    for (let i = 0; i < 3; i++) add(S, 'H' + i, '2026-10-01', 'h' + i)
    expect(habitList(S).map(h => h.c)).toEqual([0, 1, 2])
    S.habits = withoutHabit(S.habits, 'h1', 5)
    add(S, 'Next', '2026-10-02', 'n')
    expect(habitList(S).find(h => h.id === 'n').c).toBe(1)
  })

  it('removes a habit as a stamped clear, which wins a sync against the older copy', () => {
    const S = add({}, 'Water', '2026-10-01', 'w')
    const before = S.habits
    const after = withoutHabit(S.habits, 'w', at('2026-10-03'))
    expect(after.w).toEqual({ _ts: at('2026-10-03') })
    expect(habitList({ habits: mergeStampedMap(before, after) })).toEqual([])
    expect(habitList({ habits: mergeStampedMap(after, before) })).toEqual([])
  })

  it('puts a removed habit back as it was', () => {
    const S = add({}, 'Water', '2026-10-01', 'w')
    const h = habitList(S)[0]
    S.habits = withoutHabit(S.habits, 'w', 10)
    S.habits = withHabitRestored(S.habits, h, 20)
    expect(habitList(S)).toEqual([h])
  })

  it('renames, and ignores an empty new name', () => {
    const S = add({}, 'Water', '2026-10-01', 'w')
    S.habits = withHabitName(S.habits, 'w', 'Drink 3 L', 9)
    expect(habitList(S)[0].name).toBe('Drink 3 L')
    expect(withHabitName(S.habits, 'w', ' ', 10)).toBe(S.habits)
  })

  it('reads junk back as nothing', () => {
    expect(readHabit('x', null)).toBe(null)
    expect(readHabit('x', { name: 42 })).toBe(null)
    expect(readHabit('x', { _ts: 5 })).toBe(null)
    expect(readHabit('x', { name: 'Ok', c: 999 }).c).toBe(999 % HABIT_COLORS.length)
  })
})

describe('ticking a habit off', () => {
  it('ticks and unticks a day, the untick stamped so it syncs', () => {
    const S = add({}, 'Water', '2026-10-01', 'w')
    tick(S, '2026-10-05', 'w')
    expect(isDone(S, '2026-10-05', 'w')).toBe(true)
    tick(S, '2026-10-05', 'w', false)
    expect(isDone(S, '2026-10-05', 'w')).toBe(false)
    expect(S.habitLog[logKey('2026-10-05', 'w')]).toEqual({ _ts: at('2026-10-05') })
  })

  it('keeps both devices’ ticks of different habits through a merge', () => {
    const a = withTick({}, '2026-10-05', 'w', true, 10)
    const b = withTick({}, '2026-10-05', 'r', true, 20)
    const m = { habitLog: mergeStampedMap(a, b) }
    expect(isDone(m, '2026-10-05', 'w') && isDone(m, '2026-10-05', 'r')).toBe(true)
  })

  it('only lets today and the days before be ticked', () => {
    expect(canTickDay('2026-10-21', '2026-10-21')).toBe(true)
    expect(canTickDay('2026-10-01', '2026-10-21')).toBe(true)
    expect(canTickDay('2026-10-22', '2026-10-21')).toBe(false)
    expect(canTickDay('soon', '2026-10-21')).toBe(false)
  })
})

describe('a day on the calendar', () => {
  it('counts a habit from the day it was added, not before', () => {
    const S = add({}, 'Water', '2026-10-01', 'w')
    add(S, 'Read', '2026-10-10', 'r')
    expect(habitsOn(S, '2026-10-05').map(h => h.id)).toEqual(['w'])
    expect(habitsOn(S, '2026-10-10').map(h => h.id)).toEqual(['w', 'r'])
  })

  it('says which habits were done and out of how many', () => {
    const S = add({}, 'Water', '2026-10-01', 'w')
    add(S, 'Read', '2026-10-01', 'r')
    tick(S, '2026-10-05', 'r')
    expect(dayHabits(S, '2026-10-05')).toEqual({ done: 1, total: 2, ids: ['r'] })
  })

  it('leaves a removed habit out of the days it was ticked on', () => {
    const S = add({}, 'Water', '2026-10-01', 'w')
    tick(S, '2026-10-05', 'w')
    S.habits = withoutHabit(S.habits, 'w', 99)
    expect(dayHabits(S, '2026-10-05')).toEqual({ done: 0, total: 0, ids: [] })
  })
})

describe('streaks', () => {
  const S = add({}, 'Water', '2026-09-01', 'w')
  for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11']) tick(S, d, 'w')

  it('counts the days in a row up to today, and today still open does not break it', () => {
    expect(streakOf(S, 'w', '2026-10-11')).toBe(2)
    expect(streakOf(S, 'w', '2026-10-12')).toBe(2)
    expect(streakOf(S, 'w', '2026-10-13')).toBe(0)
  })

  it('finds the longest run ever', () => {
    expect(bestStreakOf(S, 'w')).toBe(3)
  })

  it('counts a run across a month end', () => {
    const T = add({}, 'Read', '2026-09-01', 'r')
    for (const d of ['2026-09-29', '2026-09-30', '2026-10-01']) tick(T, d, 'r')
    expect(streakOf(T, 'r', '2026-10-01')).toBe(3)
    expect(bestStreakOf(T, 'r')).toBe(3)
  })
})

describe('recentDays', () => {
  it('gives whole weeks ending with this one, starting on the chosen weekday', () => {
    const mon = recentDays('2026-10-21', 2, 1)
    expect(mon).toHaveLength(14)
    expect(mon[0]).toBe('2026-10-12')
    expect(mon.at(-1)).toBe('2026-10-25')
    expect(recentDays('2026-10-21', 1, 0)[0]).toBe('2026-10-18')
  })
})
