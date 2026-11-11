import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTimeRuler,
  getSlotForMinute,
  getEffortSize,
  getEffortMinutes,
} from '../src/workload.ts';
import {
  calculateProductivityInsights,
  PLANT_VARIANTS,
} from '../src/productivity.ts';
import { SocialPresenceManager } from '../src/social.ts';
import { DEFAULT_WORKSPACE_STATE } from '../src/storage.ts';

test('Time Ruler: maps minutes to Morning, Afternoon, Evening slots', () => {
  assert.equal(getSlotForMinute(540), 'morning');    // 09:00 -> Morning
  assert.equal(getSlotForMinute(720), 'afternoon');  // 12:00 -> Afternoon
  assert.equal(getSlotForMinute(840), 'afternoon');  // 14:00 -> Afternoon
  assert.equal(getSlotForMinute(960), 'evening');    // 16:00 -> Evening
  assert.equal(getSlotForMinute(1080), 'evening');   // 18:00 -> Evening
});

test('Effort estimation: calculates effort sizes and minutes', () => {
  assert.equal(getEffortSize(25), 'small');
  assert.equal(getEffortSize(45), 'medium');
  assert.equal(getEffortSize(90), 'large');

  assert.equal(getEffortMinutes('small'), 30);
  assert.equal(getEffortMinutes('medium'), 60);
  assert.equal(getEffortMinutes('large'), 120);
});

test('Time Ruler: detects slot overload and generates wobble angle and rebalance advice', () => {
  const tasks = [
    { id: '1', title: 'Task 1', estimatedMinutes: 60, scheduledStartMinute: 500, status: 'todo', assignedSlot: 'morning' },
    { id: '2', title: 'Task 2', estimatedMinutes: 60, scheduledStartMinute: 560, status: 'todo', assignedSlot: 'morning' },
    { id: '3', title: 'Task 3', estimatedMinutes: 60, scheduledStartMinute: 620, status: 'todo', assignedSlot: 'morning' },
    { id: '4', title: 'Task 4', estimatedMinutes: 90, scheduledStartMinute: 680, status: 'todo', assignedSlot: 'morning' }, // 4th task -> overloaded!
    { id: '5', title: 'Task 5', estimatedMinutes: 60, scheduledStartMinute: 800, status: 'todo', assignedSlot: 'afternoon' },
  ];

  const ruler = analyzeTimeRuler(tasks, 3, 240);
  assert.equal(ruler.isAnySlotOverloaded, true);
  assert.deepEqual(ruler.overloadedSlots, ['morning']);

  const morning = ruler.slots.morning;
  assert.equal(morning.isOverloaded, true);
  assert.equal(morning.taskCount, 4);
  assert.equal(morning.totalMinutes, 270);
  assert.ok(morning.wobbleAngleDeg > 0, 'Morning cards must physically tilt and wobble');

  const afternoon = ruler.slots.afternoon;
  assert.equal(afternoon.isOverloaded, false);
  assert.equal(afternoon.wobbleAngleDeg, 0);

  assert.ok(ruler.rebalanceSuggestions.length > 0, 'Must generate Pip rebalance suggestion');
  assert.equal(ruler.rebalanceSuggestions[0].fromSlot, 'morning');
});

test('Productivity & Forgiving Streak: protects streak with rest leaf on missed day', () => {
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;

  // Active today, active 2 days ago, missed yesterday
  const tasks = [
    { id: 't1', status: 'completed', completedAt: now },
    { id: 't2', status: 'completed', completedAt: now - 2 * dayMs },
    { id: 't3', status: 'completed', completedAt: now - 3 * dayMs },
  ];

  const insights = calculateProductivityInsights(tasks, [], now, 1);
  assert.ok(insights.streakDays >= 2, 'Forgiving streak must not drop to 0 on 1 missed day');
  assert.equal(insights.unlockedVariants.length, 4);
  assert.ok(PLANT_VARIANTS.some((v) => v.name === 'Morning Clover'));
});

test('Social: Ghost Deskmate simulates scripted focus and break rhythm', () => {
  const social = new SocialPresenceManager();
  const state = social.getState();
  assert.equal(state.mode, 'ghost');
  assert.equal(state.partnerName, 'Ghost Companion');
  assert.ok(typeof state.partnerRemainingSeconds === 'number');
  assert.ok(state.partnerHandPosition.length === 3);
  social.destroy();
});

test('Storage: verifies default workspace state schema version 3', () => {
  assert.equal(DEFAULT_WORKSPACE_STATE.schemaVersion, 3);
  assert.ok(DEFAULT_WORKSPACE_STATE.tasks.length >= 3);
  assert.ok(DEFAULT_WORKSPACE_STATE.gardenPoints >= 20);
  assert.equal(DEFAULT_WORKSPACE_STATE.settings.focusDurationMinutes, 25);
});
