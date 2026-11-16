import type {
  Action,
  ActionDefinition,
  AppState,
  PanelState,
  RiskLevel,
  StickyNote,
  ThemeState,
} from './types.ts';
import type { GlassTask, TaskPriority } from '../glass-data-adapters.ts';

const WORKDAY_START = 8 * 60; // 08:00 = 480
const WORKDAY_END = 18 * 60; // 18:00 = 1080
const MIN_DURATION = 5;
const MAX_DURATION = 480;

export const actionDefinitions: Record<string, ActionDefinition> = {
  'task.create': {
    validate(params: { task: GlassTask }, state: AppState) {
      if (!params.task || !params.task.title?.trim()) {
        return { valid: false, reason: 'Task title cannot be empty' };
      }
      if (params.task.estimatedMinutes < MIN_DURATION || params.task.estimatedMinutes > MAX_DURATION) {
        return { valid: false, reason: `Duration must be between ${MIN_DURATION}m and ${MAX_DURATION}m` };
      }
      if (params.task.scheduledStartMinute !== null) {
        if (params.task.scheduledStartMinute < WORKDAY_START || params.task.scheduledStartMinute > WORKDAY_END) {
          return { valid: false, reason: 'Start time outside workday hours (08:00 to 18:00)' };
        }
      }
      return { valid: true };
    },
    apply(params: { task: GlassTask }, state: AppState) {
      const existing = state.tasks.find((t) => t.id === params.task.id);
      const newTask = existing ? { ...params.task, id: `${params.task.id}-${Date.now()}` } : { ...params.task };
      const nextTasks = [...state.tasks, newTask];
      const inverse: Action = {
        name: 'task.delete',
        params: { id: newTask.id },
        describe: () => `Delete created task "${newTask.title}"`,
        riskLevel: 'SAFE',
        visualTarget: 'tasks',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'task.update': {
    validate(params: { id: string; changes: Partial<GlassTask> }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      if (params.changes.estimatedMinutes !== undefined) {
        if (params.changes.estimatedMinutes < MIN_DURATION || params.changes.estimatedMinutes > MAX_DURATION) {
          return { valid: false, reason: `Duration must be between ${MIN_DURATION}m and ${MAX_DURATION}m` };
        }
      }
      return { valid: true };
    },
    apply(params: { id: string; changes: Partial<GlassTask> }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const prevChanges: Partial<GlassTask> = {};
      for (const k of Object.keys(params.changes) as (keyof GlassTask)[]) {
        (prevChanges as any)[k] = task[k];
      }
      const nextTasks = state.tasks.map((t) => (t.id === params.id ? { ...t, ...params.changes } : t));
      const inverse: Action = {
        name: 'task.update',
        params: { id: params.id, changes: prevChanges },
        describe: () => `Revert updates to "${task.title}"`,
        riskLevel: 'SAFE',
        visualTarget: 'tasks',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'task.delete': {
    validate(params: { id: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      return { valid: true };
    },
    apply(params: { id: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const nextTasks = state.tasks.filter((t) => t.id !== params.id);
      const inverse: Action = {
        name: 'task.create',
        params: { task },
        describe: () => `Restore deleted task "${task.title}"`,
        riskLevel: 'SAFE',
        visualTarget: 'tasks',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'task.complete': {
    validate(params: { id: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      return { valid: true };
    },
    apply(params: { id: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const nextTasks = state.tasks.map((t) => (t.id === params.id ? { ...t, status: 'completed' as const } : t));
      const inverse: Action = {
        name: 'task.reopen',
        params: { id: params.id },
        describe: () => `Reopen completed task "${task.title}"`,
        riskLevel: 'SAFE',
        visualTarget: 'tasks',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'task.reopen': {
    validate(params: { id: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      return { valid: true };
    },
    apply(params: { id: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const nextTasks = state.tasks.map((t) => (t.id === params.id ? { ...t, status: 'todo' as const } : t));
      const inverse: Action = {
        name: 'task.complete',
        params: { id: params.id },
        describe: () => `Mark task "${task.title}" complete`,
        riskLevel: 'SAFE',
        visualTarget: 'tasks',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'task.setPriority': {
    validate(params: { id: string; priority: TaskPriority }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      return { valid: true };
    },
    apply(params: { id: string; priority: TaskPriority }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const prevPriority = task.priority;
      const nextTasks = state.tasks.map((t) => (t.id === params.id ? { ...t, priority: params.priority } : t));
      const inverse: Action = {
        name: 'task.setPriority',
        params: { id: params.id, priority: prevPriority },
        describe: () => `Revert priority of "${task.title}" to ${prevPriority}`,
        riskLevel: 'SAFE',
        visualTarget: 'tasks',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'task.setDuration': {
    validate(params: { id: string; estimatedMinutes: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      if (params.estimatedMinutes < MIN_DURATION || params.estimatedMinutes > MAX_DURATION) {
        return { valid: false, reason: `Duration must be between ${MIN_DURATION}m and ${MAX_DURATION}m` };
      }
      return { valid: true };
    },
    apply(params: { id: string; estimatedMinutes: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const prevDuration = task.estimatedMinutes;
      const nextTasks = state.tasks.map((t) =>
        t.id === params.id ? { ...t, estimatedMinutes: params.estimatedMinutes } : t,
      );
      const inverse: Action = {
        name: 'task.setDuration',
        params: { id: params.id, estimatedMinutes: prevDuration },
        describe: () => `Revert duration of "${task.title}" to ${prevDuration}m`,
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'task.duplicate': {
    validate(params: { id: string; newId?: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      return { valid: true };
    },
    apply(params: { id: string; newId?: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const copyId = params.newId || `${task.id}-copy-${Date.now()}`;
      const copyTask: GlassTask = {
        ...task,
        id: copyId,
        title: `${task.title} (Copy)`,
        scheduledStartMinute: null,
      };
      const nextTasks = [...state.tasks, copyTask];
      const inverse: Action = {
        name: 'task.delete',
        params: { id: copyId },
        describe: () => `Delete duplicate task "${copyTask.title}"`,
        riskLevel: 'SAFE',
        visualTarget: 'tasks',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'task.split': {
    validate(params: { id: string; part1Minutes: number; part2Minutes: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      if (params.part1Minutes < MIN_DURATION || params.part2Minutes < MIN_DURATION) {
        return { valid: false, reason: `Each part must be at least ${MIN_DURATION} minutes` };
      }
      return { valid: true };
    },
    apply(params: { id: string; part1Minutes: number; part2Minutes: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const part1: GlassTask = {
        ...task,
        id: `${task.id}-p1`,
        title: `${task.title} (Part 1)`,
        estimatedMinutes: params.part1Minutes,
      };
      const part2: GlassTask = {
        ...task,
        id: `${task.id}-p2`,
        title: `${task.title} (Part 2)`,
        estimatedMinutes: params.part2Minutes,
        scheduledStartMinute: task.scheduledStartMinute ? task.scheduledStartMinute + params.part1Minutes : null,
      };
      const nextTasks = state.tasks.filter((t) => t.id !== params.id).concat([part1, part2]);
      const inverse: Action = {
        name: 'task.merge',
        params: { id1: part1.id, id2: part2.id, originalTask: task },
        describe: () => `Re-merge split parts of "${task.title}"`,
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'task.merge': {
    validate(params: { id1: string; id2: string; originalTask?: GlassTask }, state: AppState) {
      const t1 = state.tasks.find((t) => t.id === params.id1);
      const t2 = state.tasks.find((t) => t.id === params.id2);
      if (!t1 || !t2) return { valid: false, reason: 'Both tasks to merge must exist' };
      return { valid: true };
    },
    apply(params: { id1: string; id2: string; originalTask?: GlassTask }, state: AppState) {
      const t1 = state.tasks.find((t) => t.id === params.id1)!;
      const t2 = state.tasks.find((t) => t.id === params.id2)!;
      const merged: GlassTask = params.originalTask || {
        ...t1,
        id: `${t1.id}-merged`,
        title: t1.title.replace(/\s*\(Part 1\)/i, ''),
        estimatedMinutes: t1.estimatedMinutes + t2.estimatedMinutes,
      };
      const nextTasks = state.tasks.filter((t) => t.id !== params.id1 && t.id !== params.id2).concat([merged]);
      const inverse: Action = {
        name: 'task.split',
        params: { id: merged.id, part1Minutes: t1.estimatedMinutes, part2Minutes: t2.estimatedMinutes },
        describe: () => `Split merged task back into "${t1.title}" and "${t2.title}"`,
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.place': {
    validate(params: { id: string; startMinute: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      if (params.startMinute < WORKDAY_START || params.startMinute > WORKDAY_END) {
        return { valid: false, reason: 'Placement outside workday range (08:00 to 18:00)' };
      }
      return { valid: true };
    },
    apply(params: { id: string; startMinute: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const prevMinute = task.scheduledStartMinute;
      const nextTasks = state.tasks.map((t) =>
        t.id === params.id ? { ...t, scheduledStartMinute: params.startMinute } : t,
      );
      const inverse: Action =
        prevMinute === null
          ? {
              name: 'schedule.unschedule',
              params: { id: params.id },
              describe: () => `Unschedule "${task.title}"`,
              riskLevel: 'SAFE',
              visualTarget: 'schedule',
            }
          : {
              name: 'schedule.place',
              params: { id: params.id, startMinute: prevMinute },
              describe: () => `Return "${task.title}" to previous time`,
              riskLevel: 'SAFE',
              visualTarget: 'schedule',
            };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.move': {
    validate(params: { id: string; deltaMinutes: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      if (task.scheduledStartMinute === null) return { valid: false, reason: 'Task is not scheduled' };
      const newStart = task.scheduledStartMinute + params.deltaMinutes;
      if (newStart < WORKDAY_START || newStart > WORKDAY_END) {
        return { valid: false, reason: 'Move results in time outside workday range' };
      }
      return { valid: true };
    },
    apply(params: { id: string; deltaMinutes: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const newStart = task.scheduledStartMinute! + params.deltaMinutes;
      const nextTasks = state.tasks.map((t) => (t.id === params.id ? { ...t, scheduledStartMinute: newStart } : t));
      const inverse: Action = {
        name: 'schedule.move',
        params: { id: params.id, deltaMinutes: -params.deltaMinutes },
        describe: () => `Move "${task.title}" back by ${params.deltaMinutes}m`,
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.resize': {
    validate(params: { id: string; newDuration: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      if (params.newDuration < MIN_DURATION || params.newDuration > MAX_DURATION) {
        return { valid: false, reason: `Duration must be between ${MIN_DURATION}m and ${MAX_DURATION}m` };
      }
      return { valid: true };
    },
    apply(params: { id: string; newDuration: number }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const prevDuration = task.estimatedMinutes;
      const nextTasks = state.tasks.map((t) =>
        t.id === params.id ? { ...t, estimatedMinutes: params.newDuration } : t,
      );
      const inverse: Action = {
        name: 'schedule.resize',
        params: { id: params.id, newDuration: prevDuration },
        describe: () => `Revert duration of "${task.title}" to ${prevDuration}m`,
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.unschedule': {
    validate(params: { id: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id);
      if (!task) return { valid: false, reason: `Task ${params.id} not found` };
      return { valid: true };
    },
    apply(params: { id: string }, state: AppState) {
      const task = state.tasks.find((t) => t.id === params.id)!;
      const prevMinute = task.scheduledStartMinute;
      const nextTasks = state.tasks.map((t) => (t.id === params.id ? { ...t, scheduledStartMinute: null } : t));
      const inverse: Action = {
        name: 'schedule.place',
        params: { id: params.id, startMinute: prevMinute ?? WORKDAY_START },
        describe: () => `Reschedule "${task.title}"`,
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.swap': {
    validate(params: { idA: string; idB: string }, state: AppState) {
      const a = state.tasks.find((t) => t.id === params.idA);
      const b = state.tasks.find((t) => t.id === params.idB);
      if (!a || !b) return { valid: false, reason: 'Both tasks must exist to swap' };
      if (a.scheduledStartMinute === null || b.scheduledStartMinute === null) {
        return { valid: false, reason: 'Both tasks must be scheduled to swap' };
      }
      return { valid: true };
    },
    apply(params: { idA: string; idB: string }, state: AppState) {
      const a = state.tasks.find((t) => t.id === params.idA)!;
      const b = state.tasks.find((t) => t.id === params.idB)!;
      const nextTasks = state.tasks.map((t) => {
        if (t.id === params.idA) return { ...t, scheduledStartMinute: b.scheduledStartMinute };
        if (t.id === params.idB) return { ...t, scheduledStartMinute: a.scheduledStartMinute };
        return t;
      });
      const inverse: Action = {
        name: 'schedule.swap',
        params: { idA: params.idA, idB: params.idB },
        describe: () => `Swap "${a.title}" and "${b.title}" back`,
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.shiftAll': {
    validate(params: { deltaMinutes: number; afterMinute?: number }, state: AppState) {
      if (params.deltaMinutes === 0) return { valid: false, reason: 'Delta must be non-zero' };
      return { valid: true };
    },
    apply(params: { deltaMinutes: number; afterMinute?: number }, state: AppState) {
      const threshold = params.afterMinute ?? 0;
      const prevPositions: Record<string, number | null> = {};
      const nextTasks = state.tasks.map((t) => {
        if (t.scheduledStartMinute !== null && t.scheduledStartMinute >= threshold) {
          prevPositions[t.id] = t.scheduledStartMinute;
          const shifted = Math.max(WORKDAY_START, Math.min(WORKDAY_END, t.scheduledStartMinute + params.deltaMinutes));
          return { ...t, scheduledStartMinute: shifted };
        }
        return t;
      });
      const inverse: Action = {
        name: 'schedule.shiftAll',
        params: { deltaMinutes: -params.deltaMinutes, afterMinute: params.afterMinute },
        describe: () => `Shift all tasks back by ${params.deltaMinutes}m`,
        riskLevel: 'BULK',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.clearRange': {
    validate(params: { startMinute: number; endMinute: number }, state: AppState) {
      if (params.startMinute >= params.endMinute) {
        return { valid: false, reason: 'startMinute must be before endMinute' };
      }
      return { valid: true };
    },
    apply(params: { startMinute: number; endMinute: number }, state: AppState) {
      const clearedTasks: Record<string, number> = {};
      const nextTasks = state.tasks.map((t) => {
        if (
          t.scheduledStartMinute !== null &&
          t.scheduledStartMinute >= params.startMinute &&
          t.scheduledStartMinute < params.endMinute
        ) {
          clearedTasks[t.id] = t.scheduledStartMinute;
          return { ...t, scheduledStartMinute: null };
        }
        return t;
      });
      const inverse: Action = {
        name: 'schedule.restorePlacements',
        params: { placements: clearedTasks },
        describe: () => `Restore cleared schedule range (${params.startMinute} to ${params.endMinute})`,
        riskLevel: 'BULK',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.restorePlacements': {
    validate(params: { placements: Record<string, number> }, state: AppState) {
      return { valid: true };
    },
    apply(params: { placements: Record<string, number> }, state: AppState) {
      const nextTasks = state.tasks.map((t) => {
        if (params.placements[t.id] !== undefined) {
          return { ...t, scheduledStartMinute: params.placements[t.id] };
        }
        return t;
      });
      const inverse: Action = {
        name: 'schedule.clearRange',
        params: { startMinute: 0, endMinute: 24 * 60 },
        describe: () => 'Unschedule restored tasks',
        riskLevel: 'BULK',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.compact': {
    validate(params: { gapMinutes?: number }, state: AppState) {
      return { valid: true };
    },
    apply(params: { gapMinutes?: number }, state: AppState) {
      const gap = params.gapMinutes ?? 10;
      const scheduled = state.tasks
        .filter((t) => t.scheduledStartMinute !== null)
        .sort((a, b) => a.scheduledStartMinute! - b.scheduledStartMinute!);
      const prevPlacements: Record<string, number> = {};
      scheduled.forEach((t) => {
        prevPlacements[t.id] = t.scheduledStartMinute!;
      });

      let currentMin = WORKDAY_START;
      const newPlacements: Record<string, number> = {};
      scheduled.forEach((t) => {
        newPlacements[t.id] = currentMin;
        currentMin += t.estimatedMinutes + gap;
      });

      const nextTasks = state.tasks.map((t) =>
        newPlacements[t.id] !== undefined ? { ...t, scheduledStartMinute: newPlacements[t.id] } : t,
      );
      const inverse: Action = {
        name: 'schedule.restorePlacements',
        params: { placements: prevPlacements },
        describe: () => 'Undo compact schedule',
        riskLevel: 'BULK',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.addBreak': {
    validate(params: { startMinute: number; durationMinutes: number }, state: AppState) {
      if (params.durationMinutes < 5) return { valid: false, reason: 'Break must be at least 5 minutes' };
      return { valid: true };
    },
    apply(params: { startMinute: number; durationMinutes: number }, state: AppState) {
      const breakTask: GlassTask = {
        id: `break-${Date.now()}`,
        title: 'Rest & Guided Breathing',
        priority: 'low',
        estimatedMinutes: params.durationMinutes,
        scheduledStartMinute: params.startMinute,
        status: 'todo',
        description: 'wellness',
      };
      const nextTasks = [...state.tasks, breakTask];
      const inverse: Action = {
        name: 'task.delete',
        params: { id: breakTask.id },
        describe: () => 'Remove added break',
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.autoPlan': {
    validate(params: { startMinute?: number; breakMinutes?: number }, state: AppState) {
      return { valid: true };
    },
    apply(params: { startMinute?: number; breakMinutes?: number }, state: AppState) {
      const start = params.startMinute ?? WORKDAY_START;
      const breakMin = params.breakMinutes ?? 15;
      const prevPlacements: Record<string, number | null> = {};
      state.tasks.forEach((t) => {
        prevPlacements[t.id] = t.scheduledStartMinute;
      });

      // Prioritize high then medium then low
      const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
      const sorted = [...state.tasks]
        .filter((t) => t.status !== 'completed')
        .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      let cur = start;
      const newPlacements: Record<string, number> = {};
      for (const t of sorted) {
        if (cur + t.estimatedMinutes <= WORKDAY_END) {
          newPlacements[t.id] = cur;
          cur += t.estimatedMinutes + breakMin;
        }
      }

      const nextTasks = state.tasks.map((t) =>
        newPlacements[t.id] !== undefined ? { ...t, scheduledStartMinute: newPlacements[t.id] } : t,
      );
      const inverse: Action = {
        name: 'schedule.restorePlacements',
        params: { placements: prevPlacements },
        describe: () => 'Undo auto-plan my day',
        riskLevel: 'BULK',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'schedule.protectRange': {
    validate(params: { startMinute: number; endMinute: number; label?: string }, state: AppState) {
      return { valid: true };
    },
    apply(params: { startMinute: number; endMinute: number; label?: string }, state: AppState) {
      const protectTask: GlassTask = {
        id: `protect-${Date.now()}`,
        title: params.label || 'Protected Focus Block',
        priority: 'high',
        estimatedMinutes: params.endMinute - params.startMinute,
        scheduledStartMinute: params.startMinute,
        status: 'todo',
        description: 'deep-work',
      };
      const nextTasks = [...state.tasks, protectTask];
      const inverse: Action = {
        name: 'task.delete',
        params: { id: protectTask.id },
        describe: () => 'Remove protected range',
        riskLevel: 'SAFE',
        visualTarget: 'schedule',
      };
      return {
        nextState: { ...state, tasks: nextTasks },
        inverse,
      };
    },
  },

  'focus.start': {
    validate(params: { durationMinutes?: number }, state: AppState) {
      return { valid: true };
    },
    apply(params: { durationMinutes?: number }, state: AppState) {
      const durSec = (params.durationMinutes ?? 25) * 60;
      const prevFocus = { ...state.focus };
      const nextFocus = {
        ...state.focus,
        totalSeconds: durSec,
        remainingSeconds: durSec,
        isRunning: true,
        mode: 'focus' as const,
      };
      const inverse: Action = {
        name: 'focus.restore',
        params: { previous: prevFocus },
        describe: () => 'Revert focus session start',
        riskLevel: 'SAFE',
        visualTarget: 'focus',
      };
      return {
        nextState: { ...state, focus: nextFocus },
        inverse,
      };
    },
  },

  'focus.pause': {
    validate(params: {}, state: AppState) {
      return { valid: true };
    },
    apply(params: {}, state: AppState) {
      const prev = state.focus.isRunning;
      const nextFocus = { ...state.focus, isRunning: false };
      const inverse: Action = {
        name: 'focus.updateRunning',
        params: { isRunning: prev },
        describe: () => 'Resume focus session',
        riskLevel: 'SAFE',
        visualTarget: 'focus',
      };
      return {
        nextState: { ...state, focus: nextFocus },
        inverse,
      };
    },
  },

  'focus.resume': {
    validate(params: {}, state: AppState) {
      return { valid: true };
    },
    apply(params: {}, state: AppState) {
      const prev = state.focus.isRunning;
      const nextFocus = { ...state.focus, isRunning: true };
      const inverse: Action = {
        name: 'focus.updateRunning',
        params: { isRunning: prev },
        describe: () => 'Pause focus session',
        riskLevel: 'SAFE',
        visualTarget: 'focus',
      };
      return {
        nextState: { ...state, focus: nextFocus },
        inverse,
      };
    },
  },

  'focus.stop': {
    validate(params: {}, state: AppState) {
      return { valid: true };
    },
    apply(params: {}, state: AppState) {
      const prev = { ...state.focus };
      const nextFocus = {
        ...state.focus,
        isRunning: false,
        remainingSeconds: state.focus.totalSeconds,
      };
      const inverse: Action = {
        name: 'focus.restore',
        params: { previous: prev },
        describe: () => 'Restore focus session',
        riskLevel: 'SAFE',
        visualTarget: 'focus',
      };
      return {
        nextState: { ...state, focus: nextFocus },
        inverse,
      };
    },
  },

  'focus.setLength': {
    validate(params: { durationMinutes: number }, state: AppState) {
      if (params.durationMinutes < 1 || params.durationMinutes > 180) {
        return { valid: false, reason: 'Duration must be between 1 and 180 minutes' };
      }
      return { valid: true };
    },
    apply(params: { durationMinutes: number }, state: AppState) {
      const prevTotal = state.focus.totalSeconds;
      const newTotal = params.durationMinutes * 60;
      const nextFocus = {
        ...state.focus,
        totalSeconds: newTotal,
        remainingSeconds: newTotal,
      };
      const inverse: Action = {
        name: 'focus.setLength',
        params: { durationMinutes: Math.round(prevTotal / 60) },
        describe: () => `Revert focus length to ${Math.round(prevTotal / 60)}m`,
        riskLevel: 'SAFE',
        visualTarget: 'focus',
      };
      return {
        nextState: { ...state, focus: nextFocus },
        inverse,
      };
    },
  },

  'focus.updateRunning': {
    validate(params: { isRunning: boolean }, state: AppState) {
      return { valid: true };
    },
    apply(params: { isRunning: boolean }, state: AppState) {
      const prev = state.focus.isRunning;
      const nextFocus = { ...state.focus, isRunning: params.isRunning };
      const inverse: Action = {
        name: 'focus.updateRunning',
        params: { isRunning: prev },
        describe: () => 'Toggle focus running state',
        riskLevel: 'SAFE',
        visualTarget: 'focus',
      };
      return {
        nextState: { ...state, focus: nextFocus },
        inverse,
      };
    },
  },

  'focus.restore': {
    validate(params: { previous: any }, state: AppState) {
      return { valid: true };
    },
    apply(params: { previous: any }, state: AppState) {
      const prev = { ...state.focus };
      const inverse: Action = {
        name: 'focus.restore',
        params: { previous: prev },
        describe: () => 'Restore focus state',
        riskLevel: 'SAFE',
        visualTarget: 'focus',
      };
      return {
        nextState: { ...state, focus: { ...params.previous } },
        inverse,
      };
    },
  },

  'ui.openPanel': {
    validate(params: { panelId: string }, state: AppState) {
      return { valid: true };
    },
    apply(params: { panelId: string }, state: AppState) {
      const prevVisible = state.panels[params.panelId]?.visible ?? false;
      const nextPanels = {
        ...state.panels,
        [params.panelId]: {
          ...(state.panels[params.panelId] || {
            id: params.panelId,
            position: [0, 1.48, -0.7],
            rotationDeg: [0, 0, 0],
            scale: 0.1,
            isZoomed: false,
          }),
          visible: true,
        },
      };
      const inverse: Action = {
        name: 'ui.closePanel',
        params: { panelId: params.panelId },
        describe: () => `Close panel "${params.panelId}"`,
        riskLevel: 'SAFE',
        visualTarget: params.panelId,
      };
      return {
        nextState: { ...state, panels: nextPanels },
        inverse,
      };
    },
  },

  'ui.closePanel': {
    validate(params: { panelId: string }, state: AppState) {
      return { valid: true };
    },
    apply(params: { panelId: string }, state: AppState) {
      const nextPanels = {
        ...state.panels,
        [params.panelId]: {
          ...state.panels[params.panelId],
          visible: false,
        },
      };
      const inverse: Action = {
        name: 'ui.openPanel',
        params: { panelId: params.panelId },
        describe: () => `Re-open panel "${params.panelId}"`,
        riskLevel: 'SAFE',
        visualTarget: params.panelId,
      };
      return {
        nextState: { ...state, panels: nextPanels },
        inverse,
      };
    },
  },

  'ui.movePanel': {
    validate(
      params: { panelId: string; position: [number, number, number]; rotationDeg?: [number, number, number] },
      state: AppState,
    ) {
      return { valid: true };
    },
    apply(
      params: { panelId: string; position: [number, number, number]; rotationDeg?: [number, number, number] },
      state: AppState,
    ) {
      const prev = state.panels[params.panelId];
      const prevPos = prev?.position || [0, 1.48, -0.7];
      const prevRot = prev?.rotationDeg || [0, 0, 0];
      const nextPanels = {
        ...state.panels,
        [params.panelId]: {
          ...(prev || { id: params.panelId, visible: true, scale: 0.1, isZoomed: false }),
          position: params.position,
          rotationDeg: params.rotationDeg || prevRot,
        },
      };
      const inverse: Action = {
        name: 'ui.movePanel',
        params: { panelId: params.panelId, position: prevPos, rotationDeg: prevRot },
        describe: () => `Move panel "${params.panelId}" back`,
        riskLevel: 'SAFE',
        visualTarget: params.panelId,
      };
      return {
        nextState: { ...state, panels: nextPanels },
        inverse,
      };
    },
  },

  'ui.arrange': {
    validate(params: { preset: 'Arc' | 'Spread' | 'Stack' | 'Focus' | 'Wall' }, state: AppState) {
      return { valid: true };
    },
    apply(params: { preset: 'Arc' | 'Spread' | 'Stack' | 'Focus' | 'Wall' }, state: AppState) {
      const prevPreset = state.activeArrangePreset;
      const inverse: Action = {
        name: 'ui.arrange',
        params: { preset: prevPreset },
        describe: () => `Restore arrange preset to ${prevPreset}`,
        riskLevel: 'SAFE',
        visualTarget: 'hub',
      };
      return {
        nextState: { ...state, activeArrangePreset: params.preset },
        inverse,
      };
    },
  },

  'ui.zoom': {
    validate(params: { panelId: string; zoom: boolean }, state: AppState) {
      return { valid: true };
    },
    apply(params: { panelId: string; zoom: boolean }, state: AppState) {
      const prevZoom = state.panels[params.panelId]?.isZoomed ?? false;
      const nextPanels = {
        ...state.panels,
        [params.panelId]: {
          ...(state.panels[params.panelId] || {
            id: params.panelId,
            visible: true,
            position: [0, 1.48, -0.7],
            rotationDeg: [0, 0, 0],
            scale: 0.1,
          }),
          isZoomed: params.zoom,
        },
      };
      const inverse: Action = {
        name: 'ui.zoom',
        params: { panelId: params.panelId, zoom: prevZoom },
        describe: () => `Toggle zoom on "${params.panelId}"`,
        riskLevel: 'SAFE',
        visualTarget: params.panelId,
      };
      return {
        nextState: { ...state, panels: nextPanels },
        inverse,
      };
    },
  },

  'ui.highlight': {
    validate(params: { targetId: string; durationMs?: number }, state: AppState) {
      return { valid: true };
    },
    apply(params: { targetId: string; durationMs?: number }, state: AppState) {
      const inverse: Action = {
        name: 'ui.highlight',
        params: { targetId: '' },
        describe: () => 'Clear highlight',
        riskLevel: 'SAFE',
        visualTarget: 'hub',
      };
      return {
        nextState: { ...state },
        inverse,
      };
    },
  },

  'theme.set': {
    validate(params: { name?: ThemeState['name']; opacity?: number; highContrast?: boolean }, state: AppState) {
      return { valid: true };
    },
    apply(params: { name?: ThemeState['name']; opacity?: number; highContrast?: boolean }, state: AppState) {
      const prevTheme = { ...state.theme };
      const nextTheme: ThemeState = {
        name: params.name ?? state.theme.name,
        glassOpacity: params.opacity ?? state.theme.glassOpacity,
        highContrast: params.highContrast ?? state.theme.highContrast,
      };
      const inverse: Action = {
        name: 'theme.set',
        params: { name: prevTheme.name, opacity: prevTheme.glassOpacity, highContrast: prevTheme.highContrast },
        describe: () => `Revert theme to ${prevTheme.name}`,
        riskLevel: 'SAFE',
        visualTarget: 'hub',
      };
      return {
        nextState: { ...state, theme: nextTheme },
        inverse,
      };
    },
  },

  'note.create': {
    validate(params: { note: StickyNote }, state: AppState) {
      if (!params.note?.text?.trim()) return { valid: false, reason: 'Note text cannot be empty' };
      return { valid: true };
    },
    apply(params: { note: StickyNote }, state: AppState) {
      const nextNotes = [...state.notes, params.note];
      const inverse: Action = {
        name: 'note.remove',
        params: { id: params.note.id },
        describe: () => `Delete sticky note "${params.note.text.slice(0, 20)}"`,
        riskLevel: 'SAFE',
        visualTarget: 'notes',
      };
      return {
        nextState: { ...state, notes: nextNotes },
        inverse,
      };
    },
  },

  'note.remove': {
    validate(params: { id: string }, state: AppState) {
      const note = state.notes.find((n) => n.id === params.id);
      if (!note) return { valid: false, reason: `Note ${params.id} not found` };
      return { valid: true };
    },
    apply(params: { id: string }, state: AppState) {
      const note = state.notes.find((n) => n.id === params.id)!;
      const nextNotes = state.notes.filter((n) => n.id !== params.id);
      const inverse: Action = {
        name: 'note.create',
        params: { note },
        describe: () => `Restore sticky note "${note.text.slice(0, 20)}"`,
        riskLevel: 'SAFE',
        visualTarget: 'notes',
      };
      return {
        nextState: { ...state, notes: nextNotes },
        inverse,
      };
    },
  },

  'query.day': {
    validate() {
      return { valid: true };
    },
    apply(params: {}, state: AppState) {
      const totalTasks = state.tasks.length;
      const completed = state.tasks.filter((t) => t.status === 'completed').length;
      const scheduled = state.tasks.filter((t) => t.scheduledStartMinute !== null).length;
      const totalMinutes = state.tasks.reduce(
        (sum, t) => sum + (t.status !== 'completed' ? t.estimatedMinutes : 0),
        0,
      );
      const hours = (totalMinutes / 60).toFixed(1);
      const answer = `You have ${totalTasks} tasks today (${completed} done, ${scheduled} scheduled). Total planned remaining: ${hours}h.`;
      const inverse: Action = {
        name: 'query.clear',
        params: {},
        describe: () => 'Clear query output',
        riskLevel: 'SAFE',
        visualTarget: 'pip',
      };
      return {
        nextState: {
          ...state,
          lastQuery: { type: 'day', answer, timestamp: Date.now() },
        },
        inverse,
      };
    },
  },

  'query.overload': {
    validate() {
      return { valid: true };
    },
    apply(params: {}, state: AppState) {
      const totalMinutes = state.tasks.reduce(
        (sum, t) => sum + (t.status !== 'completed' ? t.estimatedMinutes : 0),
        0,
      );
      const capacityMinutes = 8 * 60; // 480m
      const percent = Math.round((totalMinutes / capacityMinutes) * 100);
      let answer: string;
      if (percent > 100) {
        answer = `Overloaded at ${percent}% capacity (${(totalMinutes / 60).toFixed(1)}h planned for 8h workday). I recommend moving 1 or 2 tasks to tomorrow.`;
      } else if (percent >= 75) {
        answer = `Balanced at ${percent}% capacity (${(totalMinutes / 60).toFixed(1)}h planned). Great pace!`;
      } else {
        answer = `Light day at ${percent}% capacity (${(totalMinutes / 60).toFixed(1)}h planned). You have plenty of breathing room.`;
      }
      const inverse: Action = {
        name: 'query.clear',
        params: {},
        describe: () => 'Clear query output',
        riskLevel: 'SAFE',
        visualTarget: 'pip',
      };
      return {
        nextState: {
          ...state,
          lastQuery: { type: 'overload', answer, data: { percent, totalMinutes }, timestamp: Date.now() },
        },
        inverse,
      };
    },
  },

  'query.next': {
    validate() {
      return { valid: true };
    },
    apply(params: {}, state: AppState) {
      const pending = state.tasks.filter((t) => t.status !== 'completed');
      let answer: string;
      if (pending.length === 0) {
        answer = "All tasks are complete! Great job today.";
      } else {
        // High priority or first scheduled
        const next =
          pending.find((t) => t.priority === 'high' && t.scheduledStartMinute !== null) ||
          pending.find((t) => t.scheduledStartMinute !== null) ||
          pending[0];
        answer = `Up next: "${next.title}" (${next.estimatedMinutes}m, ${next.priority} priority).`;
      }
      const inverse: Action = {
        name: 'query.clear',
        params: {},
        describe: () => 'Clear query output',
        riskLevel: 'SAFE',
        visualTarget: 'pip',
      };
      return {
        nextState: {
          ...state,
          lastQuery: { type: 'next', answer, timestamp: Date.now() },
        },
        inverse,
      };
    },
  },

  'query.stats': {
    validate() {
      return { valid: true };
    },
    apply(params: {}, state: AppState) {
      const completed = state.tasks.filter((t) => t.status === 'completed').length;
      const focusSessions = state.focus.completedSessions;
      const answer = `Completed ${completed} tasks and ${focusSessions} focus sessions today. Current streak: 7 days.`;
      const inverse: Action = {
        name: 'query.clear',
        params: {},
        describe: () => 'Clear query output',
        riskLevel: 'SAFE',
        visualTarget: 'pip',
      };
      return {
        nextState: {
          ...state,
          lastQuery: { type: 'stats', answer, timestamp: Date.now() },
        },
        inverse,
      };
    },
  },

  'query.find': {
    validate(params: { keyword: string }, state: AppState) {
      return { valid: true };
    },
    apply(params: { keyword: string }, state: AppState) {
      const kw = params.keyword.toLowerCase();
      const matches = state.tasks.filter(
        (t) => t.title.toLowerCase().includes(kw) || t.description?.toLowerCase().includes(kw),
      );
      const answer =
        matches.length > 0
          ? `Found ${matches.length} matching task(s): ${matches.map((m) => `"${m.title}"`).join(', ')}.`
          : `No tasks found matching "${params.keyword}".`;
      const inverse: Action = {
        name: 'query.clear',
        params: {},
        describe: () => 'Clear query output',
        riskLevel: 'SAFE',
        visualTarget: 'pip',
      };
      return {
        nextState: {
          ...state,
          lastQuery: { type: 'find', answer, data: matches, timestamp: Date.now() },
        },
        inverse,
      };
    },
  },

  'query.clear': {
    validate() {
      return { valid: true };
    },
    apply(params: {}, state: AppState) {
      const inverse: Action = {
        name: 'query.clear',
        params: {},
        describe: () => 'Clear query output',
        riskLevel: 'SAFE',
        visualTarget: 'pip',
      };
      return {
        nextState: { ...state, lastQuery: null },
        inverse,
      };
    },
  },
};
