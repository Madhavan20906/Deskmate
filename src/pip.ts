export type PipCommand =
  | { intent: 'create-task'; title: string; estimatedMinutes: number }
  | {
      intent: 'schedule-task';
      taskQuery: string;
      estimatedMinutes?: number;
      requestedDay: 'today' | 'tomorrow' | null;
      requestedStartMinute?: number;
    }
  | { intent: 'complete-task'; taskQuery: string }
  | { intent: 'list-tasks'; filter: 'all' | 'pending' }
  | { intent: 'start-focus'; taskQuery?: string }
  | { intent: 'morning-ritual' }
  | { intent: 'evening-ritual' }
  | { intent: 'start-break' }
  | { intent: 'jar-history' }
  | { intent: 'recap' }
  | { intent: 'help' }
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
    .trim();
}

function isIntent(value: unknown): value is PipIntent {
  return value === 'create-task' ||
    value === 'schedule-task' ||
    value === 'complete-task' ||
    value === 'list-tasks' ||
    value === 'start-focus' ||
    value === 'morning-ritual' ||
    value === 'evening-ritual' ||
    value === 'start-break' ||
    value === 'jar-history' ||
    value === 'recap' ||
    value === 'help' ||
    value === 'invalid-duration' ||
    value === 'unknown';
}

export function validatePipCommand(value: unknown): PipCommand | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isIntent(record.intent)) return null;
  switch (record.intent) {
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
    case 'morning-ritual':
    case 'evening-ritual':
    case 'start-break':
    case 'jar-history':
    case 'recap':
    case 'help':
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

  let candidate: unknown;
  if (/\b(?:morning\s+ritual|good\s+morning|plan\s+(?:the\s+|my\s+)?day|start\s+(?:the\s+)?day)\b/.test(lower)) {
    candidate = { intent: 'morning-ritual' };
  } else if (/\b(?:evening\s+ritual|wind\s*down|evening\s+review|good\s+evening|wrap\s+up)\b/.test(lower)) {
    candidate = { intent: 'evening-ritual' };
  } else if (/\b(?:take\s+a\s+break|stretch|breathing\s+break|seated\s+break|start\s+break)\b/.test(lower)) {
    candidate = { intent: 'start-break' };
  } else if (/\b(?:jar(?:\s+history)?|today'?s\s+jar|focus\s+jar|marbles?|tokens?)\b/.test(lower)) {
    candidate = { intent: 'jar-history' };
  } else if (/\b(?:show|list|what)\b.*\b(?:pending|incomplete|unfinished)\b/.test(lower)) {
    candidate = { intent: 'list-tasks', filter: 'pending' };
  } else if (/\b(?:start|begin)\b.*\bfocus\b/.test(lower)) {
    const focusTask = text.match(/\bfocus\s+(?:on|for)\s+(?:my\s+)?(.+)$/i)?.[1];
    candidate = {
      intent: 'start-focus',
      ...(focusTask === undefined || /^(?:current|selected)\s+task$/i.test(focusTask)
        ? {}
        : { taskQuery: cleanTaskQuery(focusTask) }),
    };
  } else if (/\b(?:what|show|list)\b.*\b(?:tasks?|schedule|today)\b/.test(lower)) {
    candidate = { intent: 'list-tasks', filter: 'all' };
  } else if (
    /\b(?:recap|summary|workload|overload(?:ed)?|underloaded|available capacity|priorit(?:y|ies|ize|ise))\b/.test(lower) ||
    /\bwhat should i focus on\b/.test(lower)
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
        /^(?:please\s+)?(?:add|create|make)\s+(?:a\s+)?(?:new\s+)?task\s+(?:to|for|called|named)\s+(.+)$/i,
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
        );
        if (completeMatch !== null) {
          candidate = {
            intent: 'complete-task',
            taskQuery: cleanTaskQuery(completeMatch[1]),
          };
        } else if (/^(?:help|what can you do|how can you help)\b/i.test(text)) {
          candidate = { intent: 'help' };
        } else {
          candidate = { intent: 'unknown' };
        }
      }
    }
  }

  return validatePipCommand(candidate) ?? { intent: 'unknown' };
}
