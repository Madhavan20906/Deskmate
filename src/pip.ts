export type PipCommand =
  | { intent: 'create-task'; title: string; estimatedMinutes: number; assignedSlot?: 'morning' | 'afternoon' | 'evening' }
  | { intent: 'create-multiple-tasks'; tasks: Array<{ title: string; estimatedMinutes: number; assignedSlot?: 'morning' | 'afternoon' | 'evening' }> }
  | {
      intent: 'schedule-task';
      taskQuery: string;
      estimatedMinutes?: number;
      requestedDay: 'today' | 'tomorrow' | null;
      requestedStartMinute?: number;
      assignedSlot?: 'morning' | 'afternoon' | 'evening';
    }
  | { intent: 'complete-task'; taskQuery: string }
  | { intent: 'list-tasks'; filter: 'all' | 'pending' }
  | { intent: 'start-focus'; taskQuery?: string }
  | { intent: 'recap' }
  | { intent: 'help' }
  | { intent: 'rebalance' }
  | { intent: 'invalid-duration' }
  | { intent: 'unknown' };

type PipIntent = PipCommand['intent'];

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

const DURATION_PATTERN =
  /\b(?:for\s+)?(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i;

function parseDurationMinutes(text: string): number | undefined {
  const match = text.match(DURATION_PATTERN);
  if (match === null) return undefined;
  const rawAmount = match[1].toLowerCase();
  const amount = NUMBER_WORDS[rawAmount] ?? Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2].toLowerCase();
  const minutes = Math.round(amount * (unit.startsWith('h') ? 60 : 1));
  return Number.isSafeInteger(minutes) && minutes >= 5 && minutes <= 480
    ? minutes
    : undefined;
}

function parseRequestedStartMinute(text: string): number | undefined {
  const match = text.match(/\b(?:at|to)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (match === null) return undefined;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (minutes > 59 || hours > 24) return undefined;
  if (meridiem !== undefined) {
    if (hours < 1 || hours > 12) return undefined;
    hours = hours % 12 + (meridiem === 'pm' ? 12 : 0);
  }
  const startMinute = hours * 60 + minutes;
  return startMinute >= 8 * 60 && startMinute < 18 * 60
    ? startMinute
    : undefined;
}

function cleanTaskQuery(value: string): string {
  return value
    .replace(DURATION_PATTERN, ' ')
    .replace(/\b(?:today|tomorrow)\b/gi, ' ')
    .replace(/\b(?:at|to)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, ' ')
    .replace(/[.,!?]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^(?:the|a|an|my|of)\s+/iu, '')
    .replace(/\s+(?:today|tomorrow)$/iu, '')
    .replace(/\s+(?:to|at|for|on)$/iu, '')
    .trim();
}

function isIntent(value: unknown): value is PipIntent {
  return (
    value === 'create-task' ||
    value === 'create-multiple-tasks' ||
    value === 'schedule-task' ||
    value === 'complete-task' ||
    value === 'list-tasks' ||
    value === 'start-focus' ||
    value === 'recap' ||
    value === 'help' ||
    value === 'rebalance' ||
    value === 'invalid-duration' ||
    value === 'unknown'
  );
}

function guessEffortMinutes(text: string): number {
  const parsed = parseDurationMinutes(text);
  if (parsed !== undefined) return parsed;
  const lower = text.toLowerCase();
  if (/\b(?:quick|short|small|call|text|email|ping|message|check|sync|brief)\b/.test(lower)) {
    return 15;
  }
  if (/\b(?:large|deep|deepwork|heavy|report|architecture|roadmap|study|write|code|refactor|design)\b/.test(lower)) {
    return 60;
  }
  return 30;
}

function parseMultipleTasks(text: string): Array<{ title: string; estimatedMinutes: number }> | null {
  const match = text.match(/^(?:please\s+)?(?:i\s+need\s+to|i\s+have\s+to|add|create|make)\s+(.+)$/i);
  if (match === null) return null;
  const body = match[1].replace(/^(?:tasks?|to-dos?)(?:\s*:|\s+to|\s+for)?/i, '').trim();
  if (!/\s+and\s+|,\s*/i.test(body)) return null;

  const rawClauses = body
    .split(/\s+and\s+|,\s*(?:and\s+)?/i)
    .map((clause) => cleanTaskQuery(clause))
    .filter((clause) => clause.length >= 3 && clause.length <= 80);

  if (rawClauses.length < 2) return null;

  return rawClauses.slice(0, 4).map((title) => ({
    title,
    estimatedMinutes: guessEffortMinutes(title),
  }));
}

export function validatePipCommand(value: unknown): PipCommand | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isIntent(record.intent)) return null;
  switch (record.intent) {
    case 'create-multiple-tasks': {
      if (!Array.isArray(record.tasks) || record.tasks.length === 0) return null;
      const validTasks = record.tasks.filter((t): t is { title: string; estimatedMinutes: number } =>
        typeof t === 'object' && t !== null &&
        typeof (t as { title?: unknown }).title === 'string' &&
        (t as { title: string }).title.trim().length > 0 &&
        (t as { title: string }).title.trim().length <= 80 &&
        typeof (t as { estimatedMinutes?: unknown }).estimatedMinutes === 'number' &&
        Number.isSafeInteger((t as { estimatedMinutes: number }).estimatedMinutes) &&
        (t as { estimatedMinutes: number }).estimatedMinutes >= 5 &&
        (t as { estimatedMinutes: number }).estimatedMinutes <= 480,
      );
      return validTasks.length >= 2 ? { intent: 'create-multiple-tasks', tasks: validTasks } : null;
    }
    case 'create-task':
      return typeof record.title === 'string' &&
        record.title.trim().length > 0 && record.title.trim().length <= 80 &&
        typeof record.estimatedMinutes === 'number' &&
        Number.isSafeInteger(record.estimatedMinutes) &&
        record.estimatedMinutes >= 5 && record.estimatedMinutes <= 480
        ? {
            intent: 'create-task',
            title: record.title.trim(),
            estimatedMinutes: record.estimatedMinutes,
          }
        : null;
    case 'schedule-task':
      if (
        typeof record.taskQuery !== 'string' ||
        record.taskQuery.trim().length === 0 ||
        record.taskQuery.trim().length > 80 ||
        !(record.requestedDay === null || record.requestedDay === 'today' || record.requestedDay === 'tomorrow')
      ) return null;
      if (
        record.estimatedMinutes !== undefined &&
        (typeof record.estimatedMinutes !== 'number' ||
          !Number.isSafeInteger(record.estimatedMinutes) ||
          record.estimatedMinutes < 5 || record.estimatedMinutes > 480)
      ) return null;
      if (
        record.requestedStartMinute !== undefined &&
        (typeof record.requestedStartMinute !== 'number' ||
          !Number.isSafeInteger(record.requestedStartMinute) ||
          record.requestedStartMinute < 8 * 60 ||
          record.requestedStartMinute >= 18 * 60)
      ) return null;
      return {
        intent: 'schedule-task',
        taskQuery: record.taskQuery.trim(),
        requestedDay: record.requestedDay,
        ...(typeof record.estimatedMinutes === 'number'
          ? { estimatedMinutes: record.estimatedMinutes }
          : {}),
        ...(typeof record.requestedStartMinute === 'number'
          ? { requestedStartMinute: record.requestedStartMinute }
          : {}),
      };
    case 'complete-task':
      return typeof record.taskQuery === 'string' &&
        record.taskQuery.trim().length > 0 && record.taskQuery.trim().length <= 80
        ? { intent: 'complete-task', taskQuery: record.taskQuery.trim() }
        : null;
    case 'recap':
    case 'help':
    case 'rebalance':
    case 'invalid-duration':
    case 'unknown':
      return { intent: record.intent };
    case 'list-tasks':
      return record.filter === 'all' || record.filter === 'pending'
        ? { intent: 'list-tasks', filter: record.filter }
        : null;
    case 'start-focus':
      return record.taskQuery === undefined ||
        (typeof record.taskQuery === 'string' &&
          record.taskQuery.trim().length > 0 && record.taskQuery.trim().length <= 80)
        ? {
            intent: 'start-focus',
            ...(typeof record.taskQuery === 'string'
              ? { taskQuery: record.taskQuery.trim() }
              : {}),
          }
        : null;
  }
}

export function parsePipCommand(input: string): PipCommand {
  const text = input.trim().replace(/\s+/gu, ' ');
  if (text.length === 0 || text.length > 240) return { intent: 'unknown' };
  const lower = text.toLowerCase();

  const multiTasks = parseMultipleTasks(text);
  let candidate: unknown;
  if (multiTasks !== null) {
    candidate = { intent: 'create-multiple-tasks', tasks: multiTasks };
  } else if (/\b(?:show|list|what)\b.*\b(?:pending|incomplete|unfinished)\b/.test(lower)) {
    candidate = { intent: 'list-tasks', filter: 'pending' };
  } else if (/\b(?:start|begin|let'?s?)\s+focus\b/i.test(lower) || /^focus\s+on\s+/i.test(lower)) {
    const focusTask = text.match(/(?:focus\s+(?:on|for)|let'?s?\s+focus\s+on)\s+(?:my\s+)?(.+)$/i)?.[1];
    candidate = {
      intent: 'start-focus',
      ...(focusTask === undefined || /^(?:current|selected)\s+task$/i.test(focusTask)
        ? {}
        : { taskQuery: cleanTaskQuery(focusTask) }),
    };
  } else if (/\b(?:rebalance|fix schedule|fix overload|ease schedule)\b/.test(lower)) {
    candidate = { intent: 'rebalance' };
  } else if (/\b(?:what|show|list)\b.*\b(?:tasks?|schedule|today)\b/.test(lower)) {
    candidate = { intent: 'list-tasks', filter: 'all' };
  } else if (
    /\b(?:recap|summary|workload|overload(?:ed)?|underloaded|available capacity|priorit(?:y|ies|ize|ise))\b/.test(lower) ||
    /\b(?:what should i focus on|give me an update|how am i doing|daily update)\b/.test(lower)
  ) {
    candidate = { intent: 'recap' };
  } else {
    const scheduleMatch = text.match(/^(?:please\s+)?(?:schedule|reschedule|plan|move|put)\s+(?:a\s+)?(?:my\s+|the\s+)?(?:task\s+)?(?:to\s+)?(.+)$/i);
    if (scheduleMatch !== null) {
      const details = scheduleMatch[1];
      const durationMinutes = parseDurationMinutes(details);
      const hasDuration = DURATION_PATTERN.test(details);
      if (hasDuration && durationMinutes === undefined) {
        candidate = { intent: 'invalid-duration' };
      } else {
        const requestedStartMinute = parseRequestedStartMinute(details);
        const requestedDay = /\btomorrow\b/i.test(details)
          ? 'tomorrow'
          : /\btoday\b/i.test(details)
            ? 'today'
            : null;
        candidate = {
          intent: 'schedule-task',
          taskQuery: cleanTaskQuery(details),
          requestedDay,
          ...(durationMinutes === undefined ? {} : { estimatedMinutes: durationMinutes }),
          ...(requestedStartMinute === undefined ? {} : { requestedStartMinute }),
        };
      }
    } else {
      const createMatch = text.match(
        /^(?:please\s+)?(?:add|create|make)\s+(?:a\s+)?(?:new\s+)?task\s*(?:to|for|called|named)?\s+(.+)$/i,
      );
      const simpleCreateMatch = createMatch === null
        ? text.match(/^(?:please\s+)?(?:add|create|make)\s+(.+?)\s+to\s+(?:my\s+)?tasks?$/i)
        : null;
      if (createMatch !== null || simpleCreateMatch !== null) {
        const details = (createMatch?.[1] ?? simpleCreateMatch?.[1] ?? '').trim();
        const title = cleanTaskQuery(details);
        const parsedDuration = parseDurationMinutes(details);
        if (DURATION_PATTERN.test(details) && parsedDuration === undefined) {
          return { intent: 'invalid-duration' };
        }
        const estimatedMinutes = parsedDuration ?? 30;
        candidate = {
          intent: 'create-task',
          title,
          estimatedMinutes,
        };
      } else {
        const completeMatch = text.match(
          /^(?:please\s+)?(?:mark|set)\s+(?:the\s+|my\s+)?(.+?)\s+(?:as\s+)?(?:completed|complete|done)$/i,
        ) ?? text.match(
          /^(?:please\s+)?(?:complete|finish)\s+(?:the\s+|my\s+)?(.+)$/i,
        ) ?? text.match(
          /^(?:i\s+)?(?:finished|completed|done\s+with)\s+(?:the\s+|my\s+)?(.+)$/i,
        );
        if (completeMatch !== null) {
          candidate = {
            intent: 'complete-task',
            taskQuery: cleanTaskQuery(completeMatch[1]),
          };
        } else if (/^(?:help|what can you do|how can you help|who are you|introduce yourself)\b/i.test(text)) {
          candidate = { intent: 'help' };
        } else {
          candidate = { intent: 'unknown' };
        }
      }
    }
  }

  return validatePipCommand(candidate) ?? { intent: 'unknown' };
}

/**
 * Natural language processing with automatic 3-second offline fallback.
 * Strictly adheres to security rules: no client API keys, rate-limited,
 * minimal task data sent, offline first.
 */
export async function processPipNaturalLanguage(
  text: string,
  aiEndpoint?: string,
  aiEnabled = false,
): Promise<PipCommand> {
  if (!aiEnabled || !aiEndpoint) {
    return parsePipCommand(text);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2800); // 2.8s strict timeout

  try {
    const res = await fetch(aiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text.trim().slice(0, 240) }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const validated = validatePipCommand(data);
      if (validated) return validated;
    }
  } catch {
    // Timeout or network error; fall through to offline parsing
  } finally {
    clearTimeout(timeoutId);
  }

  return parsePipCommand(text);
}

/**
 * Generates Pip's daily recap speech
 */
export function generatePipDailyRecap(
  completedCount: number,
  focusedMinutes: number,
  streakDays: number,
  gardenStage: string,
  overloadedSlots: string[],
): string {
  const parts: string[] = [];
  if (completedCount > 0) {
    parts.push(`Pip here! You finished ${completedCount} task${completedCount === 1 ? '' : 's'} and logged ${focusedMinutes} focus minutes today!`);
  } else {
    parts.push(`Pip here! We're ready for focus today. You have ${focusedMinutes} focused minutes logged.`);
  }

  if (streakDays > 1) {
    parts.push(`Your focus streak is ${streakDays} days strong! Your garden is blooming in the ${gardenStage} stage.`);
  }

  if (overloadedSlots.length > 0) {
    parts.push(`Notice: your ${overloadedSlots.join(' and ')} slot${overloadedSlots.length === 1 ? ' is' : 's are'} looking crowded. Would you like me to rebalance some tasks?`);
  } else {
    parts.push('Your desk schedule is wonderfully balanced. Keep up the calm momentum!');
  }

  return parts.join(' ');
}
