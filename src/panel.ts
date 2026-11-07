/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  Entity,
  UIKitMLAsset,
  VisibilityState,
} from '@iwsdk/core';
import { TaskData } from './components.js';

type TaskStatus = 'todo' | 'in-progress' | 'completed';
type TaskPriority = 'low' | 'medium' | 'high';

interface TaskRecord {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  estimatedMinutes: number;
  scheduledStartMinute: number | null;
  status: TaskStatus;
  scheduleNeedsReview?: boolean;
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
}

interface TimelineSlotElements {
  button: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  label: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
  content: NonNullable<ReturnType<UIKitMLAsset['getElementById']>>;
}

const STORAGE_KEY = 'deskmate.tasks.v1';
const MAX_TASKS = 6;
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
    priority: 'high',
    estimatedMinutes: 120,
    scheduledStartMinute: 9 * 60 + 30,
    status: 'todo',
  },
  {
    id: 'seed-design-review',
    title: 'Review design brief',
    description: 'Share feedback with the team',
    priority: 'medium',
    estimatedMinutes: 60,
    scheduledStartMinute: 13 * 60,
    status: 'todo',
  },
  {
    id: 'seed-inbox',
    title: 'Inbox reset',
    description: 'Clear the queue and flag follow-ups',
    priority: 'low',
    estimatedMinutes: 60,
    scheduledStartMinute: 15 * 60,
    status: 'todo',
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

function parseTask(value: unknown): TaskRecord | null {
  if (!isRecord(value)) return null;
  const {
    id,
    title,
    description,
    priority,
    estimatedMinutes,
    scheduledStartMinute,
    status,
  } = value;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    typeof description !== 'string' ||
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
    priority,
    estimatedMinutes: Math.round(estimatedMinutes),
    scheduledStartMinute:
      validSchedule && typeof candidateStart === 'number' ? candidateStart : null,
    status,
    scheduleNeedsReview: !validSchedule,
  };
}

function readTasks(): TaskRecord[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_TASKS.map((task) => ({ ...task }));

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return DEFAULT_TASKS.map((task) => ({ ...task }));

    const tasks: TaskRecord[] = [];
    const seenIds = new Set<string>();
    for (const candidate of parsed) {
      const task = parseTask(candidate);
      if (task === null || seenIds.has(task.id)) continue;
      seenIds.add(task.id);
      tasks.push(task);
      if (tasks.length === MAX_TASKS) break;
    }
    return tasks;
  } catch {
    return DEFAULT_TASKS.map((task) => ({ ...task }));
  }
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
  private timelineSlots!: TimelineSlotElements[];
  private loadSegments!: Array<NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  > | null>;
  private schedulerMessage = '';

  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    const xrButton = panel?.getElementById('xr-button');
    const exitButton = panel?.getElementById('exit-button');
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

    const dashboard = this.world.getSceneObject<UIKitMLAsset>('workspace-dashboard');
    const createButton = dashboard?.getElementById('task-create');
    const summary = dashboard?.getElementById('task-summary');
    const selectedLabel = dashboard?.getElementById('selected-task');
    const workloadValue = dashboard?.getElementById('workload-value');
    const smartStatus = dashboard?.getElementById('smart-status');
    const scheduleStatus = dashboard?.getElementById('schedule-status');
    const scheduleSuggestion = dashboard?.getElementById('schedule-suggestion');
    const scheduleSuggestionButton = dashboard?.getElementById('schedule-apply-suggestion');
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
      smartStatus == null || scheduleStatus == null || scheduleSuggestion == null ||
      scheduleSuggestionButton == null || earlierButton == null || laterButton == null ||
      clearScheduleButton == null || timelineSlots.some((slot) => slot === null) ||
      loadSegments.some((segment) => segment === null)
    ) return;

    this.dashboardSummary = summary;
    this.selectedTaskLabel = selectedLabel;
    this.workloadValue = workloadValue;
    this.smartStatus = smartStatus;
    this.scheduleStatus = scheduleStatus;
    this.scheduleSuggestion = scheduleSuggestion;
    this.scheduleSuggestionButton = scheduleSuggestionButton;
    this.timelineSlots = timelineSlots as TimelineSlotElements[];
    this.loadSegments = loadSegments;
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

    const loadedTasks = readTasks();
    loadedTasks.forEach((task, slot) => {
      this.tasks[slot] = task;
    });

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
      if (
        root == null || priority == null || title == null || description == null ||
        statusButton == null || statusLabelElement == null || selectButton == null ||
        editButton == null || deleteButton == null
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
      };


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
    const clearSchedule = () => this.clearSelectedSchedule();
    earlierButton.name = 'Move selected task 30 minutes earlier';
    laterButton.name = 'Move selected task 30 minutes later';
    scheduleSuggestionButton.name = 'Apply suggested time to selected task';
    clearScheduleButton.name = 'Clear selected task schedule';
    earlierButton.addEventListener('click', moveEarlier);
    laterButton.addEventListener('click', moveLater);
    scheduleSuggestionButton.addEventListener('click', applySuggestion);
    clearScheduleButton.addEventListener('click', clearSchedule);
    this.cleanupFuncs.push(
      () => earlierButton.removeEventListener('click', moveEarlier),
      () => laterButton.removeEventListener('click', moveLater),
      () => scheduleSuggestionButton.removeEventListener('click', applySuggestion),
      () => clearScheduleButton.removeEventListener('click', clearSchedule),
    );
      const selectTask = () => {
        const task = this.tasks[slot];
        if (task === null) return;
        this.selectedTask = task.id;
        this.schedulerMessage = '';
        this.renderTasks();
      };
      const advanceStatus = () => {
        const task = this.tasks[slot];
        if (task === null) return;
        task.status = nextStatus(task.status);
        this.persistTasks();
      };
      const editTask = () => this.editTask(slot);
      const deleteTask = () => this.deleteTask(slot);

      selectButton.addEventListener('click', selectTask);
      statusButton.addEventListener('click', advanceStatus);
      editButton.addEventListener('click', editTask);
      deleteButton.addEventListener('click', deleteTask);
      this.cleanupFuncs.push(
        () => selectButton.removeEventListener('click', selectTask),
        () => statusButton.removeEventListener('click', advanceStatus),
        () => editButton.removeEventListener('click', editTask),
        () => deleteButton.removeEventListener('click', deleteTask),
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
    this.tasks[emptySlot] = { ...task, id: createTaskId(), status: 'todo' };
    this.persistTasks();
  }

  private editTask(slot: number): void {
    const currentTask = this.tasks[slot];
    if (currentTask === null) return;
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
    this.tasks[slot] = { ...updatedTask, id: currentTask.id, status: currentTask.status };
    this.persistTasks();
  }

  private promptTask(current?: TaskRecord): Omit<TaskRecord, 'id' | 'status'> | null {
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

  private findSuggestedStart(task: TaskRecord): number | null {
    for (
      let candidate = WORKDAY_START_MINUTE;
      candidate + task.estimatedMinutes <= WORKDAY_END_MINUTE;
      candidate += 30
    ) {
      const occupied = this.tasks.some((other) =>
        other !== null &&
        other.id !== task.id &&
        other.scheduledStartMinute !== null &&
        schedulesOverlap(
          candidate,
          task.estimatedMinutes,
          other.scheduledStartMinute,
          other.estimatedMinutes,
        ),
      );
      if (!occupied) return candidate;
    }
    return null;
  }

  private applySuggestedSlot(): void {
    const task = this.getSelectedTask();
    if (task === null) {
      this.schedulerMessage = 'Select a task card to get a time suggestion.';
      this.renderTasks();
      return;
    }
    const suggestion = this.findSuggestedStart(task);
    if (suggestion === null) {
      this.schedulerMessage = 'No open slot fits this task. Existing tasks were not moved.';
      this.renderTasks();
      return;
    }
    this.setTaskSchedule(task, suggestion);
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
    if (task === null || !window.confirm(`Delete "${task.title}"?`)) return;
    if (this.selectedTask === task.id) this.selectedTask = null;
    this.tasks[slot] = null;
    this.persistTasks();
  }

  private persistTasks(): void {
    const activeTasks = this.tasks.filter((task): task is TaskRecord => task !== null);
    this.syncTasksToEntities();

    let message = `${activeTasks.length} / ${MAX_TASKS} tasks`;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(activeTasks));
    } catch {
      message = `${message} / storage unavailable`;
    }
    this.renderTasks(message);
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
      entity.setValue(TaskData, 'estimatedMinutes', task?.estimatedMinutes ?? 30);
      entity.setValue(
        TaskData,
        'scheduledStartMinute',
        task?.scheduledStartMinute ?? -1,
      );
      entity.setValue(TaskData, 'status', task?.status ?? 'todo');
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
        text: `${task.priority.toUpperCase()} PRIORITY / ${task.estimatedMinutes} MIN / ${scheduleLabel} / ${taskPhase(task)}`,
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
    }

    const total = this.tasks.filter((task) => task !== null).length;
    const summary = summaryOverride ??
      `${total} / ${MAX_TASKS} tasks  /  ${inProgress} active  /  ${completed} complete`;
    this.dashboardSummary.setProperties({ text: summary });
    const selected = this.tasks.find((task) => task?.id === this.selectedTask);
    this.selectedTaskLabel.setProperties({
      text: selected?.title ?? 'Choose a task card',
    });
    this.renderTimeline();
  }

  private renderTimeline(): void {
    const scheduledTasks = this.tasks.filter(
      (task): task is TaskRecord => task !== null && task.scheduledStartMinute !== null,
    );
    const plannedMinutes = scheduledTasks.reduce(
      (total, task) => total + task.estimatedMinutes,
      0,
    );
    const overCapacity = plannedMinutes > WORKLOAD_CAPACITY_MINUTES;
    const conflictingIds = this.getConflictingTaskIds();
    let conflictCount = 0;
    for (let firstIndex = 0; firstIndex < scheduledTasks.length; firstIndex += 1) {
      const first = scheduledTasks[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < scheduledTasks.length; secondIndex += 1) {
        const second = scheduledTasks[secondIndex];
        if (
          schedulesOverlap(
            first.scheduledStartMinute as number,
            first.estimatedMinutes,
            second.scheduledStartMinute as number,
            second.estimatedMinutes,
          )
        ) conflictCount += 1;
      }
    }

    this.workloadValue.setProperties({
      text: `${formatDuration(plannedMinutes)} planned / 8h capacity`,
      color: overCapacity ? '#ef756d' : '#8ce2d2',
    });
    this.loadSegments.forEach((segment, index) => {
      if (segment === null) return;
      const filled = plannedMinutes >= (index + 1) * 60;
      segment.setProperties({
        backgroundColor: overCapacity
          ? '#a64848'
          : filled
            ? '#53cbb5'
            : '#34434c',
      });
    });

    const selected = this.getSelectedTask();
    this.timelineSlots.forEach((timelineSlot, index) => {
      const startMinute = TIMELINE_STARTS[index];
      const endMinute = startMinute + TIMELINE_BAND_MINUTES;
      const bandTasks = scheduledTasks.filter((task) =>
        (task.scheduledStartMinute as number) >= startMinute &&
        (task.scheduledStartMinute as number) < endMinute,
      );
      const hasConflict = bandTasks.some((task) => conflictingIds.has(task.id));
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
    const conflictLabel = conflictCount === 0
      ? 'NO SCHEDULING CONFLICTS'
      : `${conflictCount} SCHEDULING CONFLICT${conflictCount === 1 ? '' : 'S'}`;
    const capacityLabel = overCapacity
      ? `OVER CAPACITY BY ${formatDuration(plannedMinutes - WORKLOAD_CAPACITY_MINUTES)}`
      : `${formatDuration(plannedMinutes)} / 8h WORK CAPACITY`;
    this.smartStatus.setProperties({
      text: `${conflictLabel} / ${capacityLabel}${reviewCount > 0 ? ` / ${reviewCount} SCHEDULE REVIEW` : ''}`,
      color: overCapacity || conflictCount > 0 || reviewCount > 0 ? '#ef756d' : '#8ce2d2',
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

    const suggestedStart = selected === null ? null : this.findSuggestedStart(selected);
    this.scheduleSuggestion.setProperties({
      text: selected === null
        ? 'Select a task for a slot suggestion'
        : suggestedStart === null
          ? 'NO OPEN SLOT FITS'
          : `NEXT OPEN ${formatTime(suggestedStart)}-${formatTime(suggestedStart + selected.estimatedMinutes)}`,
    });
    this.scheduleSuggestionButton.name = selected !== null && suggestedStart !== null
      ? `Apply suggested time ${formatTime(suggestedStart)} for ${selected.title}`
      : 'No suggested time available';
  }
}
