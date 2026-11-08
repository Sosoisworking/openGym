// The text of every push the server sends. Tarnished is English-only.
import { NUDGE_COPY } from './nudge-copy.js';
import { lineIndex } from './nudge.js';

export function restTimerPush() {
  return { title: 'Rest over 💪', body: 'Time for your next set.', tag: 'rest-timer' };
}

export function testPush() {
  return { title: 'Tarnished', body: 'Test notification ✅ This is what alerts look like.', tag: 'test' };
}

export function dayReminderPush(routine) {
  return {
    title: routine ? `${routine.emoji || '🏋️'} ${routine.name} today` : 'Workout planned today',
    body: "It's on your plan. Let's go 💪",
    tag: 'day-reminder',
  };
}

// The missed-workout nudge (nudge.js). Its lines live in the frontend (lib/nudge.js) and are
// generated into nudge-copy.js. An unknown tone reads as friendly.
export function nudgePush(tone, routine, iso) {
  const copy = NUDGE_COPY.en[NUDGE_COPY.en[tone] ? tone : 'friendly'];
  const line = copy.lines[lineIndex(iso, copy.lines.length)];
  const name = routine?.name || 'Tarnished';
  return { title: copy.title, body: line.replace('{0}', () => name), tag: 'nudge' };
}
