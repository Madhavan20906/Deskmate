import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEED_TASKS,
  WORKDAY_START_MINUTE,
  WORKDAY_END_MINUTE,
  DAILY_CAPACITY_MINUTES,
  tasksToRowViewModels,
  tasksToScheduleBlocks,
  calculateWorkloadDonut,
  calculateGardenProgress,
  generateGreeting,
  getClockViewModel,
  calculateNowMarker,
  calculateFocusRing,
  snapTo15,
  clampWorkdayRange,
  resolveOverlapAndPush,
  resolveDragDropTarget,
  UndoStack,
  computeArcTransform,
  formatMinutesDuration,
  formatTimeOfDay,
} from '../src/glass-data-adapters.ts';
import type { GlassTask } from '../src/glass-data-adapters.ts';

test('1.1 Pure View-Models: tasksToRowViewModels', () => {
  const rows = tasksToRowViewModels(SEED_TASKS);
  assert.equal(rows.length, 8);

  // Check high priority row formatting
  assert.equal(rows[0].title, 'Finish ML assignment');
  assert.equal(rows[0].priorityLabel, 'High, 1h 30m');
  assert.equal(rows[0].priorityColor, '#EF4444');
  assert.equal(rows[0].isCompleted, false);
  assert.equal(rows[0].scheduledTimeFormatted, '09:00 - 10:30');

  // Check completed task
  const completedTask: GlassTask = {
    id: 'test-done',
    title: 'Completed item',
    priority: 'low',
    estimatedMinutes: 45,
    scheduledStartMinute: null,
    status: 'completed',
  };
  const completedRow = tasksToRowViewModels([completedTask])[0];
  assert.equal(completedRow.isCompleted, true);
  assert.equal(completedRow.scheduledTimeFormatted, null);
  assert.equal(completedRow.priorityLabel, 'Low, 45m');
});

test('1.1 Pure View-Models: tasksToScheduleBlocks & boundaries', () => {
  const blocks = tasksToScheduleBlocks(SEED_TASKS);
  assert.equal(blocks.length, 6);

  // 09:00 to 10:30 (starts at 540m, duration 90m)
  // Workday 480m to 1080m (600m total). 540-480 = 60m. 60/600 = 10%
  assert.equal(blocks[0].startMinute, 540);
  assert.equal(blocks[0].endMinute, 630);
  assert.equal(blocks[0].timeRangeFormatted, '09:00 to 10:30');
  assert.equal(blocks[0].relativeLeftPercent, 10);
  assert.equal(blocks[0].widthPercent, 15); // 90 / 600 = 15%

  // 5-minute task minimum width padding (4.5%)
  const shortTask: GlassTask = {
    id: 'short-5m',
    title: 'Quick check',
    priority: 'low',
    estimatedMinutes: 5,
    scheduledStartMinute: 480, // Exactly 08:00
    status: 'todo',
  };
  const shortBlock = tasksToScheduleBlocks([shortTask])[0];
  assert.equal(shortBlock.relativeLeftPercent, 0);
  assert.equal(shortBlock.widthPercent, 4.5); // Padded to min 4.5%

  // 480-minute task (full 8-hour workday span)
  const fullDayTask: GlassTask = {
    id: 'full-day',
    title: 'Hackathon build',
    priority: 'high',
    estimatedMinutes: 480,
    scheduledStartMinute: 480, // 08:00 to 16:00
    status: 'todo',
  };
  const fullBlock = tasksToScheduleBlocks([fullDayTask])[0];
  assert.equal(fullBlock.relativeLeftPercent, 0);
  assert.equal(fullBlock.widthPercent, 80); // 480 / 600 = 80%
});

test('1.1 Pure View-Models: calculateWorkloadDonut (empty, partial, overloaded)', () => {
  // Empty day
  const emptyDonut = calculateWorkloadDonut([]);
  assert.equal(emptyDonut.percentage, 0);
  assert.equal(emptyDonut.scheduledMinutes, 0);
  assert.equal(emptyDonut.remainingCapacityMinutes, 480);
  assert.equal(emptyDonut.isOverloaded, false);

  // Seed tasks: 90 + 90 + 30 + 45 + 60 + 45 = 360 minutes (6 hours)
  const seedDonut = calculateWorkloadDonut(SEED_TASKS);
  assert.equal(seedDonut.scheduledMinutes, 360);
  assert.equal(seedDonut.percentage, 75); // 360 / 480 = 75%
  assert.equal(seedDonut.scheduledFormatted, '6h');
  assert.equal(seedDonut.remainingCapacityMinutes, 120);
  assert.equal(seedDonut.remainingFormatted, '2h');
  assert.equal(seedDonut.isOverloaded, false);

  // Overloaded day (500 minutes > 480)
  const overloadTask: GlassTask = {
    id: 'heavy',
    title: 'Long crunch',
    priority: 'high',
    estimatedMinutes: 500,
    scheduledStartMinute: 480,
    status: 'todo',
  };
  const overloadDonut = calculateWorkloadDonut([overloadTask]);
  assert.equal(overloadDonut.isOverloaded, true);
  assert.equal(overloadDonut.remainingCapacityMinutes, 0);
});

test('1.1 Pure View-Models: calculateGardenProgress & levels', () => {
  const g1 = calculateGardenProgress(25);
  assert.equal(g1.level, 1);
  assert.equal(g1.stageName, 'Sprout');
  assert.equal(g1.progressPercent, 50);

  const g3 = calculateGardenProgress(200);
  assert.equal(g3.level, 3);
  assert.equal(g3.stageName, 'Sapling');

  const g5 = calculateGardenProgress(600);
  assert.equal(g5.level, 5);
  assert.equal(g5.stageName, 'Canopy');
  assert.equal(g5.progressLabel, 'Keep it growing!');
});

test('1.1 Pure View-Models: greeting, clock, now-marker, focus ring', () => {
  // Greeting by hour
  const morning = generateGreeting(new Date(2026, 10, 18, 9, 30), 'Madhavan');
  assert.equal(morning.greeting, 'Good Morning, Madhavan');
  assert.equal(morning.period, 'morning');

  const afternoon = generateGreeting(new Date(2026, 10, 18, 14, 0), 'Madhavan');
  assert.equal(afternoon.greeting, 'Good Afternoon, Madhavan');
  assert.equal(afternoon.period, 'afternoon');

  const evening = generateGreeting(new Date(2026, 10, 18, 19, 45), 'Madhavan');
  assert.equal(evening.greeting, 'Good Evening, Madhavan');
  assert.equal(evening.period, 'evening');

  // Clock
  const clock = getClockViewModel(new Date(2026, 10, 18, 10, 24));
  assert.equal(clock.timeFormatted, '10:24 AM');
  assert.equal(clock.dateFormatted, 'Wed, Nov 18');

  // Now marker: within workday (12:00 = 720m)
  // (720 - 480) / 600 = 240 / 600 = 40%
  const nowMarker = calculateNowMarker(720);
  assert.equal(nowMarker.positionPercent, 40);
  assert.equal(nowMarker.isWithinWorkday, true);
  assert.equal(nowMarker.isPastWorkday, false);

  // Now marker: past 18:00 (19:00 = 1140m)
  const lateMarker = calculateNowMarker(1140);
  assert.equal(lateMarker.positionPercent, 100);
  assert.equal(lateMarker.isPastWorkday, true);

  // Focus ring
  const focus = calculateFocusRing(20 * 60, 25 * 60, 'pomodoro', true);
  assert.equal(focus.timeFormatted, '20:00');
  assert.equal(focus.modeLabel, 'Pomodoro');
  assert.equal(focus.progress, 0.2);
  assert.equal(focus.isRunning, true);
});

test('1.2 Pure Interaction Logic: snapTo15 & clampWorkdayRange', () => {
  // 15-minute snapping boundaries
  assert.equal(snapTo15(483), 480); // 08:03 -> 08:00
  assert.equal(snapTo15(488), 495); // 08:08 -> 08:15
  assert.equal(snapTo15(450), 480); // Clamped at 08:00
  assert.equal(snapTo15(1100), 1080); // Clamped at 18:00

  // Workday clamp
  const clamped = clampWorkdayRange(480, 120);
  assert.equal(clamped.startMinute, 480);
  assert.equal(clamped.endMinute, 600);

  // Clamping near 18:00 limit
  const lateClamped = clampWorkdayRange(1050, 60); // 17:30 + 1h = 18:30 -> clamped start to 17:00
  assert.equal(lateClamped.startMinute, 1020); // 17:00
  assert.equal(lateClamped.endMinute, 1080); // 18:00
});

test('1.2 Pure Interaction Logic: resolveOverlapAndPush & overflow', () => {
  const initialTasks: GlassTask[] = [
    { id: 't1', title: 'Task 1', priority: 'high', estimatedMinutes: 60, scheduledStartMinute: 540, status: 'todo' }, // 09:00-10:00
    { id: 't2', title: 'Task 2', priority: 'medium', estimatedMinutes: 60, scheduledStartMinute: 600, status: 'todo' }, // 10:00-11:00
  ];

  // Move t1 to 09:45 -> overlaps with t2 starting at 10:00. t1 ends at 10:45, pushes t2 to 10:45
  const result = resolveOverlapAndPush(initialTasks, 't1', 585);
  assert.equal(result.conflictsPushed, 1);
  const updatedT2 = result.tasks.find((t) => t.id === 't2');
  assert.equal(updatedT2?.scheduledStartMinute, 645); // 10:45

  // Pushing past 18:00 cutoff overflows task to unscheduled tray
  const nearEndTasks: GlassTask[] = [
    { id: 't-drop', title: 'Drop Task', priority: 'high', estimatedMinutes: 60, scheduledStartMinute: 1000, status: 'todo' },
    { id: 't-overflow', title: 'Overflow Task', priority: 'low', estimatedMinutes: 60, scheduledStartMinute: 1040, status: 'todo' },
  ];
  const overflowResult = resolveOverlapAndPush(nearEndTasks, 't-drop', 1035); // 17:15 to 18:15 -> clamped/pushes t-overflow past 18:00
  const overflowTask = overflowResult.tasks.find((t) => t.id === 't-overflow');
  assert.equal(overflowTask?.scheduledStartMinute, null); // Unscheduled to tray
});

test('1.2 Pure Interaction Logic: resolveDragDropTarget', () => {
  const targets = [
    {
      id: 'timeline' as const,
      bounds: { minX: -0.25, maxX: 0.25, minY: 1.1, maxY: 1.3, minZ: -0.85, maxZ: -0.75 },
    },
    {
      id: 'trash' as const,
      bounds: { minX: 0.4, maxX: 0.6, minY: 0.8, maxY: 1.0, minZ: -0.8, maxZ: -0.7 },
    },
  ];

  const hit = resolveDragDropTarget({ x: 0, y: 1.2, z: -0.8 }, targets);
  assert.equal(hit?.id, 'timeline');

  const miss = resolveDragDropTarget({ x: 1.0, y: 0.5, z: 0 }, targets);
  assert.equal(miss, null);
});

test('1.2 Pure Interaction Logic: UndoStack (5 steps, 8s timer, persistence roundtrip)', () => {
  const undo = new UndoStack<GlassTask[]>(5);

  assert.equal(undo.isAvailable(), false);
  assert.equal(undo.size(), 0);

  // Push 6 actions to test max 5 steps capping
  for (let i = 1; i <= 6; i++) {
    undo.push(SEED_TASKS, `Action ${i}`);
  }
  assert.equal(undo.size(), 5);
  assert.equal(undo.peek()?.actionDescription, 'Action 6');
  assert.equal(undo.isAvailable(8000), true);

  // Pop undo
  const undone = undo.pop();
  assert.equal(undone?.actionDescription, 'Action 6');
  assert.equal(undo.size(), 4);

  // Persistence roundtrip serialization check
  const serialized = JSON.stringify(undone?.state);
  const parsed: GlassTask[] = JSON.parse(serialized);
  assert.equal(parsed.length, 8);
  assert.equal(parsed[0].id, SEED_TASKS[0].id);
});

test('1.2 Pure Interaction Logic: computeArcTransform', () => {
  const left = computeArcTransform(-1, 0.80, 1.30, -5);
  const center = computeArcTransform(0, 0.80, 1.30, -5);
  const right = computeArcTransform(1, 0.80, 1.30, -5);

  // Center column is at x=0, z=-0.80, pitch -5 deg, yaw 0
  assert.equal(center.position[0], 0);
  assert.equal(center.position[1], 1.30);
  assert.equal(center.position[2], -0.80);
  assert.deepEqual(center.rotationDeg, [-5, 0, 0]);

  // Left column is angled at +26 deg yaw
  assert.equal(left.rotationDeg[1], 26);
  assert.ok(left.position[0] < 0); // x is negative (to the left)

  // Right column is angled at -26 deg yaw
  assert.equal(right.rotationDeg[1], -26);
  assert.ok(right.position[0] > 0); // x is positive (to the right)
});
