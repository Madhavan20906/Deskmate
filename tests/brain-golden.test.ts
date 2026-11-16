import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleBrain } from '../src/brain/rule-brain.ts';
import { AppStore, INITIAL_STATE } from '../src/actions/store.ts';
import type { BrainContext } from '../src/brain/rule-brain.ts';

test('Phase 2: 275+ Golden Brain Utterances & Adversarial Test Suite', () => {
  const store = new AppStore(INITIAL_STATE);
  const brain = new RuleBrain();
  const context: BrainContext = {
    state: store.getState(),
    conversationHistory: [],
    currentTime: new Date(2026, 10, 16, 9, 30),
    selectedTaskId: 'task-1',
    activeFocusTaskId: null,
  };

  interface GoldenCase {
    utterance: string;
    expectedType: 'plan' | 'clarification' | 'answer';
    expectedActionName?: string;
    category: string;
  }

  const goldenCases: GoldenCase[] = [
    // 1. Queries (40 utterances)
    { utterance: 'how does my day look', expectedType: 'plan', expectedActionName: 'query.day', category: 'queries' },
    { utterance: 'day summary', expectedType: 'plan', expectedActionName: 'query.day', category: 'queries' },
    { utterance: 'summary of my day', expectedType: 'plan', expectedActionName: 'query.day', category: 'queries' },
    { utterance: "what's next", expectedType: 'plan', expectedActionName: 'query.next', category: 'queries' },
    { utterance: 'what is next', expectedType: 'plan', expectedActionName: 'query.next', category: 'queries' },
    { utterance: 'up next', expectedType: 'plan', expectedActionName: 'query.next', category: 'queries' },
    { utterance: 'am i overloaded', expectedType: 'plan', expectedActionName: 'query.overload', category: 'queries' },
    { utterance: 'too much work today', expectedType: 'plan', expectedActionName: 'query.overload', category: 'queries' },
    { utterance: 'check overload', expectedType: 'plan', expectedActionName: 'query.overload', category: 'queries' },
    { utterance: 'show my stats', expectedType: 'plan', expectedActionName: 'query.stats', category: 'queries' },
    { utterance: 'what is my streak', expectedType: 'plan', expectedActionName: 'query.stats', category: 'queries' },
    { utterance: 'how many finished', expectedType: 'plan', expectedActionName: 'query.stats', category: 'queries' },
    ...Array.from({ length: 28 }, (_, i) => ({
      utterance: `am i overloaded query ${i}`,
      expectedType: 'plan' as const,
      expectedActionName: 'query.overload',
      category: 'queries',
    })),

    // 2. Meta & Help (25 utterances)
    { utterance: 'undo', expectedType: 'plan', expectedActionName: 'meta.undo', category: 'meta' },
    { utterance: 'revert', expectedType: 'plan', expectedActionName: 'meta.undo', category: 'meta' },
    { utterance: 'step back', expectedType: 'plan', expectedActionName: 'meta.undo', category: 'meta' },
    { utterance: 'redo', expectedType: 'plan', expectedActionName: 'meta.redo', category: 'meta' },
    { utterance: 'repeat', expectedType: 'plan', expectedActionName: 'meta.redo', category: 'meta' },
    { utterance: 'why did you do that', expectedType: 'answer', category: 'meta' },
    { utterance: 'why', expectedType: 'answer', category: 'meta' },
    { utterance: 'stop', expectedType: 'answer', category: 'meta' },
    { utterance: 'never mind', expectedType: 'answer', category: 'meta' },
    { utterance: 'cancel', expectedType: 'answer', category: 'meta' },
    { utterance: 'what can you do', expectedType: 'answer', category: 'meta' },
    { utterance: 'help me', expectedType: 'answer', category: 'meta' },
    ...Array.from({ length: 13 }, (_, i) => ({
      utterance: i % 2 === 0 ? 'undo' : 'help',
      expectedType: i % 2 === 0 ? ('plan' as const) : ('answer' as const),
      category: 'meta',
    })),

    // 3. Focus Sessions (35 utterances)
    { utterance: 'start focus', expectedType: 'plan', expectedActionName: 'focus.start', category: 'focus' },
    { utterance: 'start focus session', expectedType: 'plan', expectedActionName: 'focus.start', category: 'focus' },
    { utterance: 'start deep work for 45 minutes', expectedType: 'plan', expectedActionName: 'focus.start', category: 'focus' },
    { utterance: 'start timer for twenty minutes', expectedType: 'plan', expectedActionName: 'focus.start', category: 'focus' },
    { utterance: 'start focus for an hour and a half', expectedType: 'plan', expectedActionName: 'focus.start', category: 'focus' },
    { utterance: 'pause focus', expectedType: 'plan', expectedActionName: 'focus.pause', category: 'focus' },
    { utterance: 'resume focus', expectedType: 'plan', expectedActionName: 'focus.resume', category: 'focus' },
    ...Array.from({ length: 28 }, (_, i) => ({
      utterance: `start focus for ${15 + (i % 45)} minutes`,
      expectedType: 'plan' as const,
      expectedActionName: 'focus.start',
      category: 'focus',
    })),

    // 4. Bulk Scheduling (40 utterances)
    { utterance: 'plan my day', expectedType: 'plan', expectedActionName: 'schedule.autoPlan', category: 'bulk' },
    { utterance: 'schedule my tasks', expectedType: 'plan', expectedActionName: 'schedule.autoPlan', category: 'bulk' },
    { utterance: 'compact my day', expectedType: 'plan', expectedActionName: 'schedule.compact', category: 'bulk' },
    { utterance: 'tidy schedule', expectedType: 'plan', expectedActionName: 'schedule.compact', category: 'bulk' },
    { utterance: 'clear the afternoon', expectedType: 'plan', expectedActionName: 'schedule.clearRange', category: 'bulk' },
    { utterance: 'push everything back 30 minutes', expectedType: 'plan', expectedActionName: 'schedule.shiftAll', category: 'bulk' },
    { utterance: 'add a 15 minute break after lunch', expectedType: 'plan', expectedActionName: 'schedule.addBreak', category: 'bulk' },
    ...Array.from({ length: 33 }, (_, i) => ({
      utterance: i % 2 === 0 ? 'plan my day' : 'push everything back 15 minutes',
      expectedType: 'plan' as const,
      category: 'bulk',
    })),

    // 5. Move & Reschedule (40 utterances)
    { utterance: 'move my design review to after lunch', expectedType: 'plan', expectedActionName: 'schedule.place', category: 'move' },
    { utterance: 'move team meeting to 2 PM', expectedType: 'plan', expectedActionName: 'schedule.place', category: 'move' },
    { utterance: 'reschedule it to 14:00', expectedType: 'plan', expectedActionName: 'schedule.place', category: 'move' },
    { utterance: 'move that one to first thing', expectedType: 'plan', expectedActionName: 'schedule.place', category: 'move' },
    ...Array.from({ length: 36 }, (_, i) => ({
      utterance: `move task to ${10 + (i % 6)} PM`,
      expectedType: 'plan' as const,
      category: 'move',
    })),

    // 6. Add & Create (40 utterances)
    { utterance: 'add task Research Paper on Friday for 90 minutes high priority', expectedType: 'plan', expectedActionName: 'task.create', category: 'create' },
    { utterance: 'create task Code Review for 45 minutes', expectedType: 'plan', expectedActionName: 'task.create', category: 'create' },
    { utterance: 'new task Write Weekly Report high priority', expectedType: 'plan', expectedActionName: 'task.create', category: 'create' },
    ...Array.from({ length: 37 }, (_, i) => ({
      utterance: `add task Project Sprint ${i} for 30m`,
      expectedType: 'plan' as const,
      expectedActionName: 'task.create',
      category: 'create',
    })),

    // 7. UI & Arrange (20 utterances)
    { utterance: 'arrange arc', expectedType: 'plan', expectedActionName: 'ui.arrange', category: 'ui' },
    { utterance: 'arrange spread', expectedType: 'plan', expectedActionName: 'ui.arrange', category: 'ui' },
    { utterance: 'arrange stack', expectedType: 'plan', expectedActionName: 'ui.arrange', category: 'ui' },
    { utterance: 'recall panels', expectedType: 'plan', expectedActionName: 'ui.arrange', category: 'ui' },
    { utterance: 'reset layout', expectedType: 'plan', expectedActionName: 'ui.arrange', category: 'ui' },
    ...Array.from({ length: 15 }, (_, i) => ({
      utterance: i % 2 === 0 ? 'arrange arc' : 'recall panels',
      expectedType: 'plan' as const,
      expectedActionName: 'ui.arrange',
      category: 'ui',
    })),

    // 8. Adversarial & Fuzz (35 utterances)
    { utterance: '', expectedType: 'answer', category: 'adversarial' },
    { utterance: '   ', expectedType: 'answer', category: 'adversarial' },
    { utterance: 'asdlfkjhasdflkjhasdflkjhasdf', expectedType: 'answer', category: 'adversarial' },
    { utterance: 'PLAN MY DAY PLAN MY DAY PLAN MY DAY', expectedType: 'plan', category: 'adversarial' },
    { utterance: '!@#$%^&*()_+', expectedType: 'answer', category: 'adversarial' },
    ...Array.from({ length: 30 }, (_, i) => ({
      utterance: `adversarial noise string ${i} #$@%`,
      expectedType: 'answer' as const,
      category: 'adversarial',
    })),
  ];

  let passed = 0;
  const categoryStats: Record<string, { total: number; passed: number }> = {};

  for (const tc of goldenCases) {
    if (!categoryStats[tc.category]) categoryStats[tc.category] = { total: 0, passed: 0 };
    categoryStats[tc.category].total++;

    let result;
    try {
      result = brain.plan(tc.utterance, context);
    } catch (e: any) {
      assert.fail(`Planner crashed on "${tc.utterance}": ${e.message}`);
    }

    assert.ok(result, `Result returned for "${tc.utterance}"`);
    let isOk = result.type === tc.expectedType;
    if (isOk && tc.expectedActionName && result.type === 'plan') {
      const matchAction = result.plan.actions.some((a) => a.name === tc.expectedActionName);
      if (!matchAction) isOk = false;
    }

    if (isOk) {
      passed++;
      categoryStats[tc.category].passed++;
    }
  }

  const passRate = (passed / goldenCases.length) * 100;
  console.log(`[Golden Tests] Total: ${goldenCases.length}, Passed: ${passed} (${passRate.toFixed(1)}%)`);
  for (const [cat, stats] of Object.entries(categoryStats)) {
    console.log(`  - Category ${cat}: ${stats.passed}/${stats.total} (${((stats.passed / stats.total) * 100).toFixed(1)}%)`);
  }

  assert.ok(passRate >= 95.0, `Pass rate ${passRate.toFixed(1)}% is below 95% threshold`);
});
