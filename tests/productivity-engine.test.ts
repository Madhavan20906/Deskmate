import test from 'node:test';
import assert from 'node:assert';
import {
  recommendWhatNext,
  planDaySchedule,
  detectOverlaps,
  fixScheduleOverlaps,
  formatMinuteTime,
} from '../src/productivity-engine.ts';

test('formatMinuteTime: formats 09:00, 14:30, 00:00 properly', () => {
  assert.strictEqual(formatMinuteTime(540), '09:00');
  assert.strictEqual(formatMinuteTime(870), '14:30');
  assert.strictEqual(formatMinuteTime(0), '00:00');
});

test('recommendWhatNext: returns null rationale when all tasks are complete', () => {
  const tasks = [
    { id: '1', title: 'Task 1', priority: 'high', estimatedMinutes: 60, scheduledStartMinute: 540, status: 'completed', createdAt: 1, completedAt: 2 },
  ];
  const res = recommendWhatNext(tasks);
  assert.strictEqual(res.task, null);
  assert.ok(res.rationale.includes('All tasks completed'));
});

test('recommendWhatNext: recommends active in-progress task first', () => {
  const tasks = [
    { id: '1', title: 'Inbox zero', priority: 'low', estimatedMinutes: 15, scheduledStartMinute: null, status: 'in-progress', createdAt: 1, completedAt: null },
    { id: '2', title: 'Q4 Review', priority: 'high', estimatedMinutes: 60, scheduledStartMinute: null, status: 'todo', createdAt: 2, completedAt: null },
  ];
  const res = recommendWhatNext(tasks);
  assert.strictEqual(res.task?.id, '1');
  assert.ok(res.rationale.includes('Active sprint in progress'));
});

test('recommendWhatNext: recommends task scheduled for current time', () => {
  const tasks = [
    { id: '1', title: 'Team standup', priority: 'medium', estimatedMinutes: 30, scheduledStartMinute: 600, status: 'todo', createdAt: 1, completedAt: null }, // 10:00 - 10:30
    { id: '2', title: 'Deep code', priority: 'high', estimatedMinutes: 90, scheduledStartMinute: 720, status: 'todo', createdAt: 2, completedAt: null },
  ];
  const res = recommendWhatNext(tasks, 615); // 10:15
  assert.strictEqual(res.task?.id, '1');
  assert.ok(res.rationale.includes('Scheduled for right now'));
});

test('recommendWhatNext: prioritizes high priority or quick-win momentum when unscheduled', () => {
  const tasks = [
    { id: '1', title: 'Design system', priority: 'high', estimatedMinutes: 60, scheduledStartMinute: null, status: 'todo', createdAt: 1, completedAt: null },
    { id: '2', title: 'File receipts', priority: 'low', estimatedMinutes: 10, scheduledStartMinute: null, status: 'todo', createdAt: 2, completedAt: null },
  ];
  const res = recommendWhatNext(tasks);
  assert.strictEqual(res.task?.id, '1');
  assert.ok(res.rationale.includes('High-priority focus item'));
});

test('planDaySchedule: packs tasks into workday with 10-minute breaks', () => {
  const tasks = [
    { id: 't1', title: 'High priority task', priority: 'high', estimatedMinutes: 60, scheduledStartMinute: null, status: 'todo', createdAt: 1, completedAt: null },
    { id: 't2', title: 'Med priority task', priority: 'medium', estimatedMinutes: 30, scheduledStartMinute: null, status: 'todo', createdAt: 2, completedAt: null },
  ];
  const plan = planDaySchedule(tasks, 540, 1080, 10);
  assert.strictEqual(plan.assignments.length, 2);
  assert.strictEqual(plan.overflowCount, 0);
  assert.strictEqual(plan.assignments[0].taskId, 't1');
  assert.strictEqual(plan.assignments[0].startMinute, 540); // 09:00
  assert.strictEqual(plan.assignments[1].taskId, 't2');
  assert.strictEqual(plan.assignments[1].startMinute, 610); // 09:00 + 60m + 10m break = 10:10 (610m)
});

test('detectOverlaps: finds conflicts when tasks overlap in time', () => {
  const tasks = [
    { id: 'a', title: 'Task A', priority: 'high', estimatedMinutes: 60, scheduledStartMinute: 540, status: 'todo', createdAt: 1, completedAt: null }, // 540..600
    { id: 'b', title: 'Task B', priority: 'medium', estimatedMinutes: 45, scheduledStartMinute: 580, status: 'todo', createdAt: 2, completedAt: null }, // 580..625
  ];
  const overlaps = detectOverlaps(tasks);
  assert.strictEqual(overlaps.length, 1);
  assert.strictEqual(overlaps[0].taskA.id, 'a');
  assert.strictEqual(overlaps[0].taskB.id, 'b');
});

test('fixScheduleOverlaps: shifts conflicting tasks forward cleanly', () => {
  const tasks = [
    { id: 'a', title: 'Task A', priority: 'high', estimatedMinutes: 60, scheduledStartMinute: 540, status: 'todo', createdAt: 1, completedAt: null }, // 540..600
    { id: 'b', title: 'Task B', priority: 'medium', estimatedMinutes: 45, scheduledStartMinute: 580, status: 'todo', createdAt: 2, completedAt: null }, // 580..625
  ];
  const adjustments = fixScheduleOverlaps(tasks, 1080, 5);
  assert.strictEqual(adjustments.length, 1);
  assert.strictEqual(adjustments[0].taskId, 'b');
  assert.strictEqual(adjustments[0].startMinute, 605); // 600 + 5m buffer = 605
});
