import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipCommand, validatePipCommand } from '../src/pip.ts';
import { analyzeWorkload } from '../src/workload.ts';
import { calculateProductivityInsights } from '../src/productivity.ts';

test('Pip: parse create-task commands', () => {
  const cmd1 = parsePipCommand('Add a task to plan Q4 roadmap');
  assert.equal(cmd1.intent, 'create-task');
  assert.equal(cmd1.title, 'plan Q4 roadmap');
  assert.equal(cmd1.estimatedMinutes, 30);

  const cmd2 = parsePipCommand('Create task for review PRs for 45 minutes');
  assert.equal(cmd2.intent, 'create-task');
  assert.equal(cmd2.title, 'review PRs');
  assert.equal(cmd2.estimatedMinutes, 45);

  const cmd3 = parsePipCommand('Make a new task named system architecture for 2 hours');
  assert.equal(cmd3.intent, 'create-task');
  assert.equal(cmd3.title, 'system architecture');
  assert.equal(cmd3.estimatedMinutes, 120);

  const cmd4 = parsePipCommand('Add write report to my tasks');
  assert.equal(cmd4.intent, 'create-task');
  assert.equal(cmd4.title, 'write report');
  assert.equal(cmd4.estimatedMinutes, 30);
});

test('Pip: parse schedule-task commands with requested time and day', () => {
  const cmd1 = parsePipCommand('Schedule Q4 roadmap at 10:00 am');
  assert.equal(cmd1.intent, 'schedule-task');
  assert.equal(cmd1.taskQuery, 'Q4 roadmap');
  assert.equal(cmd1.requestedStartMinute, 10 * 60);

  const cmd2 = parsePipCommand('Move review design to 2pm');
  assert.equal(cmd2.intent, 'schedule-task');
  assert.equal(cmd2.taskQuery, 'review design');
  assert.equal(cmd2.requestedStartMinute, 14 * 60);

  const cmd3 = parsePipCommand('Schedule studying for two hours today');
  assert.equal(cmd3.intent, 'schedule-task');
  assert.equal(cmd3.taskQuery, 'studying');
  assert.equal(cmd3.estimatedMinutes, 120);
  assert.equal(cmd3.requestedDay, 'today');

  const cmd4 = parsePipCommand('Schedule project tomorrow');
  assert.equal(cmd4.intent, 'schedule-task');
  assert.equal(cmd4.requestedDay, 'tomorrow');
});

test('Pip: parse complete-task commands', () => {
  const cmd1 = parsePipCommand('Mark review design as completed');
  assert.equal(cmd1.intent, 'complete-task');
  assert.equal(cmd1.taskQuery, 'review design');

  const cmd2 = parsePipCommand('Complete roadmap');
  assert.equal(cmd2.intent, 'complete-task');
  assert.equal(cmd2.taskQuery, 'roadmap');

  const cmd3 = parsePipCommand('Set inbox reset as done');
  assert.equal(cmd3.intent, 'complete-task');
  assert.equal(cmd3.taskQuery, 'inbox reset');
});

test('Pip: parse query and focus commands', () => {
  const listAll = parsePipCommand('What tasks do I have today?');
  assert.equal(listAll.intent, 'list-tasks');
  assert.equal(listAll.filter, 'all');

  const listPending = parsePipCommand('Show pending tasks');
  assert.equal(listPending.intent, 'list-tasks');
  assert.equal(listPending.filter, 'pending');

  const focusGeneric = parsePipCommand('Start focus');
  assert.equal(focusGeneric.intent, 'start-focus');

  const focusNatural = parsePipCommand('lets focus');
  assert.equal(focusNatural.intent, 'start-focus');

  const focusOnTask = parsePipCommand('focus on writing report');
  assert.equal(focusOnTask.intent, 'start-focus');
  assert.equal(focusOnTask.taskQuery, 'writing report');

  const focusSpecific = parsePipCommand('Begin focus on roadmap');
  assert.equal(focusSpecific.intent, 'start-focus');
  assert.equal(focusSpecific.taskQuery, 'roadmap');

  const recap = parsePipCommand('Daily recap');
  assert.equal(recap.intent, 'recap');

  const update = parsePipCommand('Give me an update');
  assert.equal(update.intent, 'recap');

  const help = parsePipCommand('What can you do?');
  assert.equal(help.intent, 'help');

  const who = parsePipCommand('Who are you?');
  assert.equal(who.intent, 'help');
});

test('Pip: parse multi-task sentence splitting', () => {
  const multi = parsePipCommand('I need to finish the report and call mom');
  assert.equal(multi.intent, 'create-multiple-tasks');
  assert.equal(multi.tasks.length, 2);
  assert.equal(multi.tasks[0].title, 'finish the report');
  assert.equal(multi.tasks[0].estimatedMinutes, 60);
  assert.equal(multi.tasks[1].title, 'call mom');
  assert.equal(multi.tasks[1].estimatedMinutes, 15);

  const multiThree = parsePipCommand('Add tasks: write slides, review PR, and email team');
  assert.equal(multiThree.intent, 'create-multiple-tasks');
  assert.equal(multiThree.tasks.length, 3);
});

test('Pip: handle invalid duration and unknown requests', () => {
  const tooLong = parsePipCommand('Add a task to work for 10 hours');
  assert.equal(tooLong.intent, 'invalid-duration');

  const unknown = parsePipCommand('Order a pizza');
  assert.equal(unknown.intent, 'unknown');
});

test('Pip: validatePipCommand checks schema and bounds', () => {
  assert.equal(validatePipCommand(null), null);
  assert.equal(validatePipCommand('hello'), null);
  assert.equal(validatePipCommand({ intent: 'nonexistent' }), null);

  // Valid create-task
  const validCreate = validatePipCommand({
    intent: 'create-task',
    title: 'Valid task',
    estimatedMinutes: 60,
  });
  assert.notEqual(validCreate, null);

  // Invalid duration bounds (< 5 or > 480)
  assert.equal(
    validatePipCommand({
      intent: 'create-task',
      title: 'Valid task',
      estimatedMinutes: 2,
    }),
    null,
  );

  // Valid schedule-task
  const validSchedule = validatePipCommand({
    intent: 'schedule-task',
    taskQuery: 'Test task',
    requestedDay: 'today',
    requestedStartMinute: 600,
    estimatedMinutes: 30,
  });
  assert.notEqual(validSchedule, null);
});

test('Workload: analyze capacity and overload status', () => {
  const tasks = [
    {
      id: '1',
      title: 'Task 1',
      priority: 'high',
      estimatedMinutes: 120,
      scheduledStartMinute: 480, // 08:00
      status: 'completed',
    },
    {
      id: '2',
      title: 'Task 2',
      priority: 'medium',
      estimatedMinutes: 180,
      scheduledStartMinute: 600, // 10:00
      status: 'in-progress',
    },
  ];

  const analysis = analyzeWorkload(tasks, 480, 480, 1080);
  assert.equal(analysis.totalEstimatedMinutes, 300);
  assert.equal(analysis.completedMinutes, 120);
  assert.equal(analysis.pendingMinutes, 180);
  assert.equal(analysis.balance, 'underloaded');
});

test('Productivity: calculate garden growth stages and streak', () => {
  const tasks = [
    { id: 't1', status: 'completed', completedAt: Date.now() },
    { id: 't2', status: 'todo', completedAt: null },
  ];
  const sessions = [
    {
      id: 's1',
      startedAt: Date.now() - 3600 * 1000,
      endedAt: Date.now() - 1800 * 1000,
      actualDurationMs: 25 * 60 * 1000,
      status: 'completed',
    },
  ];

  const insights = calculateProductivityInsights(tasks, sessions);
  assert.ok(insights.gardenPoints >= 20);
  assert.equal(insights.gardenStage, 'Sprout');
  assert.ok(insights.days.length === 7);
});

test('Pip: 25 messy natural phrasings benchmark', () => {
  const phrasings = [
    { text: 'I need to finish the report and call mom', expected: 'create-multiple-tasks' },
    { text: 'add tasks: design logo, test build, and write docs', expected: 'create-multiple-tasks' },
    { text: 'please add study for exam and wash dishes', expected: 'create-multiple-tasks' },
    { text: 'create quick call with team and deep work on roadmap', expected: 'create-multiple-tasks' },
    { text: 'i finished the bug fix', expected: 'complete-task' },
    { text: 'completed roadmap planning', expected: 'complete-task' },
    { text: 'done with review design brief', expected: 'complete-task' },
    { text: 'lets focus', expected: 'start-focus' },
    { text: "let's focus on slides", expected: 'start-focus' },
    { text: 'focus on writing report', expected: 'start-focus' },
    { text: 'start focus', expected: 'start-focus' },
    { text: 'begin focus on Q4 roadmap', expected: 'start-focus' },
    { text: 'schedule roadmap today', expected: 'schedule-task' },
    { text: 'schedule review design brief at 2:30 pm', expected: 'schedule-task' },
    { text: 'move inbox reset to tomorrow at 10 am', expected: 'schedule-task' },
    { text: 'plan studying for 45 minutes today', expected: 'schedule-task' },
    { text: 'give me an update', expected: 'recap' },
    { text: 'how am i doing today?', expected: 'recap' },
    { text: 'what should I focus on next?', expected: 'recap' },
    { text: 'show unfinished tasks', expected: 'list-tasks' },
    { text: 'what are my tasks for today?', expected: 'list-tasks' },
    { text: 'who are you?', expected: 'help' },
    { text: 'what can you do?', expected: 'help' },
    { text: 'make task fix login issue', expected: 'create-task' },
    { text: 'put meeting at 3pm', expected: 'schedule-task' },
  ];

  for (const { text, expected } of phrasings) {
    const res = parsePipCommand(text);
    assert.equal(res.intent, expected, `Failed on: "${text}"`);
  }
});
