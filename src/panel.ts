/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  Entity,
  Grabbed,
  Quaternion,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { GhostDeskmateAudio } from './audio.js';
import { TaskData } from './components.js';
import { parsePipCommand, validatePipCommand, type PipCommand } from './pip.js';
import { calculateProductivityInsights } from './productivity.js';
import { analyzeWorkload } from './workload.js';

type TaskStatus = 'todo' | 'in-progress' | 'completed';
type TaskPriority = 'low' | 'medium' | 'high';

interface TaskRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: TaskPriority;
  estimatedMinutes: number;
  scheduledStartMinute: number | null;
  status: TaskStatus;
  createdAt: number;
  completedAt: number | null;
  scheduleNeedsReview?: boolean;
}

type FocusSessionStatus = 'completed' | 'stopped';

interface FocusSessionRecord {
  id: string;
  taskId: string;
  taskTitle: string;
  plannedDurationMinutes: number;
  actualDurationMs: number;
  startedAt: number;
  endedAt: number;
  status: FocusSessionStatus;
  taskCompleted: boolean;
}

interface ActiveFocusSession {
  id: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  plannedDurationMinutes: number;
  startedAt: number;
  deadlineAt: number | null;
  remainingMs: number;
  status: 'running' | 'paused' | 'awaiting-completion';
}

interface FocusStorage {
  history: FocusSessionRecord[];
  active: ActiveFocusSession | null;
  durationMinutes: number;
}

interface FocusStorageLoadResult {
  storage: FocusStorage;
  readOnly: boolean;
}

interface TaskLoadResult {
  tasks: TaskRecord[];
  readOnly: boolean;
  warning: string;
}

type PipInteractionState = 'idle' | 'listening' | 'thinking' | 'responding';

interface PipPendingSchedule {
  taskId: string | null;
  title: string;
  estimatedMinutes: number;
  scheduledStartMinute: number;
}

interface PipSpeechResult {
  transcript: string;
}

interface PipSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<PipSpeechResult> & { isFinal: boolean }>;
}

interface PipSpeechRecognitionErrorEvent {
  error?: string;
}

interface PipSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: PipSpeechRecognitionEvent) => void) | null;
  onerror: ((event: PipSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface PipSpeechWindow extends Window {
  SpeechRecognition?: new () => PipSpeechRecognition;
  webkitSpeechRecognition?: new () => PipSpeechRecognition;
}

interface TaskCardElements {
  root: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  priority: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  title: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  description: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  statusLabel: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  statusButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  selectButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  editButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  deleteButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  duplicateButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusStartButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusPanel: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusState: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusTimer: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusPauseButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusResumeButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusStopButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusCompleteButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusContinueButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  focusAgainButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
}

interface TimelineSlotElements {
  button: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  label: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  content: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
}

const STORAGE_KEY = 'deskmate.tasks.v1';
const FOCUS_STORAGE_KEY = 'deskmate.focus.v1';
const MAX_TASKS = 6;
const DEFAULT_FOCUS_MINUTES = 25;
const MIN_FOCUS_MINUTES = 5;
const MAX_FOCUS_MINUTES = 120;
const MAX_FOCUS_HISTORY = 500;
const WORKDAY_START_MINUTE = 8 * 60;
const WORKDAY_END_MINUTE = 18 * 60;
const WORKLOAD_CAPACITY_MINUTES = 8 * 60;
const TIMELINE_BAND_MINUTES = 2 * 60;
const TIMELINE_STARTS = [480, 600, 720, 840, 960] as const;
const LOAD_SEGMENT_COUNT = 8;
const TASK_NODE_IDS = [
  'task-card-roadmap',
  'task-card-design-review',
  'task-card-inbox',
  'task-card-slot-4',
  'task-card-slot-5',
  'task-card-slot-6',
] as const;

const DEFAULT_TASKS: TaskRecord[] = [
  {
    id: 'seed-roadmap',
    title: 'Plan Q4 roadmap',
    description: 'Deep work and milestones',
    category: 'Planning',
    priority: 'high',
    estimatedMinutes: 120,
    scheduledStartMinute: 9 * 60 + 30,
    status: 'todo',
    createdAt: Date.now(),
    completedAt: null,
  },
  {
    id: 'seed-design-review',
    title: 'Review design brief',
    description: 'Share feedback with the team',
    category: 'Design',
    priority: 'medium',
    estimatedMinutes: 60,
    scheduledStartMinute: 13 * 60,
    status: 'todo',
    createdAt: Date.now(),
    completedAt: null,
  },
  {
    id: 'seed-inbox',
    title: 'Inbox reset',
    description: 'Clear the queue and flag follow-ups',
    category: 'Admin',
    priority: 'low',
    estimatedMinutes: 60,
    scheduledStartMinute: 15 * 60,
    status: 'todo',
    createdAt: Date.now(),
    completedAt: null,
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPriority = (value: unknown): value is TaskPriority =>
  value === 'low' || value === 'medium' || value === 'high';

const isStatus = (value: unknown): value is TaskStatus =>
  value === 'todo' || value === 'in-progress' || value === 'completed';

function isValidSchedule(startMinute: number, durationMinutes: number): boolean {
  return (
    Number.isInteger(startMinute) &&
    startMinute >= WORKDAY_START_MINUTE &&
    startMinute < WORKDAY_END_MINUTE &&
    startMinute + durationMinutes <= WORKDAY_END_MINUTE
  );
}

function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function taskPhase(task: TaskRecord): string {
  if (task.status === 'completed') return 'COMPLETED';
  return task.status === 'in-progress' ? 'ACTIVE' : 'UPCOMING';
}

function schedulesOverlap(
  firstStart: number,
  firstDuration: number,
  secondStart: number,
  secondDuration: number,
): boolean {
  return (
    firstStart < secondStart + secondDuration &&
    secondStart < firstStart + firstDuration
  );
}

function findSuggestedStartMinutes(
  tasks: TaskRecord[],
  durationMinutes: number,
  priority: TaskPriority,
): number[] {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return [];
  const preferredStart = priority === 'high'
    ? 9 * 60
    : priority === 'medium'
      ? 12 * 60
      : 15 * 60;
  const availableSlots: number[] = [];
  for (
    let candidate = WORKDAY_START_MINUTE;
    candidate + durationMinutes <= WORKDAY_END_MINUTE;
    candidate += 15
  ) {
    const hasConflict = tasks.some(
      (task) =>
        task.scheduledStartMinute !== null &&
        schedulesOverlap(
          candidate,
          durationMinutes,
          task.scheduledStartMinute,
          task.estimatedMinutes,
        ),
    );
    if (!hasConflict) availableSlots.push(candidate);
  }
  return availableSlots
    .sort((first, second) =>
      Math.abs(first - preferredStart) - Math.abs(second - preferredStart) ||
      first - second,
    )
    .slice(0, 3);
}

function parseTask(value: unknown): TaskRecord | null {
  if (!isRecord(value)) return null;
  const {
    id,
    title,
    description,
    category,
    priority,
    estimatedMinutes,
    scheduledStartMinute,
    status,
    createdAt,
    completedAt,
  } = value;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    typeof description !== 'string' ||
    (category !== undefined && typeof category !== 'string') ||
    (createdAt !== undefined && (typeof createdAt !== 'number' || !Number.isFinite(createdAt))) ||
    (completedAt !== undefined && completedAt !== null &&
      (typeof completedAt !== 'number' || !Number.isFinite(completedAt))) ||
    !isPriority(priority) ||
    typeof estimatedMinutes !== 'number' ||
    !Number.isFinite(estimatedMinutes) ||
    estimatedMinutes < 5 ||
    estimatedMinutes > 480 ||
    !isStatus(status)
  ) {
    return null;
  }

  const legacySchedule = DEFAULT_TASKS.find((task) => task.id === id)
    ?.scheduledStartMinute ?? null;
  const candidateStart = scheduledStartMinute === undefined
    ? legacySchedule
    : scheduledStartMinute;
  const validSchedule =
    candidateStart === null ||
    (typeof candidateStart === 'number' &&
      isValidSchedule(candidateStart, estimatedMinutes));

  return {
    id: id.slice(0, 80),
    title: title.trim().slice(0, 80),
    description: description.trim().slice(0, 220),
    category: typeof category === 'string' ? category.trim().slice(0, 32) : '',
    priority,
    estimatedMinutes: Math.round(estimatedMinutes),
    scheduledStartMinute:
      validSchedule && typeof candidateStart === 'number' ? candidateStart : null,
    status,
    createdAt: typeof createdAt === 'number' ? createdAt : 0,
    completedAt: status === 'completed' && typeof completedAt === 'number'
      ? completedAt
      : null,
    scheduleNeedsReview: !validSchedule,
  };
}

function readTasks(): TaskLoadResult {
  const defaults = (): TaskLoadResult => ({
    tasks: DEFAULT_TASKS.map((task) => ({ ...task })),
    readOnly: false,
    warning: '',
  });
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return defaults();

    const parsed: unknown = JSON.parse(stored);
    const records = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && parsed.schemaVersion === 2 && Array.isArray(parsed.tasks)
        ? parsed.tasks
        : null;
    if (records === null) {
      return {
        ...defaults(),
        readOnly: true,
        warning: 'Saved task data is unreadable. The original data is preserved; changes are session-only.',
      };
    }

    const tasks: TaskRecord[] = [];
    const seenIds = new Set<string>();
    let invalidCount = Math.max(0, records.length - MAX_TASKS);
    for (const candidate of records) {
      const task = parseTask(candidate);
      if (task === null || seenIds.has(task.id)) {
        invalidCount += 1;
        continue;
      }
      seenIds.add(task.id);
      tasks.push(task);
      if (tasks.length === MAX_TASKS) break;
    }
    return {
      tasks,
      readOnly: invalidCount > 0,
      warning: invalidCount > 0
        ? `Some saved tasks could not be loaded or exceed the six-card board. Original data is preserved; changes are session-only.`
        : '',
    };
  } catch {
    return {
      ...defaults(),
      readOnly: true,
      warning: 'Saved task data could not be decoded. The original data is preserved; changes are session-only.',
    };
  }
}

function normalizeFocusMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_FOCUS_MINUTES;
  }
  const clamped = Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, value));
  return Math.round(clamped / 5) * 5;
}

function parseFocusSessionRecord(value: unknown): FocusSessionRecord | null {
  if (!isRecord(value)) return null;
  const {
    id,
    taskId,
    taskTitle,
    plannedDurationMinutes,
    actualDurationMs,
    startedAt,
    endedAt,
    status,
    taskCompleted,
  } = value;
  if (
    typeof id !== 'string' || id.length === 0 ||
    typeof taskId !== 'string' || taskId.length === 0 ||
    typeof taskTitle !== 'string' ||
    typeof plannedDurationMinutes !== 'number' ||
    !Number.isSafeInteger(plannedDurationMinutes) ||
    plannedDurationMinutes < MIN_FOCUS_MINUTES ||
    plannedDurationMinutes > MAX_FOCUS_MINUTES ||
    typeof actualDurationMs !== 'number' ||
    !Number.isFinite(actualDurationMs) ||
    actualDurationMs < 0 ||
    actualDurationMs > plannedDurationMinutes * 60_000 ||
    typeof startedAt !== 'number' || !Number.isFinite(startedAt) ||
    typeof endedAt !== 'number' || !Number.isFinite(endedAt) ||
    endedAt < startedAt ||
    (status !== 'completed' && status !== 'stopped') ||
    typeof taskCompleted !== 'boolean'
  ) {
    return null;
  }
  return {
    id: id.slice(0, 100),
    taskId: taskId.slice(0, 100),
    taskTitle: taskTitle.slice(0, 80),
    plannedDurationMinutes,
    actualDurationMs,
    startedAt,
    endedAt,
    status,
    taskCompleted,
  };
}

function parseActiveFocusSession(value: unknown): ActiveFocusSession | null {
  if (!isRecord(value)) return null;
  const {
    id,
    taskId,
    taskTitle,
    taskDescription,
    plannedDurationMinutes,
    startedAt,
    deadlineAt,
    remainingMs,
    status,
  } = value;
  if (
    typeof id !== 'string' || id.length === 0 ||
    typeof taskId !== 'string' || taskId.length === 0 ||
    typeof taskTitle !== 'string' ||
    typeof taskDescription !== 'string' ||
    typeof plannedDurationMinutes !== 'number' ||
    !Number.isSafeInteger(plannedDurationMinutes) ||
    plannedDurationMinutes < MIN_FOCUS_MINUTES ||
    plannedDurationMinutes > MAX_FOCUS_MINUTES ||
    typeof startedAt !== 'number' || !Number.isFinite(startedAt) ||
    !(deadlineAt === null || (typeof deadlineAt === 'number' && Number.isFinite(deadlineAt))) ||
    typeof remainingMs !== 'number' ||
    !Number.isFinite(remainingMs) ||
    remainingMs < 0 || remainingMs > plannedDurationMinutes * 60_000 ||
    (status !== 'running' && status !== 'paused' && status !== 'awaiting-completion')
  ) {
    return null;
  }
  if (status === 'running' && typeof deadlineAt !== 'number') return null;
  return {
    id: id.slice(0, 100),
    taskId: taskId.slice(0, 100),
    taskTitle: taskTitle.slice(0, 80),
    taskDescription: taskDescription.slice(0, 220),
    plannedDurationMinutes,
    startedAt,
    deadlineAt: typeof deadlineAt === 'number' ? deadlineAt : null,
    remainingMs,
    status,
  };
}

function readFocusStorage(): FocusStorageLoadResult {
  const empty = (): FocusStorage => ({
    history: [],
    active: null,
    durationMinutes: DEFAULT_FOCUS_MINUTES,
  });
  try {
    const stored = window.localStorage.getItem(FOCUS_STORAGE_KEY);
    if (stored === null) return { storage: empty(), readOnly: false };
    const parsed: unknown = JSON.parse(stored);
    if (
      !isRecord(parsed) ||
      (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 2)
    ) return { storage: empty(), readOnly: true };
    const history = Array.isArray(parsed.history)
      ? parsed.history
        .map(parseFocusSessionRecord)
        .filter((session): session is FocusSessionRecord => session !== null)
        .slice(-MAX_FOCUS_HISTORY)
      : [];
    let active = parseActiveFocusSession(parsed.active);
    const invalidHistory = !Array.isArray(parsed.history) ||
      history.length !== parsed.history.length;
    const invalidActive = parsed.active != null && active === null;
    if (active?.status === 'running') {
      const remainingMs = Math.max(0, (active.deadlineAt ?? 0) - Date.now());
      active = remainingMs === 0
        ? { ...active, status: 'awaiting-completion', deadlineAt: null, remainingMs: 0 }
        : { ...active, remainingMs };
    } else if (active?.status === 'paused') {
      active = { ...active, deadlineAt: null };
    } else if (active?.status === 'awaiting-completion') {
      active = { ...active, deadlineAt: null, remainingMs: 0 };
    }
    return {
      storage: {
        history,
        active,
        durationMinutes: normalizeFocusMinutes(parsed.durationMinutes),
      },
      readOnly: invalidHistory || invalidActive,
    };
  } catch {
    return { storage: empty(), readOnly: true };
  }
}

function formatFocusClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatFocusDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

function sameLocalDay(firstTimestamp: number, secondTimestamp: number): boolean {
  const first = new Date(firstTimestamp);
  const second = new Date(secondTimestamp);
  return first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();
}

function statusLabel(status: TaskStatus): string {
  if (status === 'in-progress') return 'IN PROGRESS';
  return status === 'completed' ? 'COMPLETED' : 'TO DO';
}

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === 'todo') return 'in-progress';
  return status === 'in-progress' ? 'completed' : 'todo';
}

function createTaskId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random()}`;
}

export class PanelSystem extends createSystem({
  tasks: { required: [TaskData] },
}) {
  private taskEntities!: Array<Entity | null>;
  private taskCards!: Array<TaskCardElements | null>;
  private tasks!: Array<TaskRecord | null>;
  private selectedTask: string | null = null;
  private dashboardSummary!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private selectedTaskLabel!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private workloadValue!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private workloadState!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private workloadDetail!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private smartStatus!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private scheduleStatus!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private scheduleSuggestion!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private scheduleSuggestionButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private scheduleDismissSuggestionButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private timelineSlots!: TimelineSlotElements[];
  private loadSegments!: Array<NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  > | null>;
  private schedulerMessage = '';
  private dismissedSuggestionFor: string | null = null;
  private focusStorage!: FocusStorage;
  private focusDurationValue!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private focusDurationDownButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private focusDurationUpButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private focusStatistics!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private focusHistoryLabel!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private focusProgressSegments!: Array<NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  > | null>;
  private gardenStage!: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  private gardenDetails!: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  private gardenAchievements!: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  private gardenFlower!: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  private gardenLeaves!: Array<NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  > | null>;
  private gardenStem!: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  private gardenProgressSegments!: Array<NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  > | null>;
  private analyticsSummary!: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  private analyticsDayLabels!: Array<NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  > | null>;
  private analyticsBars!: Array<NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  > | null>;
  private analyticsDayCounts!: Array<NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  > | null>;
  private focusInterval: number | null = null;
  private lastTimerSecond = -1;
  private focusStorageAvailable = true;
  private focusStorageReadOnly = false;
  private taskStorageReadOnly = false;
  private taskStorageWarning = '';
  private pipInteractionState: PipInteractionState = 'idle';
  private pipPanelVisible = false;
  private pipPendingSchedule: PipPendingSchedule | null = null;
  private pipRecognition: PipSpeechRecognition | null = null;
  private pipToggleButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipPanelRoot!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipOrb!: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  private pipLauncherOrb!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipStateLabel!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipResponse!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipTranscript!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipListenButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipListenLabel!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipTextButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipRecapButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipDismissButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipConfirmationRow!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipConfirmScheduleButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipCancelScheduleButton!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
  private pipProcessingTimeout: number | null = null;

  private ghostAudio = new GhostDeskmateAudio();
  private ghostAudioButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private ghostAudioLabel: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private pipEmoteBadge: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private pipMorningRitualButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private pipEveningRitualButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private pipRitualActions: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private pipRitualNextButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private pipRitualNextLabel: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private pipRitualFinishButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private breakBanner: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private breakTimer: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private breakSuggestion: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private breakCompleteButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private breakSkipButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private timelineZoneMorningButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private timelineZoneMiddayButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private timelineZoneEveningButton: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private welcomeBackLine: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private todayJarBadge: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private todayJarStatus: NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null = null;
  private jarDayLabels: Array<NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null> = [];
  private jarBoxes: Array<NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null> = [];
  private jarTokenCounts: Array<NonNullable<ReturnType<UIKitMLAsset['getElementById']>> | null> = [];

  private ritualMode: 'morning' | 'evening' | null = null;
  private ritualStep = 0;
  private breakActive = false;
  private breakSecondsRemaining = 60;
  private breakInterval: number | null = null;
  private currentPipEmote: 'greeting' | 'encouragement' | 'celebration' | 'nudge' | 'idle' = 'greeting';
  private lastUserInteractionTime = Date.now();
  private idleNudged = false;
  private cardWasGrabbed: boolean[] = [false, false, false, false, false, false];
  private cardIsHovered: boolean[] = [false, false, false, false, false, false];
  private cardHomePositions: Vector3[] = [
    new Vector3(-0.36, 1.00, -0.80),
    new Vector3(0.00, 1.00, -0.80),
    new Vector3(0.36, 1.00, -0.80),
    new Vector3(-0.36, 0.65, -0.80),
    new Vector3(0.00, 0.65, -0.80),
    new Vector3(0.36, 0.65, -0.80),
  ];
  private cardHomeRotations: Quaternion[] = [
    new Quaternion(),
    new Quaternion(),
    new Quaternion(),
    new Quaternion(),
    new Quaternion(),
    new Quaternion(),
  ];
  private cardReturnStartPos: Vector3[] = Array.from({ length: 6 }, () => new Vector3());
  private cardReturnStartRot: Quaternion[] = Array.from({ length: 6 }, () => new Quaternion());
  private cardReturnProgress: number[] = [1, 1, 1, 1, 1, 1];

  init(): void {
    const dashboard = this.world.getSceneObject<UIKitMLAsset>('workspace-dashboard');
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    const xrButton = dashboard?.getElementById('xr-button') ?? panel?.getElementById('xr-button');
    const exitButton = dashboard?.getElementById('exit-button') ?? panel?.getElementById('exit-button');
    if (xrButton != null && exitButton != null) {
      if (!this.world.xrEnabled) {
        xrButton.setProperties({ display: 'none' });
        exitButton.setProperties({ display: 'none' });
      } else {
        const launchXR = () => this.world.launchXR();
        const exitXR = () => this.world.exitXR();
        xrButton.addEventListener('click', launchXR);
        exitButton.addEventListener('click', exitXR);
        this.cleanupFuncs.push(
          () => xrButton.removeEventListener('click', launchXR),
          () => exitButton.removeEventListener('click', exitXR),
          this.world.visibilityState.subscribe((visibilityState) => {
            const is2D = visibilityState === VisibilityState.NonImmersive;
            xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
            exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
          }),
        );
      }
    }
    const createButton = dashboard?.getElementById('task-create');
    const summary = dashboard?.getElementById('task-summary');
    const selectedLabel = dashboard?.getElementById('selected-task');
    const workloadValue = dashboard?.getElementById('workload-value');
    const workloadState = dashboard?.getElementById('workload-state');
    const workloadDetail = dashboard?.getElementById('workload-detail');
    const smartStatus = dashboard?.getElementById('smart-status');
    const scheduleStatus = dashboard?.getElementById('schedule-status');
    const scheduleSuggestion = dashboard?.getElementById('schedule-suggestion');
    const scheduleSuggestionButton = dashboard?.getElementById('schedule-apply-suggestion');
    const scheduleDismissSuggestionButton = dashboard?.getElementById('schedule-dismiss-suggestion');
    const focusDurationValue = dashboard?.getElementById('focus-duration-value');
    const focusDurationDown = dashboard?.getElementById('focus-duration-down');
    const focusDurationUp = dashboard?.getElementById('focus-duration-up');
    const focusStatistics = dashboard?.getElementById('focus-statistics');
    const focusHistoryLabel = dashboard?.getElementById('focus-history');
    const focusProgressSegments = Array.from({ length: 8 }, (_, index) =>
      dashboard?.getElementById(`focus-progress-${index + 1}`) ?? null,
    );
    const gardenStage = dashboard?.getElementById('garden-stage');
    const gardenDetails = dashboard?.getElementById('garden-details');
    const gardenAchievements = dashboard?.getElementById('garden-achievements');
    const gardenLeaves = Array.from({ length: 4 }, (_, index) =>
      dashboard?.getElementById(`garden-leaves-${index + 1}`) ?? null,
    );
    const gardenFlower = dashboard?.getElementById('garden-flower');
    const gardenStem = dashboard?.getElementById('garden-stem');
    const gardenProgressSegments = Array.from({ length: 4 }, (_, index) =>
      dashboard?.getElementById(`garden-progress-${index + 1}`) ?? null,
    );
    const analyticsSummary = dashboard?.getElementById('analytics-summary');
    const analyticsDayLabels = Array.from({ length: 7 }, (_, index) =>
      dashboard?.getElementById(`analytics-day-label-${index + 1}`) ?? null,
    );
    const analyticsBars = Array.from({ length: 7 }, (_, index) =>
      dashboard?.getElementById(`analytics-bar-${index + 1}`) ?? null,
    );
    const analyticsDayCounts = Array.from({ length: 7 }, (_, index) =>
      dashboard?.getElementById(`analytics-day-count-${index + 1}`) ?? null,
    );
    const pipToggleButton = dashboard?.getElementById('pip-toggle');
    const pipPanelRoot = dashboard?.getElementById('pip-panel');
    const pipOrb = dashboard?.getElementById('pip-orb');
    const pipLauncherOrb = dashboard?.getElementById('pip-launcher-orb');
    const pipStateLabel = dashboard?.getElementById('pip-state');
    const pipResponse = dashboard?.getElementById('pip-response');
    const pipTranscript = dashboard?.getElementById('pip-transcript');
    const pipListenButton = dashboard?.getElementById('pip-listen');
    const pipListenLabel = dashboard?.getElementById('pip-listen-label');
    const pipTextButton = dashboard?.getElementById('pip-text');
    const pipRecapButton = dashboard?.getElementById('pip-recap');
    const pipDismissButton = dashboard?.getElementById('pip-dismiss');
    const pipConfirmationRow = dashboard?.getElementById('pip-confirmation-row');
    const pipConfirmScheduleButton = dashboard?.getElementById('pip-confirm-schedule');
    const pipCancelScheduleButton = dashboard?.getElementById('pip-cancel-schedule');
    const earlierButton = dashboard?.getElementById('schedule-earlier');
    const laterButton = dashboard?.getElementById('schedule-later');
    const clearScheduleButton = dashboard?.getElementById('schedule-clear');
    const timelineSlots = TIMELINE_STARTS.map((startMinute) => {
      const button = dashboard?.getElementById(`timeline-slot-${startMinute}`);
      const label = dashboard?.getElementById(`timeline-slot-label-${startMinute}`);
      const content = dashboard?.getElementById(`timeline-slot-content-${startMinute}`);
      return button == null || label == null || content == null
        ? null
        : { button, label, content };
    });
    const loadSegments = Array.from({ length: LOAD_SEGMENT_COUNT }, (_, index) =>
      dashboard?.getElementById(`load-segment-${index + 1}`) ?? null,
    );
    if (
      summary == null || selectedLabel == null || workloadValue == null ||
      workloadState == null || workloadDetail == null ||
      smartStatus == null || scheduleStatus == null || scheduleSuggestion == null ||
      scheduleSuggestionButton == null || scheduleDismissSuggestionButton == null ||
      focusDurationValue == null || focusDurationDown == null || focusDurationUp == null ||
      focusStatistics == null || focusHistoryLabel == null ||
      focusProgressSegments.some((segment) => segment === null) ||
      gardenStage == null || gardenDetails == null || gardenAchievements == null ||
      gardenStem == null || gardenFlower == null || gardenLeaves.some((leaf) => leaf === null) ||
      gardenProgressSegments.some((segment) => segment === null) ||
      analyticsSummary == null || analyticsDayLabels.some((label) => label === null) ||
      analyticsBars.some((bar) => bar === null) ||
      analyticsDayCounts.some((count) => count === null) ||
      pipToggleButton == null || pipPanelRoot == null || pipOrb == null ||
      pipLauncherOrb == null || pipStateLabel == null || pipResponse == null ||
      pipTranscript == null || pipListenButton == null || pipListenLabel == null ||
      pipTextButton == null ||
      pipRecapButton == null || pipDismissButton == null ||
      pipConfirmationRow == null || pipConfirmScheduleButton == null ||
      pipCancelScheduleButton == null ||
      earlierButton == null || laterButton == null ||
      clearScheduleButton == null || timelineSlots.some((slot) => slot === null) ||
      loadSegments.some((segment) => segment === null)
    ) return;

    this.dashboardSummary = summary;
    this.selectedTaskLabel = selectedLabel;
    this.workloadValue = workloadValue;
    this.workloadState = workloadState;
    this.workloadDetail = workloadDetail;
    this.smartStatus = smartStatus;
    this.scheduleStatus = scheduleStatus;
    this.scheduleSuggestion = scheduleSuggestion;
    this.scheduleSuggestionButton = scheduleSuggestionButton;
    this.scheduleDismissSuggestionButton = scheduleDismissSuggestionButton;
    this.focusDurationValue = focusDurationValue;
    this.focusDurationDownButton = focusDurationDown;
    this.focusDurationUpButton = focusDurationUp;
    this.focusStatistics = focusStatistics;
    this.focusHistoryLabel = focusHistoryLabel;
    this.focusProgressSegments = focusProgressSegments;
    this.gardenStage = gardenStage;
    this.gardenDetails = gardenDetails;
    this.gardenAchievements = gardenAchievements;
    this.gardenFlower = gardenFlower;
    this.gardenLeaves = gardenLeaves;
    this.gardenStem = gardenStem;
    this.gardenProgressSegments = gardenProgressSegments;
    this.analyticsSummary = analyticsSummary;
    this.analyticsDayLabels = analyticsDayLabels;
    this.analyticsBars = analyticsBars;
    this.analyticsDayCounts = analyticsDayCounts;
    this.pipToggleButton = pipToggleButton;
    this.pipPanelRoot = pipPanelRoot;
    this.pipOrb = pipOrb;
    this.pipLauncherOrb = pipLauncherOrb;
    this.pipStateLabel = pipStateLabel;
    this.pipResponse = pipResponse;
    this.pipTranscript = pipTranscript;
    this.pipListenButton = pipListenButton;
    this.pipListenLabel = pipListenLabel;
    this.pipTextButton = pipTextButton;
    this.pipRecapButton = pipRecapButton;
    this.pipDismissButton = pipDismissButton;
    this.pipConfirmationRow = pipConfirmationRow;
    this.pipConfirmScheduleButton = pipConfirmScheduleButton;
    this.pipCancelScheduleButton = pipCancelScheduleButton;
    this.timelineSlots = timelineSlots as TimelineSlotElements[];
    this.loadSegments = loadSegments;

    this.ghostAudioButton = dashboard?.getElementById('ghost-audio-toggle') ?? null;
    this.ghostAudioLabel = dashboard?.getElementById('ghost-audio-label') ?? null;
    this.pipEmoteBadge = dashboard?.getElementById('pip-emote-badge') ?? null;
    this.pipMorningRitualButton = dashboard?.getElementById('pip-morning-ritual') ?? null;
    this.pipEveningRitualButton = dashboard?.getElementById('pip-evening-ritual') ?? null;
    this.pipRitualActions = dashboard?.getElementById('pip-ritual-actions') ?? null;
    this.pipRitualNextButton = dashboard?.getElementById('pip-ritual-next') ?? null;
    this.pipRitualNextLabel = dashboard?.getElementById('pip-ritual-next-label') ?? null;
    this.pipRitualFinishButton = dashboard?.getElementById('pip-ritual-finish') ?? null;
    this.breakBanner = dashboard?.getElementById('break-banner') ?? null;
    this.breakTimer = dashboard?.getElementById('break-timer') ?? null;
    this.breakSuggestion = dashboard?.getElementById('break-suggestion') ?? null;
    this.breakCompleteButton = dashboard?.getElementById('break-complete-btn') ?? null;
    this.breakSkipButton = dashboard?.getElementById('break-skip-btn') ?? null;
    this.timelineZoneMorningButton = dashboard?.getElementById('timeline-zone-morning') ?? null;
    this.timelineZoneMiddayButton = dashboard?.getElementById('timeline-zone-midday') ?? null;
    this.timelineZoneEveningButton = dashboard?.getElementById('timeline-zone-evening') ?? null;
    this.welcomeBackLine = dashboard?.getElementById('welcome-back-line') ?? null;
    this.todayJarBadge = dashboard?.getElementById('today-jar-badge') ?? null;
    this.todayJarStatus = dashboard?.getElementById('today-jar-status') ?? null;
    this.jarDayLabels = Array.from({ length: 7 }, (_, i) => dashboard?.getElementById(`jar-day-label-${i + 1}`) ?? null);
    this.jarBoxes = Array.from({ length: 7 }, (_, i) => dashboard?.getElementById(`jar-box-${i + 1}`) ?? null);
    this.jarTokenCounts = Array.from({ length: 7 }, (_, i) => dashboard?.getElementById(`jar-tokens-${i + 1}`) ?? null);

    if (this.ghostAudioButton !== null) {
      const toggleGhostAudio = () => {
        this.recordUserInteraction();
        this.ghostAudio.ensureRunning();
        const enabled = this.ghostAudio.toggle();
        this.ghostAudioLabel?.setProperties({
          text: enabled ? 'Deskmate: Sound on' : 'Deskmate: Sound muted',
        });
        this.setPipMessage(
          enabled
            ? 'Ghost Deskmate spatial ambient audio enabled. Soft keyboard and page-turns will sound from its side of the desk, quieter during focus.'
            : 'Ghost Deskmate ambient audio muted.',
        );
      };
      this.ghostAudioButton.addEventListener('click', toggleGhostAudio);
      this.cleanupFuncs.push(() => this.ghostAudioButton?.removeEventListener('click', toggleGhostAudio));
    }

    if (this.pipMorningRitualButton !== null) {
      const runMorning = () => {
        this.recordUserInteraction();
        this.startMorningRitual();
      };
      this.pipMorningRitualButton.addEventListener('click', runMorning);
      this.cleanupFuncs.push(() => this.pipMorningRitualButton?.removeEventListener('click', runMorning));
    }

    if (this.pipEveningRitualButton !== null) {
      const runEvening = () => {
        this.recordUserInteraction();
        this.startEveningRitual();
      };
      this.pipEveningRitualButton.addEventListener('click', runEvening);
      this.cleanupFuncs.push(() => this.pipEveningRitualButton?.removeEventListener('click', runEvening));
    }

    if (this.pipRitualNextButton !== null) {
      const nextRitual = () => {
        this.recordUserInteraction();
        this.advanceRitual();
      };
      this.pipRitualNextButton.addEventListener('click', nextRitual);
      this.cleanupFuncs.push(() => this.pipRitualNextButton?.removeEventListener('click', nextRitual));
    }

    if (this.pipRitualFinishButton !== null) {
      const finishRitual = () => {
        this.recordUserInteraction();
        this.finishRitual();
      };
      this.pipRitualFinishButton.addEventListener('click', finishRitual);
      this.cleanupFuncs.push(() => this.pipRitualFinishButton?.removeEventListener('click', finishRitual));
    }

    if (this.breakCompleteButton !== null) {
      const completeBreak = () => {
        this.recordUserInteraction();
        this.finishBreakMode(true);
      };
      this.breakCompleteButton.addEventListener('click', completeBreak);
      this.cleanupFuncs.push(() => this.breakCompleteButton?.removeEventListener('click', completeBreak));
    }

    if (this.breakSkipButton !== null) {
      const skipBreak = () => {
        this.recordUserInteraction();
        this.finishBreakMode(false);
      };
      this.breakSkipButton.addEventListener('click', skipBreak);
      this.cleanupFuncs.push(() => this.breakSkipButton?.removeEventListener('click', skipBreak));
    }

    if (this.timelineZoneMorningButton !== null) {
      const dropMorning = () => this.dropSelectedTaskToZone(9 * 60, 'Morning (09:00)');
      this.timelineZoneMorningButton.addEventListener('click', dropMorning);
      this.cleanupFuncs.push(() => this.timelineZoneMorningButton?.removeEventListener('click', dropMorning));
    }

    if (this.timelineZoneMiddayButton !== null) {
      const dropMidday = () => this.dropSelectedTaskToZone(12 * 60, 'Midday (12:00)');
      this.timelineZoneMiddayButton.addEventListener('click', dropMidday);
      this.cleanupFuncs.push(() => this.timelineZoneMiddayButton?.removeEventListener('click', dropMidday));
    }

    if (this.timelineZoneEveningButton !== null) {
      const dropEvening = () => this.dropSelectedTaskToZone(15 * 60, 'Evening (15:00)');
      this.timelineZoneEveningButton.addEventListener('click', dropEvening);
      this.cleanupFuncs.push(() => this.timelineZoneEveningButton?.removeEventListener('click', dropEvening));
    }

    this.cleanupFuncs.push(() => this.ghostAudio.dispose());

    dashboard?.getElementById('day-date')?.setProperties({
      text: new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }).format(new Date()).toUpperCase(),
    });
    this.taskEntities = Array.from({ length: MAX_TASKS }, () => null);
    this.taskCards = Array.from({ length: MAX_TASKS }, () => null);
    this.tasks = Array.from({ length: MAX_TASKS }, () => null);
    const loadedFocusData = readFocusStorage();
    this.focusStorage = loadedFocusData.storage;
    this.focusStorageReadOnly = loadedFocusData.readOnly;
    this.focusStorageAvailable = !loadedFocusData.readOnly;

    const changeFocusDuration = (delta: number) => {
      if (this.focusStorage.active !== null) return;
      this.focusStorage.durationMinutes = normalizeFocusMinutes(
        this.focusStorage.durationMinutes + delta,
      );
      this.persistFocusStorage();
      this.renderFocus();
    };
    const decreaseFocusDuration = () => changeFocusDuration(-5);
    const increaseFocusDuration = () => changeFocusDuration(5);
    focusDurationDown.name = 'Decrease focus duration by five minutes';
    focusDurationUp.name = 'Increase focus duration by five minutes';
    focusDurationDown.addEventListener('click', decreaseFocusDuration);
    focusDurationUp.addEventListener('click', increaseFocusDuration);
    this.cleanupFuncs.push(
      () => focusDurationDown.removeEventListener('click', decreaseFocusDuration),
      () => focusDurationUp.removeEventListener('click', increaseFocusDuration),
    );

    const togglePip = () => this.setPipPanelVisible(!this.pipPanelVisible);
    const hidePip = () => this.setPipPanelVisible(false);
    const listenWithPip = () => this.togglePipListening();
    const typeToPip = () => this.requestPipText();
    const showPipRecap = () => this.respondToPipRecap();
    const confirmPipSchedule = () => this.confirmPipSchedule();
    const cancelPipSchedule = () => this.cancelPipSchedule();
    this.pipToggleButton.name = 'Open or close Pip assistant';
    this.pipDismissButton.name = 'Dismiss Pip assistant';
    this.pipListenButton.name = 'Start voice input; browser speech service may transcribe audio';
    this.pipTextButton.name = 'Type a request for Pip';
    this.pipRecapButton.name = 'Ask Pip for a daily productivity recap';
    this.pipConfirmScheduleButton.name = 'Confirm Pip schedule suggestion';
    this.pipCancelScheduleButton.name = 'Cancel Pip schedule suggestion';
    this.pipToggleButton.addEventListener('click', togglePip);
    this.pipDismissButton.addEventListener('click', hidePip);
    this.pipListenButton.addEventListener('click', listenWithPip);
    this.pipTextButton.addEventListener('click', typeToPip);
    this.pipRecapButton.addEventListener('click', showPipRecap);
    this.pipConfirmScheduleButton.addEventListener('click', confirmPipSchedule);
    this.pipCancelScheduleButton.addEventListener('click', cancelPipSchedule);
    this.cleanupFuncs.push(
      () => this.pipToggleButton.removeEventListener('click', togglePip),
      () => this.pipDismissButton.removeEventListener('click', hidePip),
      () => this.pipListenButton.removeEventListener('click', listenWithPip),
      () => this.pipTextButton.removeEventListener('click', typeToPip),
      () => this.pipRecapButton.removeEventListener('click', showPipRecap),
      () => this.pipConfirmScheduleButton.removeEventListener('click', confirmPipSchedule),
      () => this.pipCancelScheduleButton.removeEventListener('click', cancelPipSchedule),
      () => this.stopPipRecognition(),
      () => {
        if (this.pipProcessingTimeout !== null) {
          window.clearTimeout(this.pipProcessingTimeout);
          this.pipProcessingTimeout = null;
        }
      },
    );
    this.renderPip();

    const onDocumentVisibilityChange = () => this.updateFocusClock(true);
    document.addEventListener('visibilitychange', onDocumentVisibilityChange);
    this.cleanupFuncs.push(
      () => document.removeEventListener('visibilitychange', onDocumentVisibilityChange),
      this.world.visibilityState.subscribe(() => this.updateFocusClock(true)),
      () => this.stopFocusTicker(),
    );

    for (const entity of this.queries.tasks.entities) {
      const slot = entity.getValue(TaskData, 'slot');
      if (
        typeof slot === 'number' &&
        Number.isInteger(slot) &&
        slot >= 0 &&
        slot < MAX_TASKS
      ) {
        this.taskEntities[slot] = entity;
      }
    }

    const loadedTaskData = readTasks();
    this.taskStorageReadOnly = loadedTaskData.readOnly;
    this.taskStorageWarning = loadedTaskData.warning;
    loadedTaskData.tasks.forEach((task, slot) => {
      this.tasks[slot] = task;
    });

    this.timelineSlots.forEach((timelineSlot, index) => {
      const startMinute = TIMELINE_STARTS[index];
      const scheduleAtTime = () => this.scheduleSelectedTask(startMinute);
      timelineSlot.button.name = `Schedule selected task for ${formatTime(startMinute)}`;
      timelineSlot.button.addEventListener('click', scheduleAtTime);
      this.cleanupFuncs.push(() =>
        timelineSlot.button.removeEventListener('click', scheduleAtTime),
      );
    });

    const moveEarlier = () => this.shiftSelectedTask(-30);
    const moveLater = () => this.shiftSelectedTask(30);
    const applySuggestion = () => this.applySuggestedSlot();
    const dismissSuggestion = () => this.dismissSuggestedSlots();
    const clearSchedule = () => this.clearSelectedSchedule();
    earlierButton.name = 'Move selected task 30 minutes earlier';
    laterButton.name = 'Move selected task 30 minutes later';
    scheduleSuggestionButton.name = 'Apply suggested time to selected task';
    scheduleDismissSuggestionButton.name = 'Dismiss suggested time slots';
    clearScheduleButton.name = 'Clear selected task schedule';
    earlierButton.addEventListener('click', moveEarlier);
    laterButton.addEventListener('click', moveLater);
    scheduleSuggestionButton.addEventListener('click', applySuggestion);
    scheduleDismissSuggestionButton.addEventListener('click', dismissSuggestion);
    clearScheduleButton.addEventListener('click', clearSchedule);
    this.cleanupFuncs.push(
      () => earlierButton.removeEventListener('click', moveEarlier),
      () => laterButton.removeEventListener('click', moveLater),
      () => scheduleSuggestionButton.removeEventListener('click', applySuggestion),
      () => scheduleDismissSuggestionButton.removeEventListener('click', dismissSuggestion),
      () => clearScheduleButton.removeEventListener('click', clearSchedule),
    );

    for (let slot = 0; slot < MAX_TASKS; slot += 1) {
      const card = this.world.getSceneObject<UIKitMLAsset>(TASK_NODE_IDS[slot]);
      if (card === undefined) continue;

      const root = card.getElementById('task-root');
      const priority = card.getElementById('task-priority');
      const title = card.getElementById('task-title');
      const description = card.getElementById('task-description');
      const statusButton = card.getElementById('task-status');
      const statusLabelElement = card.getElementById('task-status-label');
      const selectButton = card.getElementById('task-select');
      const editButton = card.getElementById('task-edit');
      const deleteButton = card.getElementById('task-delete');
      const duplicateButton = card.getElementById('task-duplicate');
      const focusStartButton = card.getElementById('task-focus-start');
      const focusPanel = card.getElementById('task-focus-panel');
      const focusState = card.getElementById('task-focus-state');
      const focusTimer = card.getElementById('task-focus-timer');
      const focusPauseButton = card.getElementById('task-focus-pause');
      const focusResumeButton = card.getElementById('task-focus-resume');
      const focusStopButton = card.getElementById('task-focus-stop');
      const focusCompleteButton = card.getElementById('task-focus-complete');
      const focusContinueButton = card.getElementById('task-focus-continue');
      const focusAgainButton = card.getElementById('task-focus-again');
      if (
        root == null || priority == null || title == null || description == null ||
        statusButton == null || statusLabelElement == null || selectButton == null ||
        editButton == null || deleteButton == null || duplicateButton == null ||
        focusStartButton == null ||
        focusPanel == null || focusState == null || focusTimer == null ||
        focusPauseButton == null || focusResumeButton == null || focusStopButton == null ||
        focusCompleteButton == null || focusContinueButton == null || focusAgainButton == null
      ) {
        continue;
      }

      this.taskCards[slot] = {
        root,
        priority,
        title,
        description,
        statusLabel: statusLabelElement,
        statusButton,
        selectButton,
        editButton,
        deleteButton,
        duplicateButton,
        focusStartButton,
        focusPanel,
        focusState,
        focusTimer,
        focusPauseButton,
        focusResumeButton,
        focusStopButton,
        focusCompleteButton,
        focusContinueButton,
        focusAgainButton,
      };


      const selectTask = () => {
        const task = this.tasks[slot];
        if (task === null) return;
        this.selectedTask = task.id;
        this.dismissedSuggestionFor = null;
        this.schedulerMessage = '';
        this.renderTasks();
      };
      const advanceStatus = () => {
        const task = this.tasks[slot];
        if (task === null) return;
        if (this.focusStorage.active?.taskId === task.id) {
          this.schedulerMessage = 'Use the focus controls to finish or stop this session first.';
          this.renderTasks();
          return;
        }
        task.status = nextStatus(task.status);
        task.completedAt = task.status === 'completed' ? Date.now() : null;
        this.persistTasks();
      };
      const editTask = () => this.editTask(slot);
      const deleteTask = () => this.deleteTask(slot);
      const duplicateTask = () => this.duplicateTask(slot);
      const startFocus = () => this.startFocusSession(slot);
      const pauseFocus = () => this.pauseFocusSession();
      const resumeFocus = () => this.resumeFocusSession();
      const stopFocus = () => this.stopFocusSession();
      const completeFocusTask = () => this.completeFocusedTask(slot);
      const continueAfterFocus = () => this.continueAfterFocus();
      const startAnotherFocus = () => this.startAnotherFocusSession(slot);

      selectButton.addEventListener('click', selectTask);
      statusButton.addEventListener('click', advanceStatus);
      editButton.addEventListener('click', editTask);
      deleteButton.addEventListener('click', deleteTask);
      duplicateButton.addEventListener('click', duplicateTask);
      focusStartButton.addEventListener('click', startFocus);
      focusPauseButton.addEventListener('click', pauseFocus);
      focusResumeButton.addEventListener('click', resumeFocus);
      focusStopButton.addEventListener('click', stopFocus);
      focusCompleteButton.addEventListener('click', completeFocusTask);
      focusContinueButton.addEventListener('click', continueAfterFocus);
      focusAgainButton.addEventListener('click', startAnotherFocus);
      this.cleanupFuncs.push(
        () => selectButton.removeEventListener('click', selectTask),
        () => statusButton.removeEventListener('click', advanceStatus),
        () => editButton.removeEventListener('click', editTask),
        () => deleteButton.removeEventListener('click', deleteTask),
        () => duplicateButton.removeEventListener('click', duplicateTask),
        () => focusStartButton.removeEventListener('click', startFocus),
        () => focusPauseButton.removeEventListener('click', pauseFocus),
        () => focusResumeButton.removeEventListener('click', resumeFocus),
        () => focusStopButton.removeEventListener('click', stopFocus),
        () => focusCompleteButton.removeEventListener('click', completeFocusTask),
        () => focusContinueButton.removeEventListener('click', continueAfterFocus),
        () => focusAgainButton.removeEventListener('click', startAnotherFocus),
      );

      const onHoverEnter = () => {
        if (!this.cardIsHovered[slot]) {
          this.cardIsHovered[slot] = true;
          this.ghostAudio.playHoverHum();
          root.setProperties({ borderColor: '#8ce2d2', borderWidth: 3 });
        }
      };
      const onHoverLeave = () => {
        if (this.cardIsHovered[slot]) {
          this.cardIsHovered[slot] = false;
          root.setProperties({ borderColor: '#3b6470', borderWidth: 2 });
        }
      };
      root.addEventListener('pointerenter', onHoverEnter);
      root.addEventListener('pointerleave', onHoverLeave);
      this.cleanupFuncs.push(
        () => root.removeEventListener('pointerenter', onHoverEnter),
        () => root.removeEventListener('pointerleave', onHoverLeave),
      );
    }

    if (createButton != null) {
      const createTask = () => this.createTask();
      createButton.name = 'Create task';
      createButton.addEventListener('click', createTask);
      this.cleanupFuncs.push(() =>
        createButton.removeEventListener('click', createTask),
      );
    }

    this.syncTasksToEntities();
    this.renderTasks();
    const activeFocus = this.focusStorage.active;
    if (
      activeFocus !== null &&
      !this.tasks.some((task) => task?.id === activeFocus.taskId)
    ) {
      this.finishFocusSession(
        activeFocus.status === 'awaiting-completion' ? 'completed' : 'stopped',
        false,
      );
    }
    this.persistFocusStorage();
    if (this.focusStorage.active?.status === 'running') this.startFocusTicker();
    this.updateFocusClock(true);
  }

  private persistFocusStorage(): void {
    if (this.focusStorageReadOnly) {
      this.focusStorageAvailable = false;
      return;
    }
    try {
      window.localStorage.setItem(
        FOCUS_STORAGE_KEY,
        JSON.stringify({ schemaVersion: 2, ...this.focusStorage }),
      );
      this.focusStorageAvailable = true;
    } catch {
      this.focusStorageAvailable = false;
    }
  }

  private startFocusTicker(): void {
    if (this.focusInterval !== null) return;
    this.focusInterval = window.setInterval(() => this.updateFocusClock(), 250);
  }

  private stopFocusTicker(): void {
    if (this.focusInterval === null) return;
    window.clearInterval(this.focusInterval);
    this.focusInterval = null;
  }

  private updateFocusClock(forceRender = false): void {
    const active = this.focusStorage.active;
    if (active === null) {
      this.lastTimerSecond = -1;
      if (forceRender) this.renderFocus();
      return;
    }

    let shouldRender = forceRender;
    if (active.status === 'running') {
      const remainingMs = Math.max(0, (active.deadlineAt ?? Date.now()) - Date.now());
      active.remainingMs = remainingMs;
      if (remainingMs === 0) {
        active.status = 'awaiting-completion';
        active.deadlineAt = null;
        this.persistFocusStorage();
        this.stopFocusTicker();
        this.lastTimerSecond = -1;
        this.ghostAudio.setFocusing(false);
        shouldRender = true;
        this.startBreakMode();
      } else {
        const timerSecond = Math.ceil(remainingMs / 1000);
        if (timerSecond !== this.lastTimerSecond) {
          this.lastTimerSecond = timerSecond;
          shouldRender = true;
        }
      }
    }
    if (shouldRender) this.renderFocus();
  }

  private renderFocus(): void {
    const now = Date.now();
    const active = this.focusStorage.active;
    const activeRemainingMs = active === null
      ? 0
      : active.status === 'running'
        ? Math.max(0, (active.deadlineAt ?? now) - now)
        : active.remainingMs;
    const activeElapsedMs = active === null
      ? 0
      : Math.max(0, active.plannedDurationMinutes * 60_000 - activeRemainingMs);
    const todaySessions = this.focusStorage.history.filter((session) =>
      sameLocalDay(session.startedAt, now),
    );
    const recordedTodayFocusMs = todaySessions.reduce(
      (total, session) => total + session.actualDurationMs,
      0,
    );
    const recordedTotalFocusMs = this.focusStorage.history.reduce(
      (total, session) => total + session.actualDurationMs,
      0,
    );
    const recordedCompletedToday = todaySessions.filter(
      (session) => session.status === 'completed',
    ).length;
    const recordedCompletedTotal = this.focusStorage.history.filter(
      (session) => session.status === 'completed',
    ).length;
    const activeIsToday = active !== null && sameLocalDay(active.startedAt, now);
    const todayFocusMs = recordedTodayFocusMs + (activeIsToday ? activeElapsedMs : 0);
    const totalFocusMs = recordedTotalFocusMs + activeElapsedMs;
    const completedToday = recordedCompletedToday + (
      activeIsToday && active?.status === 'awaiting-completion' ? 1 : 0
    );
    const completedTotal = recordedCompletedTotal + (
      active?.status === 'awaiting-completion' ? 1 : 0
    );
    this.focusDurationValue.setProperties({
      text: `${this.focusStorage.durationMinutes} MIN`,
    });
    this.focusDurationDownButton.setProperties({
      display: this.focusStorage.active === null ? 'flex' : 'none',
    });
    this.focusDurationUpButton.setProperties({
      display: this.focusStorage.active === null ? 'flex' : 'none',
    });
    this.focusStatistics.setProperties({
      text: `TODAY ${formatFocusDuration(todayFocusMs)} / 2h GOAL / ${completedToday} SESSIONS / TOTAL ${formatFocusDuration(totalFocusMs)} / ${completedTotal} COMPLETE${this.focusStorageAvailable ? '' : ' / STORAGE PROTECTED - SESSION ONLY'}`,
    });
    const recentSessions = this.focusStorage.history.slice(-3).reverse();
    this.focusHistoryLabel.setProperties({
      text: recentSessions.length === 0
        ? 'NO FOCUS HISTORY YET'
        : `RECENT: ${recentSessions.map((session) =>
          `${session.taskTitle} / ${formatFocusDuration(session.actualDurationMs)} / ${session.status.toUpperCase()} / ${new Date(session.endedAt).toLocaleDateString()}`,
        ).join('  |  ')}`,
    });
    this.focusProgressSegments.forEach((segment, index) => {
      if (segment === null) return;
      segment.setProperties({
        backgroundColor: todayFocusMs >= (index + 1) * 15 * 60_000
          ? '#53cbb5'
          : '#34434c',
      });
    });

    for (let slot = 0; slot < MAX_TASKS; slot += 1) {
      const task = this.tasks[slot];
      const card = this.taskCards[slot];
      if (task === null || card === null) continue;
      const isFocusedTask = active?.taskId === task.id;
      const isAwaitingCompletion = isFocusedTask && active.status === 'awaiting-completion';
      card.focusStartButton.setProperties({
        display: active === null && task.status !== 'completed' ? 'flex' : 'none',
      });
      card.focusStartButton.name = `Start ${this.focusStorage.durationMinutes} minute focus on ${task.title}`;
      card.focusPauseButton.name = `Pause focus on ${task.title}`;
      card.focusResumeButton.name = `Resume focus on ${task.title}`;
      card.focusStopButton.name = `Stop focus on ${task.title}`;
      card.focusCompleteButton.name = `Mark ${task.title} completed`;
      card.focusContinueButton.name = `Continue working on ${task.title}`;
      card.focusAgainButton.name = `Start another focus session on ${task.title}`;
      card.focusPanel.setProperties({ display: isFocusedTask ? 'flex' : 'none' });
      if (isFocusedTask && active !== null) {
        card.focusState.setProperties({
          text: active.status === 'running'
            ? 'FOCUS IN PROGRESS'
            : active.status === 'paused'
              ? 'SESSION PAUSED'
              : 'SESSION COMPLETE',
        });
        const remainingMs = active.status === 'running'
          ? Math.max(0, (active.deadlineAt ?? now) - now)
          : active.remainingMs;
        card.focusTimer.setProperties({ text: formatFocusClock(remainingMs) });
        card.focusPauseButton.setProperties({
          display: active.status === 'running' ? 'flex' : 'none',
        });
        card.focusResumeButton.setProperties({
          display: active.status === 'paused' ? 'flex' : 'none',
        });
        card.focusStopButton.setProperties({
          display: active.status === 'awaiting-completion' ? 'none' : 'flex',
        });
        card.focusCompleteButton.setProperties({
          display: isAwaitingCompletion && task.status !== 'completed' ? 'flex' : 'none',
        });
        card.focusContinueButton.setProperties({
          display: isAwaitingCompletion ? 'flex' : 'none',
        });
        card.focusAgainButton.setProperties({
          display: isAwaitingCompletion && task.status !== 'completed' ? 'flex' : 'none',
        });
      } else {
        card.focusPauseButton.setProperties({ display: 'none' });
        card.focusResumeButton.setProperties({ display: 'none' });
        card.focusStopButton.setProperties({ display: 'none' });
        card.focusCompleteButton.setProperties({ display: 'none' });
        card.focusContinueButton.setProperties({ display: 'none' });
        card.focusAgainButton.setProperties({ display: 'none' });
      }

      if (active !== null) {
        card.root.setProperties({
          borderColor: isFocusedTask ? '#53cbb5' : '#34434c',
          backgroundColor: isFocusedTask ? '#183942' : '#10191f',
        });
      }
    }
    this.renderProductivityInsights();
  }

  private renderProductivityInsights(): void {
    const active = this.focusStorage.active;
    const now = Date.now();
    const activeElapsedMs = active === null
      ? 0
      : Math.max(
        0,
        active.plannedDurationMinutes * 60_000 - (active.status === 'running'
          ? Math.max(0, (active.deadlineAt ?? now) - now)
          : active.remainingMs),
      );
    const sessions = active === null
      ? this.focusStorage.history
      : [
        ...this.focusStorage.history,
        {
          id: active.id,
          startedAt: active.startedAt,
          endedAt: now,
          actualDurationMs: activeElapsedMs,
          status: 'active' as const,
        },
      ];
    const tasks = this.tasks.filter((task): task is TaskRecord => task !== null);
    const insights = calculateProductivityInsights(tasks, sessions, now);
    const growthPoints = insights.gardenPoints;
    const earned = insights.earnedMilestones.length;
    const nextPointTarget = insights.nextMilestonePoints;

    this.gardenStage.setProperties({
      text: `${insights.gardenStage.toUpperCase()} / PRODUCTIVITY GARDEN`,
    });
    this.gardenDetails.setProperties({
      text: `${growthPoints} GROWTH POINTS / ${insights.streakDays} DAY STREAK / ${insights.completedTasks}/${insights.totalTasks} DONE`,
    });
    const latestMilestone = insights.earnedMilestones[earned - 1];
    const milestoneHistory = insights.earnedMilestones.slice(-2).map((milestone) =>
      `${milestone.name.toUpperCase()} ${new Date(milestone.earnedAt).toLocaleDateString()}`,
    ).join(' / ');
    this.gardenAchievements.setProperties({
      text: `${earned}/4 BADGES${latestMilestone === undefined ? '' : ` / LAST: ${milestoneHistory}`}${nextPointTarget === null ? ' / GARDEN COMPLETE' : ` / NEXT ${insights.nextMilestone.toUpperCase()} ${nextPointTarget}`}`,
    });
    this.gardenLeaves.forEach((leaf, index) => {
      leaf?.setProperties({ display: earned > index ? 'flex' : 'none' });
    });
    this.gardenFlower.setProperties({
      display: earned >= 3 ? 'flex' : 'none',
    });
    this.gardenStem.setProperties({
      backgroundColor: growthPoints >= 20 ? '#53cbb5' : '#9a7652',
    });
    this.gardenProgressSegments.forEach((segment, index) => {
      if (segment === null) return;
      const milestone = [20, 100, 250, 500][index];
      segment.setProperties({
        backgroundColor: growthPoints >= milestone
          ? '#53cbb5'
          : nextPointTarget === milestone && insights.gardenProgress > 0
            ? '#9a7652'
            : '#34434c',
      });
    });

    insights.days.forEach((day, index) => {
      const label = this.analyticsDayLabels[index];
      const bar = this.analyticsBars[index];
      const count = this.analyticsDayCounts[index];
      const focusBlocks = Math.floor(day.focusMinutes / 25);
      const activity = day.completedTasks + focusBlocks;
      label?.setProperties({ text: day.label });
      bar?.setProperties({
        backgroundColor: activity === 0
          ? '#34434c'
          : activity >= 4
            ? '#f2bf7b'
            : activity >= 2
              ? '#53cbb5'
              : '#5894b8',
      });
      count?.setProperties({ text: String(day.completedTasks) });
    });
    this.analyticsSummary.setProperties({
      text: `${insights.weeklyCompletedTasks} TASKS / ${formatDuration(insights.weeklyFocusMinutes)} FOCUS / ${Math.round(insights.completionRate * 100)}% COMPLETE / ${insights.weeklyChange.toUpperCase()} TREND`,
    });

    if (this.welcomeBackLine !== null) {
      this.welcomeBackLine.setProperties({ text: insights.welcomeBackLine });
    }
    if (this.todayJarBadge !== null) {
      this.todayJarBadge.setProperties({
        text: `${insights.todayJarTokens} / ${insights.todayJarGoal} TOKENS`,
      });
    }
    if (this.todayJarStatus !== null) {
      this.todayJarStatus.setProperties({
        text: `Today's jar: ${insights.todayJarTokens} token${insights.todayJarTokens === 1 ? '' : 's'} collected. ${insights.todayJarTokens >= insights.todayJarGoal ? 'Daily goal reached! 🏺🌟' : 'Finish sprints & breaks to fill it!'}`,
      });
    }
    insights.weekJarHistory.forEach((item, index) => {
      const label = this.jarDayLabels[index];
      const box = this.jarBoxes[index];
      const count = this.jarTokenCounts[index];
      label?.setProperties({ text: item.label });
      count?.setProperties({ text: String(item.tokens) });
      box?.setProperties({
        backgroundColor: item.tokens === 0
          ? '#203039'
          : item.tokens >= 4
            ? '#3a3b1a'
            : item.tokens >= 2
              ? '#1c3e36'
              : '#183942',
        borderColor: item.tokens >= 4 ? '#f5d90a' : item.tokens > 0 ? '#53cbb5' : '#34434c',
      });
    });
  }

  private startFocusSession(slot: number): void {
    const task = this.tasks[slot];
    if (task === null || task.status === 'completed') return;
    if (this.focusStorage.active !== null) {
      this.schedulerMessage = 'Finish, continue, or stop the current focus session first.';
      this.renderTasks();
      return;
    }
    const startedAt = Date.now();
    const plannedDurationMinutes = this.focusStorage.durationMinutes;
    this.focusStorage.active = {
      id: createTaskId(),
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description,
      plannedDurationMinutes,
      startedAt,
      deadlineAt: startedAt + plannedDurationMinutes * 60_000,
      remainingMs: plannedDurationMinutes * 60_000,
      status: 'running',
    };
    this.selectedTask = task.id;
    this.schedulerMessage = '';
    this.lastTimerSecond = -1;
    this.persistFocusStorage();
    this.startFocusTicker();
    this.ghostAudio.ensureRunning();
    this.ghostAudio.setFocusing(true);
    this.setPipEmote('encouragement');
    this.recordUserInteraction();
    this.renderTasks();
    this.updateFocusClock(true);
  }

  private pauseFocusSession(): void {
    this.updateFocusClock(true);
    const active = this.focusStorage.active;
    if (active?.status !== 'running') return;
    const remainingMs = Math.max(0, (active.deadlineAt ?? Date.now()) - Date.now());
    if (remainingMs === 0) {
      this.updateFocusClock(true);
      return;
    }
    active.status = 'paused';
    active.deadlineAt = null;
    active.remainingMs = remainingMs;
    this.stopFocusTicker();
    this.ghostAudio.setFocusing(false);
    this.lastTimerSecond = Math.ceil(remainingMs / 1000);
    this.persistFocusStorage();
    this.renderTasks();
  }

  private resumeFocusSession(): void {
    const active = this.focusStorage.active;
    if (active?.status !== 'paused') return;
    if (active.remainingMs <= 0) {
      active.status = 'awaiting-completion';
      this.persistFocusStorage();
      this.renderTasks();
      return;
    }
    active.status = 'running';
    active.deadlineAt = Date.now() + active.remainingMs;
    this.lastTimerSecond = -1;
    this.persistFocusStorage();
    this.startFocusTicker();
    this.ghostAudio.ensureRunning();
    this.ghostAudio.setFocusing(true);
    this.setPipEmote('encouragement');
    this.recordUserInteraction();
    this.updateFocusClock(true);
  }

  private stopFocusSession(): void {
    this.updateFocusClock(true);
    this.ghostAudio.setFocusing(false);
    if (this.focusStorage.active?.status === 'awaiting-completion') return;
    this.finishFocusSession('stopped', false);
  }

  private finishFocusSession(status: FocusSessionStatus, taskCompleted: boolean): void {
    const active = this.focusStorage.active;
    if (active === null) return;
    this.ghostAudio.setFocusing(false);
    const plannedMs = active.plannedDurationMinutes * 60_000;
    const remainingMs = status === 'completed'
      ? 0
      : active.status === 'running'
        ? Math.max(0, (active.deadlineAt ?? Date.now()) - Date.now())
        : active.remainingMs;
    const endedAt = Date.now();
    const session: FocusSessionRecord = {
      id: active.id,
      taskId: active.taskId,
      taskTitle: active.taskTitle,
      plannedDurationMinutes: active.plannedDurationMinutes,
      actualDurationMs: Math.min(plannedMs, Math.max(0, plannedMs - remainingMs)),
      startedAt: active.startedAt,
      endedAt,
      status,
      taskCompleted,
    };
    this.focusStorage.history = [...this.focusStorage.history, session].slice(-MAX_FOCUS_HISTORY);
    this.focusStorage.active = null;
    this.stopFocusTicker();
    this.lastTimerSecond = -1;
    this.persistFocusStorage();
    this.renderTasks();
  }

  private completeFocusedTask(slot: number): void {
    const task = this.tasks[slot];
    const active = this.focusStorage.active;
    if (
      task === null || active?.status !== 'awaiting-completion' ||
      task.id !== active.taskId
    ) return;
    task.status = 'completed';
    task.completedAt = Date.now();
    this.persistTasks();
    this.finishFocusSession('completed', true);
  }

  private continueAfterFocus(): void {
    if (this.focusStorage.active?.status !== 'awaiting-completion') return;
    this.finishFocusSession('completed', false);
    this.schedulerMessage = 'Focus session saved. Your task is still pending.';
    this.renderTasks();
  }

  private startAnotherFocusSession(slot: number): void {
    const active = this.focusStorage.active;
    const task = this.tasks[slot];
    if (
      active?.status !== 'awaiting-completion' || task === null ||
      task.id !== active.taskId || task.status === 'completed'
    ) return;
    this.finishFocusSession('completed', false);
    this.startFocusSession(slot);
  }

  private getPipSpeechConstructor(): (new () => PipSpeechRecognition) | null {
    const speechWindow = window as PipSpeechWindow;
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
  }

  private setPipPanelVisible(visible: boolean): void {
    this.pipPanelVisible = visible;
    if (!visible) {
      this.stopPipRecognition();
      if (this.pipProcessingTimeout !== null) {
        window.clearTimeout(this.pipProcessingTimeout);
        this.pipProcessingTimeout = null;
      }
      if (this.pipInteractionState === 'thinking') this.pipInteractionState = 'idle';
    }
    this.pipPanelRoot.setProperties({ display: visible ? 'flex' : 'none' });
    this.pipToggleButton.name = visible ? 'Hide Pip assistant panel' : 'Open Pip assistant panel';
    this.renderPip();
  }

  private renderPip(): void {
    const colors: Record<PipInteractionState, string> = {
      idle: '#53cbb5',
      listening: '#f2bf7b',
      thinking: '#a9baff',
      responding: '#53cbb5',
    };
    const hasSpeechRecognition = this.getPipSpeechConstructor() !== null;
    const stateLabel = this.pipInteractionState === 'idle'
      ? `READY / LOCAL MODE / ${hasSpeechRecognition ? 'VOICE AVAILABLE' : 'TYPE FALLBACK'}`
      : this.pipInteractionState === 'listening'
        ? 'LISTENING / MIC ACTIVE'
        : this.pipInteractionState === 'thinking'
          ? 'THINKING / LOCAL COMMAND'
          : 'RESPONDING / LOCAL MODE';
    this.pipStateLabel.setProperties({ text: stateLabel });
    const emoteColors: Record<'greeting' | 'encouragement' | 'celebration' | 'nudge' | 'idle', string> = {
      greeting: '#f5d90a',
      encouragement: '#53cbb5',
      celebration: '#ffb703',
      nudge: '#d1b3ff',
      idle: '#53cbb5',
    };
    const orbColor = this.pipInteractionState === 'idle'
      ? emoteColors[this.currentPipEmote]
      : colors[this.pipInteractionState];
    this.pipOrb.setProperties({ backgroundColor: orbColor });
    this.pipLauncherOrb.setProperties({ backgroundColor: orbColor });
    if (this.pipEmoteBadge !== null) {
      this.pipEmoteBadge.setProperties({ text: this.currentPipEmote.toUpperCase() });
    }
    this.pipListenLabel.setProperties({
      text: this.pipInteractionState === 'listening' ? 'Stop listening' : 'Listen',
    });
    this.pipListenButton.name = this.pipInteractionState === 'listening'
      ? 'Stop Pip voice input'
      : hasSpeechRecognition
        ? 'Start Pip voice input; browser speech service may transcribe audio'
        : 'Voice recognition unavailable; use Type request';
    this.pipConfirmationRow.setProperties({
      display: this.pipPendingSchedule === null ? 'none' : 'flex',
    });
  }

  private setPipEmote(emote: 'greeting' | 'encouragement' | 'celebration' | 'nudge' | 'idle'): void {
    this.currentPipEmote = emote;
    this.renderPip();
  }

  private recordUserInteraction(): void {
    this.lastUserInteractionTime = Date.now();
    this.idleNudged = false;
    this.ghostAudio.ensureRunning();
  }

  private setPipMessage(
    message: string,
    state: PipInteractionState = 'responding',
  ): void {
    this.pipResponse.setProperties({ text: message.slice(0, 700) });
    this.pipInteractionState = state;
    this.renderPip();
  }

  private togglePipListening(): void {
    if (this.pipRecognition !== null) {
      this.stopPipRecognition();
      this.setPipMessage('Listening stopped. Your tasks were not changed.', 'idle');
      return;
    }
    const SpeechRecognition = this.getPipSpeechConstructor();
    if (SpeechRecognition === null) {
      this.setPipMessage(
        'Voice recognition is unavailable in this browser. Use Type request instead.',
        'idle',
      );
      return;
    }

    let recognition: PipSpeechRecognition;
    try {
      recognition = new SpeechRecognition();
    } catch {
      this.setPipMessage(
        'The browser could not start voice recognition. Use Type request instead.',
        'idle',
      );
      return;
    }
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = '';
      let isFinal = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (alternative?.transcript) transcript += alternative.transcript;
        if (result?.isFinal) isFinal = true;
      }
      const cleanTranscript = transcript.trim();
      if (cleanTranscript.length === 0) return;
      this.pipTranscript.setProperties({ text: `Heard: ${cleanTranscript}` });
      if (!isFinal) return;
      this.pipRecognition = null;
      try {
        recognition.stop();
      } catch {
        // The recognition service may already have stopped after its final result.
      }
      this.processPipInput(cleanTranscript);
    };
    recognition.onerror = (event) => {
      if (this.pipRecognition !== recognition) return;
      this.pipRecognition = null;
      const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Microphone access was not allowed. You can type a request instead.'
        : event.error === 'no-speech'
          ? 'No speech was heard. Tap Listen and try again, or type a request.'
          : 'Voice recognition was interrupted or unavailable. You can type a request instead.';
      this.setPipMessage(message, 'idle');
    };
    recognition.onend = () => {
      if (this.pipRecognition === recognition) this.pipRecognition = null;
      if (this.pipInteractionState === 'listening') {
        this.setPipMessage(
          'Listening ended. Type a request or tap Listen to try again.',
          'idle',
        );
      }
    };
    this.pipRecognition = recognition;
    this.pipInteractionState = 'listening';
    this.pipResponse.setProperties({ text: 'Listening. Speak one short request.' });
    this.renderPip();
    try {
      recognition.start();
    } catch {
      this.stopPipRecognition();
      this.setPipMessage(
        'The browser could not access speech recognition. Use Type request instead.',
        'idle',
      );
    }
  }

  private stopPipRecognition(): void {
    const recognition = this.pipRecognition;
    if (recognition === null) return;
    this.pipRecognition = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // Stopping a recognizer that already ended is harmless.
    }
    if (this.pipInteractionState === 'listening') {
      this.pipInteractionState = 'idle';
    }
  }

  private requestPipText(): void {
    this.setPipPanelVisible(true);
    let request: string | null;
    try {
      request = window.prompt(
        'Type a request for Pip. Task commands are processed locally; Pip does not send task data to an AI service.',
        '',
      );
    } catch {
      this.setPipMessage('This browser does not allow text prompts here. Use Listen if available, or open Deskmate in its normal browser window.');
      return;
    }
    if (request === null || request.trim().length === 0) return;
    this.pipTranscript.setProperties({ text: `Typed: ${request.trim()}` });
    this.processPipInput(request.trim());
  }

  private processPipInput(input: string): void {
    if (this.pipProcessingTimeout !== null) {
      window.clearTimeout(this.pipProcessingTimeout);
    }
    this.pipInteractionState = 'thinking';
    this.pipResponse.setProperties({ text: 'Thinking through your request locally...' });
    this.renderPip();
    this.pipProcessingTimeout = window.setTimeout(() => {
      this.pipProcessingTimeout = null;
      this.executePipCommand(input);
    }, 120);
  }

  private executePipCommand(input: string): void {
    const command: PipCommand | null = validatePipCommand(parsePipCommand(input));
    if (command === null) {
      this.setPipMessage('I could not validate that request. No task or schedule was changed.');
      return;
    }
    switch (command.intent) {
      case 'create-task':
        this.createTaskFromPip(command);
        return;
      case 'schedule-task':
        this.scheduleTaskFromPip(command);
        return;
      case 'complete-task':
        this.completeTaskFromPip(command.taskQuery);
        return;
      case 'list-tasks':
        this.listTasksFromPip(command.filter);
        return;
      case 'start-focus':
        this.startFocusFromPip(command.taskQuery);
        return;
      case 'recap':
        this.respondToPipRecap();
        return;
      case 'morning-ritual':
        this.startMorningRitual();
        return;
      case 'evening-ritual':
        this.startEveningRitual();
        return;
      case 'start-break':
        this.startBreakMode();
        return;
      case 'jar-history':
        this.respondToJarHistory();
        return;
      case 'help':
        this.setPipMessage('Try: "Morning ritual", "Evening wind-down", "Show jar history", "Take a break", "Add a task to finish my project", or "Start focus".');
        return;
      case 'invalid-duration':
        this.setPipMessage('Task durations must be between 5 and 480 minutes. Nothing was changed.');
        return;
      case 'unknown':
        this.setPipMessage('I did not recognize that request. Try adding, scheduling, completing, or listing a task. Nothing was changed.');
    }
  }

  private createTaskFromPip(command: Extract<PipCommand, { intent: 'create-task' }>): void {
    const emptySlot = this.tasks.findIndex((task) => task === null);
    if (emptySlot < 0) {
      this.setPipMessage(`The task board is full (${MAX_TASKS} tasks). Nothing was added.`);
      return;
    }
    const title = command.title.trim().slice(0, 80);
    if (title.length === 0) {
      this.setPipMessage('I need a task title before I can add it. Nothing was changed.');
      return;
    }
    this.tasks[emptySlot] = {
      id: createTaskId(),
      title,
      description: '',
      category: '',
      priority: 'medium',
      estimatedMinutes: command.estimatedMinutes,
      scheduledStartMinute: null,
      status: 'todo',
      createdAt: Date.now(),
      completedAt: null,
      scheduleNeedsReview: false,
    };
    const saved = this.persistTasks();
    this.setPipMessage(saved
      ? `Added "${title}" as a ${command.estimatedMinutes}-minute unscheduled task.`
      : `Added "${title}" for this session, but local storage could not save it.`);
  }

  private findPipTaskMatches(query: string): TaskRecord[] {
    const normalize = (value: string) => value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, ' ')
      .trim();
    const normalizedQuery = normalize(query);
    if (normalizedQuery.length === 0) return [];
    const queryWords = normalizedQuery.split(' ');
    return this.tasks.filter((task): task is TaskRecord => {
      if (task === null) return false;
      const title = normalize(task.title);
      return title === normalizedQuery ||
        title.includes(normalizedQuery) ||
        normalizedQuery.includes(title) ||
        queryWords.every((word) => title.split(' ').includes(word));
    });
  }

  private completeTaskFromPip(taskQuery: string): void {
    const matches = this.findPipTaskMatches(taskQuery);
    if (matches.length === 0) {
      this.setPipMessage(`I could not find a task matching "${taskQuery}". No task was changed.`);
      return;
    }
    if (matches.length > 1) {
      this.setPipMessage(`I found several matches: ${matches.slice(0, 3).map((task) => task.title).join(', ')}. Please name one task more specifically.`);
      return;
    }
    const task = matches[0];
    if (task.status === 'completed') {
      this.setPipMessage(`"${task.title}" is already marked completed.`);
      return;
    }
    if (this.focusStorage.active?.taskId === task.id) {
      this.setPipMessage(`"${task.title}" has an active focus session. Finish or stop that session before changing its task status.`);
      return;
    }
    task.status = 'completed';
    task.completedAt = Date.now();
    const saved = this.persistTasks();
    this.setPipMessage(saved
      ? `Marked "${task.title}" completed.`
      : `Marked "${task.title}" completed for this session, but local storage could not save it.`);
  }

  private listTasksFromPip(filter: 'all' | 'pending'): void {
    const tasks = this.tasks.filter(
      (task): task is TaskRecord =>
        task !== null && (filter === 'all' || task.status !== 'completed'),
    );
    if (tasks.length === 0) {
      this.setPipMessage(filter === 'pending'
        ? 'There are no pending tasks on your board.'
        : 'There are no tasks on your board today.');
      return;
    }
    const lines = tasks.slice(0, 5).map((task) => {
      const time = task.scheduledStartMinute === null
        ? 'unscheduled'
        : `${formatTime(task.scheduledStartMinute)}-${formatTime(task.scheduledStartMinute + task.estimatedMinutes)}`;
      return `${task.title} - ${taskPhase(task).toLowerCase()}, ${time}`;
    });
    this.setPipMessage(`${tasks.length} task${tasks.length === 1 ? '' : 's'}: ${lines.join('; ')}${tasks.length > lines.length ? '; and more' : ''}.`);
  }

  private startFocusFromPip(taskQuery?: string): void {
    let task: TaskRecord | null = null;
    if (taskQuery !== undefined) {
      const matches = this.findPipTaskMatches(taskQuery);
      if (matches.length > 1) {
        this.setPipMessage(`I found several matching tasks: ${matches.slice(0, 3).map((match) => match.title).join(', ')}. Please name one task.`);
        return;
      }
      task = matches[0] ?? null;
    } else {
      task = this.getSelectedTask() ??
        this.tasks.find((candidate) => candidate?.status === 'in-progress') ??
        [...this.tasks]
          .filter((candidate): candidate is TaskRecord => candidate !== null && candidate.status !== 'completed')
          .sort((first, second) => {
            const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
            return priorityRank[first.priority] - priorityRank[second.priority];
          })[0] ?? null;
    }
    if (task === null) {
      this.setPipMessage('Select or create a pending task before starting focus. No session was started.');
      return;
    }
    if (task.status === 'completed') {
      this.setPipMessage(`"${task.title}" is complete. Choose a pending task for focus.`);
      return;
    }
    const slot = this.tasks.findIndex((candidate) => candidate?.id === task?.id);
    if (slot < 0) {
      this.setPipMessage('I could not start that focus session. No task was changed.');
      return;
    }
    if (this.focusStorage.active !== null) {
      this.setPipMessage('A focus session is already active. Pause, finish, or stop it before starting another.');
      return;
    }
    this.startFocusSession(slot);
    this.setPipMessage(
      `Started a ${this.focusStorage.durationMinutes}-minute focus session for "${task.title}".${this.focusStorageAvailable ? '' : ' Focus storage is protected, so this session is only saved for the current visit.'}`,
    );
  }

  private scheduleTaskFromPip(
    command: Extract<PipCommand, { intent: 'schedule-task' }>,
  ): void {
    if (command.requestedDay === 'tomorrow') {
      const duration = command.estimatedMinutes === undefined
        ? ''
        : ` for ${command.estimatedMinutes} minutes`;
      this.setPipMessage(`I understood: schedule "${command.taskQuery}"${duration} tomorrow. This task model only schedules today, so I made no changes. Ask me to add it as an unscheduled task instead.`);
      return;
    }
    const matches = this.findPipTaskMatches(command.taskQuery);
    if (matches.length > 1) {
      this.setPipMessage(`I found several tasks: ${matches.slice(0, 3).map((task) => task.title).join(', ')}. Please name one task more specifically.`);
      return;
    }
    const task = matches[0] ?? null;
    if (task?.status === 'completed') {
      this.setPipMessage(`"${task.title}" is completed, so I did not schedule it.`);
      return;
    }
    if (task !== null && this.focusStorage.active?.taskId === task.id) {
      this.setPipMessage(`"${task.title}" is in a focus session. Stop or finish it before rescheduling.`);
      return;
    }
    const title = task?.title ?? command.taskQuery.trim().slice(0, 80);
    const estimatedMinutes = command.estimatedMinutes ?? task?.estimatedMinutes ?? 30;
    if (!isValidSchedule(WORKDAY_START_MINUTE, estimatedMinutes)) {
      this.setPipMessage(`A ${estimatedMinutes}-minute task does not fit the 08:00-18:00 timeline. No schedule was changed.`);
      return;
    }
    if (task === null && this.tasks.every((candidate) => candidate !== null)) {
      this.setPipMessage(`The task board is full (${MAX_TASKS} tasks), so I could not create "${title}".`);
      return;
    }

    const reservedTasks = this.tasks.filter(
      (candidate): candidate is TaskRecord => candidate !== null && candidate.id !== task?.id,
    );
    const hasConflict = (startMinute: number) => reservedTasks.some((candidate) =>
      candidate.scheduledStartMinute !== null &&
      schedulesOverlap(
        startMinute,
        estimatedMinutes,
        candidate.scheduledStartMinute,
        candidate.estimatedMinutes,
      ),
    );
    let suggestedStart = command.requestedStartMinute;
    let explanation = 'This slot fits the workday and does not overlap another scheduled task.';
    if (
      suggestedStart === undefined ||
      !isValidSchedule(suggestedStart, estimatedMinutes) ||
      hasConflict(suggestedStart)
    ) {
      const alternatives = findSuggestedStartMinutes(
        reservedTasks,
        estimatedMinutes,
        task?.priority ?? 'medium',
      );
      suggestedStart = alternatives[0];
      explanation = command.requestedStartMinute === undefined
        ? 'I chose the closest open slot that fits without overlapping scheduled work.'
        : 'That requested time is invalid or conflicts with another task. This is the next suggested open slot.';
    }
    if (suggestedStart === undefined) {
      const workload = analyzeWorkload(
        this.tasks.filter((candidate): candidate is TaskRecord => candidate !== null),
        WORKLOAD_CAPACITY_MINUTES,
        WORKDAY_START_MINUTE,
        WORKDAY_END_MINUTE,
      );
      const overloadReason = workload.balance === 'overloaded'
        ? ' The current day is overloaded or has overlapping tasks.'
        : '';
      this.setPipMessage(`No open slot fits ${title} for ${estimatedMinutes} minutes.${overloadReason} Nothing was changed.`);
      return;
    }
    this.pipPendingSchedule = {
      taskId: task?.id ?? null,
      title,
      estimatedMinutes,
      scheduledStartMinute: suggestedStart,
    };
    this.setPipMessage(
      `${task === null ? 'Create and schedule' : 'Schedule'} "${title}" for ${estimatedMinutes} minutes at ${formatTime(suggestedStart)}. ${explanation} Confirm to apply; no changes have been made yet.`,
    );
  }

  private confirmPipSchedule(): void {
    const pending = this.pipPendingSchedule;
    if (pending === null) return;
    if (!isValidSchedule(pending.scheduledStartMinute, pending.estimatedMinutes)) {
      this.pipPendingSchedule = null;
      this.setPipMessage('That suggestion no longer fits the workday. Nothing was changed.');
      return;
    }
    const task = pending.taskId === null
      ? null
      : this.tasks.find((candidate) => candidate?.id === pending.taskId) ?? null;
    if (pending.taskId !== null && (task === null || task.status === 'completed')) {
      this.pipPendingSchedule = null;
      this.setPipMessage('That task is no longer available or is already completed. Nothing was changed.');
      return;
    }
    const conflicts = this.tasks.some((candidate) =>
      candidate !== null && candidate.id !== pending.taskId &&
      candidate.scheduledStartMinute !== null &&
      schedulesOverlap(
        pending.scheduledStartMinute,
        pending.estimatedMinutes,
        candidate.scheduledStartMinute,
        candidate.estimatedMinutes,
      ),
    );
    if (conflicts) {
      this.pipPendingSchedule = null;
      this.setPipMessage('Another task now occupies that time. The schedule was not changed; ask Pip for a fresh suggestion.');
      return;
    }
    if (task === null) {
      const emptySlot = this.tasks.findIndex((candidate) => candidate === null);
      if (emptySlot < 0) {
        this.pipPendingSchedule = null;
        this.setPipMessage(`The task board is full (${MAX_TASKS} tasks). No schedule was changed.`);
        return;
      }
      this.tasks[emptySlot] = {
        id: createTaskId(),
        title: pending.title,
        description: 'Added by Pip',
        category: '',
        priority: 'medium',
        estimatedMinutes: pending.estimatedMinutes,
        scheduledStartMinute: pending.scheduledStartMinute,
        status: 'todo',
        createdAt: Date.now(),
        completedAt: null,
        scheduleNeedsReview: false,
      };
    } else {
      if (this.focusStorage.active?.taskId === task.id) {
        this.pipPendingSchedule = null;
        this.setPipMessage('That task entered a focus session before confirmation. No schedule was changed.');
        return;
      }
      task.estimatedMinutes = pending.estimatedMinutes;
      task.scheduledStartMinute = pending.scheduledStartMinute;
      task.scheduleNeedsReview = false;
    }
    this.pipPendingSchedule = null;
    this.schedulerMessage = `${pending.title} scheduled for ${formatTime(pending.scheduledStartMinute)}.`;
    const saved = this.persistTasks();
    this.setPipMessage(saved
      ? `Scheduled "${pending.title}" for ${formatTime(pending.scheduledStartMinute)}-${formatTime(pending.scheduledStartMinute + pending.estimatedMinutes)}.`
      : `Updated the schedule for this session, but local storage could not save it.`);
  }

  private cancelPipSchedule(): void {
    if (this.pipPendingSchedule === null) return;
    const title = this.pipPendingSchedule.title;
    this.pipPendingSchedule = null;
    this.setPipMessage(`Cancelled the schedule suggestion for "${title}". No changes were made.`);
  }

  private respondToPipRecap(): void {
    const allTasks = this.tasks.filter((task): task is TaskRecord => task !== null);
    const completed = allTasks.filter((task) => task.status === 'completed');
    const pending = allTasks.filter((task) => task.status !== 'completed');
    const workload = analyzeWorkload(
      allTasks,
      WORKLOAD_CAPACITY_MINUTES,
      WORKDAY_START_MINUTE,
      WORKDAY_END_MINUTE,
    );
    const now = Date.now();
    const currentTime = new Date(now);
    const currentMinute = currentTime.getHours() * 60 + currentTime.getMinutes();
    const focusToday = this.focusStorage.history
      .filter((session) => sameLocalDay(session.startedAt, now))
      .reduce((total, session) => total + session.actualDurationMs, 0);
    const active = this.focusStorage.active;
    const activeElapsed = active === null
      ? 0
      : Math.max(
        0,
        active.plannedDurationMinutes * 60_000 - (active.status === 'running'
          ? Math.max(0, (active.deadlineAt ?? now) - now)
          : active.remainingMs),
      );
    const totalFocusToday = focusToday + (
      active !== null && sameLocalDay(active.startedAt, now) ? activeElapsed : 0
    );
    const workloadSummary = workload.overloadMinutes > 0
      ? `Over capacity by ${formatDuration(workload.overloadMinutes)}`
      : workload.overlaps.length > 0
        ? `Schedule conflict from ${formatTime(workload.overlaps[0].startMinute)} to ${formatTime(workload.overlaps[0].endMinute)}`
        : `${formatDuration(workload.remainingCapacityMinutes)} capacity free`;
    const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
    const scheduledNext = pending
      .filter((task) => task.scheduledStartMinute !== null && task.scheduledStartMinute >= currentMinute)
      .sort((first, second) =>
        (first.scheduledStartMinute ?? 0) - (second.scheduledStartMinute ?? 0),
      )[0];
    const nextTask = pending.find((task) => task.status === 'in-progress') ??
      scheduledNext ??
      [...pending].sort((first, second) =>
        priorityRank[first.priority] - priorityRank[second.priority],
      )[0];
    const priorityMessage = nextTask === undefined
      ? 'No pending task needs prioritizing.'
      : `Next up: ${nextTask.title}${nextTask.scheduledStartMinute === null ? ` (${nextTask.priority} priority)` : ` at ${formatTime(nextTask.scheduledStartMinute)}`}.`;
    this.setPipMessage(
      `Today: ${completed.length} complete, ${pending.length} pending. Focus: ${formatFocusDuration(totalFocusToday)}. ${workloadSummary}. ${priorityMessage}`,
    );
  }

  private createTask(): void {
    const emptySlot = this.tasks.findIndex((task) => task === null);
    if (emptySlot < 0) {
      this.dashboardSummary.setProperties({
        text: `Board full (${MAX_TASKS} tasks). Delete one to make room.`,
      });
      return;
    }

    const task = this.promptTask();
    if (task === null) return;
    this.tasks[emptySlot] = {
      ...task,
      id: createTaskId(),
      status: 'todo',
      createdAt: Date.now(),
      completedAt: null,
    };
    this.persistTasks();
  }

  private editTask(slot: number): void {
    const currentTask = this.tasks[slot];
    if (currentTask === null) return;
    if (this.focusStorage.active?.taskId === currentTask.id) {
      this.schedulerMessage = 'Stop or finish the focus session before editing this task.';
      this.renderTasks();
      return;
    }
    const updatedTask = this.promptTask(currentTask);
    if (updatedTask === null) return;
    if (
      updatedTask.scheduledStartMinute !== null &&
      !isValidSchedule(
        updatedTask.scheduledStartMinute,
        updatedTask.estimatedMinutes,
      )
    ) {
      this.dashboardSummary.setProperties({
        text: 'Duration would end after 18:00. Schedule was not changed.',
      });
      return;
    }
    this.tasks[slot] = {
      ...updatedTask,
      id: currentTask.id,
      status: currentTask.status,
      createdAt: currentTask.createdAt,
      completedAt: currentTask.completedAt,
    };
    this.persistTasks();
  }

  private duplicateTask(slot: number): void {
    const source = this.tasks[slot];
    const emptySlot = this.tasks.findIndex((task) => task === null);
    if (source === null) return;
    if (emptySlot < 0) {
      this.dashboardSummary.setProperties({
        text: `Board full (${MAX_TASKS} tasks). Delete one to make room.`,
      });
      return;
    }
    const suffix = ' (copy)';
    this.tasks[emptySlot] = {
      ...source,
      id: createTaskId(),
      title: `${source.title.slice(0, 80 - suffix.length)}${suffix}`,
      scheduledStartMinute: null,
      status: 'todo',
      createdAt: Date.now(),
      completedAt: null,
      scheduleNeedsReview: false,
    };
    this.selectedTask = this.tasks[emptySlot]?.id ?? null;
    this.persistTasks();
  }

  private promptTask(
    current?: TaskRecord,
  ): Omit<TaskRecord, 'id' | 'status' | 'createdAt' | 'completedAt'> | null {
    const title = window.prompt('Task title (required, up to 80 characters)', current?.title ?? '');
    if (title === null) return null;
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      this.dashboardSummary.setProperties({ text: 'Task title cannot be empty.' });
      return null;
    }

    const description = window.prompt(
      'Description (optional, up to 220 characters)',
      current?.description ?? '',
    );
    if (description === null) return null;

    const category = window.prompt(
      'Category (optional, up to 32 characters)',
      current?.category ?? '',
    );
    if (category === null) return null;

    const priorityText = window.prompt(
      'Priority: low, medium, or high',
      current?.priority ?? 'medium',
    );
    if (priorityText === null) return null;
    const priority = priorityText.trim().toLowerCase();
    if (!isPriority(priority)) {
      this.dashboardSummary.setProperties({ text: 'Priority must be low, medium, or high.' });
      return null;
    }

    const durationText = window.prompt(
      'Estimated duration in minutes (5 to 480)',
      String(current?.estimatedMinutes ?? 30),
    );
    if (durationText === null) return null;
    const estimatedMinutes = Number(durationText);
    if (
      !Number.isFinite(estimatedMinutes) ||
      estimatedMinutes < 5 ||
      estimatedMinutes > 480
    ) {
      this.dashboardSummary.setProperties({ text: 'Duration must be between 5 and 480 minutes.' });
      return null;
    }

    const roundedDuration = Math.round(estimatedMinutes);
    const scheduledStartMinute = current?.scheduledStartMinute ?? null;
    if (
      scheduledStartMinute !== null &&
      !isValidSchedule(scheduledStartMinute, roundedDuration)
    ) {
      this.dashboardSummary.setProperties({
        text: 'That duration would end after 18:00. Choose a shorter duration or reschedule first.',
      });
      return null;
    }

    return {
      title: trimmedTitle.slice(0, 80),
      description: description.trim().slice(0, 220),
      category: category.trim().slice(0, 32),
      priority,
      estimatedMinutes: roundedDuration,
      scheduledStartMinute,
      scheduleNeedsReview: false,
    };
  }

  private getSelectedTask(): TaskRecord | null {
    return this.tasks.find((task) => task?.id === this.selectedTask) ?? null;
  }

  private scheduleSelectedTask(startMinute: number): void {
    const task = this.getSelectedTask();
    if (task === null) {
      this.schedulerMessage = 'Select a task card before choosing a time block.';
      this.renderTasks();
      return;
    }
    this.setTaskSchedule(task, startMinute);
  }

  private setTaskSchedule(task: TaskRecord, startMinute: number): void {
    if (!isValidSchedule(startMinute, task.estimatedMinutes)) {
      this.schedulerMessage =
        `That slot does not fit ${task.estimatedMinutes} minutes before 18:00. Task unchanged.`;
      this.renderTasks();
      return;
    }
    task.scheduledStartMinute = startMinute;
    task.scheduleNeedsReview = false;
    this.schedulerMessage = `${task.title} set for ${formatTime(startMinute)} - ${formatTime(startMinute + task.estimatedMinutes)}.`;
    this.persistTasks();
  }

  private shiftSelectedTask(deltaMinutes: number): void {
    const task = this.getSelectedTask();
    if (task === null) {
      this.schedulerMessage = 'Select a task card before moving it.';
      this.renderTasks();
      return;
    }
    if (task.scheduledStartMinute === null) {
      this.schedulerMessage = 'This task is unscheduled. Choose a timeline block first.';
      this.renderTasks();
      return;
    }
    this.setTaskSchedule(task, task.scheduledStartMinute + deltaMinutes);
  }

  private findSuggestedStarts(task: TaskRecord): number[] {
    const otherTasks = this.tasks.filter(
      (other): other is TaskRecord => other !== null && other.id !== task.id,
    );
    return findSuggestedStartMinutes(otherTasks, task.estimatedMinutes, task.priority);
  }

  private applySuggestedSlot(): void {
    const task = this.getSelectedTask();
    if (task === null) {
      this.schedulerMessage = 'Select a task card to get a time suggestion.';
      this.renderTasks();
      return;
    }
    if (this.dismissedSuggestionFor === task.id) return;
    const suggestion = this.findSuggestedStarts(task)[0];
    if (suggestion === undefined) {
      this.schedulerMessage = 'No open slot fits this task. Existing tasks were not moved.';
      this.renderTasks();
      return;
    }
    this.setTaskSchedule(task, suggestion);
  }

  private dismissSuggestedSlots(): void {
    const task = this.getSelectedTask();
    if (task === null) return;
    this.dismissedSuggestionFor = task.id;
    this.schedulerMessage = `Suggestions for ${task.title} dismissed. No schedule changed.`;
    this.renderTasks();
  }

  private clearSelectedSchedule(): void {
    const task = this.getSelectedTask();
    if (task === null) {
      this.schedulerMessage = 'Select a task before clearing its schedule.';
      this.renderTasks();
      return;
    }
    task.scheduledStartMinute = null;
    task.scheduleNeedsReview = false;
    this.schedulerMessage = `${task.title} moved to the unscheduled list.`;
    this.persistTasks();
  }

  private deleteTask(slot: number): void {
    const task = this.tasks[slot];
    if (task !== null && this.focusStorage.active?.taskId === task.id) {
      this.schedulerMessage = 'Stop or finish the focus session before deleting this task.';
      this.renderTasks();
      return;
    }
    if (task === null || !window.confirm(`Delete "${task.title}"?`)) return;
    if (this.selectedTask === task.id) this.selectedTask = null;
    this.tasks[slot] = null;
    this.persistTasks();
  }

  private persistTasks(): boolean {
    const activeTasks = this.tasks.filter((task): task is TaskRecord => task !== null);
    this.syncTasksToEntities();

    let message = `${activeTasks.length} / ${MAX_TASKS} tasks`;
    let saved = true;
    if (this.taskStorageReadOnly) {
      message = this.taskStorageWarning || 'Saved task data is protected; changes are session-only.';
      message = `${message} / NOT SAVED`;
      saved = false;
    } else {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ schemaVersion: 2, tasks: activeTasks }),
        );
      } catch {
        message = `${message} / storage unavailable`;
        saved = false;
      }
    }
    this.renderTasks(message);
    return saved;
  }

  private syncTasksToEntities(): void {
    for (let slot = 0; slot < MAX_TASKS; slot += 1) {
      const entity = this.taskEntities[slot];
      if (entity == null) continue;
      const task = this.tasks[slot];
      entity.setValue(TaskData, 'active', task !== null);
      entity.setValue(TaskData, 'id', task?.id ?? '');
      entity.setValue(TaskData, 'title', task?.title ?? '');
      entity.setValue(TaskData, 'description', task?.description ?? '');
      entity.setValue(TaskData, 'priority', task?.priority ?? 'medium');
      entity.setValue(TaskData, 'category', task?.category ?? '');
      entity.setValue(TaskData, 'estimatedMinutes', task?.estimatedMinutes ?? 30);
      entity.setValue(
        TaskData,
        'scheduledStartMinute',
        task?.scheduledStartMinute ?? -1,
      );
      entity.setValue(TaskData, 'status', task?.status ?? 'todo');
      entity.setValue(TaskData, 'createdAt', task?.createdAt ?? 0);
      entity.setValue(TaskData, 'completedAt', task?.completedAt ?? 0);
    }
  }

  private getConflictingTaskIds(): Set<string> {
    const conflictingIds = new Set<string>();
    for (let firstIndex = 0; firstIndex < MAX_TASKS; firstIndex += 1) {
      const first = this.tasks[firstIndex];
      if (first === null || first.scheduledStartMinute === null) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < MAX_TASKS; secondIndex += 1) {
        const second = this.tasks[secondIndex];
        if (second === null || second.scheduledStartMinute === null) continue;
        if (
          schedulesOverlap(
            first.scheduledStartMinute,
            first.estimatedMinutes,
            second.scheduledStartMinute,
            second.estimatedMinutes,
          )
        ) {
          conflictingIds.add(first.id);
          conflictingIds.add(second.id);
        }
      }
    }
    return conflictingIds;
  }

  private renderTasks(summaryOverride?: string): void {
    let inProgress = 0;
    let completed = 0;
    const conflictingIds = this.getConflictingTaskIds();
    for (let slot = 0; slot < MAX_TASKS; slot += 1) {
      const task = this.tasks[slot];
      const card = this.taskCards[slot];
      if (task === null || card === null) {
        card?.root.setProperties({ display: 'none' });
        continue;
      }

      if (task.status === 'in-progress') inProgress += 1;
      if (task.status === 'completed') completed += 1;
      const priorityColor =
        task.priority === 'high'
          ? '#d76b63'
          : task.priority === 'medium'
            ? '#d2a35c'
            : '#53b89f';
      const taskBackground =
        task.status === 'completed'
          ? '#1c3e36'
          : task.status === 'in-progress'
            ? '#302b3d'
            : '#15232b';
      const isSelected = this.selectedTask === task.id;
      card.root.setProperties({
        display: 'flex',
        borderColor: isSelected
          ? '#f5d90a'
          : conflictingIds.has(task.id)
            ? '#ef756d'
            : priorityColor,
        backgroundColor: taskBackground,
      });
      card.title.setProperties({ text: task.title });
      card.description.setProperties({
        text: task.description || 'No description',
      });
      const scheduleLabel = task.scheduledStartMinute === null
        ? task.scheduleNeedsReview
          ? 'SCHEDULE REVIEW'
          : 'UNSCHEDULED'
        : `${formatTime(task.scheduledStartMinute)}-${formatTime(task.scheduledStartMinute + task.estimatedMinutes)}`;
      card.priority.setProperties({
        text: `${task.priority.toUpperCase()} PRIORITY / ${task.estimatedMinutes} MIN / ${task.category ? `${task.category.toUpperCase()} / ` : ''}${scheduleLabel} / ${taskPhase(task)}`,
        color: priorityColor,
      });
      card.statusLabel.setProperties({
        text:
          task.status === 'todo'
            ? 'Start task'
            : task.status === 'in-progress'
              ? 'Mark completed'
              : 'Move to to do',
      });
      card.statusButton.name = `${statusLabel(task.status)}: ${task.title}`;
      card.selectButton.name = `Select ${task.title}`;
      card.editButton.name = `Edit ${task.title}`;
      card.deleteButton.name = `Delete ${task.title}`;
      card.duplicateButton.name = `Duplicate ${task.title}`;
    }

    const total = this.tasks.filter((task) => task !== null).length;
    const summary = summaryOverride ?? (this.taskStorageWarning ||
      `${total} / ${MAX_TASKS} tasks  /  ${inProgress} active  /  ${completed} complete`);
    this.dashboardSummary.setProperties({ text: summary });
    const selected = this.tasks.find((task) => task?.id === this.selectedTask);
    this.selectedTaskLabel.setProperties({
      text: selected?.title ?? 'Choose a task card',
    });
    this.renderTimeline();
    this.renderFocus();
  }

  private renderTimeline(): void {
    const scheduledTasks = this.tasks.filter(
      (task): task is TaskRecord => task !== null && task.scheduledStartMinute !== null,
    );
    const workload = analyzeWorkload(
      this.tasks.filter((task): task is TaskRecord => task !== null),
      WORKLOAD_CAPACITY_MINUTES,
      WORKDAY_START_MINUTE,
      WORKDAY_END_MINUTE,
    );
    const plannedMinutes = workload.scheduledMinutes;
    const capacityExceeded = workload.overloadMinutes > 0;
    const overloaded = workload.balance === 'overloaded';
    const conflictRanges = Array.from(new Set(workload.overlaps.map(
      (overlap) => `${formatTime(overlap.startMinute)}-${formatTime(overlap.endMinute)}`,
    )));
    const conflictCount = conflictRanges.length;

    this.workloadValue.setProperties({
      text: `${formatDuration(plannedMinutes)} planned / 8h capacity`,
      color: overloaded ? '#ef756d' : '#8ce2d2',
    });
    this.workloadState.setProperties({
      text: capacityExceeded
        ? `OVERLOADED BY ${formatDuration(workload.overloadMinutes)}`
        : workload.overlaps.length > 0
          ? 'OVERLAPPING TASKS'
        : workload.balance === 'balanced'
          ? 'BALANCED CAPACITY'
          : 'UNDERLOADED',
      color: overloaded ? '#ffc0ba' : workload.balance === 'balanced' ? '#8ce2d2' : '#9eb4bf',
      backgroundColor: overloaded ? '#572f34' : workload.balance === 'balanced' ? '#183942' : '#25333b',
    });
    this.workloadDetail.setProperties({
      text: `EST ${formatDuration(workload.totalEstimatedMinutes)} / DONE ${formatDuration(workload.completedMinutes)} / PENDING ${formatDuration(workload.pendingMinutes)} / FREE ${formatDuration(workload.remainingCapacityMinutes)}`,
    });
    this.loadSegments.forEach((segment, index) => {
      if (segment === null) return;
      const filled = plannedMinutes >= (index + 1) * 60;
      segment.setProperties({
        backgroundColor: capacityExceeded
          ? '#a64848'
          : filled
            ? workload.balance === 'balanced' ? '#53cbb5' : '#5894b8'
            : '#34434c',
      });
    });

    const selected = this.getSelectedTask();
    this.timelineSlots.forEach((timelineSlot, index) => {
      const startMinute = TIMELINE_STARTS[index];
      const endMinute = startMinute + TIMELINE_BAND_MINUTES;
      const bandTasks = scheduledTasks.filter((task) =>
        (task.scheduledStartMinute as number) < endMinute &&
        (task.scheduledStartMinute as number) + task.estimatedMinutes > startMinute,
      );
      const hasConflict = workload.overlaps.some((overlap) =>
        overlap.startMinute < endMinute && overlap.endMinute > startMinute,
      );
      const containsSelection = selected?.scheduledStartMinute !== null &&
        selected?.scheduledStartMinute !== undefined &&
        selected.scheduledStartMinute >= startMinute &&
        selected.scheduledStartMinute < endMinute;
      const contents = bandTasks.length === 0
        ? 'No tasks scheduled. Tap to place selected task.'
        : bandTasks.map((task) =>
          `${formatTime(task.scheduledStartMinute as number)}-${formatTime((task.scheduledStartMinute as number) + task.estimatedMinutes)} ${task.priority.toUpperCase()} ${taskPhase(task)} / ${task.title}`,
        ).join(' | ');
      const backgroundColor = hasConflict
        ? '#4a292e'
        : bandTasks.some((task) => task.status === 'in-progress')
          ? '#302b3d'
          : bandTasks.length > 0 && bandTasks.every((task) => task.status === 'completed')
            ? '#1c3e36'
            : bandTasks.length > 0
              ? '#183942'
              : '#15212a';
      timelineSlot.label.setProperties({
        text: `${formatTime(startMinute)} - ${formatTime(endMinute)}`,
      });
      timelineSlot.content.setProperties({
        text: contents,
        color: hasConflict ? '#ffc0ba' : '#e8eef0',
      });
      timelineSlot.button.setProperties({
        backgroundColor,
        borderColor: containsSelection ? '#f5d90a' : hasConflict ? '#ef756d' : '#2b414c',
      });
      timelineSlot.button.name =
        `Schedule selected task for ${formatTime(startMinute)}. ${bandTasks.length} task${bandTasks.length === 1 ? '' : 's'} in this block`;
    });

    const reviewCount = this.tasks.filter((task) => task?.scheduleNeedsReview).length;
    const unscheduledCount = this.tasks.filter(
      (task) => task !== null && task.scheduledStartMinute === null,
    ).length;
    const conflictLabel = conflictCount === 0
      ? 'NO SCHEDULING CONFLICTS'
      : `${conflictCount} OVERLAPPING PERIOD${conflictCount === 1 ? '' : 'S'} (${conflictRanges.slice(0, 3).join(', ')}${conflictCount > 3 ? ', …' : ''})`;
    const capacityLabel = capacityExceeded
      ? `OVER CAPACITY BY ${formatDuration(workload.overloadMinutes)} (${formatDuration(plannedMinutes)} SCHEDULED / ${formatDuration(WORKLOAD_CAPACITY_MINUTES)} AVAILABLE)`
      : `${formatDuration(workload.remainingCapacityMinutes)} FREE / ${formatDuration(WORKLOAD_CAPACITY_MINUTES)} CAPACITY`;
    this.smartStatus.setProperties({
      text: `${conflictLabel} / ${capacityLabel} / ${unscheduledCount} UNSCHEDULED${reviewCount > 0 ? ` / ${reviewCount} SCHEDULE REVIEW` : ''}`,
      color: overloaded || reviewCount > 0 ? '#ef756d' : '#8ce2d2',
    });

    if (this.schedulerMessage.length > 0) {
      this.scheduleStatus.setProperties({ text: this.schedulerMessage });
    } else if (selected === null) {
      this.scheduleStatus.setProperties({
        text: 'Select a task, then tap a time block or move it by 30 minutes.',
      });
    } else if (selected.scheduledStartMinute === null) {
      this.scheduleStatus.setProperties({ text: `${selected.title} is unscheduled.` });
    } else {
      this.scheduleStatus.setProperties({
        text: `${selected.title}: ${formatTime(selected.scheduledStartMinute)} - ${formatTime(selected.scheduledStartMinute + selected.estimatedMinutes)}.`,
      });
    }

    const suggestedStarts = selected === null ? [] : this.findSuggestedStarts(selected);
    const suggestionDismissed = selected !== null && this.dismissedSuggestionFor === selected.id;
    const hasSuggestions = selected !== null && suggestedStarts.length > 0 && !suggestionDismissed;
    this.scheduleSuggestion.setProperties({
      text: selected === null
        ? 'Select a task for a slot suggestion'
        : suggestionDismissed
          ? 'SUGGESTIONS DISMISSED / NO SCHEDULE CHANGE'
          : suggestedStarts.length === 0
            ? 'NO OPEN SLOT FITS THIS DURATION'
            : `${selected.priority.toUpperCase()} SUGGESTIONS ${suggestedStarts.map(formatTime).join(' / ')}`,
    });
    this.scheduleSuggestionButton.setProperties({ display: hasSuggestions ? 'flex' : 'none' });
    this.scheduleDismissSuggestionButton.setProperties({ display: hasSuggestions ? 'flex' : 'none' });
    this.scheduleSuggestionButton.name = hasSuggestions
      ? `Apply suggested time ${formatTime(suggestedStarts[0])} for ${selected.title}`
      : 'No suggested time available';
  }

  private respondToJarHistory(): void {
    const tasks = this.tasks.filter((t): t is TaskRecord => t !== null);
    const insights = calculateProductivityInsights(tasks, this.focusStorage.history, Date.now());
    this.setPipEmote('celebration');
    this.setPipMessage(
      `Focus Jar Status: You have ${insights.todayJarTokens} token${insights.todayJarTokens === 1 ? '' : 's'} in today's jar (${insights.todayJarGoal} token daily goal). Weekly total: ${insights.weeklyCompletedTasks} tasks finished & ${insights.weeklyFocusMinutes} focus minutes!`,
      'responding',
    );
  }

  private startMorningRitual(): void {
    this.setPipPanelVisible(true);
    this.ritualMode = 'morning';
    this.ritualStep = 0;
    this.pipRitualActions?.setProperties({ display: 'flex' });
    this.renderMorningRitualStep();
  }

  private renderMorningRitualStep(): void {
    const tasks = this.tasks.filter((t): t is TaskRecord => t !== null);
    const pendingTasks = tasks.filter((t) => t.status !== 'completed');
    const workload = analyzeWorkload(
      tasks,
      WORKLOAD_CAPACITY_MINUTES,
      WORKDAY_START_MINUTE,
      WORKDAY_END_MINUTE,
    );
    const freeHours = Math.max(0, Math.round(workload.remainingCapacityMinutes / 60));

    if (this.ritualStep === 0) {
      this.setPipEmote('greeting');
      this.pipRitualNextLabel?.setProperties({ text: 'Review schedule' });
      this.setPipMessage(
        `Good morning! Pip is here to help you plan the day. You have ${pendingTasks.length} tasks ready. Let's make today calm, purposeful, and focused!`,
        'responding',
      );
    } else if (this.ritualStep === 1) {
      this.setPipEmote('encouragement');
      this.pipRitualNextLabel?.setProperties({ text: 'Lock in day plan' });
      this.setPipMessage(
        `Step 1: Check your timeline. You have ~${freeHours}h free capacity today. Pinch-drag your top priority cards into Morning (08:00-11:30) or Midday (11:30-14:30) blocks.`,
        'responding',
      );
    } else {
      this.setPipEmote('celebration');
      this.pipRitualNextLabel?.setProperties({ text: 'Finish ritual' });
      this.setPipMessage(
        'Step 2: Day plan ready! Pick a task card to begin your first sprint whenever you\'re ready. Have an energizing morning!',
        'responding',
      );
    }
  }

  private startEveningRitual(): void {
    this.setPipPanelVisible(true);
    this.ritualMode = 'evening';
    this.ritualStep = 0;
    this.pipRitualActions?.setProperties({ display: 'flex' });
    this.renderEveningRitualStep();
  }

  private renderEveningRitualStep(): void {
    const tasks = this.tasks.filter((t): t is TaskRecord => t !== null);
    const completedTasks = tasks.filter((t) => t.status === 'completed');
    const pendingTasks = tasks.filter((t) => t.status !== 'completed');
    const now = Date.now();
    const insights = calculateProductivityInsights(tasks, this.focusStorage.history, now);

    if (this.ritualStep === 0) {
      this.setPipEmote('greeting');
      this.pipRitualNextLabel?.setProperties({ text: 'Review today\'s jar' });
      this.setPipMessage(
        'Good evening! Time for your wind-down ritual. Let\'s step back, review today\'s jar, and tuck tomorrow away.',
        'responding',
      );
    } else if (this.ritualStep === 1) {
      this.setPipEmote('celebration');
      this.pipRitualNextLabel?.setProperties({ text: 'Set up tomorrow' });
      this.setPipMessage(
        `Today's Jar Walkthrough: You collected ${insights.todayJarTokens} focus tokens in today's jar and finished ${completedTasks.length} task${completedTasks.length === 1 ? '' : 's'}! ${insights.todayJarTokens >= 4 ? 'Daily focus goal achieved!' : 'Every token nurtures your garden.'}`,
        'responding',
      );
    } else {
      this.setPipEmote('encouragement');
      this.pipRitualNextLabel?.setProperties({ text: 'Rest up' });
      this.setPipMessage(
        `Setting up tomorrow: ${pendingTasks.length > 0 ? `${pendingTasks.length} unfinished task${pendingTasks.length === 1 ? '' : 's'} rolled over safely for tomorrow.` : 'All tasks completed! Tomorrow starts clean and fresh.'} Your desk is saved. Rest well tonight!`,
        'responding',
      );
    }
  }

  private advanceRitual(): void {
    if (this.ritualMode === 'morning') {
      if (this.ritualStep < 2) {
        this.ritualStep += 1;
        this.renderMorningRitualStep();
      } else {
        this.finishRitual();
      }
    } else if (this.ritualMode === 'evening') {
      if (this.ritualStep < 2) {
        this.ritualStep += 1;
        this.renderEveningRitualStep();
      } else {
        this.finishRitual();
      }
    }
  }

  private finishRitual(): void {
    this.ritualMode = null;
    this.ritualStep = 0;
    this.pipRitualActions?.setProperties({ display: 'none' });
    this.setPipEmote('idle');
  }

  private startBreakMode(): void {
    this.breakActive = true;
    this.breakSecondsRemaining = 60;
    this.breakBanner?.setProperties({ display: 'flex' });
    this.setPipEmote('encouragement');
    this.setPipMessage(
      'Sprint finished! Pip suggests: Take a 60-second seated breathing or stretch break before today\'s jar fills.',
      'responding',
    );
    this.updateBreakBannerText();
    if (this.breakInterval !== null) {
      window.clearInterval(this.breakInterval);
    }
    this.breakInterval = window.setInterval(() => {
      this.breakSecondsRemaining -= 1;
      this.updateBreakBannerText();
      if (this.breakSecondsRemaining <= 0) {
        this.finishBreakMode(true);
      }
    }, 1000);
  }

  private updateBreakBannerText(): void {
    this.breakTimer?.setProperties({
      text: `${this.breakSecondsRemaining}s remaining`,
    });
    const s = this.breakSecondsRemaining;
    const prompt = s > 45
      ? 'Pip suggests: Gently roll your shoulders back 5 times and inhale deeply.'
      : s > 30
        ? 'Pip suggests: Turn your head slowly left, then right. Release neck tension.'
        : s > 15
          ? 'Pip suggests: Clasp your hands, stretch your arms out, and exhale.'
          : 'Pip suggests: Take one slow, full breath in... and out. Almost done!';
    this.breakSuggestion?.setProperties({ text: prompt });
  }

  private finishBreakMode(fillJar: boolean): void {
    if (this.breakInterval !== null) {
      window.clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    this.breakActive = false;
    this.breakBanner?.setProperties({ display: 'none' });

    if (fillJar) {
      this.finishFocusSession('completed', true);
      this.ghostAudio.playJarFillSound();
      this.setPipEmote('celebration');
      this.setPipMessage(
        'Break completed! Today\'s jar filled with +1 focus token! 🏺✨ Great balance of work & recovery.',
        'responding',
      );
    } else {
      this.finishFocusSession('completed', false);
      this.setPipMessage('Break skipped. Focus session saved.', 'idle');
    }
    this.renderTasks();
  }

  private dropSelectedTaskToZone(startMinute: number, zoneName: string): void {
    this.recordUserInteraction();
    const selected = this.getSelectedTask();
    if (selected === null) {
      this.setPipMessage('Select a task card first, then tap a zone to schedule it.');
      return;
    }
    selected.scheduledStartMinute = startMinute;
    selected.scheduleNeedsReview = false;
    this.persistTasks();
    this.renderTasks();
    this.setPipEmote('celebration');
    this.setPipMessage(`Scheduled "${selected.title}" for ${zoneName}!`);
    this.ghostAudio.playJarFillSound();
  }

  private checkPinchDragTimelineDrop(): void {
    for (let slot = 0; slot < MAX_TASKS; slot += 1) {
      const entity = this.taskEntities[slot];
      const task = this.tasks[slot];
      if (entity == null || task == null) continue;

      const isGrabbed = entity.hasComponent(Grabbed);
      if (isGrabbed) {
        if (!this.cardWasGrabbed[slot]) {
          this.cardWasGrabbed[slot] = true;
          this.cardReturnProgress[slot] = 1;
          this.ghostAudio.playPinchTick();
          this.recordUserInteraction();
        }
      } else if (this.cardWasGrabbed[slot]) {
        this.cardWasGrabbed[slot] = false;
        this.recordUserInteraction();
        const obj = this.world.getSceneObject(TASK_NODE_IDS[slot]);
        if (obj != null) {
          const pos = obj.position;
          if (pos.y >= 1.20 && pos.y <= 1.70 && pos.z <= -0.65) {
            let startMinute: number;
            let zoneName: string;
            if (pos.x < -0.15) {
              startMinute = 9 * 60; // 09:00
              zoneName = 'Morning (09:00)';
            } else if (pos.x > 0.15) {
              startMinute = 15 * 60; // 15:00
              zoneName = 'Evening (15:00)';
            } else {
              startMinute = 12 * 60; // 12:00
              zoneName = 'Midday (12:00)';
            }
            task.scheduledStartMinute = startMinute;
            task.scheduleNeedsReview = false;
            this.selectedTask = task.id;
            this.persistTasks();
            this.renderTasks();
            this.setPipEmote('celebration');
            this.setPipMessage(
              `Pinch-drag placed "${task.title}" into ${zoneName}!`,
              'responding',
            );
            this.ghostAudio.playJarFillSound();
          } else {
            this.startCardReturnHome(slot);
          }
        }
      }
    }
  }

  private startCardReturnHome(slot: number): void {
    const obj = this.world.getSceneObject(TASK_NODE_IDS[slot]);
    if (!obj) return;
    this.cardReturnStartPos[slot].copy(obj.position);
    this.cardReturnStartRot[slot].copy(obj.quaternion);
    this.cardReturnProgress[slot] = 0;
  }

  private updateCardReturnAnimations(delta: number): void {
    for (let slot = 0; slot < MAX_TASKS; slot += 1) {
      if (this.cardReturnProgress[slot] < 1) {
        this.cardReturnProgress[slot] += delta * 3.5;
        const t = Math.min(1, this.cardReturnProgress[slot]);
        const ease = 1 - Math.pow(1 - t, 3);
        const obj = this.world.getSceneObject(TASK_NODE_IDS[slot]);
        if (obj) {
          obj.position.lerpVectors(this.cardReturnStartPos[slot], this.cardHomePositions[slot], ease);
          obj.quaternion.slerpQuaternions(this.cardReturnStartRot[slot], this.cardHomeRotations[slot], ease);
        }
        if (t >= 1) {
          this.cardReturnProgress[slot] = 1;
          this.ghostAudio.playSnapSound();
        }
      }
    }
  }

  update(delta: number, _time: number): void {
    this.checkPinchDragTimelineDrop();
    this.updateCardReturnAnimations(delta);
    this.checkIdleNudge();
  }

  private checkIdleNudge(): void {
    if (
      this.idleNudged ||
      this.breakActive ||
      this.focusStorage.active?.status === 'running' ||
      this.ritualMode !== null
    ) {
      return;
    }
    const elapsed = Date.now() - this.lastUserInteractionTime;
    if (elapsed > 90_000) {
      this.idleNudged = true;
      this.setPipEmote('nudge');
      this.setPipMessage(
        'Pip: Gentle nudge! Roll your shoulders, check today\'s plan, or pick a task when you\'re ready to focus.',
        'idle',
      );
    }
  }
}
