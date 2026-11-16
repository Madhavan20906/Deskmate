import test from 'node:test';
import assert from 'node:assert/strict';
import { AppStore, INITIAL_STATE } from '../src/actions/store.ts';
import type { Action } from '../src/actions/types.ts';
import type { GlassTask } from '../src/glass-data-adapters.ts';

test('Action Layer: Create, Update, Complete, and Undo roundtrip', () => {
  const store = new AppStore(INITIAL_STATE);
  const initialTaskCount = store.getState().tasks.length;

  const testTask: GlassTask = {
    id: 'test-1',
    title: 'Review System Specs',
    priority: 'high',
    estimatedMinutes: 45,
    scheduledStartMinute: 9 * 60,
    status: 'todo',
    category: 'deep-work',
  };

  // 1. Create task
  const createAction: Action = {
    name: 'task.create',
    params: { task: testTask },
    describe: () => 'Create test task',
    riskLevel: 'SAFE',
    visualTarget: 'tasks',
  };
  const res1 = store.dispatch(createAction, 'hand');
  assert.equal(res1.success, true);
  assert.equal(store.getState().tasks.length, initialTaskCount + 1);

  // 2. Update task
  const updateAction: Action = {
    name: 'task.update',
    params: { id: 'test-1', changes: { priority: 'low', estimatedMinutes: 60 } },
    describe: () => 'Update test task',
    riskLevel: 'SAFE',
    visualTarget: 'tasks',
  };
  const res2 = store.dispatch(updateAction, 'pip');
  assert.equal(res2.success, true);
  const updated = store.getState().tasks.find((t) => t.id === 'test-1')!;
  assert.equal(updated.priority, 'low');
  assert.equal(updated.estimatedMinutes, 60);

  // 3. Complete task
  const completeAction: Action = {
    name: 'task.complete',
    params: { id: 'test-1' },
    describe: () => 'Complete test task',
    riskLevel: 'SAFE',
    visualTarget: 'tasks',
  };
  const res3 = store.dispatch(completeAction, 'controller');
  assert.equal(res3.success, true);
  assert.equal(store.getState().tasks.find((t) => t.id === 'test-1')!.status, 'completed');

  // 4. Undo 3 times back to initial state
  assert.equal(store.canUndo(), true);
  assert.equal(store.undo(), true); // Revert complete
  assert.equal(store.getState().tasks.find((t) => t.id === 'test-1')!.status, 'todo');

  assert.equal(store.undo(), true); // Revert update
  const revertedUpdate = store.getState().tasks.find((t) => t.id === 'test-1')!;
  assert.equal(revertedUpdate.priority, 'high');
  assert.equal(revertedUpdate.estimatedMinutes, 45);

  assert.equal(store.undo(), true); // Revert create
  assert.equal(store.getState().tasks.length, initialTaskCount);
  assert.equal(store.getState().tasks.find((t) => t.id === 'test-1'), undefined);

  // 5. Redo check
  assert.equal(store.canRedo(), true);
  assert.equal(store.redo(), true); // Redo create
  assert.equal(store.getState().tasks.length, initialTaskCount + 1);
});

test('Action Layer: Schedule move, resize, swap, and bounds validation', () => {
  const store = new AppStore(INITIAL_STATE);
  const firstScheduled = store.getState().tasks.find((t) => t.scheduledStartMinute !== null)!;
  const originalMinute = firstScheduled.scheduledStartMinute!;

  // Move
  const moveAction: Action = {
    name: 'schedule.move',
    params: { id: firstScheduled.id, deltaMinutes: 30 },
    describe: () => 'Move task by 30m',
    riskLevel: 'SAFE',
    visualTarget: 'schedule',
  };
  assert.equal(store.dispatch(moveAction).success, true);
  assert.equal(
    store.getState().tasks.find((t) => t.id === firstScheduled.id)!.scheduledStartMinute,
    originalMinute + 30,
  );

  // Undo move
  assert.equal(store.undo(), true);
  assert.equal(
    store.getState().tasks.find((t) => t.id === firstScheduled.id)!.scheduledStartMinute,
    originalMinute,
  );

  // Out of bounds check: invalid duration < 5m
  const invalidResize: Action = {
    name: 'schedule.resize',
    params: { id: firstScheduled.id, newDuration: 2 },
    describe: () => 'Resize too small',
    riskLevel: 'SAFE',
    visualTarget: 'schedule',
  };
  const invalidRes = store.dispatch(invalidResize);
  assert.equal(invalidRes.success, false);
  assert.match(invalidRes.reason || '', /between 5m and 480m/);
});

test('Action Layer: Transactions atomicity and combined inverse', () => {
  const store = new AppStore(INITIAL_STATE);
  const initialTaskCount = store.getState().tasks.length;

  const batchActions: Action[] = [
    {
      name: 'task.create',
      params: {
        task: {
          id: 'batch-1',
          title: 'Batch Task A',
          priority: 'medium',
          estimatedMinutes: 30,
          scheduledStartMinute: 10 * 60,
          status: 'todo',
          category: 'admin',
        },
      },
      describe: () => 'Create Batch Task A',
      riskLevel: 'SAFE',
      visualTarget: 'tasks',
    },
    {
      name: 'task.create',
      params: {
        task: {
          id: 'batch-2',
          title: 'Batch Task B',
          priority: 'high',
          estimatedMinutes: 60,
          scheduledStartMinute: 11 * 60,
          status: 'todo',
          category: 'deep-work',
        },
      },
      describe: () => 'Create Batch Task B',
      riskLevel: 'SAFE',
      visualTarget: 'tasks',
    },
    {
      name: 'focus.start',
      params: { durationMinutes: 45 },
      describe: () => 'Start 45m focus sprint',
      riskLevel: 'SAFE',
      visualTarget: 'focus',
    },
  ];

  const txRes = store.dispatchTransaction(batchActions, 'Plan My Morning', 'pip');
  assert.equal(txRes.success, true);
  assert.equal(store.getState().tasks.length, initialTaskCount + 2);
  assert.equal(store.getState().focus.isRunning, true);
  assert.equal(store.getState().focus.totalSeconds, 45 * 60);

  // Single undo should revert the entire transaction atomically
  assert.equal(store.undo(), true);
  assert.equal(store.getState().tasks.length, initialTaskCount);
  assert.equal(store.getState().focus.isRunning, false);
  assert.equal(store.getState().tasks.find((t) => t.id === 'batch-1'), undefined);
});

test('Action Layer: Event Log tracking with actor and timestamp', () => {
  const store = new AppStore(INITIAL_STATE);
  store.dispatch(
    {
      name: 'query.day',
      params: {},
      describe: () => 'Query day summary',
      riskLevel: 'SAFE',
      visualTarget: 'pip',
    },
    'pip',
  );

  const logs = store.getEventLog();
  assert.equal(logs.length >= 1, true);
  const last = logs[logs.length - 1];
  assert.equal(last.actor, 'pip');
  assert.equal(last.action.name, 'query.day');
  assert.equal(last.success, true);
});

test('Action Layer: Property-based fuzzing with 1,000 random actions', () => {
  const store = new AppStore(INITIAL_STATE);
  const actionNames = [
    'task.complete',
    'task.reopen',
    'schedule.move',
    'schedule.resize',
    'focus.start',
    'focus.pause',
    'ui.zoom',
    'query.day',
    'query.overload',
  ];

  for (let i = 0; i < 1000; i++) {
    const name = actionNames[i % actionNames.length];
    const task = store.getState().tasks[i % store.getState().tasks.length];

    let action: Action;
    if (name === 'task.complete' || name === 'task.reopen') {
      action = {
        name,
        params: { id: task.id },
        describe: () => `${name} ${task.id}`,
        riskLevel: 'SAFE',
        visualTarget: 'tasks',
      };
    } else if (name === 'schedule.move') {
      action = {
        name,
        params: { id: task.id, deltaMinutes: (i % 3 === 0 ? 15 : -15) },
        describe: () => 'Move task',
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
    } else if (name === 'schedule.resize') {
      action = {
        name,
        params: { id: task.id, newDuration: 30 + (i % 60) },
        describe: () => 'Resize task',
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
    } else if (name === 'focus.start') {
      action = {
        name,
        params: { durationMinutes: 25 },
        describe: () => 'Focus start',
        riskLevel: 'SAFE',
        visualTarget: 'focus',
      };
    } else if (name === 'focus.pause') {
      action = {
        name,
        params: {},
        describe: () => 'Focus pause',
        riskLevel: 'SAFE',
        visualTarget: 'focus',
      };
    } else if (name === 'ui.zoom') {
      action = {
        name,
        params: { panelId: 'panel-hub', zoom: i % 2 === 0 },
        describe: () => 'Toggle zoom',
        riskLevel: 'SAFE',
        visualTarget: 'hub',
      };
    } else {
      action = {
        name,
        params: {},
        describe: () => name,
        riskLevel: 'SAFE',
        visualTarget: 'pip',
      };
    }

    // Should never throw unhandled exception or corrupt state
    store.dispatch(action, i % 2 === 0 ? 'hand' : 'controller');
  }

  // Ensure store state is healthy and intact
  const finalState = store.getState();
  assert.equal(Array.isArray(finalState.tasks), true);
  assert.equal(finalState.tasks.length > 0, true);
});
