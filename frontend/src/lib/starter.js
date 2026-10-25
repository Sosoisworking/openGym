// The workout splits a plan can start from. Training data only: each split's name and blurb live
// in sheets.jsx (SPLIT_COPY), beside the chooser that shows them.
//
// The splits are Kusuo's (Soso's split templates), carried over with their exercises, sets and rep
// ranges, plus the 5×5 that Tarnished had already. A routine is [key, name, glyph, entries]; the
// key is what a split's schedule points at, so a weekday never depends on where a routine sits in
// the list. Names stay as written: they become ordinary routines you can rename.
//
// An entry is one exercise:
//   x(id, sets, reps)            a fixed target, e.g. 4 × 6
//   x(id, sets, low, high)       a rep range, e.g. 3 × 8–10, trained with double progression
//   hold(id, sets, sec)          a timed set (planks)
//   circuit(key)                 one of the split's own exercises, 20 minutes on the clock
// `custom` names an exercise the catalogue has no match for; loading the split adds it to your own
// exercises (CUSTOM below), or reuses the one you already have under that name.
import { uid } from './format.js'
import { EXIDX } from './exercises.js'
import { eqAvailable, ALL_EQUIPMENT } from './equipment.js'

const x = (id, sets, lo, hi = lo) => ({ id, sets, lo, hi })
const hold = (id, sets, sec) => ({ id, sets, sec })
const own = (custom, sets, lo, hi = lo) => ({ custom, sets, lo, hi })
const circuit = custom => ({ custom, sets: 1, sec: 1200 })

// The exercises some splits need that the catalogue does not have, written the way a custom
// exercise is stored (sheets.jsx CustomExForm). The circuits are logged by time; their rounds are
// in the description, which the exercise sheet shows.
const ROUNDS = 'Work through the rounds for 20 minutes, with a 1-minute break after every 2 rounds. Each round: '
export const CUSTOM = {
  'archer-pull': { n: 'Archer pull', bp: 'shoulders', eq: 'cable', tg: 'delts', sm: ['rear deltoids', 'rhomboids', 'upper back'],
    desc: 'One arm at a time on a cable: pull across the body with the elbow high and finish like drawing a bow. Rear delts and upper back.' },
  'bayesian-curl': { n: 'Bayesian curl', bp: 'upper arms', eq: 'cable', tg: 'biceps', sm: ['forearms'],
    desc: 'Face away from a low cable with the arm behind your body, then curl. The biceps work from a stretched position.' },
  'kettlebell-1': { n: 'Kettlebell circuit 1', bp: 'cardio', eq: 'kettlebell', tg: 'cardiovascular system', sm: [],
    desc: ROUNDS + '10 cleans, 10 horizontal press + twist (both sides), 10 swings, 10 around-the-world halos (right and left), 10 six curl + press.' },
  'kettlebell-2': { n: 'Kettlebell circuit 2', bp: 'cardio', eq: 'kettlebell', tg: 'cardiovascular system', sm: [],
    desc: ROUNDS + '10 goblet squats, 10 bent-over rows, 10 skull crushers, 10 narrow cheat presses, 10 devil’s halos.' },
  'kettlebell-3': { n: 'Kettlebell circuit 3', bp: 'cardio', eq: 'kettlebell', tg: 'cardiovascular system', sm: [],
    desc: ROUNDS + '10 bent-over rows, 10 cleans, 10 crush presses, 10 swings, 10 around-the-world halos (right and left).' },
}

// Catalogue ids, named once so the splits below read as exercises, not numbers.
const E = {
  bench: '0025', inclineBench: '0047', dbBench: '0289', inclineDb: '0314', chestPress: '0576', cableFly: '0227',
  ohp: '1162', dbShoulderPress: '0405', lateral: '0334', cableLateral: '0178', pushdown: '0201', ohTriceps: '2188',
  closeGrip: '0030', deadlift: '0032', row: '0027', pullUp: '0652', chinUp: '1326', pulldown: '2330',
  cableRow: '0861', dbRow: '0292', facePull: '5609', rearFly: '0378', curl: '0031', dbCurl: '0294', hammer: '0313',
  preacher: '0070', shrug: '0406', squat: '0043', frontSquat: '0042', legPress: '0739', splitSquat: '0410',
  lunge: '4295', legExt: '0585', rdl: '0085', legCurl: '0586', hipThrust: '1060', calf: '0605', seatedCalf: '0594',
  legRaise: '0472', cableCrunch: '0175', plank: '0463', sidePlank: '0715',
  machineIncline: '1299', pecDeck: '1030', machineLateral: '0584', machineShoulder: '0603', frontRaise: '0310',
  cableFrontRaise: '0162', rearCross: '0225', cableCurl: '0868', cableHammer: '0166', armPulldown: '1204',
  tBarRow: '0606', straightArm: '0238', weightedPullUp: '0841', highRow: '0581', kneelingPulldown: '11253',
  cableTriceps: '0194', armPushdown: '1723', abduction: '0597', adduction: '0598',
}

const PUSH = ['push', 'Push', 'barbell', [x(E.bench, 4, 6), x(E.inclineDb, 3, 10), x(E.ohp, 3, 8), x(E.lateral, 3, 15), x(E.pushdown, 3, 12)]]
const PULL = ['pull', 'Pull', 'pullup', [x(E.deadlift, 3, 5), x(E.pullUp, 4, 8), x(E.cableRow, 3, 10), x(E.facePull, 3, 15), x(E.curl, 3, 10)]]
const LEGS = ['legs', 'Legs', 'legs', [x(E.squat, 4, 6), x(E.rdl, 3, 8), x(E.legPress, 3, 12), x(E.legCurl, 3, 12), x(E.calf, 4, 15)]]
const ABS = ['abs', 'Abs', 'abs', [x(E.legRaise, 3, 12), x(E.cableCrunch, 3, 15), hold(E.plank, 3, 45), hold(E.sidePlank, 3, 30)]]
const UPPER = ['upper', 'Upper', 'barbell', [x(E.bench, 4, 6), x(E.row, 4, 8), x(E.dbShoulderPress, 3, 10), x(E.pulldown, 3, 10), x(E.dbCurl, 3, 12), x(E.pushdown, 3, 12)]]
const LOWER = ['lower', 'Lower', 'legs', [x(E.squat, 4, 6), x(E.rdl, 3, 8), x(E.splitSquat, 3, 10), x(E.legCurl, 3, 12), x(E.seatedCalf, 4, 15)]]

const UPPER_LOWER = [
  ['upper-a', 'Upper A', UPPER[2], UPPER[3]],
  ['lower-a', 'Lower A', LOWER[2], LOWER[3]],
  ['upper-b', 'Upper B', 'barbell', [x(E.inclineBench, 4, 8), x(E.dbRow, 4, 10), x(E.lateral, 3, 15), x(E.chinUp, 3, 8), x(E.hammer, 3, 12), x(E.ohTriceps, 3, 12)]],
  ['lower-b', 'Lower B', 'legs', [x(E.frontSquat, 4, 8), x(E.hipThrust, 3, 10), x(E.lunge, 3, 12), x(E.legExt, 3, 15), x(E.calf, 4, 15)]],
]

const FULL_BODY = [
  ['fb-a', 'Full body A', 'figureStrength', [x(E.squat, 3, 6), x(E.bench, 3, 6), x(E.row, 3, 8), hold(E.plank, 3, 45)]],
  ['fb-b', 'Full body B', 'figureStrength', [x(E.deadlift, 3, 5), x(E.ohp, 3, 8), x(E.pulldown, 3, 10), x(E.legRaise, 3, 12)]],
  ['fb-c', 'Full body C', 'figureStrength', [x(E.frontSquat, 3, 8), x(E.inclineDb, 3, 10), x(E.cableRow, 3, 10), x(E.cableCrunch, 3, 15)]],
]

const BRO = [
  ['chest', 'Chest', 'barbell', [x(E.bench, 4, 8), x(E.inclineDb, 3, 10), x(E.chestPress, 3, 12), x(E.cableFly, 3, 15)]],
  ['back', 'Back', 'pullup', [x(E.deadlift, 3, 5), x(E.pullUp, 4, 8), x(E.row, 3, 10), x(E.cableRow, 3, 12)]],
  ['shoulders', 'Shoulders', 'dumbbell', [x(E.ohp, 4, 8), x(E.dbShoulderPress, 3, 10), x(E.lateral, 4, 15), x(E.rearFly, 3, 15)]],
  ['legs', 'Legs', LEGS[2], LEGS[3]],
  ['arms', 'Arms', 'arm', [x(E.curl, 3, 10), x(E.hammer, 3, 12), x(E.closeGrip, 3, 10), x(E.pushdown, 3, 12), x(E.preacher, 3, 12)]],
]

const BATMAN = [
  ['csb', 'Chest / Shoulders / Biceps', 'dumbbell', [
    x(E.inclineBench, 3, 6, 8), x(E.dbBench, 3, 8, 10), x(E.machineIncline, 2, 8, 10), x(E.pecDeck, 2, 12, 15),
    x(E.dbShoulderPress, 3, 8, 10), x(E.machineLateral, 3, 8, 10), x(E.cableLateral, 2, 10, 12), own('archer-pull', 3, 8, 10),
    x(E.frontRaise, 3, 12, 15), own('bayesian-curl', 2, 10, 12), x(E.preacher, 3, 8, 12), circuit('kettlebell-1')]],
  ['bt', 'Back / Triceps', 'pullup', [
    x(E.pulldown, 3, 10, 12), x(E.cableRow, 2, 12, 15), x(E.deadlift, 4, 8, 10), x(E.armPulldown, 3, 8, 10),
    x(E.tBarRow, 2, 8, 10), x(E.straightArm, 2, 12, 15), x(E.rearFly, 3, 12, 15), x(E.rearCross, 3, 12, 15),
    x(E.shrug, 3, 12, 15), x(E.pushdown, 3, 10, 12), x(E.ohTriceps, 3, 10, 12), circuit('kettlebell-2')]],
  ['lc', 'Legs / Core', 'legs', [
    x(E.hipThrust, 4, 8, 10), x(E.squat, 3, 8, 10), x(E.rdl, 3, 8, 10), x(E.legPress, 3, 10, 12),
    x(E.legExt, 2, 12, 15), x(E.legCurl, 2, 12, 15), x(E.abduction, 3, 10, 12), x(E.adduction, 3, 10, 12),
    x(E.calf, 2, 15, 20), x(E.cableCrunch, 3, 12, 15), circuit('kettlebell-3')]],
  // Written to alternate chest and back down the list.
  ['cb', 'Chest / Back', 'barbell', [
    x(E.bench, 3, 8, 10), x(E.weightedPullUp, 3, 8, 12), x(E.inclineDb, 3, 8, 10), x(E.highRow, 2, 8, 10),
    x(E.chestPress, 2, 10, 12), x(E.kneelingPulldown, 2, 12, 15), x(E.cableFly, 2, 12, 15), circuit('kettlebell-1')]],
  ['sa', 'Shoulders / Arms', 'arm', [
    x(E.machineShoulder, 2, 8, 10), x(E.lateral, 3, 8, 12), x(E.cableLateral, 2, 10, 12), x(E.cableFrontRaise, 3, 12, 15),
    x(E.rearCross, 3, 12, 15), own('archer-pull', 3, 8, 10), x(E.dbCurl, 3, 8, 10), x(E.hammer, 2, 10, 12),
    x(E.cableCurl, 3, 8, 10), x(E.cableHammer, 2, 10, 12), x(E.ohTriceps, 3, 10, 12), x(E.cableTriceps, 3, 10, 12),
    x(E.armPushdown, 3, 10, 12), circuit('kettlebell-2')]],
  ['recovery', 'Active recovery', 'kettlebell', [circuit('kettlebell-3')]],
]

const FIVE_BY_FIVE = [
  ['5x5-a', '5×5 A', 'barbell', [x('0043', 5, 5), x('0025', 5, 5), x('0027', 5, 5)]],
  ['5x5-b', '5×5 B', 'barbell', [x('0085', 5, 5), x('0426', 5, 5), x('2330', 5, 5)]],
  ['5x5-c', '5×5 C', 'barbell', [x('0739', 5, 5), x('0047', 5, 5), x('1323', 5, 5)]],
]

// [weekday, routineKey]: weekday is a DAYN index, so 1 is Monday and 0 Sunday. A weekday a split
// does not name is a rest day. Fixed weeks only: every split repeats the same seven days.
const PLANS = {
  ppl: { routines: [PUSH, PULL, LEGS], schedule: [[1, 'push'], [3, 'pull'], [5, 'legs']] },
  'ppl-abs': { routines: [PUSH, PULL, LEGS, ABS], schedule: [[1, 'push'], [2, 'pull'], [4, 'legs'], [5, 'abs']] },
  'ppl-ul': { routines: [PUSH, PULL, LEGS, UPPER, LOWER], schedule: [[1, 'push'], [2, 'pull'], [3, 'legs'], [5, 'upper'], [6, 'lower']] },
  'upper-lower': { routines: UPPER_LOWER, schedule: [[1, 'upper-a'], [2, 'lower-a'], [4, 'upper-b'], [5, 'lower-b']] },
  'full-body': { routines: FULL_BODY, schedule: [[1, 'fb-a'], [3, 'fb-b'], [5, 'fb-c']] },
  bro: { routines: BRO, schedule: [[1, 'chest'], [2, 'back'], [3, 'shoulders'], [4, 'legs'], [5, 'arms']] },
  // Kusuo's order from Monday: two days on, Wednesday off, three days on, Sunday active recovery.
  batman: { routines: BATMAN, schedule: [[1, 'csb'], [2, 'bt'], [4, 'lc'], [5, 'cb'], [6, 'sa'], [0, 'recovery']] },
  '5x5': { routines: FIVE_BY_FIVE, schedule: [[1, '5x5-a'], [3, '5x5-b'], [5, '5x5-c']] },
}

// One entry as a routine's exercise config.
function config(e, customIds) {
  const id = e.custom ? customIds[e.custom] : e.id
  if (e.sec) return { id, sets: e.sets, sec: e.sec, mode: 'time', weight: 0 }
  return { id, sets: e.sets, reps: e.hi, weight: 0, ...(e.lo < e.hi ? { repsMin: e.lo, prog: 'double' } : {}) }
}

const build = (routines, customIds = {}) =>
  routines.map(([, name, emoji, list]) => ({ id: uid(), name, emoji, ex: list.map(e => config(e, customIds)) }))

// The demo build's history is logged against these three exact routines (demoSeed.js PROG is
// keyed by their exercise ids), so they keep their own definition, whatever the splits become.
const DEMO_PPL = [
  ['push', 'Push Day', 'barbell', [x('0025', 4, 8), x('0047', 3, 10), x('0426', 3, 10), x('0334', 3, 12), x('0241', 3, 12), x('0251', 3, 10)]],
  ['pull', 'Pull Day', 'pullup', [x('2330', 4, 10), x('0027', 4, 8), x('1323', 3, 10), x('0031', 3, 10), x('0313', 3, 12)]],
  ['legs', 'Leg Day', 'legs', [x('0043', 4, 8), x('0085', 3, 10), x('0739', 3, 12), x('0585', 3, 12), x('0586', 3, 12), x('0605', 4, 15)]],
]
export const starterRoutines = () => build(DEMO_PPL)

// [{ id, days }] for the chooser, in the order it lists them. The day count is read off the
// schedule rather than stored beside it, so the two can never disagree.
export const starterPlanOptions = () =>
  Object.entries(PLANS).map(([id, { schedule }]) => ({ id, days: schedule.length }))

// The weekdays a split would claim, or null for an unknown id.
export const starterPlanDays = id => PLANS[id]?.schedule.map(([day]) => day) ?? null

/**
 * What a split looks like before it is loaded, for the preview: per weekday it trains, the
 * routine's name and glyph and its exercises as { id | custom, sets, reps | range | sec }.
 * null for an unknown id.
 */
export function previewPlan(id) {
  const plan = PLANS[id]
  if (!plan) return null
  const byKey = Object.fromEntries(plan.routines.map(r => [r[0], r]))
  return plan.schedule.map(([day, key]) => {
    const [, name, glyph, list] = byKey[key]
    return {
      day, name, glyph,
      ex: list.map(e => ({
        ...(e.custom ? { custom: e.custom, name: CUSTOM[e.custom].n } : { id: e.id }),
        sets: e.sets, ...(e.sec ? { sec: e.sec } : { reps: e.hi, ...(e.lo < e.hi ? { repsMin: e.lo } : {}) }),
      })),
    }
  })
}

// Words that name the equipment, not the movement ("barbell", "lever", "machine"…), so that
// "barbell bench press" and "dumbbell bench press" read as the same lift.
const EQ_WORDS = new Set(ALL_EQUIPMENT.flatMap(e => e.split(/[^a-z0-9]+/)).concat(['lever', 'leverage', 'machine', 'sled']))
const words = ex => new Set(ex.n.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !EQ_WORDS.has(w)))
const jaccard = (a, b) => {
  const inter = [...a].filter(x => b.has(x)).length
  return inter ? inter / (a.size + b.size - inter) : 0
}

// Names that are not working sets: stretches, holds, mobility and warm-up drills. Never a
// stand-in for a lift, whatever body part and muscle they share with it.
const NOT_A_LIFT = /stretch|isometric|squeeze|yoga|\bpose\b|toe touch|\broll(er)?\b|mobility|circles|warm-?up|boxing|against wall/i
// "… on exercise ball" is tagged with its weight (dumbbell), but needs a ball nobody ticked.
const NEEDS_BALL = /exercise ball|stability ball|swiss ball|bosu/i

// The best stand-in for `ex` among exercises the equipment list allows. Same body part, and it
// has to share the target muscle, the main muscle or a helper muscle with `ex`. Closest wins:
// same target muscle, then the movement by name, then helper muscles. When `ex` is a loaded
// lift, one that is loaded too beats a body-weight drill — a push-up is not a bench press.
// `taken` keeps a routine from ending up with the same exercise twice. null when nothing fits.
export const substituteFor = (ex, equipment, taken) => {
  const hasBall = equipment.includes('stability ball') || equipment.includes('bosu ball')
  const exWords = words(ex), exSm = new Set([ex.mg, ...(ex.sm || [])])
  const loaded = ex.eq !== 'body weight'
  let best = null, bestScore = -Infinity
  for (const c of Object.values(EXIDX)) {
    if (c.bp !== ex.bp || taken.has(c.id) || !eqAvailable(equipment, c)) continue
    if (NOT_A_LIFT.test(c.n) || (!hasBall && NEEDS_BALL.test(c.n))) continue
    const sm = jaccard(exSm, new Set([c.mg, ...(c.sm || [])]))
    if (c.tg !== ex.tg && c.mg !== ex.mg && !sm) continue
    const score = 2 * (c.tg === ex.tg) + (c.mg === ex.mg) + 3 * jaccard(exWords, words(c)) + 2 * sm
      - (loaded && c.eq === 'body weight' ? 3 : 0)
    // id as the last key: the same equipment always gives the same plan
    if (score > bestScore || (score === bestScore && c.id < best.id)) { best = c; bestScore = score }
  }
  return best
}

// Re-cuts a routine list for an equipment list: what you can already do stays, what you can't
// is swapped for its closest match, and what has no match is dropped (with its routine, when
// that leaves it empty). Sets and reps carry over unchanged. A split's own exercises are yours to
// do as you can, so they always stay.
const fitRoutines = (routines, equipment) => {
  let swapped = 0, dropped = 0
  const fitted = routines.map(([key, name, emoji, list]) => {
    const taken = new Set(list.map(e => e.id).filter(Boolean))
    const out = []
    for (const e of list) {
      const ex = e.custom ? null : EXIDX[e.id]
      if (!ex || eqAvailable(equipment, ex)) { out.push(e); continue }
      const sub = substituteFor(ex, equipment, taken)
      if (!sub) { dropped++; continue }
      taken.add(sub.id)
      swapped++
      out.push({ ...e, id: sub.id })
    }
    return [key, name, emoji, out]
  }).filter(([, , , list]) => list.length)
  return { routines: fitted, swapped, dropped }
}

/**
 * Fresh routines plus the weekdays to put them on, or null for an unknown id — a caller that
 * treats null as "change nothing" can never half-apply a split. With an equipment list the split
 * is fitted to it first, and `fit` reports how many exercises that swapped or dropped.
 * `existingCustom` is the profile's own exercises: a split's custom exercise reuses the one of
 * the same name, and `customEx` lists only the ones that have to be added.
 */
export const buildStarterPlan = (id, equipment, existingCustom = []) => {
  const plan = PLANS[id]
  if (!plan) return null
  const fit = equipment ? fitRoutines(plan.routines, equipment) : null
  const source = fit ? fit.routines : plan.routines
  const wanted = [...new Set(source.flatMap(([, , , list]) => list.map(e => e.custom).filter(Boolean)))]
  const customIds = {}, customEx = []
  for (const key of wanted) {
    const def = CUSTOM[key]
    const same = (existingCustom || []).find(c => String(c?.n || '').trim().toLowerCase() === def.n.toLowerCase())
    if (same) { customIds[key] = same.id; continue }
    customIds[key] = 'c' + uid()
    customEx.push({ id: customIds[key], ...def, secondaries: def.sm, custom: true })
  }
  const routines = build(source, customIds)
  // key → the id just minted for it, so the schedule below names its routine
  const byKey = Object.fromEntries(source.map(([key], i) => [key, routines[i].id]))
  return {
    routines,
    customEx,
    schedule: plan.schedule.filter(([, key]) => byKey[key]).map(([day, key]) => ({ day, routineId: byKey[key] })),
    ...(fit && { fit: { swapped: fit.swapped, dropped: fit.dropped } })
  }
}
