import test from 'node:test';
import assert from 'node:assert/strict';
import { dayReminderPush, restTimerPush, testPush } from '../push-messages.js';

test('server-generated notifications are in English', () => {
  assert.deepEqual(restTimerPush(), { title: 'Rest over 💪', body: 'Time for your next set.', tag: 'rest-timer' });
  assert.deepEqual(testPush(), {
    title: 'Tarnished',
    body: 'Test notification ✅ This is what alerts look like.',
    tag: 'test',
  });
  assert.deepEqual(dayReminderPush({ name: 'Push Day', emoji: '💪' }), {
    title: '💪 Push Day today',
    body: "It's on your plan. Let's go 💪",
    tag: 'day-reminder',
  });
  assert.equal(dayReminderPush({ name: 'Legs' }).title, '🏋️ Legs today');
  assert.equal(dayReminderPush(null).title, 'Workout planned today');
});
