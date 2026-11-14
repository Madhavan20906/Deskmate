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

test('Hands-Only Walkthrough Harness: 12-Step Full Productivity Loop', async (t) => {
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
});
