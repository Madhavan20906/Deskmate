import type { Action, AppState, Plan, RiskLevel } from '../actions/types.ts';
import type { GlassTask, TaskPriority } from '../glass-data-adapters.ts';

export interface BrainContext {
  state: AppState;
  conversationHistory?: Array<{ speaker: 'user' | 'pip'; text: string }>;
  currentTime?: Date;
  selectedTaskId?: string | null;
  activeFocusTaskId?: string | null;
  lastPlan?: Plan | null;
}

export type PlanResult =
  | { type: 'plan'; plan: Plan }
  | {
      type: 'clarification';
      question: string;
      options: Array<{ label: string; action?: Action; plan?: Plan }>;
    }
  | { type: 'answer'; text: string; data?: any };

export interface Brain {
  plan(utterance: string, context: BrainContext): PlanResult;
}

// Convert number words to numbers
const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  'forty-five': 45,
  'forty five': 45,
  fifty: 50,
  sixty: 60,
  ninety: 90,
};

export function parseDurationWords(text: string): number | null {
  const lower = text.toLowerCase();
  if (lower.includes('an hour and a half') || lower.includes('1.5 hours') || lower.includes('90 minutes')) {
    return 90;
  }
  if (lower.includes('half an hour') || lower.includes('half hour') || lower.includes('30 minutes')) {
    return 30;
  }
  if (lower.includes('two hours') || lower.includes('2 hours')) {
    return 120;
  }
  if (lower.includes('an hour') || lower.includes('one hour') || lower.includes('1 hour') || lower.includes('60 minutes')) {
    return 60;
  }
  if (lower.includes('forty five minutes') || lower.includes('forty-five minutes') || lower.includes('45 minutes') || lower.includes('45m')) {
    return 45;
  }
  if (lower.includes('fifteen minutes') || lower.includes('15 minutes') || lower.includes('15m')) {
    return 15;
  }
  if (lower.includes('twenty minutes') || lower.includes('20 minutes') || lower.includes('20m')) {
    return 20;
  }
  if (lower.includes('ten minutes') || lower.includes('10 minutes') || lower.includes('10m')) {
    return 10;
  }
  if (lower.includes('five minutes') || lower.includes('5 minutes') || lower.includes('5m')) {
    return 5;
  }

  // Regex for 'for X min/minutes/m/hours/h'
  const matchMin = lower.match(/\b(\d+)\s*(?:minutes?|mins?|m)\b/);
  if (matchMin) return parseInt(matchMin[1], 10);

  const matchHr = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (matchHr) return Math.round(parseFloat(matchHr[1]) * 60);

  return null;
}

export function parseTimeExpression(text: string, nowMinutes: number = 9 * 60): number | null {
  const lower = text.toLowerCase();
  if (lower.includes('first thing') || lower.includes('start of day') || lower.includes('in the morning') || lower.includes('this morning')) {
    return 9 * 60; // 09:00
  }
  if (lower.includes('after lunch') || lower.includes('post lunch') || lower.includes('afternoon')) {
    return 13 * 60 + 30; // 13:30
  }
  if (lower.includes('before lunch') || lower.includes('midday') || lower.includes('noon')) {
    return 11 * 60 + 30; // 11:30
  }
  if (lower.includes('end of day') || lower.includes('evening') || lower.includes('shutdown')) {
    return 16 * 60 + 30; // 16:30
  }
  if (lower.includes('in an hour') || lower.includes('in 1 hour')) {
    return nowMinutes + 60;
  }
  if (lower.includes('in 30 minutes') || lower.includes('in half an hour')) {
    return nowMinutes + 30;
  }

  // "at 2", "at 2:30", "at 2 pm", "at 14:00"
  const atMatch = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (atMatch) {
    let hr = parseInt(atMatch[1], 10);
    const min = atMatch[2] ? parseInt(atMatch[2], 10) : 0;
    const ampm = atMatch[3];
    if (ampm === 'pm' && hr < 12) hr += 12;
    if (ampm === 'am' && hr === 12) hr = 0;
    if (!ampm && hr >= 1 && hr <= 6) hr += 12; // Infer afternoon for 1..6
    return hr * 60 + min;
  }

  return null;
}

export function fuzzyMatchTask(
  query: string,
  tasks: GlassTask[],
  contextTaskId?: string | null,
): { task: GlassTask | null; confidence: number; candidates: GlassTask[] } {
  const q = query.toLowerCase().trim();
  if (!q) return { task: null, confidence: 0, candidates: [] };

  // Check contextual references
  if (q === 'it' || q === 'that' || q === 'that one' || q === 'this task' || q === 'this') {
    if (contextTaskId) {
      const match = tasks.find((t) => t.id === contextTaskId);
      if (match) return { task: match, confidence: 1.0, candidates: [match] };
    }
    // Fallback to currently active or first task
    if (tasks.length > 0) return { task: tasks[0], confidence: 0.8, candidates: [tasks[0]] };
  }

  if (q.includes('first task') || q.includes('the first')) {
    return { task: tasks[0] || null, confidence: 0.95, candidates: tasks.slice(0, 1) };
  }
  if (q.includes('second task') || q.includes('the second')) {
    return { task: tasks[1] || null, confidence: 0.95, candidates: tasks.slice(1, 2) };
  }
  if (q.includes('last task') || q.includes('the last')) {
    return { task: tasks[tasks.length - 1] || null, confidence: 0.95, candidates: tasks.slice(-1) };
  }
  if (q.includes('longest task') || q.includes('the long one')) {
    const sorted = [...tasks].sort((a, b) => b.estimatedMinutes - a.estimatedMinutes);
    return { task: sorted[0] || null, confidence: 0.9, candidates: sorted.slice(0, 1) };
  }

  // Keyword overlap scoring
  const scores: Array<{ task: GlassTask; score: number }> = [];
  const qTokens = q.split(/\s+/).filter((w) => w.length > 2);

  for (const t of tasks) {
    const titleLower = t.title.toLowerCase();
    if (titleLower === q) {
      return { task: t, confidence: 1.0, candidates: [t] };
    }
    if (titleLower.includes(q) || q.includes(titleLower)) {
      scores.push({ task: t, score: 0.9 });
      continue;
    }

    let matchCount = 0;
    for (const token of qTokens) {
      if (titleLower.includes(token)) matchCount++;
    }
    if (matchCount > 0) {
      scores.push({ task: t, score: matchCount / Math.max(qTokens.length, 1) });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  if (scores.length === 0) {
    return { task: null, confidence: 0, candidates: [] };
  }

  // Check if multiple tasks have identical high scores (ambiguity)
  if (scores.length > 1 && Math.abs(scores[0].score - scores[1].score) < 0.05 && scores[0].score < 0.9) {
    return {
      task: null,
      confidence: scores[0].score,
      candidates: scores.slice(0, 3).map((s) => s.task),
    };
  }

  return {
    task: scores[0].task,
    confidence: scores[0].score,
    candidates: scores.map((s) => s.task),
  };
}

export class RuleBrain implements Brain {
  plan(utterance: string, context: BrainContext): PlanResult {
    const text = utterance.trim();
    const lower = text.toLowerCase();
    const state = context.state;
    const tasks = state.tasks;
    const nowMin = context.currentTime ? context.currentTime.getHours() * 60 + context.currentTime.getMinutes() : 9 * 60;

    if (!text) {
      return {
        type: 'answer',
        text: 'I am ready. Ask me to plan your day, move tasks, start focus, or check workload.',
      };
    }

    // 1. Meta Commands
    if (lower === 'undo' || lower === 'revert' || lower === 'step back') {
      return {
        type: 'plan',
        plan: {
          id: `plan-undo-${Date.now()}`,
          actions: [
            {
              name: 'meta.undo',
              params: {},
              describe: () => 'Undo last action',
              riskLevel: 'SAFE',
              visualTarget: 'hub',
            },
          ],
          reason: 'Undoing previous action upon request',
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower === 'redo' || lower === 'repeat') {
      return {
        type: 'plan',
        plan: {
          id: `plan-redo-${Date.now()}`,
          actions: [
            {
              name: 'meta.redo',
              params: {},
              describe: () => 'Redo action',
              riskLevel: 'SAFE',
              visualTarget: 'hub',
            },
          ],
          reason: 'Redoing previously undone action',
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower === 'why' || lower === 'why did you do that' || lower.startsWith('why did you')) {
      const lastReason = context.lastPlan?.reason || 'Actions were chosen to keep your workday balanced with buffer breaks.';
      return {
        type: 'answer',
        text: `Reason: ${lastReason}`,
      };
    }

    if (lower === 'stop' || lower === 'never mind' || lower === 'cancel') {
      return {
        type: 'answer',
        text: 'Action halted. Your workspace remains unchanged.',
      };
    }

    if (lower.includes('what can you do') || lower.includes('help')) {
      return {
        type: 'answer',
        text: 'I can plan your day, schedule and move tasks, start focus sessions, resolve workload conflicts, arrange panels, and answer questions about your day.',
      };
    }

    // 2. Query Commands
    if (lower.includes('am i overloaded') || lower.includes('overload') || lower.includes('too much work')) {
      const def = {
        name: 'query.overload',
        params: {},
        describe: () => 'Check workload capacity',
        riskLevel: 'SAFE' as RiskLevel,
        visualTarget: 'pip',
      };
      return {
        type: 'plan',
        plan: {
          id: `query-overload-${Date.now()}`,
          actions: [def],
          reason: 'Analyzing planned tasks against 8-hour workday capacity',
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower.includes("what's next") || lower.includes('what is next') || lower.includes('up next')) {
      return {
        type: 'plan',
        plan: {
          id: `query-next-${Date.now()}`,
          actions: [
            {
              name: 'query.next',
              params: {},
              describe: () => 'Find next up task',
              riskLevel: 'SAFE',
              visualTarget: 'pip',
            },
          ],
          reason: 'Checking upcoming high priority and scheduled items',
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower.includes('how does my day look') || lower.includes('summary of my day') || lower.includes('day summary')) {
      return {
        type: 'plan',
        plan: {
          id: `query-day-${Date.now()}`,
          actions: [
            {
              name: 'query.day',
              params: {},
              describe: () => 'Summarize workday',
              riskLevel: 'SAFE',
              visualTarget: 'pip',
            },
          ],
          reason: 'Summarizing total tasks, scheduled hours, and completed items',
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower.includes('stats') || lower.includes('streak') || lower.includes('how many finished')) {
      return {
        type: 'plan',
        plan: {
          id: `query-stats-${Date.now()}`,
          actions: [
            {
              name: 'query.stats',
              params: {},
              describe: () => 'Show daily statistics',
              riskLevel: 'SAFE',
              visualTarget: 'pip',
            },
          ],
          reason: 'Retrieving completed tasks, focus sessions, and streak counts',
          riskLevel: 'SAFE',
        },
      };
    }

    // 3. Focus Session Commands
    if (lower.includes('start focus') || lower.includes('focus session') || lower.includes('start deep work') || lower.includes('start timer')) {
      const duration = parseDurationWords(text) || 25;
      return {
        type: 'plan',
        plan: {
          id: `plan-focus-${Date.now()}`,
          actions: [
            {
              name: 'focus.start',
              params: { durationMinutes: duration },
              describe: () => `Start ${duration}m focus sprint`,
              riskLevel: 'SAFE',
              visualTarget: 'focus',
            },
          ],
          reason: `Starting a ${duration}-minute distraction-free focus sprint`,
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower === 'pause focus' || lower === 'pause timer') {
      return {
        type: 'plan',
        plan: {
          id: `plan-pause-focus-${Date.now()}`,
          actions: [
            {
              name: 'focus.pause',
              params: {},
              describe: () => 'Pause focus timer',
              riskLevel: 'SAFE',
              visualTarget: 'focus',
            },
          ],
          reason: 'Pausing current focus sprint',
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower === 'resume focus' || lower === 'resume timer') {
      return {
        type: 'plan',
        plan: {
          id: `plan-resume-focus-${Date.now()}`,
          actions: [
            {
              name: 'focus.resume',
              params: {},
              describe: () => 'Resume focus timer',
              riskLevel: 'SAFE',
              visualTarget: 'focus',
            },
          ],
          reason: 'Resuming active focus sprint',
          riskLevel: 'SAFE',
        },
      };
    }

    // 4. Bulk Schedule Commands
    if (lower.includes('plan my day') || lower.includes('schedule my tasks') || lower.includes('auto plan')) {
      const actions: Action[] = [
        {
          name: 'schedule.autoPlan',
          params: { startMinute: 9 * 60, breakMinutes: 15 },
          describe: () => 'Auto-plan day with 15m rest buffers',
          riskLevel: 'BULK',
          visualTarget: 'schedule',
        },
      ];
      return {
        type: 'plan',
        plan: {
          id: `plan-autoplan-${Date.now()}`,
          actions,
          reason: 'Arranged tasks in priority order with 15-minute rest buffers',
          riskLevel: 'CONFIRM',
        },
      };
    }

    if (lower.includes('compact my day') || lower.includes('tidy schedule') || lower.includes('compact schedule')) {
      return {
        type: 'plan',
        plan: {
          id: `plan-compact-${Date.now()}`,
          actions: [
            {
              name: 'schedule.compact',
              params: { gapMinutes: 10 },
              describe: () => 'Compact schedule with 10m gaps',
              riskLevel: 'BULK',
              visualTarget: 'schedule',
            },
          ],
          reason: 'Compacted schedule to close unnecessary gaps while preserving rest buffers',
          riskLevel: 'CONFIRM',
        },
      };
    }

    if (lower.includes('clear the afternoon') || lower.includes('clear afternoon')) {
      return {
        type: 'plan',
        plan: {
          id: `plan-clear-afternoon-${Date.now()}`,
          actions: [
            {
              name: 'schedule.clearRange',
              params: { startMinute: 13 * 60, endMinute: 18 * 60 },
              describe: () => 'Clear afternoon schedule (13:00 to 18:00)',
              riskLevel: 'BULK',
              visualTarget: 'schedule',
            },
          ],
          reason: 'Cleared all scheduled tasks after 1:00 PM for deep focus or appointments',
          riskLevel: 'CONFIRM',
        },
      };
    }

    if (lower.includes('push everything back') || lower.includes('shift all tasks')) {
      const delta = parseDurationWords(text) || 30;
      return {
        type: 'plan',
        plan: {
          id: `plan-shift-all-${Date.now()}`,
          actions: [
            {
              name: 'schedule.shiftAll',
              params: { deltaMinutes: delta },
              describe: () => `Shift all tasks back by ${delta}m`,
              riskLevel: 'BULK',
              visualTarget: 'schedule',
            },
          ],
          reason: `Pushed schedule back by ${delta} minutes to make immediate room`,
          riskLevel: 'CONFIRM',
        },
      };
    }

    if (lower.includes('add a 15 minute break') || lower.includes('add 15 minute break') || lower.includes('add break')) {
      const dur = parseDurationWords(text) || 15;
      const targetTime = parseTimeExpression(text, nowMin) || (12 * 60);
      return {
        type: 'plan',
        plan: {
          id: `plan-add-break-${Date.now()}`,
          actions: [
            {
              name: 'schedule.addBreak',
              params: { startMinute: targetTime, durationMinutes: dur },
              describe: () => `Add ${dur}m break at ${Math.floor(targetTime / 60)}:${(targetTime % 60).toString().padStart(2, '0')}`,
              riskLevel: 'SAFE',
              visualTarget: 'schedule',
            },
          ],
          reason: `Added a ${dur}-minute breathing and rest break`,
          riskLevel: 'SAFE',
        },
      };
    }

    // 5. Move Task Commands (e.g. "move my design review to after lunch", "move task X to 2 PM")
    if (lower.startsWith('move ') || lower.includes('reschedule ') || lower.includes('shift ')) {
      // Find candidate task
      const match = fuzzyMatchTask(text.replace(/^(?:move|reschedule|shift)\s+/i, ''), tasks, context.selectedTaskId);
      if (match.candidates.length > 1 && match.confidence < 0.8) {
        return {
          type: 'clarification',
          question: 'Which task would you like to move?',
          options: match.candidates.map((c) => ({
            label: c.title,
            action: {
              name: 'schedule.place',
              params: { id: c.id, startMinute: 13 * 60 + 30 },
              describe: () => `Move "${c.title}" to after lunch`,
              riskLevel: 'SAFE',
              visualTarget: 'schedule',
            },
          })),
        };
      }

      const targetTask = match.task || tasks[0];
      if (targetTask) {
        const targetTime = parseTimeExpression(text, nowMin) || (13 * 60 + 30);
        return {
          type: 'plan',
          plan: {
            id: `plan-move-${targetTask.id}-${Date.now()}`,
            actions: [
              {
                name: 'schedule.place',
                params: { id: targetTask.id, startMinute: targetTime },
                describe: () => `Move "${targetTask.title}" to ${Math.floor(targetTime / 60)}:${(targetTime % 60).toString().padStart(2, '0')}`,
                riskLevel: 'SAFE',
                visualTarget: 'schedule',
              },
            ],
            reason: `Moved "${targetTask.title}" to ${Math.floor(targetTime / 60)}:${(targetTime % 60).toString().padStart(2, '0')} to fit your workflow`,
            riskLevel: 'SAFE',
          },
        };
      }
    }

    // 6. Complete / Delete Task Commands
    if (lower.startsWith('complete ') || lower.startsWith('finish ') || lower.startsWith('check off ')) {
      const match = fuzzyMatchTask(text.replace(/^(?:complete|finish|check off)\s+/i, ''), tasks, context.selectedTaskId);
      const target = match.task;
      if (!target) {
        return { type: 'answer', text: 'I could not find which task to mark complete.' };
      }
      return {
        type: 'plan',
        plan: {
          id: `plan-complete-${target.id}-${Date.now()}`,
          actions: [
            {
              name: 'task.complete',
              params: { id: target.id },
              describe: () => `Complete "${target.title}"`,
              riskLevel: 'SAFE',
              visualTarget: 'tasks',
            },
          ],
          reason: `Marked "${target.title}" as completed`,
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower.startsWith('delete ') || lower.startsWith('remove ')) {
      const match = fuzzyMatchTask(text.replace(/^(?:delete|remove)\s+/i, ''), tasks, context.selectedTaskId);
      const target = match.task;
      if (!target) {
        return { type: 'answer', text: 'I could not find which task to delete.' };
      }
      return {
        type: 'plan',
        plan: {
          id: `plan-delete-${target.id}-${Date.now()}`,
          actions: [
            {
              name: 'task.delete',
              params: { id: target.id },
              describe: () => `Delete "${target.title}"`,
              riskLevel: 'CONFIRM',
              visualTarget: 'tasks',
            },
          ],
          reason: `Deleting task "${target.title}"`,
          riskLevel: 'CONFIRM',
        },
      };
    }

    // 7. Add Task Commands (e.g. "Add task Research Paper on Friday for 90 minutes high priority")
    if (lower.startsWith('add task') || lower.startsWith('create task') || lower.startsWith('new task') || lower.startsWith('add ')) {
      const cleanUtterance = text.replace(/^(?:add\s+task|create\s+task|new\s+task|add)\s+/i, '');
      const duration = parseDurationWords(cleanUtterance) || 45;
      let priority: TaskPriority = 'medium';
      if (lower.includes('high priority') || lower.includes('urgent') || lower.includes('critical')) {
        priority = 'high';
      } else if (lower.includes('low priority') || lower.includes('minor') || lower.includes('quick')) {
        priority = 'low';
      }

      // Title extraction
      let title = cleanUtterance
        .replace(/\b(?:for|on\s+)?(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
        .replace(/\b(?:for\s+)?\d+\s*(?:minutes?|mins?|m|hours?|hrs?|h)\b/gi, '')
        .replace(/\b(?:high|medium|low)\s+priority\b/gi, '')
        .replace(/\b(?:at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!title) title = 'Quick Note';

      const newTask: GlassTask = {
        id: `task-${Date.now()}`,
        title,
        priority,
        estimatedMinutes: duration,
        scheduledStartMinute: null,
        status: 'todo',
        description: 'deep-work',
      };

      return {
        type: 'plan',
        plan: {
          id: `plan-create-${newTask.id}`,
          actions: [
            {
              name: 'task.create',
              params: { task: newTask },
              describe: () => `Create task "${newTask.title}"`,
              riskLevel: 'SAFE',
              visualTarget: 'tasks',
            },
          ],
          reason: `Added task "${newTask.title}" (${duration}m, ${priority} priority)`,
          riskLevel: 'SAFE',
        },
      };
    }

    // 8. UI / Window Management Commands
    if (lower.includes('arrange arc') || lower.includes('arc layout') || lower.includes('curved layout')) {
      return {
        type: 'plan',
        plan: {
          id: `plan-arrange-arc-${Date.now()}`,
          actions: [
            {
              name: 'ui.arrange',
              params: { preset: 'Arc' },
              describe: () => 'Switch layout to Arc',
              riskLevel: 'SAFE',
              visualTarget: 'hub',
            },
          ],
          reason: 'Restored natural curved desk arc layout',
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower.includes('arrange spread') || lower.includes('spread layout')) {
      return {
        type: 'plan',
        plan: {
          id: `plan-arrange-spread-${Date.now()}`,
          actions: [
            {
              name: 'ui.arrange',
              params: { preset: 'Spread' },
              describe: () => 'Switch layout to Spread',
              riskLevel: 'SAFE',
              visualTarget: 'hub',
            },
          ],
          reason: 'Arranged panels across a wide panoramic field of view',
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower.includes('arrange stack') || lower.includes('compact panels')) {
      return {
        type: 'plan',
        plan: {
          id: `plan-arrange-stack-${Date.now()}`,
          actions: [
            {
              name: 'ui.arrange',
              params: { preset: 'Stack' },
              describe: () => 'Switch layout to Stack',
              riskLevel: 'SAFE',
              visualTarget: 'hub',
            },
          ],
          reason: 'Stacked panels neatly for minimal footprint',
          riskLevel: 'SAFE',
        },
      };
    }

    if (lower.includes('recall') || lower.includes('bring panels to me') || lower.includes('reset layout')) {
      return {
        type: 'plan',
        plan: {
          id: `plan-recall-${Date.now()}`,
          actions: [
            {
              name: 'ui.arrange',
              params: { preset: 'Arc' },
              describe: () => 'Recall all panels to front',
              riskLevel: 'SAFE',
              visualTarget: 'hub',
            },
          ],
          reason: 'Recalled all workspace panels to center in front of you',
          riskLevel: 'SAFE',
        },
      };
    }

    // Default Fallback
    return {
      type: 'answer',
      text: `Understood: "${text}". Ask me to plan your day, reschedule tasks, or start focus.`,
    };
  }
}
