import { describe, expect, it } from 'vitest'
import { EXIDX } from './exercises.js'
import { ALL_EQUIPMENT, eqAvailable } from './equipment.js'
import { buildStarterPlan, starterPlanDays, starterPlanOptions, starterRoutines, previewPlan } from './starter.js'

// The approved prescription, written out again rather than imported: a test that reads the
// same table as the code would pass no matter what that table said. [weekday, name, exercises],
// each exercise [id, sets, reps], [id, sets, low, high] for a rep range, or [id, sets, '45s'] for a
// timed set. A split's own exercises are named instead of numbered (their ids are minted).
const PUSH = [['0025', 4, 6], ['0314', 3, 10], ['1162', 3, 8], ['0334', 3, 15], ['0201', 3, 12]]
const PULL = [['0032', 3, 5], ['0652', 4, 8], ['0861', 3, 10], ['5609', 3, 15], ['0031', 3, 10]]
const LEGS = [['0043', 4, 6], ['0085', 3, 8], ['0739', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]
const UPPER = [['0025', 4, 6], ['0027', 4, 8], ['0405', 3, 10], ['2330', 3, 10], ['0294', 3, 12], ['0201', 3, 12]]
const LOWER = [['0043', 4, 6], ['0085', 3, 8], ['0410', 3, 10], ['0586', 3, 12], ['0594', 4, 15]]
const KB = n => ['Kettlebell circuit ' + n, 1, '1200s']

const APPROVED = {
  ppl: [[1, 'Push', PUSH], [3, 'Pull', PULL], [5, 'Legs', LEGS]],
  'ppl-abs': [[1, 'Push', PUSH], [2, 'Pull', PULL], [4, 'Legs', LEGS],
    [5, 'Abs', [['0472', 3, 12], ['0175', 3, 15], ['0463', 3, '45s'], ['0715', 3, '30s']]]],
  'ppl-ul': [[1, 'Push', PUSH], [2, 'Pull', PULL], [3, 'Legs', LEGS], [5, 'Upper', UPPER], [6, 'Lower', LOWER]],
  'upper-lower': [
    [1, 'Upper A', UPPER],
    [2, 'Lower A', LOWER],
    [4, 'Upper B', [['0047', 4, 8], ['0292', 4, 10], ['0334', 3, 15], ['1326', 3, 8], ['0313', 3, 12], ['2188', 3, 12]]],
    [5, 'Lower B', [['0042', 4, 8], ['1060', 3, 10], ['4295', 3, 12], ['0585', 3, 15], ['0605', 4, 15]]],
  ],
  'full-body': [
    [1, 'Full body A', [['0043', 3, 6], ['0025', 3, 6], ['0027', 3, 8], ['0463', 3, '45s']]],
    [3, 'Full body B', [['0032', 3, 5], ['1162', 3, 8], ['2330', 3, 10], ['0472', 3, 12]]],
    [5, 'Full body C', [['0042', 3, 8], ['0314', 3, 10], ['0861', 3, 10], ['0175', 3, 15]]],
  ],
  bro: [
    [1, 'Chest', [['0025', 4, 8], ['0314', 3, 10], ['0576', 3, 12], ['0227', 3, 15]]],
    [2, 'Back', [['0032', 3, 5], ['0652', 4, 8], ['0027', 3, 10], ['0861', 3, 12]]],
    [3, 'Shoulders', [['1162', 4, 8], ['0405', 3, 10], ['0334', 4, 15], ['0378', 3, 15]]],
    [4, 'Legs', LEGS],
    [5, 'Arms', [['0031', 3, 10], ['0313', 3, 12], ['0030', 3, 10], ['0201', 3, 12], ['0070', 3, 12]]],
  ],
  batman: [
    [1, 'Chest / Shoulders / Biceps', [['0047', 3, 6, 8], ['0289', 3, 8, 10], ['1299', 2, 8, 10], ['1030', 2, 12, 15],
      ['0405', 3, 8, 10], ['0584', 3, 8, 10], ['0178', 2, 10, 12], ['Archer pull', 3, 8, 10], ['0310', 3, 12, 15],
      ['Bayesian curl', 2, 10, 12], ['0070', 3, 8, 12], KB(1)]],
    [2, 'Back / Triceps', [['2330', 3, 10, 12], ['0861', 2, 12, 15], ['0032', 4, 8, 10], ['1204', 3, 8, 10], ['0606', 2, 8, 10],
      ['0238', 2, 12, 15], ['0378', 3, 12, 15], ['0225', 3, 12, 15], ['0406', 3, 12, 15], ['0201', 3, 10, 12],
      ['2188', 3, 10, 12], KB(2)]],
    [4, 'Legs / Core', [['1060', 4, 8, 10], ['0043', 3, 8, 10], ['0085', 3, 8, 10], ['0739', 3, 10, 12], ['0585', 2, 12, 15],
      ['0586', 2, 12, 15], ['0597', 3, 10, 12], ['0598', 3, 10, 12], ['0605', 2, 15, 20], ['0175', 3, 12, 15], KB(3)]],
    [5, 'Chest / Back', [['0025', 3, 8, 10], ['0841', 3, 8, 12], ['0314', 3, 8, 10], ['0581', 2, 8, 10], ['0576', 2, 10, 12],
      ['11253', 2, 12, 15], ['0227', 2, 12, 15], KB(1)]],
    [6, 'Shoulders / Arms', [['0603', 2, 8, 10], ['0334', 3, 8, 12], ['0178', 2, 10, 12], ['0162', 3, 12, 15], ['0225', 3, 12, 15],
      ['Archer pull', 3, 8, 10], ['0294', 3, 8, 10], ['0313', 2, 10, 12], ['0868', 3, 8, 10], ['0166', 2, 10, 12],
      ['2188', 3, 10, 12], ['0194', 3, 10, 12], ['1723', 3, 10, 12], KB(2)]],
    [0, 'Active recovery', [KB(3)]],
  ],
  '5x5': [
    [1, '5×5 A', [['0043', 5, 5], ['0025', 5, 5], ['0027', 5, 5]]],
    [3, '5×5 B', [['0085', 5, 5], ['0426', 5, 5], ['2330', 5, 5]]],
    [5, '5×5 C', [['0739', 5, 5], ['0047', 5, 5], ['1323', 5, 5]]],
  ],
}

// A built routine in the table's own notation.
const shapeOf = plan => r => r.ex.map(e => {
  const own = (plan.customEx || []).find(c => c.id === e.id)
  const id = own ? own.n : e.id
  if (e.mode === 'time') return [id, e.sets, e.sec + 's']
  return e.repsMin ? [id, e.sets, e.repsMin, e.reps] : [id, e.sets, e.reps]
})
const DEMO_PPL = [
  ['Push Day', [['0025', 4, 8], ['0047', 3, 10], ['0426', 3, 10], ['0334', 3, 12], ['0241', 3, 12], ['0251', 3, 10]]],
  ['Pull Day', [['2330', 4, 10], ['0027', 4, 8], ['1323', 3, 10], ['0031', 3, 10], ['0313', 3, 12]]],
  ['Leg Day', [['0043', 4, 8], ['0085', 3, 10], ['0739', 3, 12], ['0585', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]],
]

describe('the split catalog', () => {
  it('offers the eight splits in order, with the day count read off the schedule', () => {
    expect(starterPlanOptions()).toEqual([
      { id: 'ppl', days: 3 }, { id: 'ppl-abs', days: 4 }, { id: 'ppl-ul', days: 5 }, { id: 'upper-lower', days: 4 },
      { id: 'full-body', days: 3 }, { id: 'bro', days: 5 }, { id: 'batman', days: 6 }, { id: '5x5', days: 3 },
    ])
    for (const { id, days } of starterPlanOptions()) expect(starterPlanDays(id)).toHaveLength(days)
  })

  it('changes nothing for an unknown id', () => {
    expect(buildStarterPlan('nope')).toBeNull()
    expect(buildStarterPlan(undefined)).toBeNull()
    // A click handler wired straight to a loader would hand the event in as the plan.
    expect(buildStarterPlan({ type: 'click' })).toBeNull()
    expect(starterPlanDays('nope')).toBeNull()
    expect(previewPlan('nope')).toBeNull()
  })
})

describe.each(Object.keys(APPROVED))('%s', planId => {
  const approved = APPROVED[planId]

  it('builds the approved exercises, sets and reps in order', () => {
    const plan = buildStarterPlan(planId)
    expect(plan.routines.map(r => r.name)).toEqual(approved.map(([, name]) => name))
    plan.routines.forEach((r, i) => expect(shapeOf(plan)(r)).toEqual(approved[i][2]))
  })

  it('puts each routine on its approved weekday, by identity not position', () => {
    const { routines, schedule } = buildStarterPlan(planId)
    const nameOf = Object.fromEntries(routines.map(r => [r.id, r.name]))
    expect(schedule.map(({ day, routineId }) => [day, nameOf[routineId]]))
      .toEqual(approved.map(([day, name]) => [day, name]))
  })

  it('references only real exercises and starts every one at weight 0', () => {
    const plan = buildStarterPlan(planId)
    for (const r of plan.routines) {
      for (const e of r.ex) {
        expect(EXIDX[e.id] || plan.customEx.find(c => c.id === e.id), e.id).toBeTruthy()
        expect(e.sets).toBeGreaterThan(0)
        expect(e.mode === 'time' ? e.sec : e.reps).toBeGreaterThan(0)
        expect(e.weight).toBe(0)
      }
    }
  })

  it('previews the same week it loads', () => {
    const preview = previewPlan(planId)
    expect(preview.map(d => [d.day, d.name])).toEqual(approved.map(([day, name]) => [day, name]))
    expect(preview.map(d => d.ex.length)).toEqual(approved.map(([, , list]) => list.length))
  })

  it('mints fresh ids and independent objects on every build', () => {
    const first = buildStarterPlan(planId)
    const second = buildStarterPlan(planId)
    const ids = first.routines.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(second.routines.some(r => ids.includes(r.id))).toBe(false)
    expect(first.routines[0].ex[0]).not.toBe(second.routines[0].ex[0])
    // and the static definition survives a caller mutating what it got back
    first.routines[0].ex[0].sets = 99
    expect(buildStarterPlan(planId).routines[0].ex[0].sets).toBe(approved[0][2][0][1])
  })
})

describe('how a split writes its exercises', () => {
  it('trains a rep range with double progression, and a fixed target with the default', () => {
    const batman = buildStarterPlan('batman').routines[0].ex[0]
    expect(batman).toMatchObject({ id: '0047', sets: 3, reps: 8, repsMin: 6, prog: 'double' })
    const ppl = buildStarterPlan('ppl').routines[0].ex[0]
    expect(ppl).toEqual({ id: '0025', sets: 4, reps: 6, weight: 0 })
  })

  it('times a plank instead of counting it', () => {
    const plank = buildStarterPlan('ppl-abs').routines[3].ex[2]
    expect(plank).toEqual({ id: '0463', sets: 3, sec: 45, mode: 'time', weight: 0 })
  })

  it('brings the Batman split’s own exercises once, each with its description', () => {
    const { customEx, routines } = buildStarterPlan('batman')
    expect(customEx.map(c => c.n)).toEqual(['Archer pull', 'Bayesian curl', 'Kettlebell circuit 1', 'Kettlebell circuit 2', 'Kettlebell circuit 3'])
    for (const c of customEx) {
      expect(c.custom).toBe(true)
      expect(c.id).toMatch(/^c/)
      expect(c.desc.length).toBeGreaterThan(20)
    }
    expect(customEx.find(c => c.n === 'Kettlebell circuit 1').desc).toContain('cleans')
    // the archer pull is on two days, as the same exercise
    const archer = customEx.find(c => c.n === 'Archer pull').id
    expect(routines.filter(r => r.ex.some(e => e.id === archer)).map(r => r.name)).toEqual(['Chest / Shoulders / Biceps', 'Shoulders / Arms'])
  })

  it('reuses an exercise of yours with the same name instead of adding a second', () => {
    const mine = [{ id: 'my-archer', n: 'archer PULL', custom: true }]
    const { customEx, routines } = buildStarterPlan('batman', undefined, mine)
    expect(customEx.map(c => c.n)).not.toContain('Archer pull')
    expect(routines[0].ex.some(e => e.id === 'my-archer')).toBe(true)
  })

  it('adds no exercises of its own for a split made only of catalogue ones', () => {
    expect(buildStarterPlan('ppl').customEx).toEqual([])
  })
})

describe('starterRoutines (the demo build entry point)', () => {
  it('still returns its own push, pull and legs, unchanged', () => {
    const routines = starterRoutines()
    expect(routines.map(r => r.name)).toEqual(DEMO_PPL.map(([name]) => name))
    routines.forEach((r, i) => expect(r.ex.map(e => [e.id, e.sets, e.reps])).toEqual(DEMO_PPL[i][1]))
    expect(routines.map(r => r.emoji)).toEqual(['barbell', 'pullup', 'legs'])
  })

  it('mints fresh ids on every invocation', () => {
    const first = starterRoutines().map(r => r.id)
    const second = starterRoutines().map(r => r.id)
    expect(new Set([...first, ...second]).size).toBe(6)
  })
})

describe('fitting a split to equipment', () => {
  // catalogue exercises only: a split's own exercises are yours to do as you can
  const ids = plan => plan.routines.flatMap(r => r.ex.map(e => e.id)).filter(id => !plan.customEx.some(c => c.id === id))

  it('changes nothing when the equipment already covers the split', () => {
    const fitted = buildStarterPlan('ppl', ALL_EQUIPMENT)
    expect(fitted.routines.map(shapeOf(fitted))).toEqual(APPROVED.ppl.map(([, , list]) => list))
    expect(fitted.fit).toEqual({ swapped: 0, dropped: 0 })
  })

  it('has no fit report when no equipment is given', () => {
    expect(buildStarterPlan('ppl').fit).toBeUndefined()
  })

  it('swaps only what the equipment cannot do, keeping sets and reps', () => {
    const fitted = buildStarterPlan('ppl', ['dumbbell', 'bench'])
    const push = fitted.routines[0]
    // the dumbbell exercises stay put (the incline press needs the bench too); the barbell bench,
    // the barbell press and the cable pushdown are swapped
    expect(push.ex.map(e => e.id)).toContain('0314')
    expect(push.ex.map(e => e.id)).toContain('0334')
    expect(push.ex[0].id).not.toBe('0025')
    expect(push.ex[0].sets).toBe(4)
    expect(push.ex[0].reps).toBe(6)
    expect(fitted.fit.swapped).toBeGreaterThan(0)
  })

  it('keeps a rep range and its progression when it swaps the exercise', () => {
    const first = buildStarterPlan('batman', ['dumbbell']).routines[0].ex[0]
    expect(first.id).not.toBe('0047')
    expect(first).toMatchObject({ sets: 3, reps: 8, repsMin: 6, prog: 'double' })
  })

  it('keeps the split’s own exercises whatever the equipment', () => {
    const fitted = buildStarterPlan('batman', [])
    expect(fitted.customEx).toHaveLength(5)
    expect(fitted.routines.find(r => r.name === 'Active recovery')).toBeTruthy()
  })

  it('only ever uses exercises the equipment allows (body weight is always allowed)', () => {
    for (const eq of [['dumbbell'], ['barbell', 'dumbbell'], ['band'], []]) {
      for (const { id } of starterPlanOptions()) {
        const fitted = buildStarterPlan(id, eq)
        for (const exId of ids(fitted)) expect(eqAvailable(eq, EXIDX[exId])).toBe(true)
      }
    }
  })

  it('never repeats an exercise inside one routine', () => {
    for (const eq of [['dumbbell'], ['band'], []]) {
      for (const { id } of starterPlanOptions()) {
        for (const r of buildStarterPlan(id, eq).routines) {
          const own = r.ex.map(e => e.id)
          expect(new Set(own).size, `${id} ${r.name}`).toBe(own.length)
        }
      }
    }
  })

  it('never stands in with a stretch, a hold or a drill that needs a ball nobody ticked', () => {
    const bad = /stretch|isometric|squeeze|yoga|toe touch|exercise ball|bosu/i
    for (const eq of [['dumbbell'], ['band'], []]) {
      for (const { id } of starterPlanOptions()) {
        const plan = buildStarterPlan(id, eq)
        const written = new Set(buildStarterPlan(id).routines.flatMap(r => r.ex.map(e => e.id)))
        // the split's own planks are holds on purpose; only stand-ins are checked
        for (const exId of ids(plan).filter(i => !written.has(i))) expect(EXIDX[exId].n).not.toMatch(bad)
      }
    }
  })

  it('prefers a loaded exercise over a body-weight drill for a loaded lift', () => {
    // the lying leg curl has no dumbbell twin; a loaded leg exercise still wins over a drill
    const legs = buildStarterPlan('ppl', ['dumbbell']).routines.find(r => r.name === 'Legs')
    const swappedIn = legs.ex[3]
    expect(swappedIn.id).not.toBe('0586')
    expect(EXIDX[swappedIn.id].eq).toBe('dumbbell')
    expect(EXIDX[swappedIn.id].bp).toBe('upper legs')
  })

  it('swaps a barbell bench press for chest work with the same kit, not a push-up', () => {
    const push = buildStarterPlan('ppl', ['dumbbell']).routines[0]
    expect(EXIDX[push.ex[0].id].eq).toBe('dumbbell')
    expect(EXIDX[push.ex[0].id].bp).toBe('chest')
  })

  it('is deterministic', () => {
    const a = buildStarterPlan('upper-lower', ['dumbbell'])
    const b = buildStarterPlan('upper-lower', ['dumbbell'])
    expect(a.routines.map(shapeOf(a))).toEqual(b.routines.map(shapeOf(b)))
  })

  it('keeps every scheduled day pointing at a routine that exists', () => {
    for (const { id } of starterPlanOptions()) {
      const fitted = buildStarterPlan(id, [])
      const have = new Set(fitted.routines.map(r => r.id))
      for (const { routineId } of fitted.schedule) expect(have.has(routineId)).toBe(true)
    }
  })
})
