import type { GlassTask, TaskPriority, TaskStatus } from '../glass-data-adapters.ts';

export type RiskLevel = 'SAFE' | 'CONFIRM' | 'BULK';
export type ActorType = 'hand' | 'controller' | 'pip';

export interface PanelState {
  id: string;
  visible: boolean;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: number;
  isZoomed: boolean;
}

export interface FocusSessionState {
  remainingSeconds: number;
  totalSeconds: number;
  mode: 'focus' | 'break';
  isRunning: boolean;
  completedSessions: number;
}

export interface StickyNote {
  id: string;
  text: string;
  position: [number, number, number];
  color?: string;
}

export interface ThemeState {
  name: 'Auto' | 'Warm' | 'Slate' | 'Sage' | 'Paper' | 'Night';
  glassOpacity: number; // 0.40 to 0.85
  highContrast: boolean;
}

export interface AppState {
  tasks: GlassTask[];
  focus: FocusSessionState;
  panels: Record<string, PanelState>;
  theme: ThemeState;
  notes: StickyNote[];
  selectedTaskId: string | null;
  activeArrangePreset: 'Arc' | 'Spread' | 'Stack' | 'Focus' | 'Wall';
  lastQuery: {
    type: string;
    answer: string;
    data?: any;
    timestamp: number;
  } | null;
}

export interface Action<P = any> {
  name: string;
  params: P;
  describe(): string;
  riskLevel: RiskLevel;
  visualTarget: string;
}

export interface ActionLogEntry {
  id: string;
  action: Action;
  actor: ActorType;
  timestamp: number;
  success: boolean;
  reason?: string;
}

export interface Plan {
  id: string;
  actions: Action[];
  reason: string;
  riskLevel: RiskLevel;
  diffSummary?: {
    addedTaskIds?: string[];
    movedTaskIds?: string[];
    removedTaskIds?: string[];
    timeShifts?: Record<string, { fromMinute: number; toMinute: number }>;
  };
}

export interface ActionDefinition<P = any> {
  validate(params: P, state: AppState): { valid: boolean; reason?: string };
  apply(params: P, state: AppState): { nextState: AppState; inverse: Action };
}
