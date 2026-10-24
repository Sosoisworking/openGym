import { describe, expect, it } from 'vitest'
import { changeTitle } from './coach.js'

// "Drop {0}" labels a drop set's sub-row; it once also titled the Coach's "remove this exercise"
// change, which read as a second delete button.
describe('the drop-set sub-row label', () => {
  it('is not what the Coach titles an exercise it takes out', () => {
    expect(changeTitle({ type: 'remove-exercise', target: { exId: 'bench' } }, {})).toMatch(/^Remove /)
  })
})
