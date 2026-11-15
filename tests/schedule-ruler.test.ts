import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKDAY_START_MINUTE,
  WORKDAY_END_MINUTE,
  DEFAULT_SCALE_PER_HOUR,
  MIN_TILE_WIDTH_METERS,
  getRulerTotalWidth,
  getRulerStartX,
  minuteToRulerX,
  rulerXToMinute,
  snapTo15Minutes,
  getTileVisualWidth,
  clampResizeEndMinute,
  checkOverlapAndResolve,
  computeFreeSlots,
  partitionSchedule,
  formatSummaryCapsule,
  getNowMarkerPosition,
  getZoneSlices,
  isWithinSeatedReach,
  type ScheduledTileInput,
} from '../src/schedule-ruler.ts';

test('Ruler coordinate conversion: roundtrip between minute and X coordinate', () => {
  const startX = getRulerStartX(0, DEFAULT_SCALE_PER_HOUR);
  const totalW = getRulerTotalWidth(DEFAULT_SCALE_PER_HOUR);

  // 08:00 (480 min) should match ruler left edge
  const x8 = minuteToRulerX(480, 0, DEFAULT_SCALE_PER_HOUR);
  assert.ok(Math.abs(x8 - startX) < 1e-6);
  assert.equal(Math.round(rulerXToMinute(x8, 0, DEFAULT_SCALE_PER_HOUR)), 480);

  // 18:00 (1080 min) should match ruler right edge
  const x18 = minuteToRulerX(1080, 0, DEFAULT_SCALE_PER_HOUR);
  assert.ok(Math.abs(x18 - (startX + totalW)) < 1e-6);
  assert.equal(Math.round(rulerXToMinute(x18, 0, DEFAULT_SCALE_PER_HOUR)), 1080);

  // 13:00 (780 min - midday halfway point)
  const x13 = minuteToRulerX(780, 0, DEFAULT_SCALE_PER_HOUR);
  assert.ok(Math.abs(x13) < 1e-6); // Centered at 0
  assert.equal(Math.round(rulerXToMinute(x13, 0, DEFAULT_SCALE_PER_HOUR)), 780);
});

test('15-minute magnetic snapping and boundaries', () => {
  // Exact 15-min mark
  assert.equal(snapTo15Minutes(480), 480);
  assert.equal(snapTo15Minutes(495), 495);

  // Round down (487 -> 480 or 495)
  assert.equal(snapTo15Minutes(486), 480);
  assert.equal(snapTo15Minutes(488), 495);

  // Boundaries: Before 08:00 is clamped to 480
  assert.equal(snapTo15Minutes(400), 480);
  assert.equal(snapTo15Minutes(0), 480);

  // Boundaries: After 18:00 is clamped to 1080
  assert.equal(snapTo15Minutes(1100), 1080);
  assert.equal(snapTo15Minutes(1440), 1080);
});

test('Tile visual width: 5-minute task gets 4.5cm minimum width padding', () => {
  // 5-minute task: true width = (5/60)*0.060 = 0.005m = 0.5cm
  // Must render at 4.5cm minimum width
  const shortTask = getTileVisualWidth(5, DEFAULT_SCALE_PER_HOUR, MIN_TILE_WIDTH_METERS);
  assert.equal(shortTask.visualWidth, MIN_TILE_WIDTH_METERS);
  assert.ok(shortTask.isMinWidthPadded);
  assert.ok(shortTask.trueWidth < MIN_TILE_WIDTH_METERS);

  // 120-minute (2-hour) task: true width = 2 * 0.060 = 0.120m = 12.0cm
  // Should NOT be padded
  const longTask = getTileVisualWidth(120, DEFAULT_SCALE_PER_HOUR, MIN_TILE_WIDTH_METERS);
  assert.ok(Math.abs(longTask.visualWidth - 0.120) < 1e-5);
  assert.equal(longTask.isMinWidthPadded, false);

  // Proportionality: 2h task true width is exactly 2x 1h task
  const oneHour = getTileVisualWidth(60, DEFAULT_SCALE_PER_HOUR, MIN_TILE_WIDTH_METERS);
  assert.ok(Math.abs(longTask.trueWidth - 2 * oneHour.trueWidth) < 1e-6);
});

test('480-minute task (full 8-hour capacity) spans correctly', () => {
  const fullDayTask = getTileVisualWidth(480, DEFAULT_SCALE_PER_HOUR, MIN_TILE_WIDTH_METERS);
  // 8 hours * 0.060m = 0.480m
  assert.ok(Math.abs(fullDayTask.trueWidth - 0.480) < 1e-5);
  assert.equal(fullDayTask.visualWidth, fullDayTask.trueWidth);
});

test('Resize clamping with neighbor collision and workday bounds', () => {
  // Task starts at 540 (09:00), dragging end handle to 600 (10:00) with next neighbor at 660 (11:00)
  const end1 = clampResizeEndMinute(540, 600, 15, 480, 660);
  assert.equal(end1, 600);

  // Dragging past neighbor at 660: clamped to neighbor start (660)
  const endClampedNeighbor = clampResizeEndMinute(540, 720, 15, 480, 660);
  assert.equal(endClampedNeighbor, 660);

  // Minimum duration constraint: cannot resize smaller than 15 min
  const endClampedMin = clampResizeEndMinute(540, 545, 15, 480, 660);
  assert.equal(endClampedMin, 555);

  // Cannot resize past 18:00 (1080)
  const endClampedWorkday = clampResizeEndMinute(960, 1200, 15, 480, null);
  assert.equal(endClampedWorkday, 1080);
});

test('Overlap resolution: fit, conflict, swap, and push later', () => {
  const existingSchedule = [
    { id: 'task-1', startMinute: 540, duration: 60 },  // 09:00 - 10:00
    { id: 'task-2', startMinute: 660, duration: 120 }, // 11:00 - 13:00
  ];

  // Fit in gap: 10:00 - 11:00 (600 - 660)
  const fitRes = checkOverlapAndResolve('task-new', 600, 60, existingSchedule);
  assert.equal(fitRes.hasConflict, false);
  assert.equal(fitRes.conflictingTaskId, null);

  // Overlap task-1: 09:30 - 10:30 (570 - 630)
  const conflictRes = checkOverlapAndResolve('task-new', 570, 60, existingSchedule);
  assert.equal(conflictRes.hasConflict, true);
  assert.equal(conflictRes.conflictingTaskId, 'task-1');
  assert.equal(conflictRes.canSwap, true);
  assert.equal(conflictRes.swapStartMinute, 540);
  // Push later places it at 10:00 (540 + 60)
  assert.equal(conflictRes.canPushLater, true);
  assert.equal(conflictRes.pushLaterStartMinute, 600);
});

test('Free slots calculation: empty day, partial day, and full day', () => {
  // Empty day: single free slot spanning 08:00 to 18:00 (600 min)
  const emptySlots = computeFreeSlots([], 0, DEFAULT_SCALE_PER_HOUR);
  assert.equal(emptySlots.length, 1);
  assert.equal(emptySlots[0].startMinute, 480);
  assert.equal(emptySlots[0].endMinute, 1080);
  assert.equal(emptySlots[0].durationMinutes, 600);

  // Partial day with 2 tasks: 09:00-10:00 (540-600) and 13:00-14:00 (780-840)
  const partialSchedule = [
    { startMinute: 540, duration: 60 },
    { startMinute: 780, duration: 60 },
  ];
  const partialSlots = computeFreeSlots(partialSchedule, 0, DEFAULT_SCALE_PER_HOUR);
  assert.equal(partialSlots.length, 3);
  // 1: 08:00 - 09:00 (480 - 540) = 60 min
  assert.equal(partialSlots[0].startMinute, 480);
  assert.equal(partialSlots[0].endMinute, 540);
  assert.equal(partialSlots[0].durationMinutes, 60);
  // 2: 10:00 - 13:00 (600 - 780) = 180 min
  assert.equal(partialSlots[1].startMinute, 600);
  assert.equal(partialSlots[1].endMinute, 780);
  assert.equal(partialSlots[1].durationMinutes, 180);
  // 3: 14:00 - 18:00 (840 - 1080) = 240 min
  assert.equal(partialSlots[2].startMinute, 840);
  assert.equal(partialSlots[2].endMinute, 1080);
  assert.equal(partialSlots[2].durationMinutes, 240);
});

test('Schedule partitioning: ruler tasks, tray tasks, and 8-hour / 18:00 overflow', () => {
  const mixedTasks: ScheduledTileInput[] = [
    { id: 'tray-1', estimatedMinutes: 60, scheduledStartMinute: null, status: 'todo' },
    { id: 'ruler-1', estimatedMinutes: 120, scheduledStartMinute: 540, status: 'todo' }, // 2h (540-660)
    { id: 'ruler-2', estimatedMinutes: 180, scheduledStartMinute: 660, status: 'todo' }, // 3h (660-840)
    { id: 'ruler-3', estimatedMinutes: 120, scheduledStartMinute: 840, status: 'todo' }, // 2h (840-960) -> cumulative 7h
    { id: 'overflow-capacity', estimatedMinutes: 90, scheduledStartMinute: 960, status: 'todo' }, // 1.5h -> total 8.5h > 8h!
    { id: 'overflow-time', estimatedMinutes: 60, scheduledStartMinute: 1050, status: 'todo' }, // 1050 + 60 = 1110 > 18:00!
  ];

  const res = partitionSchedule(mixedTasks, 480, 480, 1080);
  // Tray
  assert.equal(res.trayTasks.length, 1);
  assert.equal(res.trayTasks[0].id, 'tray-1');

  // Ruler fits first 3 tasks = 7h (420 min)
  assert.equal(res.rulerTasks.length, 3);
  assert.equal(res.totalScheduledMinutes, 420);

  // Overflow receives the 2 excess tasks
  assert.equal(res.overflowTasks.length, 2);
  assert.equal(res.overflowTasks[0].id, 'overflow-capacity');
  assert.equal(res.overflowTasks[1].id, 'overflow-time');
  assert.equal(res.exceedsCapacity, true);
  assert.equal(res.hasWorkdayOverflow, true);
});

test('Summary capsule text formatting', () => {
  assert.equal(formatSummaryCapsule(240, 480, 0), '4h planned of 8h, 0 conflicts');
  assert.equal(formatSummaryCapsule(270, 480, 1), '4.5h planned of 8h, 1 conflict');
  assert.equal(formatSummaryCapsule(480, 480, 2), '8h planned of 8h, 2 conflicts');
});

test('Sun Now marker positioning: within workday and after hours', () => {
  // 12:00 (720 min)
  const pos12 = getNowMarkerPosition(720, 0, DEFAULT_SCALE_PER_HOUR);
  assert.equal(pos12.isWithinWorkday, true);
  assert.equal(pos12.isPastWorkday, false);
  assert.equal(pos12.x, pos12.clampedX);

  // 19:30 (1170 min - after hours)
  const posPast = getNowMarkerPosition(1170, 0, DEFAULT_SCALE_PER_HOUR);
  assert.equal(posPast.isWithinWorkday, false);
  assert.equal(posPast.isPastWorkday, true);
  // clampedX stops at 18:00
  const x18 = minuteToRulerX(1080, 0, DEFAULT_SCALE_PER_HOUR);
  assert.ok(Math.abs(posPast.clampedX - x18) < 1e-6);
});

test('Zone slices: Morning, Midday, Evening layout', () => {
  const slices = getZoneSlices(0, DEFAULT_SCALE_PER_HOUR);
  assert.equal(slices.length, 3);
  assert.equal(slices[0].name, 'morning');
  assert.equal(slices[0].startMinute, 480);
  assert.equal(slices[0].endMinute, 690);

  assert.equal(slices[1].name, 'midday');
  assert.equal(slices[1].startMinute, 690);
  assert.equal(slices[1].endMinute, 870);

  assert.equal(slices[2].name, 'evening');
  assert.equal(slices[2].startMinute, 870);
  assert.equal(slices[2].endMinute, 1080);
});

test('Seated reach validation: every ruler point is within 0.65m of seated torso', () => {
  const torso = { x: 0, y: 1.05, z: 0 };
  const deskY = 0.74;
  const deskZ = -0.48; // Front edge of the desk table

  // Left end (x = -0.30m at 08:00)
  const leftEnd = { x: -0.30, y: deskY, z: deskZ };
  const leftReach = isWithinSeatedReach(leftEnd, torso, 0.65);
  assert.ok(leftReach.isReachable, `Left end distance ${leftReach.distance.toFixed(3)}m must be <= 0.65m`);
  assert.ok(leftReach.distance <= 0.65);

  // Center (x = 0m at 13:00)
  const center = { x: 0, y: deskY, z: deskZ };
  const centerReach = isWithinSeatedReach(center, torso, 0.65);
  assert.ok(centerReach.isReachable, `Center distance ${centerReach.distance.toFixed(3)}m must be <= 0.65m`);
  assert.ok(centerReach.distance <= 0.65);

  // Right end (x = +0.30m at 18:00)
  const rightEnd = { x: 0.30, y: deskY, z: deskZ };
  const rightReach = isWithinSeatedReach(rightEnd, torso, 0.65);
  assert.ok(rightReach.isReachable, `Right end distance ${rightReach.distance.toFixed(3)}m must be <= 0.65m`);
  assert.ok(rightReach.distance <= 0.65);
});
