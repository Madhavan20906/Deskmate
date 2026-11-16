import type {
  Action,
  ActionLogEntry,
  ActorType,
  AppState,
  PanelState,
  Plan,
} from './types.ts';
import { actionDefinitions } from './registry.ts';
import { SEED_TASKS } from '../glass-data-adapters.ts';

export const INITIAL_PANELS: Record<string, PanelState> = {
  'panel-hub': {
    id: 'panel-hub',
    visible: true,
    position: [0, 1.48, -0.72],
    rotationDeg: [0, 0, 0],
    scale: 0.1,
    isZoomed: false,
  },
  'panel-left-tasks': {
    id: 'panel-left-tasks',
    visible: true,
    position: [-0.72, 1.48, -0.72],
    rotationDeg: [0, 26, 0],
    scale: 0.1,
    isZoomed: false,
  },
  'panel-right-pip': {
    id: 'panel-right-pip',
    visible: true,
    position: [0.72, 1.66, -0.72],
    rotationDeg: [0, -26, 0],
    scale: 0.1,
    isZoomed: false,
  },
  'panel-right-focus': {
    id: 'panel-right-focus',
    visible: true,
    position: [0.72, 1.28, -0.72],
    rotationDeg: [0, -26, 0],
    scale: 0.1,
    isZoomed: false,
  },
};

export const INITIAL_STATE: AppState = {
  tasks: [...SEED_TASKS],
  focus: {
    remainingSeconds: 25 * 60,
    totalSeconds: 25 * 60,
    mode: 'focus',
    isRunning: false,
    completedSessions: 3,
  },
  panels: { ...INITIAL_PANELS },
  theme: {
    name: 'Auto',
    glassOpacity: 0.85,
    highContrast: false,
  },
  notes: [],
  selectedTaskId: null,
  activeArrangePreset: 'Arc',
  lastQuery: null,
};

interface HistoryEntry {
  forwardActions: Action[];
  inverseActions: Action[];
  description: string;
}

export class AppStore {
  private state: AppState;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private eventLog: ActionLogEntry[] = [];
  private listeners: Set<(state: AppState) => void> = new Set();
  private maxHistory = 20;

  constructor(initialState: AppState = INITIAL_STATE) {
    this.state = JSON.parse(JSON.stringify(initialState));
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  getEventLog(): ActionLogEntry[] {
    return [...this.eventLog];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  dispatch(action: Action, actor: ActorType = 'hand'): { success: boolean; reason?: string } {
    const def = actionDefinitions[action.name];
    if (!def) {
      const err = `Unknown action: "${action.name}"`;
      this.logEvent(action, actor, false, err);
      return { success: false, reason: err };
    }

    const validation = def.validate(action.params, this.state);
    if (!validation.valid) {
      this.logEvent(action, actor, false, validation.reason);
      return { success: false, reason: validation.reason };
    }

    try {
      const { nextState, inverse } = def.apply(action.params, this.state);
      this.state = nextState;
      this.undoStack.push({
        forwardActions: [action],
        inverseActions: [inverse],
        description: action.describe ? action.describe() : action.name,
      });
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }
      this.redoStack = []; // Clear redo on fresh action
      this.logEvent(action, actor, true);
      this.notify();
      return { success: true };
    } catch (e: any) {
      const err = e.message || 'Execution error';
      this.logEvent(action, actor, false, err);
      return { success: false, reason: err };
    }
  }

  dispatchTransaction(
    actions: Action[],
    reason: string,
    actor: ActorType = 'pip',
  ): { success: boolean; reason?: string } {
    if (actions.length === 0) return { success: true };
    if (actions.length > 20) {
      return { success: false, reason: 'Transaction exceeds 20 actions limit' };
    }

    // Dry run validation for atomicity
    let tempState = this.state;
    const inverses: Action[] = [];

    for (const action of actions) {
      const def = actionDefinitions[action.name];
      if (!def) {
        return { success: false, reason: `Unknown action: ${action.name}` };
      }
      const validation = def.validate(action.params, tempState);
      if (!validation.valid) {
        return { success: false, reason: `Validation failed for ${action.name}: ${validation.reason}` };
      }
      const result = def.apply(action.params, tempState);
      tempState = result.nextState;
      inverses.unshift(result.inverse); // Inverses applied in reverse order
    }

    // All valid - commit state change
    this.state = tempState;
    this.undoStack.push({
      forwardActions: [...actions],
      inverseActions: inverses,
      description: reason || `Batch of ${actions.length} action(s)`,
    });
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];

    for (const action of actions) {
      this.logEvent(action, actor, true);
    }
    this.notify();
    return { success: true };
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const entry = this.undoStack.pop()!;

    let tempState = this.state;
    const redoInverses: Action[] = [];

    for (const invAction of entry.inverseActions) {
      const def = actionDefinitions[invAction.name];
      if (def) {
        const res = def.apply(invAction.params, tempState);
        tempState = res.nextState;
        redoInverses.unshift(res.inverse);
      }
    }

    this.state = tempState;
    this.redoStack.push({
      forwardActions: entry.inverseActions,
      inverseActions: entry.forwardActions,
      description: `Reverted: ${entry.description}`,
    });

    this.logEvent(
      {
        name: 'meta.undo',
        params: { count: entry.inverseActions.length },
        describe: () => `Undo: ${entry.description}`,
        riskLevel: 'SAFE',
        visualTarget: 'hub',
      },
      'hand',
      true,
    );

    this.notify();
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const entry = this.redoStack.pop()!;

    let tempState = this.state;
    for (const fwdAction of entry.inverseActions) {
      const def = actionDefinitions[fwdAction.name];
      if (def) {
        const res = def.apply(fwdAction.params, tempState);
        tempState = res.nextState;
      }
    }

    this.state = tempState;
    this.undoStack.push({
      forwardActions: entry.inverseActions,
      inverseActions: entry.forwardActions,
      description: `Redo: ${entry.description}`,
    });

    this.logEvent(
      {
        name: 'meta.redo',
        params: {},
        describe: () => `Redo: ${entry.description}`,
        riskLevel: 'SAFE',
        visualTarget: 'hub',
      },
      'hand',
      true,
    );

    this.notify();
    return true;
  }

  private logEvent(action: Action, actor: ActorType, success: boolean, reason?: string) {
    this.eventLog.push({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      actor,
      timestamp: Date.now(),
      success,
      reason,
    });
    if (this.eventLog.length > 200) {
      this.eventLog.shift();
    }
  }
}
