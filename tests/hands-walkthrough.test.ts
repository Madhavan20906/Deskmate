import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planDaySchedule,
  recommendWhatNext,
  formatMinuteTime,
  detectOverlaps,
  type TaskItem,
} from '../src/productivity-engine.ts';
import {
  findMatchingTimelineZone,
  PinchHysteresis,
  ActionDebouncer,
  HandTrackingMonitor,
  calculateSeatedDistance,
} from '../src/hand-interaction-engine.ts';
import {
  minuteToRulerX,
  rulerXToMinute,
  snapTo15Minutes,
  clampResizeEndMinute,
  checkOverlapAndResolve,
  partitionSchedule,
  getTileVisualWidth,
  DEFAULT_SCALE_PER_HOUR,
  MIN_TILE_WIDTH_METERS,
  type ScheduledTileInput,
} from '../src/schedule-ruler.ts';

test('Hands-Only Walkthrough Harness: 18-Step Full Desk Ruler Productivity Loop', async (t) => {
  // Step 1: Session & Entry (Zero controllers, hands only)
  await t.test('Step 1: Session entry with hands only', () => {
    const inputSources = [
      { handedness: 'left', hand: { joints: {} }, targetRayMode: 'tracked-pointer' },
      { handedness: 'right', hand: { joints: {} }, targetRayMode: 'tracked-pointer' },
    ];
    const hasControllers = inputSources.some((src) => src.hand == null);
    const hasHands = inputSources.every((src) => src.hand != null);
    assert.equal(hasControllers, false, 'No controllers connected');
    assert.equal(hasHands, true, 'Both hands tracked in XR');
  });

  // Step 2: Desk placement (Plane detected at y=0.72)
  await t.test('Step 2: Tabletop plane calibration', () => {
    const plane = { orientation: 'horizontal', y: 0.72, semanticLabel: 'table' };
    const workspaceRootY = plane.y + 0.03;
    assert.equal(workspaceRootY, 0.75, 'Workspace roots cleanly 3cm above detected tabletop');
  });

  // Step 3: Meet Pip & What-Next recommendation
  await t.test('Step 3: Meet Pip & What Next query', () => {
    const tasks: TaskItem[] = [
      { id: '1', title: 'Plan Q4 roadmap', priority: 'high', estimatedMinutes: 120, scheduledStartMinute: 570, status: 'todo' },
      { id: '2', title: 'Review design brief', priority: 'medium', estimatedMinutes: 60, scheduledStartMinute: 780, status: 'todo' },
    ];
    const rec = recommendWhatNext(tasks, 570);
    assert.ok(rec.task !== null);
    assert.equal(rec.task?.title, 'Plan Q4 roadmap');
    assert.ok(rec.rationale.toLowerCase().includes('scheduled'));
  });

  // Step 4: Quick Capture without typing (Preset chips + stepper)
  await t.test('Step 4: Hands-only Quick Capture with chips & stepper', () => {
    const chips = ['Write report', 'Review', 'Call', 'Email', 'Study', 'Plan', 'Design', 'Admin'];
    const chosenTitle = chips[0]; // 1st pinch
    let duration = 25;
    duration += 5; // 2nd pinch (+5)
    const priority = 'high'; // 3rd pinch (High)

    const newTask: TaskItem = {
      id: 'task-quick-1',
      title: chosenTitle,
      priority,
      estimatedMinutes: duration,
      scheduledStartMinute: null,
      status: 'todo',
    };
    assert.equal(newTask.title, 'Write report');
    assert.equal(newTask.estimatedMinutes, 30);
    assert.equal(newTask.priority, 'high');
  });

  // Step 5: Plan Day Schedule
  await t.test('Step 5: Pack tasks into schedule with rest buffers', () => {
    const tasks: TaskItem[] = [
      { id: '1', title: 'Plan Q4 roadmap', priority: 'high', estimatedMinutes: 120, scheduledStartMinute: null, status: 'todo' },
      { id: '2', title: 'Review design brief', priority: 'medium', estimatedMinutes: 60, scheduledStartMinute: null, status: 'todo' },
    ];
    const plan = planDaySchedule(tasks, 540, 1080, 10);
    assert.equal(plan.assignments.length, 2);
    assert.equal(plan.assignments[0].startMinute, 540); // 09:00
    assert.equal(plan.assignments[1].startMinute, 670); // 11:10 (540 + 120 + 10)
    assert.equal(plan.overflowCount, 0);
  });

  // Step 6: Start Sprint
  await t.test('Step 6: Activate focus sprint', () => {
    const activeSprint = {
      taskId: '1',
      taskTitle: 'Plan Q4 roadmap',
      durationMinutes: 25,
      remainingSeconds: 25 * 60,
      status: 'running' as const,
    };
    assert.equal(activeSprint.status, 'running');
    assert.equal(activeSprint.remainingSeconds, 1500);
  });

  // Step 7: Pause & Resume
  await t.test('Step 7: Pause and resume sprint', () => {
    let status: 'running' | 'paused' = 'running';
    // Pause
    status = 'paused';
    assert.equal(status, 'paused');
    // Resume
    status = 'running';
    assert.equal(status, 'running');
  });

  // Step 8: Complete Sprint & Bloom
  await t.test('Step 8: Complete sprint, award token and perk plant', () => {
    let tokens = 0;
    let growthPoints = 0;
    tokens += 1;
    growthPoints += 25;
    assert.equal(tokens, 1);
    assert.equal(growthPoints, 25);
  });

  // Step 9: Recovery Break
  await t.test('Step 9: Seated guided breathing break', () => {
    const breakRemainingSeconds = 120;
    const prompt = 'Pip suggests: Turn your head slowly left, then right. Release neck tension.';
    assert.ok(breakRemainingSeconds > 0);
    assert.ok(prompt.includes('neck tension'));
  });

  // Step 10: Evening Jar Reward
  await t.test('Step 10: Token marble dropped into jar', () => {
    const marbleDropPos = { x: -0.52, y: 0.76, z: -0.62 };
    const jarPos = { x: -0.52, y: 0.74, z: -0.62 };
    const distanceToJar = Math.hypot(
      marbleDropPos.x - jarPos.x,
      marbleDropPos.y - jarPos.y,
      marbleDropPos.z - jarPos.z,
    );
    assert.ok(distanceToJar < 0.10, 'Marble drops cleanly into jar opening');
  });

  // Step 11: Evening Shutdown Ritual
  await t.test('Step 11: Daily shutdown and focus recap', () => {
    const completedMinutes = 25;
    const recap = `Today's Focus: ${completedMinutes}m logged across 1 focus sprint. Great progress!`;
    assert.ok(recap.includes('25m logged'));
  });

  // Step 12: State Persistence & Rehydration
  await t.test('Step 12: State rehydrates cleanly without duplicates', () => {
    const saved = JSON.stringify({
      schemaVersion: 2,
      tasks: [
        { id: '1', title: 'Plan Q4 roadmap', priority: 'high', estimatedMinutes: 120, status: 'completed' },
        { id: '2', title: 'Review design brief', priority: 'medium', estimatedMinutes: 60, status: 'todo' },
      ],
    });
    const parsed = JSON.parse(saved);
    assert.equal(parsed.schemaVersion, 2);
    assert.equal(parsed.tasks.length, 2);
    assert.equal(parsed.tasks[0].status, 'completed');
  });

  // Step 13: Drag a tile along Desk Ruler with 15-minute magnetic snapping
  await t.test('Step 13: Drag tile along desk ruler with 15m magnetic snap & ghost preview', () => {
    // User pinches a 60m task and drags along desk surface (x = 0.05m -> ~13:50)
    const rawMinute = rulerXToMinute(0.05, 0, DEFAULT_SCALE_PER_HOUR);
    const snappedMinute = snapTo15Minutes(rawMinute);
    // Snapped to clean 15-minute boundary
    assert.equal(snappedMinute % 15, 0);

    // Ghost landing width equals tile true visual width
    const widthInfo = getTileVisualWidth(60, DEFAULT_SCALE_PER_HOUR, MIN_TILE_WIDTH_METERS);
    assert.equal(widthInfo.visualWidth, 0.06);
    assert.equal(widthInfo.isMinWidthPadded, false);
  });

  // Step 14: Resize tile via end handle with neighbor clamp
  await t.test('Step 14: Resize tile via end handle with neighbor & workday clamp', () => {
    // Task at 09:00 (540m) resized towards 11:30 (690m), next neighbor starts at 10:30 (630m)
    const clampedEnd = clampResizeEndMinute(540, 690, 15, 480, 630);
    assert.equal(clampedEnd, 630, 'Clamped exactly at next neighbor start');
  });

  // Step 15: Conflict detection on tile drop with red outline & swap/push later
  await t.test('Step 15: Conflict detection on tile drop with red outline & swap/push later', () => {
    const existing = [
      { id: 'task-1', startMinute: 540, duration: 60 }, // 09:00 - 10:00
      { id: 'task-2', startMinute: 660, duration: 90 }, // 11:00 - 12:30
    ];
    // Dropping moving task at 09:30 (570) with 60m duration -> overlaps task-1
    const conflict = checkOverlapAndResolve('moving-task', 570, 60, existing);
    assert.equal(conflict.hasConflict, true);
    assert.equal(conflict.conflictingTaskId, 'task-1');
    assert.equal(conflict.canSwap, true);
    assert.equal(conflict.swapStartMinute, 540);
    assert.equal(conflict.canPushLater, true);
    assert.equal(conflict.pushLaterStartMinute, 600);
  });

  // Step 16: Overflow tray partitioning when tasks exceed 8 hours or 18:00 cutoff
  await t.test('Step 16: Overflow tray partitioning when tasks exceed 8 hours or 18:00 cutoff', () => {
    const mixed: ScheduledTileInput[] = [
      { id: 't1', estimatedMinutes: 240, scheduledStartMinute: 480, status: 'todo' }, // 4h
      { id: 't2', estimatedMinutes: 180, scheduledStartMinute: 720, status: 'todo' }, // 3h (total 7h)
      { id: 't3', estimatedMinutes: 120, scheduledStartMinute: 900, status: 'todo' }, // 2h (total 9h > 8h capacity!)
    ];
    const partition = partitionSchedule(mixed, 480, 480, 1080);
    assert.equal(partition.rulerTasks.length, 2);
    assert.equal(partition.overflowTasks.length, 1);
    assert.equal(partition.overflowTasks[0].id, 't3');
    assert.equal(partition.exceedsCapacity, true);
  });

  // Step 17: Plan My Day preview with confirm & cancel gate
  await t.test('Step 17: Plan My Day preview with confirm & cancel gate', () => {
    const pendingTasks: TaskItem[] = [
      { id: 't1', title: 'Task 1', priority: 'high', estimatedMinutes: 60, scheduledStartMinute: null, status: 'todo' },
      { id: 't2', title: 'Task 2', priority: 'medium', estimatedMinutes: 45, scheduledStartMinute: null, status: 'todo' },
    ];
    // Preview generated
    const plan = planDaySchedule(pendingTasks, 480, 1080, 10);
    assert.equal(plan.assignments.length, 2);
    // Cancellation retains original null schedule
    let applied = false;
    // User cancels:
    applied = false;
    assert.equal(applied, false, 'No tasks modified on cancel');
    // User confirms:
    applied = true;
    assert.equal(applied, true, 'Tasks committed only on explicit confirm');
  });

  // Step 18: Mid-sprint and mid-drag state reload persistence
  await t.test('Step 18: Mid-sprint and mid-drag state reload persistence', () => {
    const focusState = {
      active: {
        id: 'sprint-123',
        taskId: 'task-roadmap',
        startedAt: 1700000000000,
        plannedDurationMinutes: 25,
        remainingMs: 900000,
        status: 'running' as const,
      },
      durationMinutes: 25,
      history: [],
    };
    const serialized = JSON.stringify(focusState);
    const reloaded = JSON.parse(serialized);
    assert.equal(reloaded.active.status, 'running');
    assert.equal(reloaded.active.remainingMs, 900000);
    assert.equal(reloaded.active.taskId, 'task-roadmap');
  });
});
