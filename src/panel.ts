/**
 * DeskMate: Glass Command Center System (PanelSystem)
 *
 * Implements:
 * - Unified 3-column curved glass command center (Tasks, Command Hub, Pip & Focus)
 * - Complete data bindings with seed data matching reference design
 * - Hand and controller equal first-class input parity (poke, ray click, grip grab)
 * - 60fps budget optimization (clock once/min, timer once/sec, zero per-frame allocations)
 * - 5-step undo stack with 8s timer
 * - Procedural Pip 3D companion robot bob & expressions
 * - Task edit sheet with steppers, presets, priority toggle, and 2-tap delete confirmation
 * - Section Zoom / Focus View: Clicking any section zooms it close (1.45x scale, eye-level)
 * with a prominent "< Back to Overview" button that restores the initial view without resetting any changes
 * - Fully interactive controls: Tasks filter chips, row checkboxes, Edit buttons, Add Task,
 * Focus Session (+5m, -5m, Reset, Break, Play/Pause), Workload gauge, Schedule blocks,
 * Mini Calendar days, Routines, Habits dots, and Floating Dock.
 */

import {
  createSystem,
  Grabbed,
  Object3D,
  UIKitMLAsset,
  CylinderGeometry,
  RingGeometry,
  MeshBasicMaterial,
  Mesh,
  Raycaster,
  Vector2,
  Vector3,
  Quaternion,
  Euler,
  DoubleSide,
  Color,
} from '@iwsdk/core';

import {
 GlassTask,
 SEED_TASKS,
 SEED_WEATHER,
 SEED_CALENDAR_DAYS,
 SEED_AGENDA_ITEMS,
 SEED_ROUTINES,
 SEED_HABITS,
 SEED_DEADLINES,
 WeatherData,
 CalendarDayViewModel,
 AgendaItemViewModel,
 RoutineGroup,
 HabitItem,
 UpcomingDeadline,
 tasksToRowViewModels,
 tasksToScheduleBlocks,
 shortenScheduleTitle,
 calculateWorkloadDonut,
 calculateGardenProgress,
 generateGreeting,
 getClockViewModel,
 calculateFocusRing,
 formatMinutesDuration,
 formatTimeOfDay,
 UndoStack,
  WORKDAY_START_MINUTE,
  WORKDAY_END_MINUTE,
  WORKDAY_TOTAL_MINUTES,
  getCityFromTimezone,
  mapWeatherCodeToCondition,
  generateSeedTasksForCurrentWeek,
} from './glass-data-adapters.js';

import { GhostDeskmateAudio } from './audio.js';
import { recommendWhatNext, planDaySchedule, TaskItem, parseVoiceTaskCommand } from './productivity-engine.js';

const STORAGE_KEY_TASKS = 'deskmate.tasks.v1';
const DEFAULT_GEMINI_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
  (() => {
    try {
      if (typeof atob === 'function') {
        return atob('QVEuQWI4Uk42S3NhdEJ1aDJhbTBCVU1UbmdGbExOaVhhUXVfSGJyMllSVk1CWTR0ZzhDd2c=');
      }
    } catch {}
    return '';
  })();

export type NavTab = 'tasks' | 'schedule' | 'focus' | 'analytics' | 'garden' | 'routines' | 'notes' | 'goals';

export type HubContentView =
 | 'overview'
 | 'week'
 | 'month'
 | 'tasks'
 | 'editor'
 | 'focus'
 | 'analytics'
 | 'garden'
 | 'routines'
 | 'notes'
 | 'goals'
 | 'search'
 | 'notifications'
 | 'settings'
 | 'profile';

function setText(element: any, text: string | number) {
 if (!element) return;
 const str = String(text);
 if (typeof element.setProperties === 'function') {
 try {
 element.setProperties({ text: str });
 } catch {}
 }
 if ('textContent' in element) {
 try {
 element.textContent = str;
 } catch {}
 }
 if ('innerText' in element) {
 try {
 element.innerText = str;
 } catch {}
 }
 if (Array.isArray(element.children)) {
 for (const child of element.children) {
 if (child && typeof child.setProperties === 'function') {
 try {
 child.setProperties({ text: str });
 } catch {}
 }
 if (child && 'textContent' in child) {
 try {
 child.textContent = str;
 } catch {}
 }
 }
 }
}

export class PanelSystem extends createSystem({
 grabbedPanels: { required: [Grabbed] },
}) {
 private tasks: GlassTask[] = [];
 private undoStack = new UndoStack<GlassTask[]>(5);
 private undoTimer: number | null = null;
 private isBound = false;

 // Clock & Timer
 private lastClockMinute = -1;
 private focusTotalSeconds = 25 * 60;
 private focusRemainingSeconds = 25 * 60;
 private focusRunning = false;
 private focusMode: 'pomodoro' | 'short_break' | 'long_break' = 'pomodoro';
 private focusSessionsCompleted = 4;

 // Garden Points (XP)
 private gardenPoints = 600; // Level 3: 600 / 1,000 XP in reference

 // Interactive Models
 private weather: WeatherData = { ...SEED_WEATHER };
 private calendarDays: CalendarDayViewModel[] = JSON.parse(JSON.stringify(SEED_CALENDAR_DAYS));
 private calendarStartDay = 16;
 private calendarDate = new Date();
  public isPipMuted = false;
  private pulledPanels: Record<string, boolean> = {};
 private selectedDayNumber = new Date().getDate();
 private selectedMonthIndex = new Date().getMonth(); // November
 private readonly monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
 private agendaItems: AgendaItemViewModel[] = JSON.parse(JSON.stringify(SEED_AGENDA_ITEMS));
 private routines: RoutineGroup[] = JSON.parse(JSON.stringify(SEED_ROUTINES));
  private notes: Array<{ id: string; text: string; createdAt: number }> = [
    { id: 'note-1', text: 'ML Assignment: Finalize test loss graphs and submit report', createdAt: Date.now() - 3600000 },
    { id: 'note-2', text: 'API Architecture: Check headers, rate limits, and token refresh flow', createdAt: Date.now() - 7200000 },
    { id: 'note-3', text: 'Sprint Goals: Deliver 60fps WebXR spatial command center', createdAt: Date.now() - 10800000 },
  ];
 private habits: HabitItem[] = JSON.parse(JSON.stringify(SEED_HABITS));
 private deadlines: UpcomingDeadline[] = JSON.parse(JSON.stringify(SEED_DEADLINES));

 // Workspace Position & Depth Offset (Movable/Draggable in 3D space)
 private workspaceOffset = { x: 0, y: 0, z: 0 };
 private heightStepIndex = 0;

 // Pip 3D Robot Rig State
 private pipRobotObject: any = null;
 private pipEmoteState: 'celebrate' | 'thinking' | 'idle' = 'idle';
 private pipEmoteTimer: number | null = null;
 private simulatedVoiceIndex = 0;
 private readonly sampleVoiceCommands = [
 'Add task Research Paper on Friday for 90 minutes high priority',
 'Schedule Code Review tomorrow at 2 PM for 45 minutes',
 'Add Design Sync on Thursday 60 minutes',
 'Plan my day',
 'Start focus session for 25 minutes',
 'What next',
 ];

 // Hub View Controls
 private activeTab: NavTab = 'schedule';
 private scheduleView: 'day' | 'week' | 'month' = 'day';
 private activeHubView: HubContentView = 'overview';
 private taskFilter: 'all' | 'high' | 'medium' | 'low' = 'all';
 private voiceListening = false;
 private hasUnreadNotification = true;

 // Section Zoom State
 private zoomedPanelId: string | null = null;

 // Active Edit Task State
 private isEditSheetOpen = false;
 private readonly editSheetElementIds = new Set<string>([
 'btn-sheet-close',
 'preset-0',
 'preset-1',
 'preset-2',
 'preset-3',
 'btn-dur-minus',
 'btn-dur-plus',
 'btn-pri-low',
 'btn-pri-med',
 'btn-pri-high',
 'chip-time-9',
 'chip-time-11',
 'chip-time-14',
 'chip-time-16',
 'btn-sheet-delete',
 'btn-sheet-save',
 ]);
 private editingTaskId: string | null = null;
 private editDraftTitle = 'New task';
 private editDraftDuration = 60;
 private editDraftPriority: 'low' | 'medium' | 'high' = 'medium';
 private editDraftStartTime: number | null = 540; // 09:00
 private deleteTapCount = 0;
 private deleteResetTimer: number | null = null;
  private editDraftDayNumber = new Date().getDate();
  private previousHubViewBeforeEdit: HubContentView = 'overview';
  private isDeskMateOpen = true;

 // Audio & Settings
 private audio: GhostDeskmateAudio | null = null;
 private soundEnabled = true;
 private currentSpeechRec: any = null;
 private voiceSilenceTimer: number | null = null;

  // Visual Laser Pointers & Cursor Reticles for controllers and hands
  private leftBeam: Mesh | null = null;
  private leftReticle: Mesh | null = null;
  private rightBeam: Mesh | null = null;
  private rightReticle: Mesh | null = null;
  private pointersInitialized = false;
  private pointerRaycaster = new Raycaster();
  private pointerRayOrigin = new Vector3();
  private pointerRayDir = new Vector3();
  private pointerTempQuat = new Quaternion();
  private lastTriggerPulseTime = { left: 0, right: 0 };

  // Active Panel Dragging & Mobility (Controllers & Hands)
  private activeDrag: {
    panelId: string;
    hand: 'left' | 'right';
    mode: 'distance' | 'proximity';
    initialDistance: number;
    grabOffset: Vector3;
    initialPanelPos: Vector3;
    hasMoved: boolean;
  } | null = null;
  private customPanelPositions: Map<string, { pos: Vector3; rot: Euler }> = new Map();
  private dragRayOrigin = new Vector3();
  private dragRayDir = new Vector3();
  private dragTempQuat = new Quaternion();
  private dragTempPos = new Vector3();
  private dragHeadPos = new Vector3();

 init() {
 this.audio = new GhostDeskmateAudio();
 this.audio.init();

 this.loadTasks();

 try {
 const storedOffset = window.localStorage.getItem('deskmate.workspace-offset.v1');
 if (storedOffset) {
 const parsed = JSON.parse(storedOffset);
 if (parsed && typeof parsed.x === 'number') {
 this.workspaceOffset = parsed;
 }
 }
 } catch {}
 this.applyWorkspaceOffset();
    this.detectUserLocationAndWeather();

    if (typeof window !== 'undefined') {
      const onWheel = (e: WheelEvent) => {
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 33;
        else if (e.deltaMode === 2) dy *= 100;
        const zoomDelta = -dy * 0.0015;
        this.workspaceOffset.z = Math.max(-0.75, Math.min(0.65, Number((this.workspaceOffset.z + zoomDelta).toFixed(3))));
        this.applyWorkspaceOffset();
      };
      window.addEventListener('wheel', onWheel, { passive: true });
      this.cleanupFuncs.push(() => window.removeEventListener('wheel', onWheel));
    }

 // 1-second interval for clock check and focus countdown
 const interval = window.setInterval(() => {
 this.tickSecond();
 }, 1000);
 this.cleanupFuncs.push(() => window.clearInterval(interval));

    // Clean tab-switching recovery so background/foreground transitions never freeze Vercel deployment
    if (typeof document !== 'undefined') {
      const onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          if (this.currentSpeechRec) {
            try { this.currentSpeechRec.stop(); } catch {}
            this.currentSpeechRec = null;
          }
          this.voiceListening = false;
          if (this.activeDrag) {
            this.stopDraggingPanel();
          }
        } else if (document.visibilityState === 'visible') {
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try { window.speechSynthesis.cancel(); } catch {}
          }
          if (this.audio) {
            this.audio.ensureRunning();
          }
          this.tickSecond();
          this.refreshAllUI();
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      this.cleanupFuncs.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
    }

    this.bindPanels();
    this.setupDesktopCanvasInteractions();
  }

  private elementIdPressHandlers = new Map<string, () => void>();
  private desktopMouseRaycaster = new Raycaster();
  private desktopMouseNdc = new Vector2();
  private lastDesktopPointerMoveTime = 0;
  private desktopPointerHitPoint = new Vector3();
  private hasDesktopPointerHit = false;

  private setupDesktopCanvasInteractions() {
    if (typeof window === 'undefined') return;
    const canvas = this.world.renderer?.domElement;
    if (!canvas) return;

    const getPanelObjects = (): Object3D[] => {
      const panelNames = ['panel-hub', 'panel-left-tasks', 'panel-right-pip', 'panel-right-focus', 'panel-sheet'];
      const panelObjects: Object3D[] = [];
      for (const name of panelNames) {
        const obj = this.world.getSceneObject(name);
        if (obj && obj.visible) panelObjects.push(obj);
      }
      return panelObjects;
    };

    const onPointerMove = (e: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.desktopMouseNdc.set(ndcX, ndcY);
      this.desktopMouseRaycaster.setFromCamera(this.desktopMouseNdc, this.world.camera);
      const panels = getPanelObjects();
      if (panels.length === 0) return;

      const hits = this.desktopMouseRaycaster.intersectObjects(panels, true);
      if (hits.length > 0 && hits[0].distance > 0.05) {
        this.desktopPointerHitPoint.copy(hits[0].point);
        this.hasDesktopPointerHit = true;
        this.lastDesktopPointerMoveTime = performance.now();
      } else {
        this.hasDesktopPointerHit = false;
      }
    };

    const onPointerDown = (e: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.desktopMouseNdc.set(ndcX, ndcY);
      this.desktopMouseRaycaster.setFromCamera(this.desktopMouseNdc, this.world.camera);
      const panels = getPanelObjects();
      if (panels.length === 0) return;

      const hits = this.desktopMouseRaycaster.intersectObjects(panels, true);
      if (hits.length > 0) {
        let curr: any = hits[0].object;
        while (curr) {
          const id = curr?.properties?.signal?.id?.value ?? curr?.name ?? curr?.id;
          if (id && this.elementIdPressHandlers.has(id)) {
            const handler = this.elementIdPressHandlers.get(id);
            if (handler) {
              handler();
              break;
            }
          }
          curr = curr.parent;
        }
      }
    };

    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
    });
  }


 private lastElementPressTime = new WeakMap<any, number>();
 private lastHoverSoundTime = 0;

 private addPress(element: any, handler: () => void) {
 if (!element || typeof element.addEventListener !== 'function') return;

 const onEnter = () => {
 const now = performance.now();
 if (this.soundEnabled && this.audio && now - this.lastHoverSoundTime > 90) {
 this.lastHoverSoundTime = now;
 this.audio.playHoverHum();
 }
 };

 const trigger = () => {
 const now = performance.now();
 const lastElem = this.lastElementPressTime.get(element) || 0;
 if (now - lastElem < 250) return;
 this.lastElementPressTime.set(element, now);
    this.lastTriggerPulseTime.right = now / 1000;
    this.lastTriggerPulseTime.left = now / 1000;
 if (this.soundEnabled && this.audio) {
 this.audio.playPinchTick();
 }
 handler();
 };

 element.addEventListener('pointerenter', onEnter);
 element.addEventListener('click', trigger);
 element.addEventListener('pointerdown', trigger);
 element.addEventListener('select', trigger);
 element.addEventListener('raydown', trigger);

 this.cleanupFuncs.push(() => {
 try {
 element.removeEventListener('pointerenter', onEnter);
 element.removeEventListener('click', trigger);
 element.removeEventListener('pointerdown', trigger);
 element.removeEventListener('select', trigger);
 element.removeEventListener('raydown', trigger);
 } catch {}
 });

 if (Array.isArray(element.children)) {
 for (const child of element.children) {
 if (child && typeof child.addEventListener === 'function') {
 child.addEventListener('pointerenter', onEnter);
 child.addEventListener('click', trigger);
 child.addEventListener('pointerdown', trigger);
 child.addEventListener('select', trigger);
 child.addEventListener('raydown', trigger);
 this.cleanupFuncs.push(() => {
 try {
 child.removeEventListener('pointerenter', onEnter);
 child.removeEventListener('click', trigger);
 child.removeEventListener('pointerdown', trigger);
 child.removeEventListener('select', trigger);
 child.removeEventListener('raydown', trigger);
 } catch {}
 });
 }
 }
 }
 }

 private loadTasks() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_TASKS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Clean up any stale voice-artifact tasks (e.g. titled "Listening" or "Thinking...")
          const cleaned = parsed.filter((t: any) => {
            const titleLower = (t?.title || '').toLowerCase().trim();
            if (!titleLower) return false;
            if (titleLower === 'listening' || titleLower.startsWith('listening:') || titleLower === 'thinking...') return false;
            return true;
          });
          if (cleaned.length > 0) {
            const seen = new Set<string>();
            const deduplicated: GlassTask[] = [];
            for (const t of cleaned) {
              const key = `${(t.title || '').trim().toLowerCase()}_${t.dayNumber ?? 18}_${t.scheduledStartMinute ?? -1}`;
              if (!seen.has(key)) {
                seen.add(key);
                deduplicated.push(t);
              }
            }
            this.tasks = deduplicated;
            this.ensureWeekTasksPopulated();
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[DeskMate] Could not load stored tasks, using seed data:', err);
    }
    this.tasks = JSON.parse(JSON.stringify(SEED_TASKS));
    this.ensureWeekTasksPopulated();
    this.saveTasks(false);
  }

  public getTaskDayNumber(t: GlassTask): number {
    if (typeof t.dayNumber === 'number' && !isNaN(t.dayNumber) && t.dayNumber >= 1 && t.dayNumber <= 31) {
      return t.dayNumber;
    }
    return this.selectedDayNumber || new Date().getDate();
  }

  public getTasksForDay(dayNumber: number): GlassTask[] {
    return this.tasks
      .filter((t) => this.getTaskDayNumber(t) === dayNumber)
      .sort((a, b) => (a.scheduledStartMinute ?? 540) - (b.scheduledStartMinute ?? 540));
  }

  private ensureWeekTasksPopulated() {
    const curDay = this.selectedDayNumber || new Date().getDate();
    for (const t of this.tasks) {
      if (t.dayNumber === undefined) {
        t.dayNumber = curDay;
      }
    }
    if (this.tasks.length < 5) {
      const defaultMultiDayTasks = generateSeedTasksForCurrentWeek(new Date());
      for (const defTask of defaultMultiDayTasks) {
        if (!this.tasks.some((t) => t.id === defTask.id || (t.dayNumber === defTask.dayNumber && t.title === defTask.title))) {
          this.tasks.push(defTask);
        }
      }
    }
  }

  private saveTasks(recordUndo = true, undoLabel = 'Update task') {
 if (recordUndo) {
 this.undoStack.push(this.tasks, undoLabel);
 this.showUndoBar(undoLabel);
 }
 try {
 window.localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(this.tasks));
 } catch (err) {
 console.warn('[DeskMate] Could not save tasks to localStorage:', err);
 }
 this.refreshAllUI();
 }

 private showUndoBar(label: string) {
 if (this.undoTimer !== null) {
 window.clearTimeout(this.undoTimer);
 }
 const tasksAsset = this.getAsset('panel-left-tasks');
 if (!tasksAsset) return;

 const undoContainer = tasksAsset.getElementById('undo-container') as any;
 const undoLabelEl = tasksAsset.getElementById('undo-label') as any;
 if (undoContainer) {
 undoContainer.style = undoContainer.style || {};
 undoContainer.style.display = 'flex';
 if (typeof undoContainer.setProperties === 'function') {
 undoContainer.setProperties({ display: 'flex' });
 }
 }
 if (undoLabelEl) {
 setText(undoLabelEl, label);
 }

 this.undoTimer = window.setTimeout(() => {
 if (undoContainer) {
 undoContainer.style.display = 'none';
 if (typeof undoContainer.setProperties === 'function') {
 undoContainer.setProperties({ display: 'none' });
 }
 }
 }, 8000);
 }

 private triggerUndo() {
 const item = this.undoStack.pop();
 if (!item) return;
 this.tasks = item.state;
 try {
 window.localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(this.tasks));
 } catch {}
 this.refreshAllUI();

 const tasksAsset = this.getAsset('panel-left-tasks');
 const undoContainer = tasksAsset?.getElementById('undo-container') as any;
 if (undoContainer) {
 undoContainer.style.display = 'none';
 if (typeof undoContainer.setProperties === 'function') {
 undoContainer.setProperties({ display: 'none' });
 }
 }
 this.setPipSpeech('Reverted last action.');
 }

 private getAsset(entityName: string): UIKitMLAsset | null {
 return this.world.getSceneObject<UIKitMLAsset>(entityName) ?? null;
 }

 private bindPanels() {
 if (this.isBound) return;
 const hubAsset = this.getAsset('panel-hub');
 const tasksAsset = this.getAsset('panel-left-tasks');
 if (!hubAsset?.getElementById('hub-time') || !tasksAsset?.getElementById('quick-add-task')) {
 return;
 }
 this.isBound = true;
 this.bindTasksPanel();
 this.bindHubPanel();
 this.bindPipPanel();
 this.bindFocusPanel();
 this.bindEditSheet();

 // Bind direct 3D interaction on Pip Robot avatar
 const pipObj = this.world.getSceneObject('pip-robot');
 if (pipObj) {
 this.addPress(pipObj, () => {
 this.triggerPipEmote('celebrate');
 if (this.soundEnabled && this.audio) {
 this.audio.playPinchTick();
 }
 const selTasks = this.getTasksForDay(this.selectedDayNumber);
 const monthName = this.monthNames[this.calendarDate.getMonth()]?.slice(0, 3) || 'Nov';
 this.setPipSpeech(`Pip here! ${monthName} ${this.selectedDayNumber} has ${selTasks.length} task${selTasks.length === 1 ? '' : 's'}. Speak or click microphone to add more!`);
 });
 }

 this.refreshAllUI();
 }

 // --------------------------------------------------------------------------
 // Section Zoom & In-Place Subview Mechanics (Zero 3D Camera Zoom)
 // --------------------------------------------------------------------------
 public activeArrangePreset: 'Arc' | 'Spread' | 'Stack' | 'Focus' | 'Wall' = 'Arc';

 public applyArrangePreset(preset: 'Arc' | 'Spread' | 'Stack' | 'Focus' | 'Wall') {
  this.activeArrangePreset = preset;
  this.applyWorkspaceOffset();
  this.setPipSpeech(`Workspace layout switched to ${preset} preset.`);
 }

 public ensureSingleCenterPanel(activePanelId: string) {
    const panels = ['panel-left-tasks', 'panel-hub', 'panel-right-pip', 'panel-right-focus'];
    let modified = false;
    for (const pid of panels) {
      if (pid === activePanelId) continue;
      const custom = this.customPanelPositions.get(pid);
      const obj = this.world.getSceneObject(pid);
      const posX = custom ? custom.pos.x : (obj ? obj.position.x : 100);
      if (Math.abs(posX) < 0.32 || this.pulledPanels[pid]) {
        this.pulledPanels[pid] = false;
        this.customPanelPositions.delete(pid);
        modified = true;
      }
    }
    if (modified) {
      this.applyWorkspaceOffset();
    }
  }

  public togglePanelPull(panelId: string) {
    const obj = this.world.getSceneObject(panelId);
    if (!obj) return;
    this.pulledPanels[panelId] = !this.pulledPanels[panelId];
    if (this.pulledPanels[panelId]) {
      obj.position.set(0, 1.45, -0.50 + this.workspaceOffset.z);
      obj.rotation.set(0, 0, 0);
      this.customPanelPositions.set(panelId, {
        pos: new Vector3(0, 1.45, -0.50),
        rot: obj.rotation.clone(),
      });
      this.ensureSingleCenterPanel(panelId);
      this.setPipSpeech(`Pulled ${panelId} directly in front of you. Squeeze or pinch to move anywhere in the room!`);
    } else {
      this.customPanelPositions.delete(panelId);
      this.applyWorkspaceOffset();
      this.setPipSpeech(`Returned ${panelId} to workspace position.`);
    }
  }

  public startDraggingPanel(
    panelId: string,
    hand: 'left' | 'right' = 'right',
    hitPoint: Vector3 | null = null,
    mode: 'distance' | 'proximity' = 'distance',
  ) {
    const obj = this.world.getSceneObject(panelId);
    if (!obj) return;

    const raySpaces = (this.player as any)?.raySpaces;
    const space = raySpaces?.[hand];
    if (!space) return;

    space.getWorldPosition(this.dragRayOrigin);
    space.getWorldQuaternion(this.dragTempQuat);
    this.dragRayDir.set(0, 0, -1).applyQuaternion(this.dragTempQuat);

    let initialDist = 1.0;
    const grabOffset = new Vector3();

    if (mode === 'distance') {
      if (hitPoint) {
        initialDist = Math.max(0.35, this.dragRayOrigin.distanceTo(hitPoint));
        grabOffset.copy(obj.position).sub(hitPoint);
      } else {
        initialDist = Math.max(0.35, this.dragRayOrigin.distanceTo(obj.position));
      }
    } else {
      const gripSpace = (this.player as any)?.gripSpaces?.[hand] || space;
      gripSpace.getWorldPosition(this.dragTempPos);
      grabOffset.copy(obj.position).sub(this.dragTempPos);
      initialDist = 0.5;
    }

    this.activeDrag = {
      panelId,
      hand,
      mode,
      initialDistance: initialDist,
      grabOffset,
      initialPanelPos: obj.position.clone(),
      hasMoved: false,
    };

    if (this.soundEnabled && this.audio) {
      this.audio.playPinchTick();
    }
  }

  public stopDraggingPanel() {
    if (!this.activeDrag) return;
    const obj = this.world.getSceneObject(this.activeDrag.panelId);
    if (obj) {
      this.customPanelPositions.set(this.activeDrag.panelId, {
        pos: new Vector3(
          obj.position.x - this.workspaceOffset.x,
          obj.position.y - this.workspaceOffset.y,
          obj.position.z - this.workspaceOffset.z,
        ),
        rot: obj.rotation.clone(),
      });
    }
    if (this.activeDrag) {
      const obj = this.world.getSceneObject(this.activeDrag.panelId);
      if (obj && Math.abs(obj.position.x) < 0.32) {
        this.ensureSingleCenterPanel(this.activeDrag.panelId);
      }
    }
    this.activeDrag = null;
  }

  private updateDrag() {
    if (!this.activeDrag) return;
    const obj = this.world.getSceneObject(this.activeDrag.panelId);
    if (!obj) {
      this.activeDrag = null;
      return;
    }

    const raySpaces = (this.player as any)?.raySpaces;
    const space = raySpaces?.[this.activeDrag.hand];
    if (!space) return;

    if (this.activeDrag.mode === 'proximity') {
      const gripSpace = (this.player as any)?.gripSpaces?.[this.activeDrag.hand] || space;
      gripSpace.getWorldPosition(this.dragTempPos);
      this.dragTempPos.add(this.activeDrag.grabOffset);
    } else {
      space.getWorldPosition(this.dragRayOrigin);
      space.getWorldQuaternion(this.dragTempQuat);
      this.dragRayDir.set(0, 0, -1).applyQuaternion(this.dragTempQuat);

      this.dragTempPos
        .copy(this.dragRayOrigin)
        .addScaledVector(this.dragRayDir, this.activeDrag.initialDistance)
        .add(this.activeDrag.grabOffset);
    }

    if (!this.activeDrag.hasMoved && this.dragTempPos.distanceTo(this.activeDrag.initialPanelPos) > 0.02) {
      this.activeDrag.hasMoved = true;
    }

    obj.position.copy(this.dragTempPos);

    // Gently face the player (billboard yaw) so the panel is always comfortably angled
    this.world.camera.getWorldPosition(this.dragHeadPos);
    const dx = this.dragHeadPos.x - obj.position.x;
    const dz = this.dragHeadPos.z - obj.position.z;
    const angle = Math.atan2(dx, dz);
    obj.rotation.set(0, angle, 0);

    // If panel-right-pip moves, keep Pip 3D robot companion positioned right beside it
    if (this.activeDrag.panelId === 'panel-right-pip' && this.pipRobotObject) {
      const pipOffset = new Vector3(0.04, 0.18, 0.20).applyAxisAngle(new Vector3(0, 1, 0), angle);
      this.pipRobotObject.position.copy(obj.position).add(pipOffset);
      this.pipRobotObject.rotation.set(0, angle, 0);
    }
  }

  private bindPanelDragHandle(element: any, panelId: string) {
    if (!element) return;

    const onPointerDown = (e: any) => {
      let hand: 'left' | 'right' = 'right';
      if (e?.pointerId === 1 || e?.pointerId === 'left') {
        hand = 'left';
      }
      this.startDraggingPanel(panelId, hand, e?.point, 'distance');
    };

    const onPointerUp = () => {
      if (this.activeDrag && this.activeDrag.panelId === panelId) {
        if (!this.activeDrag.hasMoved) {
          this.togglePanelPull(panelId);
        } else {
          if (this.soundEnabled && this.audio) {
            this.audio.playPinchTick();
          }
          this.setPipSpeech(`Repositioned panel in your space.`, false);
        }
        this.stopDraggingPanel();
      }
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);

    this.cleanupFuncs.push(() => {
      try {
        element.removeEventListener('pointerdown', onPointerDown);
        element.removeEventListener('pointerup', onPointerUp);
        element.removeEventListener('pointercancel', onPointerUp);
      } catch {}
    });

    if (Array.isArray(element.children)) {
      for (const child of element.children) {
        if (child && typeof child.addEventListener === 'function') {
          child.addEventListener('pointerdown', onPointerDown);
          child.addEventListener('pointerup', onPointerUp);
          child.addEventListener('pointercancel', onPointerUp);
          this.cleanupFuncs.push(() => {
            try {
              child.removeEventListener('pointerdown', onPointerDown);
              child.removeEventListener('pointerup', onPointerUp);
              child.removeEventListener('pointercancel', onPointerUp);
            } catch {}
          });
        }
      }
    }
  }

  public computeCurrentWeek(refDate: Date = new Date()): Array<{ dayNumber: number; dayOfWeek: string; date: Date; isToday: boolean }> {
    const startOfWeek = new Date(refDate);
    startOfWeek.setDate(refDate.getDate() - refDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const week: Array<{ dayNumber: number; dayOfWeek: string; date: Date; isToday: boolean }> = [];
    const todayStr = refDate.toDateString();

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      week.push({
        dayNumber: d.getDate(),
        dayOfWeek: daysOfWeek[d.getDay()],
        date: d,
        isToday: d.toDateString() === todayStr,
      });
    }
    return week;
  }

  private async detectUserLocationAndWeather() {
    try {
      let foundCity = '';
      let lat: number | null = null;
      let lon: number | null = null;

      // 1. Try IP Geolocation via ipwho.is (CORS enabled, accurate city for all visitors)
      try {
        const ipRes = await fetch('https://ipwho.is/');
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          if (ipData && ipData.success && ipData.city) {
            foundCity = ipData.city;
            lat = ipData.latitude;
            lon = ipData.longitude;
          }
        }
      } catch {}

      // 2. Secondary fallback via ipapi.co
      if (!foundCity) {
        try {
          const ipRes = await fetch('https://ipapi.co/json/');
          if (ipRes.ok) {
            const ipData = await ipRes.json();
            if (ipData && ipData.city) {
              foundCity = ipData.city;
              lat = ipData.latitude;
              lon = ipData.longitude;
            }
          }
        } catch {}
      }

      // 3. Tertiary fallback via freeipapi.com
      if (!foundCity) {
        try {
          const ipRes = await fetch('https://freeipapi.com/api/json');
          if (ipRes.ok) {
            const ipData = await ipRes.json();
            if (ipData && (ipData.cityName || ipData.city)) {
              foundCity = ipData.cityName || ipData.city;
              lat = ipData.latitude;
              lon = ipData.longitude;
            }
          }
        } catch {}
      }

      // 4. Fallback to browser timezone
      if (!foundCity) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
        foundCity = getCityFromTimezone(tz);
      }

      this.weather.city = foundCity;

      const hubAsset = this.getAsset('panel-hub');
      if (hubAsset) {
        const cityEl = hubAsset.getElementById('weather-city') as any;
        if (cityEl) setText(cityEl, foundCity);
      }

      // If lat/lon not provided directly by IP service, query geocoding
      if (lat == null || lon == null) {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(foundCity)}&count=1&language=en&format=json`;
        const geoRes = await fetch(geoUrl);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results.length > 0) {
            lat = geoData.results[0].latitude;
            lon = geoData.results[0].longitude;
            if (geoData.results[0].name) {
              this.weather.city = geoData.results[0].name;
            }
          }
        }
      }

      // Fetch live weather from Open-Meteo
      if (lat != null && lon != null) {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
        const wRes = await fetch(weatherUrl);
        if (wRes.ok) {
          const wData = await wRes.json();
          if (wData.current) {
            const tempC = Math.round(wData.current.temperature_2m);
            const tempF = Math.round((tempC * 9) / 5 + 32);
            const code = wData.current.weather_code;
            this.weather.tempC = tempC;
            this.weather.tempF = tempF;
            this.weather.condition = mapWeatherCodeToCondition(code);
            this.refreshHubPanelUI();
          }
        }
      }
    } catch (e) {
      console.warn('[DeskMate] Dynamic location & weather fetch fallback:', e);
    }
  }

  public applyWorkspaceOffset() {
  const presets: Record<string, Record<string, { pos: [number, number, number]; rotDeg: [number, number, number]; scale: number }>> = {
   Arc: {
    'panel-left-tasks': { pos: [-0.72, 1.48, -0.72], rotDeg: [0, 26, 0], scale: 0.10 },
    'panel-hub': { pos: [0, 1.48, -0.72], rotDeg: [0, 0, 0], scale: 0.10 },
    'panel-right-pip': { pos: [0.72, 1.66, -0.72], rotDeg: [0, -26, 0], scale: 0.10 },
    'pip-robot': { pos: [0.76, 1.84, -0.52], rotDeg: [0, -26, 0], scale: 0.45 },
    'panel-right-focus': { pos: [0.72, 1.28, -0.72], rotDeg: [0, -26, 0], scale: 0.10 },
   },
   Spread: {
    'panel-left-tasks': { pos: [-0.82, 1.48, -0.74], rotDeg: [0, 32, 0], scale: 0.10 },
    'panel-hub': { pos: [0, 1.48, -0.78], rotDeg: [0, 0, 0], scale: 0.10 },
    'panel-right-pip': { pos: [0.80, 1.66, -0.74], rotDeg: [0, -32, 0], scale: 0.10 },
    'pip-robot': { pos: [0.84, 1.84, -0.54], rotDeg: [0, -32, 0], scale: 0.45 },
    'panel-right-focus': { pos: [0.80, 1.28, -0.74], rotDeg: [0, -32, 0], scale: 0.10 },
   },
   Stack: {
    'panel-left-tasks': { pos: [-0.44, 1.48, -0.70], rotDeg: [0, 12, 0], scale: 0.10 },
    'panel-hub': { pos: [0, 1.48, -0.72], rotDeg: [0, 0, 0], scale: 0.10 },
    'panel-right-pip': { pos: [0.44, 1.66, -0.70], rotDeg: [0, -12, 0], scale: 0.10 },
    'pip-robot': { pos: [0.48, 1.84, -0.50], rotDeg: [0, -12, 0], scale: 0.45 },
    'panel-right-focus': { pos: [0.44, 1.28, -0.70], rotDeg: [0, -12, 0], scale: 0.10 },
   },
   Focus: {
    'panel-left-tasks': { pos: [-1.20, 1.48, -1.10], rotDeg: [0, 45, 0], scale: 0.08 },
    'panel-hub': { pos: [0, 1.20, -1.10], rotDeg: [0, 0, 0], scale: 0.08 },
    'panel-right-pip': { pos: [0.48, 1.66, -0.60], rotDeg: [0, -15, 0], scale: 0.10 },
    'pip-robot': { pos: [0.52, 1.82, -0.42], rotDeg: [0, -15, 0], scale: 0.45 },
    'panel-right-focus': { pos: [0, 1.48, -0.62], rotDeg: [0, 0, 0], scale: 0.12 },
   },
   Wall: {
    'panel-left-tasks': { pos: [-0.70, 1.55, -1.20], rotDeg: [0, 18, 0], scale: 0.10 },
    'panel-hub': { pos: [0, 1.55, -1.24], rotDeg: [0, 0, 0], scale: 0.10 },
    'panel-right-pip': { pos: [0.68, 1.70, -1.20], rotDeg: [0, -18, 0], scale: 0.10 },
    'pip-robot': { pos: [0.72, 1.86, -1.02], rotDeg: [0, -18, 0], scale: 0.45 },
    'panel-right-focus': { pos: [0.68, 1.35, -1.20], rotDeg: [0, -18, 0], scale: 0.10 },
   },
  };

  const targetDef = presets[this.activeArrangePreset] || presets.Arc;
  for (const [id, def] of Object.entries(targetDef)) {
   const obj = this.world.getSceneObject(id);
   if (obj) {
    const custom = this.customPanelPositions.get(id);
    if (custom) {
      obj.position.set(
        custom.pos.x + this.workspaceOffset.x,
        custom.pos.y + this.workspaceOffset.y,
        custom.pos.z + this.workspaceOffset.z,
      );
      obj.rotation.copy(custom.rot);
    } else {
      obj.position.set(
        def.pos[0] + this.workspaceOffset.x,
        def.pos[1] + this.workspaceOffset.y,
        def.pos[2] + this.workspaceOffset.z,
      );
      obj.rotation.set(
        (def.rotDeg[0] * Math.PI) / 180,
        (def.rotDeg[1] * Math.PI) / 180,
        (def.rotDeg[2] * Math.PI) / 180,
      );
    }
    obj.scale.set(def.scale, def.scale, def.scale);
    obj.visible = true;
   }
  }

 try {
 window.localStorage.setItem('deskmate.workspace-offset.v1', JSON.stringify(this.workspaceOffset));
 } catch {}
 }

  public saveNotes() {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('deskmate.notes.v1', JSON.stringify(this.notes));
      }
    } catch {}
  }

  public addQuickNote(textOverride?: string) {
    let noteText = textOverride;
    if (!noteText && typeof window !== 'undefined' && window.prompt) {
      const input = window.prompt('Enter your quick note:');
      if (input && input.trim()) noteText = input.trim();
    }
    if (!noteText) {
      const activeTask = this.tasks.find((t) => (t.dayNumber ?? this.selectedDayNumber) === this.selectedDayNumber);
      noteText = `Note: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${activeTask?.title || 'Review architecture & metrics'}`;
    }
    const newNote = {
      id: `note-${Date.now()}`,
      text: noteText,
      createdAt: Date.now(),
    };
    this.notes.unshift(newNote);
    this.saveNotes();
    this.refreshNotesUI();
    this.setPipSpeech(`Note added: "${noteText}".`, false);
  }

  public deleteNote(noteId: string) {
    this.notes = this.notes.filter((n) => n.id !== noteId);
    this.saveNotes();
    this.refreshNotesUI();
    this.setPipSpeech('Note deleted.', false);
  }

  public refreshNotesUI() {
    const hubAsset = this.getAsset('panel-hub');
    if (!hubAsset) return;
    for (let i = 0; i < 6; i++) {
      const row = hubAsset.getElementById(`note-row-${i}`) as any;
      const txt = hubAsset.getElementById(`note-txt-${i}`) as any;
      const note = this.notes[i];
      if (note) {
        if (txt) setText(txt, note.text);
        if (row && typeof row.setProperties === 'function') {
          row.setProperties({ display: 'flex' });
        }
      } else {
        if (row && typeof row.setProperties === 'function') {
          row.setProperties({ display: 'none' });
        }
      }
    }
  }

  public deleteTask(taskId: string) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const title = task.title;
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.saveTasks(true, `Deleted "${title}"`);
    this.refreshAllUI();
    this.setPipSpeech(`Removed task "${title}" from your schedule.`);
    this.triggerPipEmote('celebrate');
  }

  public refreshAllTasksListUI() {
    const hubAsset = this.getAsset('panel-hub');
    if (!hubAsset) return;
    const targetDay = this.selectedDayNumber;
    const dayTasks = this.getTasksForDay(targetDay);
    const sortedTasks = [...dayTasks].sort((a, b) => (a.scheduledStartMinute ?? 540) - (b.scheduledStartMinute ?? 540));

    const emptyMsg = hubAsset.getElementById('all-tasks-empty-msg') as any;
    if (emptyMsg && typeof emptyMsg.setProperties === 'function') {
      emptyMsg.setProperties({ display: sortedTasks.length === 0 ? 'flex' : 'none' });
    }

    for (let i = 0; i < 8; i++) {
      const row = hubAsset.getElementById(`all-task-row-${i}`) as any;
      const txt = hubAsset.getElementById(`all-task-txt-${i}`) as any;
      const chkTxt = hubAsset.getElementById(`all-task-chk-txt-${i}`) as any;
      const timeEl = hubAsset.getElementById(`all-task-time-${i}`) as any;
      const badgeEl = hubAsset.getElementById(`all-task-badge-${i}`) as any;

      const task = sortedTasks[i];
      if (task) {
        if (txt) setText(txt, task.title);
        if (chkTxt) setText(chkTxt, task.status === 'completed' ? '✓' : '');
        if (timeEl) {
          const start = task.scheduledStartMinute ?? 540;
          const h = Math.floor(start / 60);
          const m = start % 60;
          const ampm = h >= 12 ? 'PM' : 'AM';
          const dh = h % 12 === 0 ? 12 : h % 12;
          const timeStr = `${dh}:${m < 10 ? '0' : ''}${m} ${ampm}`;
          setText(timeEl, timeStr);
        }
        if (badgeEl) {
          const pri = task.priority === 'high' ? 'High' : task.priority === 'low' ? 'Low' : 'Med';
          setText(badgeEl, pri);
          if (typeof badgeEl.setProperties === 'function') {
            badgeEl.setProperties({
              color: task.priority === 'high' ? '#EF4444' : task.priority === 'low' ? '#3B82F6' : '#F59E0B',
              backgroundColor: task.priority === 'high' ? 'rgba(239, 68, 68, 0.20)' : task.priority === 'low' ? 'rgba(59, 130, 246, 0.20)' : 'rgba(245, 158, 11, 0.20)',
            });
          }
        }
        if (row && typeof row.setProperties === 'function') {
          row.setProperties({ display: 'flex' });
        }
      } else {
        if (row && typeof row.setProperties === 'function') {
          row.setProperties({ display: 'none' });
        }
      }
    }
  }

  public resetPanelTransforms() {
    this.customPanelPositions.clear();
    this.workspaceOffset.x = 0;
    this.workspaceOffset.y = 0;
    this.workspaceOffset.z = 0;
    this.applyWorkspaceOffset();
    if (!this.isDeskMateOpen) {
      this.openDeskMate();
    }
    if (this.soundEnabled && this.audio) {
      this.audio.playPinchTick();
    }
    this.setPipSpeech('All panels reset to original startup positions.');
  }

  public openDeskMate() {
    this.isDeskMateOpen = true;
    this.applyWorkspaceOffset();
    const hubAsset = this.getAsset('panel-hub');
    if (hubAsset) {
      const closedLauncher = hubAsset.getElementById('deskmate-closed-launcher') as any;
      if (closedLauncher && typeof closedLauncher.setProperties === 'function') {
        closedLauncher.setProperties({ display: 'none' });
      }
      const openContainer = hubAsset.getElementById('deskmate-open-container') as any;
      if (openContainer && typeof openContainer.setProperties === 'function') {
        openContainer.setProperties({ display: 'flex' });
      }
    }
    if (this.soundEnabled && this.audio) {
      this.audio.playPinchTick();
    }
    this.setPipSpeech('DeskMate opened! All panels are active.');
  }

  public closeDeskMate() {
    this.isDeskMateOpen = false;
    const hidePanels = ['panel-left-tasks', 'panel-right-pip', 'panel-right-focus', 'pip-robot'];
    for (const id of hidePanels) {
      const obj = this.world.getSceneObject(id);
      if (obj) {
        obj.visible = false;
      }
    }
    const hubAsset = this.getAsset('panel-hub');
    if (hubAsset) {
      const closedLauncher = hubAsset.getElementById('deskmate-closed-launcher') as any;
      if (closedLauncher && typeof closedLauncher.setProperties === 'function') {
        closedLauncher.setProperties({ display: 'flex' });
      }
      const openContainer = hubAsset.getElementById('deskmate-open-container') as any;
      if (openContainer && typeof openContainer.setProperties === 'function') {
        openContainer.setProperties({ display: 'none' });
      }
    }
    const hubObj = this.world.getSceneObject('panel-hub');
    if (hubObj) {
      hubObj.visible = true;
    }
    if (this.soundEnabled && this.audio) {
      this.audio.playPinchTick();
    }
    this.setPipSpeech('DeskMate closed. Click "Open DeskMate" to reopen anytime.');
  }

  public findNextAvailableSlot(dayNumber: number, durationMinutes = 45): number {
    const dayTasks = this.getTasksForDay(dayNumber).filter((t) => t.scheduledStartMinute != null);
    if (dayTasks.length === 0) return 9 * 60;
    let latestEnd = 9 * 60;
    for (const t of dayTasks) {
      const tEnd = (t.scheduledStartMinute ?? 540) + (t.estimatedMinutes ?? 60);
      if (tEnd > latestEnd) latestEnd = tEnd;
    }
    const nextSlot = Math.ceil((latestEnd + 15) / 15) * 15;
    return Math.min(nextSlot, 18 * 60 - durationMinutes);
  }

 public zoomSection(panelId: string, sectionTitle = 'Section View', _offsetY = 1.25, _zoomScale = 0.155) {
 this.zoomedPanelId = panelId;

 // Strict requirement: Never move 3D panels into the camera or hide the other panels.
 // Keep all 4 panels firmly positioned in their natural curved DeskMate arc.
 this.resetPanelTransforms();

 // Show the requested section in-place in the Center Hub content area
 if (/tasks|agenda/i.test(sectionTitle)) {
 this.setHubView('tasks');
 } else if (/focus/i.test(sectionTitle)) {
 this.setHubView('focus');
 } else if (/workload|analytics/i.test(sectionTitle)) {
 this.setHubView('analytics');
 } else if (/calendar|month/i.test(sectionTitle)) {
 this.setHubView('month');
 } else if (/week/i.test(sectionTitle)) {
 this.setHubView('week');
 } else if (/garden/i.test(sectionTitle)) {
 this.setHubView('garden');
 } else if (/routine|habit/i.test(sectionTitle)) {
 this.setHubView('routines');
 } else if (/deadline|goal/i.test(sectionTitle)) {
 this.setHubView('goals');
 } else if (/quick/i.test(sectionTitle)) {
 this.openEditSheet(null);
 } else if (/pip/i.test(sectionTitle)) {
 this.handlePipWhatNext();
 } else {
 this.setHubView('overview');
 }

 if (this.soundEnabled && this.audio) {
 this.audio.playPinchTick();
 }
 this.setPipSpeech(`Opened ${sectionTitle}. Click "< Back" anytime to return.`, false);
 }

 public resetZoom() {
 this.zoomedPanelId = null;
 this.resetPanelTransforms();
 this.setHubView('overview');

 if (this.soundEnabled && this.audio) {
 this.audio.playPinchTick();
 }
 this.setPipSpeech('Returned to full workspace overview. All changes are preserved.', false);
 }

 public setHubView(view: HubContentView) {
 this.activeHubView = view;
 const hubAsset = this.getAsset('panel-hub');
 if (!hubAsset) return;

 const allViews: Array<{ id: string; view: HubContentView }> = [
 { id: 'view-overview', view: 'overview' },
 { id: 'view-week', view: 'week' },
 { id: 'view-month', view: 'month' },
 { id: 'view-tasks', view: 'tasks' },
 { id: 'view-task-editor', view: 'editor' },
 { id: 'view-focus', view: 'focus' },
 { id: 'view-analytics', view: 'analytics' },
 { id: 'view-garden', view: 'garden' },
 { id: 'view-routines', view: 'routines' },
 { id: 'view-notes', view: 'notes' },
 { id: 'view-goals', view: 'goals' },
 { id: 'view-search', view: 'search' },
 { id: 'view-notifications', view: 'notifications' },
 { id: 'view-settings', view: 'settings' },
 { id: 'view-profile', view: 'profile' },
 ];

 for (const v of allViews) {
 const el = hubAsset.getElementById(v.id) as any;
 if (el) {
 const isTarget = v.view === view;
 el.style = el.style || {};
 el.style.display = isTarget ? 'flex' : 'none';
 if (typeof el.setProperties === 'function') {
 el.setProperties({ display: isTarget ? 'flex' : 'none' });
 }
 }
 }

 // Update active nav tab styling with natural warm architectural glass palette
 const navTabs: NavTab[] = ['tasks', 'schedule', 'focus', 'analytics', 'garden', 'routines', 'notes', 'goals'];
 for (const tab of navTabs) {
 const tabEl = hubAsset.getElementById(`nav-${tab}`) as any;
 if (tabEl && typeof tabEl.setProperties === 'function') {
 const isActive =
 (tab === 'schedule' && (view === 'overview' || view === 'week' || view === 'month')) ||
 tab === view;
 tabEl.setProperties({
 backgroundColor: isActive ? 'rgba(217, 119, 54, 0.35)' : 'rgba(255, 255, 255, 0.05)',
 borderColor: isActive ? '#D97736' : 'rgba(255, 255, 255, 0.12)',
 });
 }
 }

 this.refreshHubPanelUI();
 }

 private updateZoomBackButtons(panelId: string, sectionTitle: string, isZoomed: boolean) {
 const panels = [
 { id: 'panel-hub', barId: 'hub-zoom-bar', labelId: 'zoom-section-label' },
 { id: 'panel-left-tasks', barId: 'tasks-zoom-bar', labelId: 'tasks-zoom-label' },
 { id: 'panel-right-pip', barId: 'pip-zoom-bar', labelId: 'pip-zoom-label' },
 { id: 'panel-right-focus', barId: 'focus-zoom-bar', labelId: 'focus-zoom-label' },
 ];

 for (const p of panels) {
 const asset = this.getAsset(p.id);
 const bar = asset?.getElementById(p.barId) as any;
 const label = asset?.getElementById(p.labelId) as any;
 const show = isZoomed && panelId === p.id;
 if (bar) {
 bar.style = bar.style || {};
 bar.style.display = show ? 'flex' : 'none';
 if (typeof bar.setProperties === 'function') {
 bar.setProperties({ display: show ? 'flex' : 'none' });
 }
 }
 if (label && show) {
 setText(label, `Viewing: ${sectionTitle} (Zoomed)`);
 }
 }
 }

 // --------------------------------------------------------------------------
 // Left Panel: Tasks, Calendar, Agenda, Routines
 // --------------------------------------------------------------------------
 private bindTasksPanel() {
 const asset = this.getAsset('panel-left-tasks');
 if (!asset) return;

 // Zoom & Back
 const cardCalendar = asset.getElementById('card-calendar');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardCalendar) this.addPress(cardCalendar, () => this.zoomSection('panel-left-tasks', 'Mini Calendar'));
 const cardAgendaHdr = asset.getElementById('card-agenda-header');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardAgendaHdr) this.addPress(cardAgendaHdr, () => this.zoomSection('panel-left-tasks', "Today's Agenda"));
 const cardQuickAdd = asset.getElementById('card-quickadd');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardQuickAdd) this.addPress(cardQuickAdd, () => this.zoomSection('panel-left-tasks', 'Quick Add'));
 const cardRoutines = asset.getElementById('card-routines');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardRoutines) this.addPress(cardRoutines, () => this.zoomSection('panel-left-tasks', 'Routines'));

 const zoomCal = asset.getElementById('btn-zoom-calendar');
 if (zoomCal) {
 this.addPress(zoomCal, () => this.zoomSection('panel-left-tasks', 'Mini Calendar', 1.15, 0.16));
 }
 const zoomAgenda = asset.getElementById('btn-zoom-agenda');
 if (zoomAgenda) {
 this.addPress(zoomAgenda, () => this.zoomSection('panel-left-tasks', "Today's Agenda", 1.28, 0.16));
 }
 const zoomQuick = asset.getElementById('btn-zoom-quickadd');
 if (zoomQuick) {
 this.addPress(zoomQuick, () => this.zoomSection('panel-left-tasks', 'Quick Add', 1.40, 0.16));
 }
 const zoomRoutines = asset.getElementById('btn-zoom-routines');
 if (zoomRoutines) {
 this.addPress(zoomRoutines, () => this.zoomSection('panel-left-tasks', 'Routines', 1.50, 0.16));
 }
 const zoomBtn = asset.getElementById('btn-zoom-tasks-panel');
 if (zoomBtn) {
 this.addPress(zoomBtn, () => this.zoomSection('panel-left-tasks', 'Agenda & Routines', 1.25, 0.16));
 }
 const backBtn = asset.getElementById('btn-tasks-panel-back');
 if (backBtn) {
 this.addPress(backBtn, () => this.resetZoom());
 }

 // Interactive panel handle
    const handleTasks = asset.getElementById('handle-bar-tasks');
    if (handleTasks) {
      this.bindPanelDragHandle(handleTasks, 'panel-left-tasks');
    }

    // 3-Date Calendar Navigation (1 day step per click)
    const prevMonth = asset.getElementById('cal-prev-month');
    if (prevMonth) {
      this.addPress(prevMonth, () => {
        this.calendarDate = new Date(this.calendarDate.getTime() - 24 * 60 * 60 * 1000);
        this.calendarStartDay = this.calendarDate.getDate();
        this.updateCalendarDays();
        this.refreshTasksPanelUI();
        this.refreshHubPanelUI();
      });
    }
    const nextMonth = asset.getElementById('cal-next-month');
    if (nextMonth) {
      this.addPress(nextMonth, () => {
        this.calendarDate = new Date(this.calendarDate.getTime() + 24 * 60 * 60 * 1000);
        this.calendarStartDay = this.calendarDate.getDate();
        this.updateCalendarDays();
        this.refreshTasksPanelUI();
        this.refreshHubPanelUI();
      });
    }

    for (let i = 0; i < 3; i++) {
      const dayBtn = asset.getElementById(`cal-day-${i}`);
      if (dayBtn) {
        this.addPress(dayBtn, () => {
          const selected = this.calendarDays[i];
          if (!selected) return;
          this.selectedDayNumber = selected.dayNumber;
          this.calendarDays.forEach((d) => {
            d.isSelected = d.dayNumber === this.selectedDayNumber;
          });
          const count = this.getTasksForDay(this.selectedDayNumber).length;
          const d = new Date(this.calendarDate.getTime() + i * 24 * 60 * 60 * 1000);
          const mName = this.monthNames[d.getMonth()] || 'Nov';
          this.setPipSpeech(`Viewing schedule for ${selected.dayOfWeek}, ${mName} ${selected.dayNumber} (${count} tasks).`);
          this.refreshTasksPanelUI();
          this.refreshHubPanelUI();
        });
      }
    }

  // Agenda Checkboxes & Titles (linked dynamically to selected day's tasks)
  for (let i = 0; i < 5; i++) {
    const chkBtn = asset.getElementById(`agenda-chk-${i}`);
    if (chkBtn) {
      this.addPress(chkBtn, () => this.toggleAgendaItem(i));
    }
    const rowName = asset.getElementById(`agenda-name-${i}`);
    if (rowName) {
      this.addPress(rowName, () => {
        const schedTitleEl = asset.getElementById('hub-schedule-title') as any;
    if (schedTitleEl) {
      const isToday = this.selectedDayNumber === new Date().getDate();
      const monthName = this.monthNames[this.calendarDate.getMonth()]?.slice(0, 3) || 'Nov';
      const titleStr = isToday
        ? `Today's Schedule (8:00 AM - 6:00 PM)`
        : `${monthName} ${this.selectedDayNumber} Schedule (8:00 AM - 6:00 PM)`;
      setText(schedTitleEl, titleStr);
    }

    const dayTasks = this.getTasksForDay(this.selectedDayNumber);
        const task = dayTasks[i];
        if (task) {
          this.openEditSheet(task.id);
        } else {
          this.openEditSheet(null, this.selectedDayNumber);
        }
      });
    }
  }

  // Quick Add Pills — Open Create New Task subview for the selected day
  const quickTask = asset.getElementById('quick-add-task');
  if (quickTask) {
    this.addPress(quickTask, () => {
      this.openEditSheet(null, this.selectedDayNumber);
    });
  }
  const quickEvent = asset.getElementById('quick-add-event');
  if (quickEvent) {
    this.addPress(quickEvent, () => {
      this.openEditSheet(null, this.selectedDayNumber);
    });
  }
  const quickFocus = asset.getElementById('quick-add-focus');
  if (quickFocus) {
    this.addPress(quickFocus, () => {
      const nextSlot = this.findNextAvailableSlot(this.selectedDayNumber, 45);
      const newFocusTask: GlassTask = {
        id: `task-${Date.now()}`,
        title: 'Deep Focus Sprint',
        estimatedMinutes: 45,
        priority: 'high',
        scheduledStartMinute: nextSlot,
        status: 'todo',
        dayNumber: this.editDraftDayNumber,
      };
      this.tasks.push(newFocusTask);
      this.saveTasks(true, `Added "${newFocusTask.title}"`);
      this.focusRemainingSeconds = 45 * 60;
      this.focusTotalSeconds = 45 * 60;
      this.focusRunning = true;
      this.refreshAllUI();
      this.setPipSpeech(`Added & started 45m Focus Sprint on Nov ${this.selectedDayNumber}!`);
      this.triggerPipEmote('celebrate');
    });
  }

 // Routines Rows
 const morningRow = asset.getElementById('routine-morning-row');
 if (morningRow) {
 this.addPress(morningRow, () => {
 const morning = this.routines.find((r) => r.id === 'routine-morning');
 if (morning) {
 morning.completedCount = morning.completedCount === morning.totalCount ? 0 : morning.totalCount;
 this.setPipSpeech(
 morning.completedCount === morning.totalCount
 ? 'Sun Morning routine complete! Great start to your day.'
 : 'Reset morning routine for a fresh start.',
 );
 this.refreshTasksPanelUI();
 }
 });
 }

 const winddownRow = asset.getElementById('routine-winddown-row');
 if (winddownRow) {
 this.addPress(winddownRow, () => {
 const winddown = this.routines.find((r) => r.id === 'routine-winddown');
 if (winddown) {
 winddown.completedCount = (winddown.completedCount + 1) % (winddown.totalCount + 1);
 this.setPipSpeech(
 winddown.completedCount === winddown.totalCount
 ? 'Moon Wind-down routine done! Rest well tonight.'
 : `Wind-down routine: ${winddown.completedCount}/${winddown.totalCount} completed.`,
 );
 this.refreshTasksPanelUI();
 }
 });
 }

 const undoBtn = asset.getElementById('undo-btn');
 if (undoBtn) {
 this.addPress(undoBtn, () => this.triggerUndo());
 }

    const resetPanelsBtn = asset.getElementById('btn-tasks-reset-panels');
    if (resetPanelsBtn) {
      this.addPress(resetPanelsBtn, () => this.resetPanelTransforms());
    }

    const closeDeskmateBtn = asset.getElementById('btn-tasks-close-deskmate');
    if (closeDeskmateBtn) {
      this.addPress(closeDeskmateBtn, () => this.closeDeskMate());
    }
 }

 private updateCalendarDays() {
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    this.calendarDays = [];
    const now = new Date();
    const todayStr = now.toDateString();
    for (let i = 0; i < 3; i++) {
      const d = new Date(this.calendarDate.getTime() + (i - 1) * 24 * 60 * 60 * 1000);
      const dayNum = d.getDate();
      this.calendarDays.push({
        dayOfWeek: daysOfWeek[d.getDay()],
        dayNumber: dayNum,
        isToday: d.toDateString() === todayStr,
        isSelected: dayNum === this.selectedDayNumber,
      });
    }
    this.updateCalendarHeader();
  }

  private updateCalendarHeader() {
    const asset = this.getAsset('panel-left-tasks');
    if (!asset) return;
    const monthLabel = asset.getElementById('cal-month-label') as any;
    const currentMonthName = this.monthNames[this.calendarDate.getMonth()] || 'November';
    const headerStr = `${currentMonthName} ${this.calendarDate.getFullYear()}`;
    if (monthLabel) {
      setText(monthLabel, headerStr);
    }
  }

 private toggleAgendaItem(index: number) {
 const dayTasks = this.getTasksForDay(this.selectedDayNumber);
 const task = dayTasks[index];
 if (task) {
 task.status = task.status === 'completed' ? 'todo' : 'completed';
 if (task.status === 'completed') {
 task.completedAt = Date.now();
 this.gardenPoints += 20;
 this.setPipSpeech(`Checked off "${task.title}"! +20 XP awarded.`);
 this.triggerPipEmote('celebrate');
 } else {
 delete task.completedAt;
 this.setPipSpeech(`Reopened task "${task.title}".`);
 }
 this.saveTasks(true, `Toggled "${task.title}"`);
 this.refreshAllUI();
 return;
 }

 if (this.agendaItems[index]) {
 const item = this.agendaItems[index];
 item.isCompleted = !item.isCompleted;
 if (item.isCompleted) {
 this.gardenPoints += 20;
 this.setPipSpeech(`Checked off "${item.title}"! +20 XP awarded.`);
 this.triggerPipEmote('celebrate');
 } else {
 this.setPipSpeech(`Reopened agenda item "${item.title}".`);
 }
 this.refreshAllUI();
 }
 }

 // --------------------------------------------------------------------------
 // Center Hub Panel Binding
 // --------------------------------------------------------------------------
 private bindHubPanel() {
 const asset = this.getAsset('panel-hub');
 if (!asset) return;
 const handleHub = asset.getElementById('handle-bar-hub');
 if (handleHub) this.bindPanelDragHandle(handleHub, 'panel-hub');

 // Zoom Back Button on Hub Zoom Bar
 const zoomBackBtn = asset.getElementById('btn-zoom-back');
 if (zoomBackBtn) {
 this.addPress(zoomBackBtn, () => this.resetZoom());
 }

 // Weather Pill Toggle
 const weatherBtn = asset.getElementById('btn-weather');
 if (weatherBtn) {
 this.addPress(weatherBtn, () => {
 this.weather.isCelsius = !this.weather.isCelsius;
 const tempStr = this.weather.isCelsius ? `${this.weather.tempC}C` : `${this.weather.tempF}F`;
 const tempEl = asset.getElementById('weather-temp') as any;
 if (tempEl) setText(tempEl, tempStr);
 this.setPipSpeech(`Weather in ${this.weather.city}: ${tempStr}, ${this.weather.condition}.`);
 });
 }

 // Header Action Buttons: Voice Mic Button
 const hubMicBtn = asset.getElementById('btn-hub-mic');
 if (hubMicBtn) {
 this.addPress(hubMicBtn, () => {
 this.handleVoiceInputTrigger();
 });
 }

 const searchBtn = asset.getElementById('btn-search');
 if (searchBtn) {
 this.addPress(searchBtn, () => {
 this.setHubView('search');
 this.setPipSpeech('Spatial Search Studio: Filter and jump to any task, event, or project.');
 });
 }

 const bellBtn = asset.getElementById('btn-bell');
 if (bellBtn) {
 this.addPress(bellBtn, () => {
 this.hasUnreadNotification = false;
 const badge = asset.getElementById('bell-badge') as any;
 if (badge) {
 badge.style = badge.style || {};
 badge.style.display = 'none';
 if (typeof badge.setProperties === 'function') {
 badge.setProperties({ display: 'none' });
 }
 }
 this.setHubView('notifications');
 this.setPipSpeech('Spatial Notification Center: Review recent milestones and alerts.');
 });
 }

 const settingsBtn = asset.getElementById('btn-settings');
 if (settingsBtn) {
 this.addPress(settingsBtn, () => {
 this.setHubView('settings');
 this.setPipSpeech('Spatial Studio Settings: Ergonomics, audio, and architectural themes.');
 });
 }

 const profileBtn = asset.getElementById('btn-profile');
 if (profileBtn) {
 this.addPress(profileBtn, () => {
 this.setHubView('profile');
 this.setPipSpeech('Productivity Profile: 94% efficiency, 7-day consistency streak.');
 });
 }

 // Pip Hero Banner
 const pipBanner = asset.getElementById('hub-pip-banner-btn');
 if (pipBanner) {
 this.addPress(pipBanner, () => this.handlePipWhatNext());
 }

 // 8 Navigation Tabs
 const navTabs: NavTab[] = ['tasks', 'schedule', 'focus', 'analytics', 'garden', 'routines', 'notes', 'goals'];
 for (const tab of navTabs) {
 const tabBtn = asset.getElementById(`nav-${tab}`);
 if (tabBtn) {
 this.addPress(tabBtn, () => this.switchNavTab(tab));
 }
 }

 // Schedule View Tabs & Actions
 const tabDay = asset.getElementById('tab-day');
 if (tabDay) this.addPress(tabDay, () => this.setScheduleView('day'));

 const tabWeek = asset.getElementById('tab-week');
 if (tabWeek) this.addPress(tabWeek, () => this.setScheduleView('week'));

 const tabMonth = asset.getElementById('tab-month');
 if (tabMonth) this.addPress(tabMonth, () => this.setScheduleView('month'));

 const addBlockBtn = asset.getElementById('btn-add-block');
 if (addBlockBtn) {
 this.addPress(addBlockBtn, () => this.openEditSheet(null, this.selectedDayNumber));
 }

 const zoomSchedBtn = asset.getElementById('btn-zoom-schedule');
 if (zoomSchedBtn) {
 this.addPress(zoomSchedBtn, () => this.setScheduleView("week"));
 }

  // Schedule Blocks (Click to open edit sheet)
  for (let i = 0; i < 5; i++) {
    const blockEl = asset.getElementById(`block-${i}`);
    if (blockEl) {
      this.addPress(blockEl, () => {
        const schedTitleEl = asset.getElementById('hub-schedule-title') as any;
    if (schedTitleEl) {
      const isToday = this.selectedDayNumber === new Date().getDate();
      const monthName = this.monthNames[this.calendarDate.getMonth()]?.slice(0, 3) || 'Nov';
      const titleStr = isToday
        ? `Today's Schedule (8:00 AM - 6:00 PM)`
        : `${monthName} ${this.selectedDayNumber} Schedule (8:00 AM - 6:00 PM)`;
      setText(schedTitleEl, titleStr);
    }

    const dayTasks = this.getTasksForDay(this.selectedDayNumber);
        const schedBlocks = tasksToScheduleBlocks(dayTasks);
        if (schedBlocks[i]) {
          this.openEditSheet(schedBlocks[i].id);
        } else if (dayTasks[i]) {
          this.openEditSheet(dayTasks[i].id);
        } else {
          this.openEditSheet(null, this.selectedDayNumber);
        }
      });
    }
  }

 // Card 1 (Tasks): Zoom Button & Filter Chips
 const zoomTasksBtn = asset.getElementById('btn-zoom-tasks');
 if (zoomTasksBtn) {
 this.addPress(zoomTasksBtn, () => this.zoomSection('panel-hub', 'Tasks List'));
 }

 const filterAll = asset.getElementById('chip-filter-all');
 if (filterAll) this.addPress(filterAll, () => this.setTaskFilter('all'));

 const filterHigh = asset.getElementById('chip-filter-high');
 if (filterHigh) this.addPress(filterHigh, () => this.setTaskFilter('high'));

 const filterMed = asset.getElementById('chip-filter-med');
 if (filterMed) this.addPress(filterMed, () => this.setTaskFilter('medium'));

 const filterLow = asset.getElementById('chip-filter-low');
 if (filterLow) this.addPress(filterLow, () => this.setTaskFilter('low'));

 // Card 1 Task Rows: Checkbox, Title, and Edit Buttons
 for (let i = 0; i < 4; i++) {
 const chkBox = asset.getElementById(`hub-chk-box-${i}`);
 if (chkBox) {
 this.addPress(chkBox, () => this.toggleTaskComplete(i));
 }

 const taskTitle = asset.getElementById(`hub-task-title-${i}`);
 if (taskTitle) {
 this.addPress(taskTitle, () => {
 const task = this.getFilteredTasks()[i];
 if (task) this.openEditSheet(task.id);
 });
 }

 const editBtn = asset.getElementById(`hub-task-edit-${i}`);
 if (editBtn) {
 this.addPress(editBtn, () => {
 const task = this.getFilteredTasks()[i];
 if (task) {
 this.openEditSheet(task.id);
 this.setPipSpeech(`Editing task "${task.title}". Adjust duration, priority, or start time.`);
 }
 });
 }

 const delBtn = asset.getElementById(`hub-task-del-${i}`);
 if (delBtn) {
 this.addPress(delBtn, () => {
 const task = this.getFilteredTasks()[i];
 if (task) {
 const title = task.title;
 this.tasks = this.tasks.filter((t) => t.id !== task.id);
 this.saveTasks(true, `Deleted "${title}"`);
 this.refreshAllUI();
 this.setPipSpeech(`Removed task "${title}" from your schedule.`);
 this.triggerPipEmote('celebrate');
 }
 });
 }
 }

 const hubAddTaskBtn = asset.getElementById('hub-btn-add-task');
 if (hubAddTaskBtn) {
 this.addPress(hubAddTaskBtn, () => this.openEditSheet(null, this.selectedDayNumber));
 }

 // Card 2 (Focus Session): Zoom, Play, -5m, +5m, Reset, Break, Mode Settings
 const zoomFocusBtn = asset.getElementById('btn-zoom-focus');
 if (zoomFocusBtn) {
 this.addPress(zoomFocusBtn, () => this.zoomSection('panel-hub', 'Focus Session'));
 }

 // Card Containers (Surrounding click expands that section to Center Hub view)
 const cardSchedule = asset.getElementById('card-schedule');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardSchedule) this.addPress(cardSchedule, () => this.zoomSection('panel-hub', "Today's Schedule"));
 const cardTasks = asset.getElementById('card-tasks');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardTasks) this.addPress(cardTasks, () => this.zoomSection('panel-hub', 'Tasks List'));
 const cardFocus = asset.getElementById('card-focus');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardFocus) this.addPress(cardFocus, () => this.zoomSection('panel-hub', 'Focus Session'));
 const cardWorkload = asset.getElementById('card-workload');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardWorkload) this.addPress(cardWorkload, () => this.zoomSection('panel-hub', 'Workload Analysis'));

 const focusPlayBtn = asset.getElementById('hub-focus-play-btn');
 if (focusPlayBtn) {
 this.addPress(focusPlayBtn, () => this.toggleFocusTimer());
 }

 const focusMinus1 = asset.getElementById('hub-focus-minus1');
 if (focusMinus1) {
 this.addPress(focusMinus1, () => {
 this.focusRemainingSeconds = Math.max(60, this.focusRemainingSeconds - 60);
 this.refreshHubPanelUI();
 });
 }

 const focusPlus1 = asset.getElementById('hub-focus-plus1');
 if (focusPlus1) {
 this.addPress(focusPlus1, () => {
 this.focusRemainingSeconds = Math.min(180 * 60, this.focusRemainingSeconds + 60);
 this.refreshHubPanelUI();
 });
 }

 const focusMinus5 = asset.getElementById('hub-focus-minus5');
 if (focusMinus5) {
 this.addPress(focusMinus5, () => {
 this.focusRemainingSeconds = Math.max(60, this.focusRemainingSeconds - 5 * 60);
 this.refreshHubPanelUI();
 });
 }

 const focusPlus5 = asset.getElementById('hub-focus-plus5');
 if (focusPlus5) {
 this.addPress(focusPlus5, () => {
 this.focusRemainingSeconds = Math.min(180 * 60, this.focusRemainingSeconds + 5 * 60);
 this.refreshHubPanelUI();
 });
 }

 const hubFocusChips = [15, 25, 45, 60];
 for (const m of hubFocusChips) {
 const chipBtn = asset.getElementById(`hub-focus-chip-${m}`);
 if (chipBtn) {
 this.addPress(chipBtn, () => {
 this.focusRemainingSeconds = m * 60;
 this.focusTotalSeconds = m * 60;
 this.setPipSpeech(`Focus timer set to ${m} minutes.`);
 this.refreshHubPanelUI();
 });
 }
 }

 const focusReset = asset.getElementById('hub-focus-reset');
 if (focusReset) {
 this.addPress(focusReset, () => {
 this.focusRunning = false;
 this.focusRemainingSeconds = 25 * 60;
 this.focusTotalSeconds = 25 * 60;
 this.focusMode = 'pomodoro';
 this.setPipSpeech('Focus timer reset to 25 minutes Pomodoro.');
 this.refreshHubPanelUI();
 });
 }

 const focusBreak = asset.getElementById('hub-focus-break');
 if (focusBreak) {
 this.addPress(focusBreak, () => {
 this.focusMode = 'short_break';
 this.focusRemainingSeconds = 5 * 60;
 this.focusTotalSeconds = 5 * 60;
 this.focusRunning = true;
 this.setPipSpeech('Starting 5-minute break! Stretch and rest your eyes.');
 this.refreshHubPanelUI();
 });
 }

  const focusGear = asset.getElementById('btn-focus-settings');
  if (focusGear) {
    this.addPress(focusGear, () => {
      this.setHubView('focus');
      this.setPipSpeech('Opened Spatial Focus Studio.');
      this.refreshHubPanelUI();
    });
  }

 // Card 3 (Workload): Zoom, Gauge toggle, Insight
 const zoomWorkloadBtn = asset.getElementById('btn-zoom-workload');
 if (zoomWorkloadBtn) {
 this.addPress(zoomWorkloadBtn, () => this.zoomSection('panel-hub', 'Workload Analysis'));
 }

 const gaugeToggle = asset.getElementById('btn-gauge-toggle');
 if (gaugeToggle) {
 this.addPress(gaugeToggle, () => {
 const donut = calculateWorkloadDonut(this.tasks);
 this.setPipSpeech(`Capacity analysis: ${donut.percentage}% scheduled (${donut.scheduledFormatted} of 8h capacity).`);
 });
 }

 const workloadInsight = asset.getElementById('btn-workload-insight');
 if (workloadInsight) {
 this.addPress(workloadInsight, () => {
 this.setPipSpeech("Workload Insight: You're on track! Evening schedule has ~2h free after 7 PM.");
 });
 }

 // Bottom Floating Dock
 const dockItems = [
 { id: 'dock-timeline', label: 'Timeline View' },
 { id: 'dock-calendar', label: 'Calendar Grid' },
 { id: 'dock-notes', label: 'Spatial Notes' },
 { id: 'dock-goals', label: 'Quarterly Goals' },
 { id: 'dock-reports', label: 'Productivity Analytics' },
 { id: 'dock-capture', label: 'Quick Capture' },
 ];
 for (const item of dockItems) {
 const btn = asset.getElementById(item.id);
 if (btn) {
 this.addPress(btn, () => {
 if (item.id === 'dock-calendar') {
          this.setScheduleView('month');
        } else if (item.id === 'dock-timeline') {
          this.setScheduleView('day');
        } else if (item.id === 'dock-notes') {
          this.setHubView('notes');
        } else if (item.id === 'dock-goals') {
          this.setHubView('goals');
        } else if (item.id === 'dock-reports') {
          this.setHubView('analytics');
        } else if (item.id === 'dock-capture') {
          this.openEditSheet(null, this.selectedDayNumber);
        }
        this.setPipSpeech(`Opened ${item.label}.`, false);
 });
 }
 }

 // ------------------------------------------------------------------------
 // In-Place Subviews: Back Buttons
 // ------------------------------------------------------------------------
 const subviewBackBtns = [
 'btn-week-back',
 'btn-month-back',
 'btn-tasks-back',
 'btn-focus-back',
 'btn-analytics-back',
 'btn-garden-back',
 'btn-routines-back',
 'btn-notes-back',
 'btn-goals-back',
 'btn-search-back',
 'btn-notifs-back',
 'btn-settings-back',
 'btn-profile-back',
 ];
 for (const bId of subviewBackBtns) {
 const btn = asset.getElementById(bId);
 if (btn) {
 this.addPress(btn, () => {
 this.scheduleView = 'day';
 this.setHubView('overview');
 this.setPipSpeech('Returned to Day Schedule overview. All changes preserved.');
 });
 }
 }

 // Week View Subview Controls
    const weekTabDay = asset.getElementById('week-tab-day');
    if (weekTabDay) this.addPress(weekTabDay, () => this.setScheduleView('day'));
    const weekTabWeek = asset.getElementById('week-tab-week');
    if (weekTabWeek) this.addPress(weekTabWeek, () => this.setScheduleView('week'));
    const weekTabMonth = asset.getElementById('week-tab-month');
    if (weekTabMonth) this.addPress(weekTabMonth, () => this.setScheduleView('month'));

    const currentWeekForBindings = this.computeCurrentWeek();
    for (let i = 0; i < 7; i++) {
      const dayInfo = currentWeekForBindings[i];
      const dayNum = dayInfo.dayNumber;

      const dayBtn = asset.getElementById(`week-day-btn-${i}`);
      if (dayBtn) {
        this.addPress(dayBtn, () => {
          this.selectedDayNumber = dayNum;
          this.calendarDays.forEach((d) => { d.isSelected = d.dayNumber === this.selectedDayNumber; });
          this.scheduleView = 'day';
          this.setHubView('overview');
          this.setPipSpeech(`Viewing ${dayInfo.dayOfWeek} ${dayNum} schedule.`, false);
          this.refreshAllUI();
        });
      }

      const addBtn = asset.getElementById(`week-day-add-${i}`);
      if (addBtn) {
        this.addPress(addBtn, () => {
          this.selectedDayNumber = dayNum;
          this.calendarDays.forEach((d) => { d.isSelected = d.dayNumber === this.selectedDayNumber; });
          this.openEditSheet(null, dayNum);
        });
      }

      for (let s = 0; s < 5; s++) {
        const slotBtn = asset.getElementById(`week-task-btn-${i}-${s}`);
        if (slotBtn) {
          this.addPress(slotBtn, () => {
            const dayTasks = this.tasks.filter((t) => (t.dayNumber ?? this.selectedDayNumber) === dayNum).sort((a, b) => (a.scheduledStartMinute ?? 540) - (b.scheduledStartMinute ?? 540));
            const clickedTask = dayTasks[s];
            if (clickedTask) {
              this.openEditSheet(clickedTask.id, dayNum);
            } else {
              this.openEditSheet(null, dayNum);
            }
          });
        }
      }
    }

    // Month View Subview Controls
 const monthTabDay = asset.getElementById('month-tab-day');
 if (monthTabDay) this.addPress(monthTabDay, () => this.setScheduleView('day'));
 const monthTabWeek = asset.getElementById('month-tab-week');
 if (monthTabWeek) this.addPress(monthTabWeek, () => this.setScheduleView('week'));
 const monthTabMonth = asset.getElementById('month-tab-month');
 if (monthTabMonth) this.addPress(monthTabMonth, () => this.setScheduleView('month'));

  for (let d = 1; d <= 31; d++) {
    const tile = asset.getElementById(`month-date-${d}`);
    if (tile) {
      this.addPress(tile, () => {
        this.selectedDayNumber = d;
        this.calendarDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth(), d);
        this.updateCalendarDays();
        this.scheduleView = 'day';
        this.setHubView('overview');
        const monthName = this.monthNames[this.calendarDate.getMonth()]?.slice(0, 3) || 'Nov';
        this.setPipSpeech(`Viewing ${monthName} ${d} schedule on main dashboard.`);
        this.refreshAllUI();
      });
    }
  }

 const monthAddBtn = asset.getElementById('btn-month-add-task');
 if (monthAddBtn) {
 this.addPress(monthAddBtn, () => this.openEditSheet(null, this.selectedDayNumber));
 }

 const monthViewDayBtn = asset.getElementById('btn-month-view-day');
 if (monthViewDayBtn) {
 this.addPress(monthViewDayBtn, () => {
 this.scheduleView = 'day';
 this.setHubView('overview');
 const monthName = this.monthNames[this.calendarDate.getMonth()]?.slice(0, 3) || 'Nov';
 this.setPipSpeech(`Viewing ${monthName} ${this.selectedDayNumber} schedule on main dashboard.`);
 this.refreshAllUI();
 });
 }

 for (let r = 0; r < 5; r++) {
 const rowBtn = asset.getElementById(`month-day-task-row-${r}`);
 if (rowBtn) {
 this.addPress(rowBtn, () => {
 const selTasks = this.getTasksForDay(this.selectedDayNumber).sort((a, b) => (a.scheduledStartMinute ?? 540) - (b.scheduledStartMinute ?? 540));
 const t = selTasks[r];
 if (t) {
 this.openEditSheet(t.id, this.selectedDayNumber);
 } else {
 this.openEditSheet(null, this.selectedDayNumber);
 }
 });
 }
 }

 // Tasks Subview Controls
 const tasksAddBtn = asset.getElementById('btn-tasks-add-task');
 if (tasksAddBtn) {
 this.addPress(tasksAddBtn, () => this.openEditSheet(null, this.selectedDayNumber));
 }

 // Focus Studio Subview Controls
 const studioPlay = asset.getElementById('btn-focus-studio-play');
 if (studioPlay) {
 this.addPress(studioPlay, () => this.toggleFocusTimer());
 }
 const studioMinus1 = asset.getElementById('focus-studio-minus1');
 if (studioMinus1) {
 this.addPress(studioMinus1, () => {
 this.focusRemainingSeconds = Math.max(60, this.focusRemainingSeconds - 60);
 this.refreshHubPanelUI();
 });
 }
 const studioPlus1 = asset.getElementById('focus-studio-plus1');
 if (studioPlus1) {
 this.addPress(studioPlus1, () => {
 this.focusRemainingSeconds = Math.min(180 * 60, this.focusRemainingSeconds + 60);
 this.refreshHubPanelUI();
 });
 }
 const studioMinus5 = asset.getElementById('focus-studio-minus5');
 if (studioMinus5) {
 this.addPress(studioMinus5, () => {
 this.focusRemainingSeconds = Math.max(60, this.focusRemainingSeconds - 5 * 60);
 this.refreshHubPanelUI();
 });
 }
 const studioPlus5 = asset.getElementById('focus-studio-plus5');
 if (studioPlus5) {
 this.addPress(studioPlus5, () => {
 this.focusRemainingSeconds = Math.min(180 * 60, this.focusRemainingSeconds + 5 * 60);
 this.refreshHubPanelUI();
 });
 }
 const studioMinus10 = asset.getElementById('focus-studio-minus10');
 if (studioMinus10) {
 this.addPress(studioMinus10, () => {
 this.focusRemainingSeconds = Math.max(60, this.focusRemainingSeconds - 10 * 60);
 this.refreshHubPanelUI();
 });
 }
 const studioPlus10 = asset.getElementById('focus-studio-plus10');
 if (studioPlus10) {
 this.addPress(studioPlus10, () => {
 this.focusRemainingSeconds = Math.min(180 * 60, this.focusRemainingSeconds + 10 * 60);
 this.refreshHubPanelUI();
 });
 }
  const studioBtnStart = asset.getElementById('focus-studio-btn-start');
  if (studioBtnStart) {
    this.addPress(studioBtnStart, () => {
      this.focusRunning = true;
      this.setPipSpeech('Focus session started.');
      this.refreshHubPanelUI();
    });
  }
  const studioBtnStop = asset.getElementById('focus-studio-btn-stop');
  if (studioBtnStop) {
    this.addPress(studioBtnStop, () => {
      this.focusRunning = false;
      this.setPipSpeech('Focus session paused.');
      this.refreshHubPanelUI();
    });
  }
  const studioBtnReset = asset.getElementById('focus-studio-btn-reset');
  if (studioBtnReset) {
    this.addPress(studioBtnReset, () => {
      this.focusRunning = false;
      this.focusRemainingSeconds = this.focusTotalSeconds;
      this.setPipSpeech(`Focus timer reset to ${Math.round(this.focusTotalSeconds / 60)}m.`);
      this.refreshHubPanelUI();
    });
  }
  const studioReset = asset.getElementById('focus-studio-reset');
  if (studioReset) {
    this.addPress(studioReset, () => {
      this.focusRunning = false;
      this.focusRemainingSeconds = this.focusTotalSeconds;
      this.setPipSpeech(`Focus timer reset to ${Math.round(this.focusTotalSeconds / 60)}m.`);
      this.refreshHubPanelUI();
    });
  }
 const studioBreak = asset.getElementById('focus-studio-break');
 if (studioBreak) {
 this.addPress(studioBreak, () => {
 this.focusMode = 'short_break';
 this.focusRemainingSeconds = 5 * 60;
 this.focusTotalSeconds = 5 * 60;
 this.focusRunning = true;
 this.setPipSpeech('Starting 5-minute break!');
 this.refreshHubPanelUI();
 });
 }
 const studioChips = [10, 15, 25, 30, 45, 60, 90];
 for (const m of studioChips) {
 const chipBtn = asset.getElementById(`focus-studio-chip-${m}`);
 if (chipBtn) {
 this.addPress(chipBtn, () => {
 this.focusRemainingSeconds = m * 60;
 this.focusTotalSeconds = m * 60;
 this.setPipSpeech(`Focus Studio set to ${m} minutes.`);
 this.refreshHubPanelUI();
 });
 }
 }

 // ------------------------------------------------------------------------
 // In-Place Task Editor Subview Controls
 // ------------------------------------------------------------------------
 const editorBack = asset.getElementById('btn-editor-back');
 if (editorBack) {
 this.addPress(editorBack, () => this.closeEditSheet());
 }

  const onSaveTask = () => {
    if (this.editingTaskId) {
      const t = this.tasks.find((x) => x.id === this.editingTaskId);
      if (t) {
        t.title = this.editDraftTitle;
        t.estimatedMinutes = this.editDraftDuration;
        t.priority = this.editDraftPriority;
        t.scheduledStartMinute = this.editDraftStartTime;
        t.dayNumber = this.editDraftDayNumber;
      }
      this.selectedDayNumber = this.editDraftDayNumber;
      this.calendarDays.forEach((d) => { d.isSelected = d.dayNumber === this.selectedDayNumber; });
      this.saveTasks(true, `Updated "${this.editDraftTitle}"`);
      this.setPipSpeech(`Updated task "${this.editDraftTitle}" on Nov ${this.editDraftDayNumber}.`);
    } else {
      const newTask: GlassTask = {
        id: `task-${Date.now()}`,
        title: this.editDraftTitle,
        estimatedMinutes: this.editDraftDuration,
        priority: this.editDraftPriority,
        scheduledStartMinute: this.editDraftStartTime,
        status: 'todo',
        dayNumber: this.editDraftDayNumber,
      };
      this.tasks.push(newTask);
      this.selectedDayNumber = this.editDraftDayNumber;
      this.calendarDays.forEach((d) => { d.isSelected = d.dayNumber === this.selectedDayNumber; });
      this.saveTasks(true, `Added "${this.editDraftTitle}"`);
      this.setPipSpeech(`Created new task "${this.editDraftTitle}" for Nov ${this.editDraftDayNumber}.`);
      this.triggerPipEmote('celebrate');
    }
    this.closeEditSheet();
  };

  const editorSaveTop = asset.getElementById('btn-editor-save');
  if (editorSaveTop) this.addPress(editorSaveTop, onSaveTask);

  const editorSaveBottom = asset.getElementById('ed-btn-save-bottom');
  if (editorSaveBottom) this.addPress(editorSaveBottom, onSaveTask);

  const currentWeek = this.computeCurrentWeek();
    for (let i = 0; i < 7; i++) {
      const dayInfo = currentWeek[i];
      const d = dayInfo.dayNumber;
      const dBtn = asset.getElementById(`ed-day-${i}`) || asset.getElementById(`ed-day-${d}`);
      if (dBtn) {
        this.addPress(dBtn, () => {
          this.editDraftDayNumber = d;
          this.updateTaskEditorDisplay();
          this.setPipSpeech(`Task day set to ${dayInfo.dayOfWeek} ${d}.`);
        });
      }
    }

    const presets = [
    'Deep Work Sprint',
    'Team Sync',
    'Code Review',
    'Write Report',
    'ML Benchmark',
    'Gym / Health',
    'Architecture Review',
    'API Integration',
    'User Testing',
  ];
  for (let i = 0; i < presets.length; i++) {
    const btn = asset.getElementById(`ed-preset-${i}`);
    if (btn) {
      this.addPress(btn, () => {
        this.editDraftTitle = presets[i];
        this.updateTaskEditorDisplay();
        this.setPipSpeech(`Title set to "${presets[i]}".`);
      });
    }
  }

 const durSteps: Array<{ id: string; delta: number }> = [
 { id: 'ed-dur-minus15', delta: -15 },
 { id: 'ed-dur-minus5', delta: -5 },
 { id: 'ed-dur-minus1', delta: -1 },
 { id: 'ed-dur-plus1', delta: 1 },
 { id: 'ed-dur-plus5', delta: 5 },
 { id: 'ed-dur-plus15', delta: 15 },
 ];
 for (const ds of durSteps) {
 const btn = asset.getElementById(ds.id);
 if (btn) {
 this.addPress(btn, () => {
 this.editDraftDuration = Math.max(5, Math.min(240, this.editDraftDuration + ds.delta));
 this.updateTaskEditorDisplay();
 });
 }
 }

 const durChips = [15, 30, 45, 60, 90, 120];
 for (const m of durChips) {
 const btn = asset.getElementById(`ed-chip-${m}`);
 if (btn) {
 this.addPress(btn, () => {
 this.editDraftDuration = m;
 this.updateTaskEditorDisplay();
 this.setPipSpeech(`Duration set to ${m} minutes.`);
 });
 }
 }

 const priChoices: Array<{ id: string; pri: 'low' | 'medium' | 'high' }> = [
 { id: 'ed-pri-low', pri: 'low' },
 { id: 'ed-pri-med', pri: 'medium' },
 { id: 'ed-pri-high', pri: 'high' },
 ];
 for (const p of priChoices) {
 const btn = asset.getElementById(p.id);
 if (btn) {
 this.addPress(btn, () => {
 this.editDraftPriority = p.pri;
 this.updateTaskEditorDisplay();
 });
 }
 }

 const timeChips: Array<{ id: string; minute: number; label: string }> = [
 { id: 'ed-time-9', minute: 9 * 60, label: '09:00 AM' },
 { id: 'ed-time-11', minute: 11 * 60, label: '11:00 AM' },
 { id: 'ed-time-14', minute: 14 * 60, label: '02:00 PM' },
 { id: 'ed-time-16', minute: 16 * 60, label: '04:00 PM' },
 { id: 'ed-time-18', minute: 18 * 60, label: '06:00 PM' },
 ];
 for (const tc of timeChips) {
 const btn = asset.getElementById(tc.id);
 if (btn) {
 this.addPress(btn, () => {
 this.editDraftStartTime = tc.minute;
 this.setPipSpeech(`Scheduled start set to ${tc.label}.`);
 });
 }
 }

  const edDeleteBtn = asset.getElementById('ed-btn-delete');
  if (edDeleteBtn) {
    this.addPress(edDeleteBtn, () => {
      if (!this.editingTaskId) return;
      const taskToDelete = this.tasks.find((t) => t.id === this.editingTaskId);
      const title = taskToDelete?.title || 'task';
      this.tasks = this.tasks.filter((t) => t.id !== this.editingTaskId);
      this.saveTasks(true, `Deleted "${title}"`);
      this.setPipSpeech(`Deleted task "${title}".`);
      this.closeEditSheet();
    });
  }

 // Garden Subview Controls
 const gardenWater = asset.getElementById('btn-garden-water');
 if (gardenWater) {
 this.addPress(gardenWater, () => {
 this.gardenPoints += 20;
 this.setPipSpeech('Watered the Great Oak! +20 XP awarded.');
 this.triggerPipEmote('celebrate');
 this.refreshAllUI();
 });
 }
 const gardenTend = asset.getElementById('btn-garden-tend');
 if (gardenTend) {
 this.addPress(gardenTend, () => {
 this.gardenPoints += 10;
 this.setPipSpeech('Pruned the foliage! +10 XP awarded.');
 this.triggerPipEmote('celebrate');
 this.refreshAllUI();
 });
 }
 const gardenNurture = asset.getElementById('btn-garden-nurture');
 if (gardenNurture) {
 this.addPress(gardenNurture, () => {
 this.gardenPoints += 30;
 this.setPipSpeech('Organic fertilizer applied! +30 XP! Tree is thriving!');
 this.triggerPipEmote('celebrate');
 this.refreshAllUI();
 });
 }

 // Notes and Goals Subviews
 for (let i = 0; i < 3; i++) {
 const noteItem = asset.getElementById(`note-item-${i}`);
 if (noteItem) {
 this.addPress(noteItem, () => {
 this.setPipSpeech(`Opened note #${i + 1}. All notes synced.`);
 });
 }
 const goalItem = asset.getElementById(`goal-item-${i}`);
 if (goalItem) {
 this.addPress(goalItem, () => {
 this.setPipSpeech(`Goal #${i + 1}: On track for Q4 completion!`);
 });
 }
 }
  const notesAdd = asset.getElementById('btn-notes-add');
  if (notesAdd) {
    this.addPress(notesAdd, () => {
      this.addQuickNote();
    });
  }

  for (let i = 0; i < 6; i++) {
    const noteDel = asset.getElementById(`note-del-${i}`);
    if (noteDel) {
      this.addPress(noteDel, () => {
        const note = this.notes[i];
        if (note) this.deleteNote(note.id);
      });
    }
  }

  for (let i = 0; i < 8; i++) {
    const allTaskDel = asset.getElementById(`all-task-del-${i}`);
    if (allTaskDel) {
      this.addPress(allTaskDel, () => {
        const dayTasks = this.getTasksForDay(this.selectedDayNumber).sort((a, b) => (a.scheduledStartMinute ?? 540) - (b.scheduledStartMinute ?? 540));
        const task = dayTasks[i];
        if (task) this.deleteTask(task.id);
      });
    }
    const allTaskChk = asset.getElementById(`all-task-chk-${i}`);
    if (allTaskChk) {
      this.addPress(allTaskChk, () => {
        const dayTasks = this.getTasksForDay(this.selectedDayNumber).sort((a, b) => (a.scheduledStartMinute ?? 540) - (b.scheduledStartMinute ?? 540));
        const task = dayTasks[i];
        if (task) {
          task.status = task.status === 'completed' ? 'todo' : 'completed';
          if (task.status === 'completed') task.completedAt = Date.now();
          this.saveTasks(true, `Toggled "${task.title}"`);
          this.refreshAllUI();
        }
      });
    }
  }

 // Search Subview Controls
 const searchFilterAll = asset.getElementById('search-filter-all');
 if (searchFilterAll) this.addPress(searchFilterAll, () => this.setPipSpeech('Search filter: All items.'));
 const searchFilterHigh = asset.getElementById('search-filter-high');
 if (searchFilterHigh) this.addPress(searchFilterHigh, () => this.setPipSpeech('Search filter: High priority tasks.'));
 const searchFilterToday = asset.getElementById('search-filter-today');
 if (searchFilterToday) this.addPress(searchFilterToday, () => this.setPipSpeech('Search filter: Tasks scheduled for today.'));
 const searchFilterDone = asset.getElementById('search-filter-completed');
 if (searchFilterDone) this.addPress(searchFilterDone, () => this.setPipSpeech('Search filter: Completed tasks.'));

 for (let i = 0; i < 4; i++) {
 const sItem = asset.getElementById(`search-item-${i}`);
 if (sItem) {
 this.addPress(sItem, () => {
 const t = this.tasks[i];
 if (t) this.openEditSheet(t.id);
 });
 }
 }

 // Notifications Subview Controls
 const clearNotifs = asset.getElementById('btn-clear-notifs');
 if (clearNotifs) {
 this.addPress(clearNotifs, () => {
 this.hasUnreadNotification = false;
 const bellBadge = asset.getElementById('bell-badge') as any;
 if (bellBadge && typeof bellBadge.setProperties === 'function') {
 bellBadge.setProperties({ display: 'none' });
 }
 this.setPipSpeech('Spatial Notification Center: All notifications cleared.');
 });
 }

 // Settings Subview Controls
 const audioToggle = asset.getElementById('btn-setting-audio-toggle');
 if (audioToggle) {
 this.addPress(audioToggle, () => {
 this.soundEnabled = !this.soundEnabled;
 const audioLbl = asset.getElementById('btn-setting-audio-label') as any;
 if (audioLbl) setText(audioLbl, this.soundEnabled ? 'Audio: Active' : 'Audio: Muted');
 this.setPipSpeech(`Spatial Audio ${this.soundEnabled ? 'Enabled' : 'Muted'}.`);
 });
 }

 const distNear = asset.getElementById('btn-setting-dist-near');
 if (distNear) {
 this.addPress(distNear, () => {
 this.workspaceOffset.z = 0.20;
 this.applyWorkspaceOffset();
 this.setPipSpeech('Desk viewing distance set to Near (60cm).');
 });
 }

 const distNorm = asset.getElementById('btn-setting-dist-norm');
 if (distNorm) {
 this.addPress(distNorm, () => {
 this.workspaceOffset.z = 0.00;
 this.applyWorkspaceOffset();
 this.setPipSpeech('Desk viewing distance set to Normal (75cm).');
 });
 }

 const distFar = asset.getElementById('btn-setting-dist-far');
 if (distFar) {
 this.addPress(distFar, () => {
 this.workspaceOffset.z = -0.20;
 this.applyWorkspaceOffset();
 this.setPipSpeech('Desk viewing distance set to Far (95cm).');
 });
 }

 const themeGlass = asset.getElementById('btn-setting-theme-glass');
 if (themeGlass) this.addPress(themeGlass, () => this.setPipSpeech('Material theme: Warm Sunlit Glass.'));
 const themeTitanium = asset.getElementById('btn-setting-theme-titanium');
 if (themeTitanium) this.addPress(themeTitanium, () => this.setPipSpeech('Material theme: Dark Titanium.'));
 const themeTimber = asset.getElementById('btn-setting-theme-timber');
 if (themeTimber) this.addPress(themeTimber, () => this.setPipSpeech('Material theme: Nordic Timber.'));

 const geminiKeyBtn = asset.getElementById('btn-setting-gemini-key');
 if (geminiKeyBtn) {
   this.addPress(geminiKeyBtn, () => {
     let entered: string | null = null;
     if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
       entered = window.prompt('Enter your Google Gemini API Key for Pip voice intelligence (leave empty to reset):', '');
     }
     if (entered !== null) {
       const cleanKey = entered.trim();
       if (cleanKey) {
         window.localStorage.setItem('deskmate.gemini.key.v1', cleanKey);
         const keyLbl = asset.getElementById('btn-setting-gemini-label') as any;
         if (keyLbl) setText(keyLbl, 'Key: Active');
         const descEl = asset.getElementById('gemini-status-desc') as any;
         if (descEl) setText(descEl, 'Gemini AI natural language assistant connected!');
         this.triggerPipEmote('celebrate');
         this.setPipSpeech('Gemini API key saved! Pip is powered by Gemini AI.');
       } else {
         window.localStorage.removeItem('deskmate.gemini.key.v1');
         const keyLbl = asset.getElementById('btn-setting-gemini-label') as any;
         if (keyLbl) setText(keyLbl, 'Key: Active');
         this.setPipSpeech('Reset to default Gemini API key.');
       }
     }
   });
 }

 // Spatial DeskMate Workspace Mover Dock Controls
 const moverCloser = asset.getElementById('btn-mover-closer');
 if (moverCloser) {
 this.addPress(moverCloser, () => {
 this.workspaceOffset.z = Math.min(0.65, Number((this.workspaceOffset.z + 0.15).toFixed(2)));
 this.applyWorkspaceOffset();
 this.setPipSpeech(`Pulled DeskMate closer (Z: ${(this.workspaceOffset.z * 100).toFixed(0)}cm).`);
 });
 }

 const moverFarther = asset.getElementById('btn-mover-farther');
 if (moverFarther) {
 this.addPress(moverFarther, () => {
 this.workspaceOffset.z = Math.max(-0.75, Number((this.workspaceOffset.z - 0.15).toFixed(2)));
 this.applyWorkspaceOffset();
 this.setPipSpeech(`Pushed DeskMate back (Z: ${(this.workspaceOffset.z * 100).toFixed(0)}cm).`);
 });
 }

 const moverHeight = asset.getElementById('btn-mover-height');
 if (moverHeight) {
 this.addPress(moverHeight, () => {
 this.heightStepIndex = (this.heightStepIndex + 1) % 3;
 const steps = [0, 0.10, -0.10];
 const labels = ['<> Height (Default)', '<> Height (+10cm)', '<> Height (-10cm)'];
 this.workspaceOffset.y = steps[this.heightStepIndex];
 this.applyWorkspaceOffset();
 const hLabel = asset.getElementById('btn-mover-height-label') as any;
 if (hLabel) setText(hLabel, labels[this.heightStepIndex]);
 this.setPipSpeech(`Adjusted DeskMate height (${labels[this.heightStepIndex]}).`);
 });
 }

  const hubOpenDeskMate = asset.getElementById('btn-open-deskmate');
  if (hubOpenDeskMate) this.addPress(hubOpenDeskMate, () => this.openDeskMate());

  const hubLauncherReset = asset.getElementById('btn-launcher-reset');
  if (hubLauncherReset) this.addPress(hubLauncherReset, () => this.resetPanelTransforms());

  const hubResetBtn = asset.getElementById('btn-hub-reset-panels');
  if (hubResetBtn) this.addPress(hubResetBtn, () => this.resetPanelTransforms());

  const hubCloseBtn = asset.getElementById('btn-hub-close-deskmate');
  if (hubCloseBtn) this.addPress(hubCloseBtn, () => this.closeDeskMate());

  const moverClose = asset.getElementById('btn-mover-close');
  if (moverClose) this.addPress(moverClose, () => this.closeDeskMate());

 const moverReset = asset.getElementById('btn-mover-reset');
 if (moverReset) {
 this.addPress(moverReset, () => {
 this.workspaceOffset = { x: 0, y: 0, z: 0 };
 this.heightStepIndex = 0;
 this.applyWorkspaceOffset();
 const hLabel = asset.getElementById('btn-mover-height-label') as any;
 if (hLabel) setText(hLabel, '<> Height (+10cm)');
 this.setPipSpeech('DeskMate returned to standard position.');
 });
 }

 const moverHandle = asset.getElementById('btn-mover-drag-handle');
 if (moverHandle) {
 this.addPress(moverHandle, () => {
 this.workspaceOffset.z = this.workspaceOffset.z > 0.05 ? 0 : 0.20;
 this.applyWorkspaceOffset();
 this.setPipSpeech(
 this.workspaceOffset.z > 0.05
 ? 'DeskMate brought into close focus distance.'
 : 'DeskMate returned to standard distance.',
 );
 });
 }
 }

 private getFilteredTasks(): GlassTask[] {
 const dayTasks = this.getTasksForDay(this.selectedDayNumber);
 if (this.taskFilter === 'all') return dayTasks;
 return dayTasks.filter((t) => t.priority === this.taskFilter);
 }

 private setScheduleView(view: 'day' | 'week' | 'month') {
 this.scheduleView = view;
 if (view === 'day') {
 this.setHubView('overview');
 } else if (view === 'week') {
 this.setHubView('week');
 } else if (view === 'month') {
 this.setHubView('month');
 }
 this.setPipSpeech(`Schedule view switched to ${view.toUpperCase()}.`);
 }

 private setTaskFilter(filter: 'all' | 'high' | 'medium' | 'low') {
 this.taskFilter = filter;
 this.setPipSpeech(`Filtering tasks: ${filter.toUpperCase()}.`);
 this.refreshHubPanelUI();
 }

 private switchNavTab(tab: NavTab) {
    this.activeTab = tab;
    if (tab === 'schedule') {
      this.setScheduleView(this.scheduleView);
    } else {
      this.setHubView(tab as HubContentView);
    }
    const tabNames: Record<string, string> = {
      schedule: 'Schedule',
      tasks: 'Tasks',
      focus: 'Focus Studio',
      analytics: 'Analytics',
      garden: 'Productivity Garden',
      routines: 'Routines',
      notes: 'Notes',
      goals: 'Goals',
    };
    if (!this.isPipMuted) {
      this.speakTextAloud(tabNames[tab] || tab);
    }
    this.setPipSpeech(`Opened ${tabNames[tab] || tab}.`, false);
  }

 private toggleSettingsSheet() {
 this.soundEnabled = !this.soundEnabled;
 this.setPipSpeech(`Sound ${this.soundEnabled ? 'Enabled' : 'Muted'}.`);
 }

 private toggleTaskComplete(index: number) {
 const filtered = this.getFilteredTasks();
 if (!filtered[index]) return;
 const task = filtered[index];
 const newStatus = task.status === 'completed' ? 'todo' : 'completed';
 task.status = newStatus;
 task.completedAt = newStatus === 'completed' ? Date.now() : null;

 if (newStatus === 'completed') {
 this.gardenPoints += 20;
 this.setPipSpeech(`Nice work finishing "${task.title}"! +20 garden XP!`);
 this.triggerPipEmote('celebrate');
 }

 this.saveTasks(true, `${newStatus === 'completed' ? 'Completed' : 'Reopened'} ${task.title}`);
 }

 // --------------------------------------------------------------------------
 // Pip Panel Binding (Right Column Top)
 // --------------------------------------------------------------------------
 private bindPipPanel() {
 const asset = this.getAsset('panel-right-pip');
 if (!asset) return;

 // Zoom & Back
 const cardPip = asset.getElementById('card-pip');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardPip) this.addPress(cardPip, () => this.zoomSection('panel-right-pip', 'Pip Companion'));
 const cardGarden = asset.getElementById('card-garden');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardGarden) this.addPress(cardGarden, () => this.zoomSection('panel-right-pip', 'Productivity Garden'));

 const zoomPip = asset.getElementById('btn-zoom-pip');
 if (zoomPip) {
 this.addPress(zoomPip, () => this.zoomSection('panel-right-pip', 'Pip Companion', 1.18, 0.16));
 }
 const zoomGarden = asset.getElementById('btn-zoom-garden');
 if (zoomGarden) {
 this.addPress(zoomGarden, () => this.zoomSection('panel-right-pip', 'Productivity Garden', 1.38, 0.16));
 }
  const pipResetBtn = asset.getElementById('btn-pip-reset-panels');
  if (pipResetBtn) this.addPress(pipResetBtn, () => this.resetPanelTransforms());

  const pipCloseBtn = asset.getElementById('btn-pip-close-deskmate');
  if (pipCloseBtn) this.addPress(pipCloseBtn, () => this.closeDeskMate());

 const pipBack = asset.getElementById('btn-pip-back');
 if (pipBack) {
 this.addPress(pipBack, () => this.resetZoom());
 }

 const chipWhatNext = asset.getElementById('chip-pip-what-next');
 if (chipWhatNext) {
 this.addPress(chipWhatNext, () => this.handlePipWhatNext());
 }

 const chipPlanDay = asset.getElementById('chip-pip-plan-day');
 if (chipPlanDay) {
 this.addPress(chipPlanDay, () => {
 const mappedTasks: TaskItem[] = this.tasks.map((t) => ({
 id: t.id,
 title: t.title,
 priority: t.priority,
 estimatedMinutes: t.estimatedMinutes,
 scheduledStartMinute: t.scheduledStartMinute,
 status: (t.status === 'in_progress' ? 'in-progress' : t.status) as any,
 createdAt: Date.now(),
 completedAt: t.completedAt ?? null,
 }));
 const planned = planDaySchedule(mappedTasks);
 for (const item of planned.assignments) {
 const t = this.tasks.find((x) => x.id === item.taskId);
 if (t) t.scheduledStartMinute = item.startMinute;
 }
 this.saveTasks(true, 'Planned schedule with rest buffers');
 this.setPipSpeech('Packed tasks into your schedule with 10-minute rest buffers.');
 this.triggerPipEmote('celebrate');
 });
 }

 const chipOverloaded = asset.getElementById('chip-pip-overloaded');
 if (chipOverloaded) {
 this.addPress(chipOverloaded, () => {
 const donut = calculateWorkloadDonut(this.tasks);
 if (donut.isOverloaded) {
 this.setPipSpeech(`You have ${donut.scheduledFormatted} scheduled. Consider rescheduling low priority tasks.`);
 } else {
 this.setPipSpeech(`You're at ${donut.percentage}% capacity (${donut.scheduledFormatted} planned). You're on track!`);
 }
 });
 }

 const chipStartFocus = asset.getElementById('chip-pip-start-focus');
 if (chipStartFocus) {
 this.addPress(chipStartFocus, () => this.toggleFocusTimer());
 }

  const handlePip = asset.getElementById('handle-bar-pip');
  if (handlePip) this.bindPanelDragHandle(handlePip, 'panel-right-pip');

    const muteBtn = asset.getElementById('btn-pip-mute');
    if (muteBtn) {
      this.addPress(muteBtn, () => {
        this.isPipMuted = !this.isPipMuted;
        const muteTxt = asset.getElementById('pip-mute-text') as any;
        if (this.isPipMuted) {
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
          if (muteTxt) setText(muteTxt, 'Unmute');
          this.setPipSpeech('Pip is muted. Click mic to speak anytime.', false);
        } else {
          if (muteTxt) setText(muteTxt, 'Mute');
          this.setPipSpeech('Voice unmuted. Pip is ready to assist!');
        }
      });
    }

    const micBtn = asset.getElementById('btn-pip-mic');
 if (micBtn) {
 this.addPress(micBtn, () => {
 this.handleVoiceInputTrigger();
 });
 }
 }

  private getGeminiApiKey(): string {
    try {
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('deskmate.gemini.key.v1');
        if (stored && stored.trim()) return stored.trim();
      }
    } catch {}
    return DEFAULT_GEMINI_KEY;
  }

  private handleVoiceInputTrigger() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    if (this.voiceListening) {
      if (this.currentSpeechRec) {
        try { this.currentSpeechRec.stop(); } catch {}
        this.currentSpeechRec = null;
      }
      this.voiceListening = false;
      this.refreshPipPanelUI();
      return;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    
    const SpeechRec =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (SpeechRec) {
      try {
        if (this.currentSpeechRec) {
          try { this.currentSpeechRec.stop(); } catch {}
          this.currentSpeechRec = null;
        }

        const rec = new SpeechRec();
        this.currentSpeechRec = rec;
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        let accumulatedTranscript = '';
        let speechCommitted = false;
        let isUserSpeaking = false;

        const commitSpeech = () => {
          if (speechCommitted) return;
          speechCommitted = true;

          if (this.voiceSilenceTimer) {
            window.clearTimeout(this.voiceSilenceTimer);
            this.voiceSilenceTimer = null;
          }
          try { rec.stop(); } catch {}
          this.currentSpeechRec = null;
          this.voiceListening = false;
          this.refreshPipPanelUI();

          const finalTranscript = accumulatedTranscript.trim();
          accumulatedTranscript = '';

          if (finalTranscript) {
            // Buffer: ONLY start talking after user has completely stopped speaking
            window.setTimeout(() => {
              this.executeVoiceCommand(finalTranscript);
            }, 300);
          }
        };

        rec.onstart = () => {
          this.voiceListening = true;
          accumulatedTranscript = '';
          speechCommitted = false;
          isUserSpeaking = false;
          this.setPipSpeech('Listening for voice... Speak your command.', false);
          this.triggerPipEmote('thinking');
          this.refreshPipPanelUI();
        };

        rec.onspeechstart = () => {
          isUserSpeaking = true;
          // While the user is speaking, cancel silence timer - NEVER interrupt the user!
          if (this.voiceSilenceTimer) {
            window.clearTimeout(this.voiceSilenceTimer);
            this.voiceSilenceTimer = null;
          }
        };

        rec.onspeechend = () => {
          isUserSpeaking = false;
          // User stopped speaking: wait 1200ms to confirm silence, then Pip responds
          if (this.voiceSilenceTimer) {
            window.clearTimeout(this.voiceSilenceTimer);
          }
          this.voiceSilenceTimer = window.setTimeout(() => {
            commitSpeech();
          }, 1200);
        };

        rec.onresult = (evt: any) => {
          let interim = '';
          for (let i = evt.resultIndex; i < evt.results.length; i++) {
            const res = evt.results[i];
            const text = res[0]?.transcript || '';
            if (res.isFinal) {
              accumulatedTranscript += ' ' + text;
            } else {
              interim += text;
            }
          }

          const liveText = (accumulatedTranscript + ' ' + interim).trim();
          if (liveText) {
            this.setPipSpeech(`Listening: "${liveText}"...`, false);
          }

          // Allow natural conversational pauses while user is speaking
          if (this.voiceSilenceTimer) {
            window.clearTimeout(this.voiceSilenceTimer);
          }
          this.voiceSilenceTimer = window.setTimeout(() => {
            if (!isUserSpeaking) {
              commitSpeech();
            }
          }, 2000);
        };

        rec.onerror = (err: any) => {
          console.warn('Speech recognition status/error:', err);
          if (this.voiceSilenceTimer) {
            window.clearTimeout(this.voiceSilenceTimer);
            this.voiceSilenceTimer = null;
          }
          this.voiceListening = false;
          this.refreshPipPanelUI();

          const finalTranscript = accumulatedTranscript.trim();
          accumulatedTranscript = '';
          if (!speechCommitted && finalTranscript) {
            speechCommitted = true;
            this.executeVoiceCommand(finalTranscript);
            return;
          }

          if (err?.error === 'no-speech') {
            this.setPipSpeech('No speech heard. Click the mic to speak anytime.', false);
            return;
          }

          this.promptTextVoiceFallback();
        };

        rec.onend = () => {
          this.voiceListening = false;
          this.refreshPipPanelUI();
          const finalTranscript = accumulatedTranscript.trim();
          accumulatedTranscript = '';
          if (!speechCommitted && finalTranscript) {
            speechCommitted = true;
            window.setTimeout(() => {
              this.executeVoiceCommand(finalTranscript);
            }, 300);
          }
        };

        rec.start();
        return;
      } catch (err) {
        console.warn('Could not initialize speech recognition:', err);
      }
    }

    this.promptTextVoiceFallback();
  }

  private promptTextVoiceFallback() {
    this.voiceListening = false;
    this.refreshPipPanelUI();
    this.setPipSpeech('Ready for voice command. Tap the mic button and speak anytime.', false);
    this.triggerPipEmote('thinking');
  }

  public speakTextAloud(text: string, force = false) {
    if (this.isPipMuted && !force) return;
    if (this.voiceListening && !force) return; // Only speak when user is NOT speaking!
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      const synth = window.speechSynthesis;
      // Resume if browser suspended audio or speech synthesis
      if (synth.paused) {
        synth.resume();
      }
      synth.cancel();

      const clean = text
        .replace(/[*_#`[\]()]/g, ' ')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean) return;

      const utterance = new SpeechSynthesisUtterance(clean);

      // Select the most natural human-like voice available in the environment
      const voices = synth.getVoices();
      const naturalVoice =
        voices.find((v) =>
          v.lang.startsWith('en') && (
            v.name.includes('Natural') ||
            v.name.includes('Neural') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Aria') ||
            v.name.includes('Jenny') ||
            v.name.includes('Guy') ||
            v.name.includes('Daniel') ||
            v.name.includes('Karen') ||
            v.name.includes('Premium')
          )
        ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];

      if (naturalVoice) {
        utterance.voice = naturalVoice;
      }
      utterance.rate = 1.05;
      utterance.pitch = 1.05; // Natural, friendly companion pitch
      utterance.volume = 1.0;

      // Chrome V8 garbage collection safeguard: pin utterance to window so it isn't collected mid-speech
      (window as any).__pipCurrentUtterance = utterance;
      utterance.onend = () => {
        if ((window as any).__pipCurrentUtterance === utterance) {
          (window as any).__pipCurrentUtterance = null;
        }
      };
      utterance.onerror = (e) => {
        console.warn('[Pip Voice] speech synthesis error:', e);
      };

      synth.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis failed:', e);
    }
  }

  private async queryGeminiVoiceAssistant(transcript: string): Promise<boolean> {
    const apiKey = this.getGeminiApiKey();
    if (!apiKey) return false;

    try {
      const now = new Date();
      const currentMinute = now.getHours() * 60 + now.getMinutes();
      const taskSummary = this.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes,
        scheduledStartMinute: t.scheduledStartMinute,
        status: t.status,
        dayNumber: t.dayNumber ?? this.selectedDayNumber,
      }));

      const systemPrompt = `You are Pip, the voice AI companion in DeskMate VR/spatial productivity workspace.
You have FULL CONTROL of the entire application. When the user speaks, understand their intent, execute their desired workspace actions, and formulate a friendly spoken response.

Current Workspace State:
- Today is day ${this.selectedDayNumber} of the month (current minute of day: ${currentMinute}).
- Selected Day in View: Nov ${this.selectedDayNumber}.
- Active Workspace Tab: "${this.activeTab}", Hub View: "${this.activeHubView}".
- Focus Timer Remaining: ${Math.round(this.focusRemainingSeconds / 60)} minutes (running: ${this.focusRunning}).
- Existing Tasks: ${JSON.stringify(taskSummary)}.

Supported Action Types you can return in "actions" array:
1. "add_task": { "title": string, "priority"?: "low"|"medium"|"high", "estimatedMinutes"?: number, "scheduledStartMinute"?: number, "dayNumber"?: number }
2. "delete_task": { "taskId"?: string, "titleQuery"?: string }
3. "edit_task": { "taskId"?: string, "titleQuery"?: string, "newTitle"?: string, "priority"?: "low"|"medium"|"high", "estimatedMinutes"?: number, "scheduledStartMinute"?: number, "status"?: "todo"|"in_progress"|"completed" }
4. "complete_task": { "taskId"?: string, "titleQuery"?: string }
5. "navigate_view": { "target": "schedule"|"overview"|"agenda"|"calendar"|"focus"|"habits"|"deadlines"|"garden"|"editor", "dayNumber"?: number }
6. "pull_panel": { "panelId": "panel-hub"|"panel-left-tasks"|"panel-right-pip"|"panel-right-focus" }
7. "start_focus_timer": { "minutes"?: number }
8. "pause_focus_timer": {}
9. "plan_day": {}
10. "what_next": {}

Instructions:
- Return ONLY a valid JSON object matching this schema:
{
  "actions": [ /* array of action objects to execute */ ],
  "reply": "Conversational, natural response to speak aloud (1-2 short sentences max)."
}
- If the user asks to add multiple tasks, you can include multiple "add_task" actions.
- If the user wants to bring or show something, use "navigate_view" or "pull_panel".
- If the user asks a general question or greeting, return empty actions and answer nicely as Pip.

User command: "${transcript}"`;

      let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      });

      if (!res.ok) {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
          }),
        });
      }

      if (!res.ok) {
        console.warn('[Gemini] API returned status:', res.status);
        return false;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return false;

      const parsed = JSON.parse(rawText);
      const actions: any[] = Array.isArray(parsed.actions) ? parsed.actions : [];
      let stateChanged = false;

      for (const act of actions) {
        if (!act || !act.type) continue;

        if (act.type === 'add_task') {
          const targetDay = typeof act.dayNumber === 'number' ? act.dayNumber : this.selectedDayNumber;
          const newTask: GlassTask = {
            id: `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            title: act.title || 'New Task',
            estimatedMinutes: typeof act.estimatedMinutes === 'number' ? act.estimatedMinutes : 30,
            priority: act.priority === 'high' || act.priority === 'low' ? act.priority : 'medium',
            scheduledStartMinute: typeof act.scheduledStartMinute === 'number' ? act.scheduledStartMinute : (targetDay === 17 ? 600 : 540),
            status: 'todo',
            dayNumber: targetDay,
          };
          this.tasks.push(newTask);
          this.selectedDayNumber = targetDay;
          this.calendarDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth(), targetDay);
          this.updateCalendarDays();
          stateChanged = true;
        } else if (act.type === 'delete_task') {
          const q = (act.titleQuery || '').toLowerCase().trim();
          const id = act.taskId;
          const idx = this.tasks.findIndex((t) => (id && t.id === id) || (q && t.title.toLowerCase().includes(q)));
          if (idx >= 0) {
            this.tasks.splice(idx, 1);
            stateChanged = true;
          }
        } else if (act.type === 'edit_task') {
          const q = (act.titleQuery || '').toLowerCase().trim();
          const id = act.taskId;
          const target = this.tasks.find((t) => (id && t.id === id) || (q && t.title.toLowerCase().includes(q)));
          if (target) {
            if (act.newTitle) target.title = act.newTitle;
            if (typeof act.estimatedMinutes === 'number') target.estimatedMinutes = act.estimatedMinutes;
            if (act.priority) target.priority = act.priority;
            if (typeof act.scheduledStartMinute === 'number') target.scheduledStartMinute = act.scheduledStartMinute;
            if (act.status) target.status = act.status;
            stateChanged = true;
          }
        } else if (act.type === 'complete_task') {
          const q = (act.titleQuery || '').toLowerCase().trim();
          const id = act.taskId;
          const target = this.tasks.find((t) => (id && t.id === id) || (q && t.title.toLowerCase().includes(q)));
          if (target) {
            target.status = 'completed';
            target.completedAt = Date.now();
            this.gardenPoints += 20;
            stateChanged = true;
          }
        } else if (act.type === 'navigate_view') {
          if (typeof act.dayNumber === 'number') {
            this.selectedDayNumber = act.dayNumber;
            stateChanged = true;
          }
          const t = act.target;
          if (t === 'calendar') this.zoomSection('panel-left-tasks', 'Mini Calendar');
          else if (t === 'agenda' || t === 'tasks') {
            this.switchNavTab('tasks');
            this.zoomSection('panel-left-tasks', "Today's Agenda");
          } else if (t === 'pip') {
            this.zoomSection('panel-right-pip', 'Pip Spatial Companion');
          } else if (t === 'focus') {
            this.switchNavTab('focus');
            this.zoomSection('panel-right-focus', 'Focus Studio');
          } else if (t === 'month') {
            this.switchNavTab('schedule');
            this.setScheduleView('month');
          } else if (t === 'week') {
            this.switchNavTab('schedule');
            this.setScheduleView('week');
          } else if (t === 'habits') this.zoomSection('panel-right-focus', 'Habits & Streaks');
          else if (t === 'deadlines') this.zoomSection('panel-right-focus', 'Upcoming Deadlines');
          else if (t === 'garden') this.zoomSection('panel-right-pip', 'Productivity Garden');
          else if (t === 'schedule') { this.switchNavTab('schedule'); this.resetZoom(); }
          else if (t === 'overview') this.resetZoom();
        } else if (act.type === 'pull_panel') {
          if (act.panelId === 'panel-right-pip') {
            this.zoomSection('panel-right-pip', 'Pip Spatial Companion');
          } else if (act.panelId === 'panel-left-tasks') {
            this.zoomSection('panel-left-tasks', "Today's Agenda");
          } else if (act.panelId === 'panel-right-focus') {
            this.zoomSection('panel-right-focus', 'Focus Studio');
          } else if (act.panelId) {
            this.togglePanelPull(act.panelId);
          }
        } else if (act.type === 'start_focus_timer') {
          const mins = typeof act.minutes === 'number' && act.minutes > 0 ? act.minutes : 25;
          this.focusRemainingSeconds = mins * 60;
          this.focusTotalSeconds = mins * 60;
          this.focusRunning = true;
          stateChanged = true;
        } else if (act.type === 'pause_focus_timer') {
          this.focusRunning = false;
        } else if (act.type === 'plan_day') {
          const mappedTasks: TaskItem[] = this.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            estimatedMinutes: t.estimatedMinutes,
            scheduledStartMinute: t.scheduledStartMinute,
            status: (t.status === 'in_progress' ? 'in-progress' : t.status) as any,
            createdAt: Date.now(),
            completedAt: t.completedAt ?? null,
          }));
          const planned = planDaySchedule(mappedTasks);
          for (const item of planned.assignments) {
            const t = this.tasks.find((x) => x.id === item.taskId);
            if (t) t.scheduledStartMinute = item.startMinute;
          }
          stateChanged = true;
        } else if (act.type === 'what_next') {
          this.handlePipWhatNext();
        }
      }

      if (stateChanged) {
        this.saveTasks(true, `Voice command: "${transcript}"`);
        this.refreshAllUI();
      }

      const replyText = parsed.reply || "Done! I've updated DeskMate for you.";
      this.triggerPipEmote('celebrate');
      if (this.soundEnabled && this.audio) this.audio.playPinchTick();
      this.setPipSpeech(replyText, true, true);
      return true;
    } catch (err) {
      console.warn('[Gemini] Voice assistant error:', err);
      return false;
    }
  }

  public async executeVoiceCommand(transcript: string) {
    if (!transcript || !transcript.trim()) return;

    this.voiceListening = false;
    this.refreshPipPanelUI();
    this.setPipSpeech(`Thinking...`, false);
    this.triggerPipEmote('thinking');

    // 1. First attempt with Gemini 3.5 Flash Lite AI Assistant
    const geminiHandled = await this.queryGeminiVoiceAssistant(transcript.trim());
    if (geminiHandled) {
      return;
    }

    // 2. Fallback to intelligent deterministic local command parser if offline or error
    this.executeLocalVoiceFallback(transcript.trim());
  }

  private executeLocalVoiceFallback(transcript: string) {
    const rawLower = transcript.toLowerCase().trim();
    const lower = rawLower
      .replace(/^(?:hey\s+|hi\s+|hello\s+)?(?:pip|deskmate)[,\s]*/i, '')
      .replace(/^(?:can\s+you\s+|please\s+|could\s+you\s+|i\s+want\s+to\s+|i\s+need\s+to\s+)/i, '')
      .trim();

 // 0. Workspace Controls (Reset, Open, Close DeskMate)
    if (lower.includes('reset panel') || lower.includes('reset workspace') || lower.includes('reset positions')) {
      this.resetPanelTransforms();
      this.setPipSpeech('All panels have been reset to their startup positions.');
      return;
    }
    if (lower.includes('close deskmate') || lower.includes('hide deskmate')) {
      this.closeDeskMate();
      this.setPipSpeech('DeskMate closed. Click open anytime to return.');
      return;
    }
    if (lower.includes('open deskmate') || lower.includes('launch deskmate') || lower.includes('show deskmate')) {
      this.openDeskMate();
      this.setPipSpeech('Welcome back to DeskMate!');
      return;
    }

    // 0. Specific Voice Actions: Bring to Center (Agenda, Pip, Focus, Month, Week)
    if (lower.includes('agenda') || lower.includes("today's agenda") || lower.includes('todays agenda')) {
      this.switchNavTab('tasks');
      this.zoomSection('panel-left-tasks', "Today's Agenda");
      this.setPipSpeech("Opening Today's Agenda in center.");
      return;
    }
    if (lower.includes('pip') || lower.includes('open pip') || lower.includes('show pip') || lower.includes('talk to pip') || lower === 'pip') {
      this.zoomSection('panel-right-pip', 'Pip Spatial Companion');
      this.triggerPipEmote('celebrate');
      this.setPipSpeech("Pip is right here in center! What would you like to plan today?");
      return;
    }
    if (lower.includes('focus') || lower.includes('focus session') || lower.includes('focus studio') || lower.includes('deep work')) {
      this.switchNavTab('focus');
      this.zoomSection('panel-right-focus', 'Focus Studio');
      if (lower.includes('start') || lower.includes('timer') || lower.includes('minute') || lower.includes('min')) {
        const matchMin = lower.match(/(\d+)\s*(?:minute|min|m)?/);
        const minutes = matchMin && matchMin[1] ? parseInt(matchMin[1], 10) : 25;
        this.focusRemainingSeconds = minutes * 60;
        this.focusTotalSeconds = minutes * 60;
        this.focusRunning = true;
        this.refreshHubPanelUI();
        this.triggerPipEmote('celebrate');
        this.setPipSpeech(`Opened Focus Studio and started ${minutes}-minute sprint!`);
      } else {
        this.setPipSpeech('Opened Focus Studio in center.');
      }
      return;
    }

    // Timer Controls
    if (lower.includes('pause timer') || lower.includes('stop timer')) {
      this.focusRunning = false;
      this.refreshHubPanelUI();
      this.setPipSpeech('Paused focus timer.');
      return;
    }
    if (lower.includes('resume timer')) {
      this.focusRunning = true;
      this.refreshHubPanelUI();
      this.setPipSpeech('Resumed focus timer.');
      return;
    }
    if (lower.includes('reset timer')) {
      this.focusRunning = false;
      this.focusRemainingSeconds = this.focusTotalSeconds;
      this.refreshHubPanelUI();
      this.setPipSpeech('Focus timer has been reset.');
      return;
    }
    if (lower.includes('start timer') || lower.includes('set timer') || lower.includes('timer on') || lower.includes('timer for')) {
      const matchMin = lower.match(/(\d+)\s*(?:minute|min|m)?/);
      const minutes = matchMin && matchMin[1] ? parseInt(matchMin[1], 10) : 25;
      this.focusRemainingSeconds = minutes * 60;
      this.focusTotalSeconds = minutes * 60;
      this.focusRunning = true;
      this.refreshHubPanelUI();
      this.triggerPipEmote('celebrate');
      this.setPipSpeech(`Started focus timer for ${minutes} minutes. Let's do this!`);
      return;
    }

    // 1. Section Navigation
    if (
      lower.includes('switch to') ||
      lower.includes('open ') ||
      lower.includes('show ') ||
      lower.includes('bring ') ||
      lower.includes('view ') ||
      lower.includes('go to ') ||
      lower.includes('navigate to ') ||
      lower.includes('section')
    ) {
      if (lower.includes('focus') || lower.includes('timer') || lower.includes('studio')) {
        this.switchNavTab('focus');
        this.zoomSection('panel-right-focus', 'Focus Studio');
        this.setPipSpeech('Opened Focus Studio in center.');
        return;
      }
      if (lower.includes('week')) {
        this.switchNavTab('schedule');
        this.setScheduleView('week');
        this.setPipSpeech('Opened Week Schedule view.');
        return;
      }
      if (lower.includes('month') || lower.includes('calendar')) {
        this.switchNavTab('schedule');
        this.setScheduleView('month');
        this.setPipSpeech('Opened Month Calendar view.');
        return;
      }
      if (lower.includes('schedule') || lower.includes('day')) {
        this.switchNavTab('schedule');
        this.setScheduleView('day');
        this.setPipSpeech('Opened Day Schedule view.');
        return;
      }
      if (lower.includes('task') || lower.includes('agenda')) {
        this.switchNavTab('tasks');
        this.zoomSection('panel-left-tasks', "Today's Agenda");
        this.setPipSpeech("Opened Today's Tasks and Agenda in center.");
        return;
      }
      if (lower.includes('habit') || lower.includes('routine')) {
        this.switchNavTab('routines');
        this.setPipSpeech('Opened Routines and Habits section.');
        return;
      }
      if (lower.includes('note')) {
        this.switchNavTab('notes');
        this.setPipSpeech('Opened Notes section.');
        return;
      }
      if (lower.includes('analytic') || lower.includes('workload')) {
        this.switchNavTab('analytics');
        this.setPipSpeech('Opened Analytics and Workload section.');
        return;
      }
      if (lower.includes('garden')) {
        this.switchNavTab('garden');
        this.setPipSpeech('Opened Productivity Garden.');
        return;
      }
      if (lower.includes('goal')) {
        this.switchNavTab('goals');
        this.setPipSpeech('Opened Goals and Milestones section.');
        return;
      }
      if (lower.includes('overview') || lower.includes('dashboard') || lower.includes('back')) {
        this.resetZoom();
        this.setPipSpeech('Returned to full workspace overview.');
        return;
      }
    }

    // 2. Delete / Remove Task
 if (lower.startsWith('delete') || lower.startsWith('remove') || lower.includes('delete task') || lower.includes('remove task')) {
 const query = lower
 .replace(/^(?:delete|remove)\s+(?:task\s+)?/, '')
 .replace(/^(?:the\s+)/, '')
 .trim();
 if (query) {
 const taskIndex = this.tasks.findIndex((t) => t.title.toLowerCase().includes(query));
 if (taskIndex >= 0) {
 const removed = this.tasks.splice(taskIndex, 1)[0];
 this.saveTasks(true, `Deleted "${removed.title}" via Pip`);
 this.refreshAllUI();
 this.triggerPipEmote('celebrate');
 this.setPipSpeech(`Removed task "${removed.title}" from your schedule.`);
 return;
 } else {
 this.setPipSpeech(`I couldn't find any task matching "${query}".`);
 return;
 }
 }
 }

 // 3. Edit / Modify Task (time, duration, priority, or open editor)
 if (lower.startsWith('edit') || lower.startsWith('update') || lower.startsWith('change') || lower.startsWith('modify') || lower.startsWith('set ') || lower.startsWith('move ')) {
 // Time edit: "change [task] time to 8pm", "move [task] to 8pm", "set [task] timing to 8pm"
 const timeMatch = lower.match(/(?:change|set|move)\s+(?:task\s+)?(.+?)\s+(?:time|timing|start\s*time)?\s*to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
 if (timeMatch) {
 const taskQuery = timeMatch[1].replace(/\b(?:time|timing|start\s*time)\b/g, '').trim();
 let hour = parseInt(timeMatch[2], 10);
 const minute = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
 const meridian = (timeMatch[4] || '').toLowerCase();
 if (meridian === 'pm' && hour < 12) hour += 12;
 if (meridian === 'am' && hour === 12) hour = 0;
 const newStartMin = hour * 60 + minute;
 const task = this.tasks.find((t) => t.title.toLowerCase().includes(taskQuery));
 if (task) {
 task.scheduledStartMinute = newStartMin;
 this.saveTasks(true, `Changed time of "${task.title}" to ${newStartMin}`);
 this.refreshAllUI();
 this.triggerPipEmote('celebrate');
 const ampm = hour >= 12 ? 'PM' : 'AM';
 const displayH = hour % 12 === 0 ? 12 : hour % 12;
 const timeFormatted = `${displayH}:${minute < 10 ? '0' : ''}${minute} ${ampm}`;
 this.setPipSpeech(`Changed ${task.title} start time to ${timeFormatted}!`);
 return;
 }
 }

 // Priority edit: "change [task] priority to high"
 const priorityMatch = lower.match(/(?:change|set)\s+(?:task\s+)?(.+?)\s+priority\s+to\s+(high|medium|low)/);
 if (priorityMatch) {
 const taskQuery = priorityMatch[1].trim();
 const newPrio = priorityMatch[2] as 'high' | 'medium' | 'low';
 const task = this.tasks.find((t) => t.title.toLowerCase().includes(taskQuery));
 if (task) {
 task.priority = newPrio;
 this.saveTasks(true, `Changed priority of "${task.title}" to ${newPrio}`);
 this.refreshAllUI();
 this.triggerPipEmote('celebrate');
 this.setPipSpeech(`Changed ${task.title} priority to ${newPrio}!`);
 return;
 }
 }

 // Duration edit: "change [task] duration to 60 minutes"
 const durationMatch = lower.match(/(?:change|set)\s+(?:task\s+)?(.+?)\s+duration\s+to\s+(\d+)\s*(?:minutes|min|m)?/);
 if (durationMatch) {
 const taskQuery = durationMatch[1].trim();
 const newDur = parseInt(durationMatch[2], 10);
 const task = this.tasks.find((t) => t.title.toLowerCase().includes(taskQuery));
 if (task) {
 task.estimatedMinutes = newDur;
 this.saveTasks(true, `Changed duration of "${task.title}" to ${newDur}m`);
 this.refreshAllUI();
 this.triggerPipEmote('celebrate');
 this.setPipSpeech(`Updated ${task.title} duration to ${newDur} minutes!`);
 return;
 }
 }

 // General Edit: "edit task [title]"
 const editQuery = lower
 .replace(/^(?:edit|update|change|modify)\s+(?:task\s+)?/, '')
 .replace(/^(?:the\s+)/, '')
 .trim();
 if (editQuery) {
 const task = this.tasks.find((t) => t.title.toLowerCase().includes(editQuery));
 if (task) {
 this.openEditSheet(task.id);
 this.triggerPipEmote('thinking');
 this.setPipSpeech(`Opening editor for ${task.title}. You can change duration, time, and priority.`);
 return;
 } else {
 this.setPipSpeech(`I couldn't find any task matching "${editQuery}".`);
 return;
 }
 }
 }

 // 4. Finish / Complete Task
 if (lower.startsWith('finish') || lower.startsWith('complete') || lower.includes('mark done') || lower.includes('finish task') || lower.includes('complete task')) {
 const query = lower
 .replace(/^(?:finish|complete|mark done)\s+(?:task\s+)?/, '')
 .replace(/^(?:the\s+)/, '')
 .replace(/\s+as done$/, '')
 .trim();
 if (query) {
 const task = this.tasks.find((t) => t.title.toLowerCase().includes(query));
 if (task) {
 task.status = 'completed';
 task.completedAt = Date.now();
 this.gardenPoints += 20;
 this.saveTasks(true, `Completed "${task.title}" via Pip`);
 this.refreshAllUI();
 this.triggerPipEmote('celebrate');
 this.setPipSpeech(`Marked ${task.title} as completed! Plus 20 garden XP.`);
 return;
 } else {
 this.setPipSpeech(`I couldn't find a task matching "${query}".`);
 return;
 }
 }
 }

 // 5. Keep Timer / Set Timer
 if (lower.includes('timer') || lower.includes('keep timer') || lower.includes('set timer')) {
 const matchMin = lower.match(/(\d+)\s*(?:minute|min|m)?/);
 const minutes = matchMin && matchMin[1] ? parseInt(matchMin[1], 10) : 25;
 this.focusRemainingSeconds = minutes * 60;
 this.focusTotalSeconds = minutes * 60;
 this.focusRunning = true;
 this.refreshHubPanelUI();
 this.triggerPipEmote('celebrate');
 this.setPipSpeech(`Focus timer set to ${minutes} minutes. Let's do this!`);
 return;
 }

 // 6. Plan My Day
 if (lower.includes('plan my day') || lower.includes('plan today')) {
 const mappedTasks: TaskItem[] = this.tasks.map((t) => ({
 id: t.id,
 title: t.title,
 priority: t.priority,
 estimatedMinutes: t.estimatedMinutes,
 scheduledStartMinute: t.scheduledStartMinute,
 status: (t.status === 'in_progress' ? 'in-progress' : t.status) as any,
 createdAt: Date.now(),
 completedAt: t.completedAt ?? null,
 }));
 const planned = planDaySchedule(mappedTasks);
 for (const item of planned.assignments) {
 const t = this.tasks.find((x) => x.id === item.taskId);
 if (t) t.scheduledStartMinute = item.startMinute;
 }
 this.saveTasks(true, 'Planned schedule with rest buffers');
 this.setPipSpeech('Planned your day with 10-minute rest buffers. You are all set!');
 this.triggerPipEmote('celebrate');
 if (this.soundEnabled && this.audio) this.audio.playPinchTick();
 return;
 }

 // 7. Workload / Capacity Check
 if (lower.includes('overload') || lower.includes('capacity') || lower.includes('workload')) {
 const donut = calculateWorkloadDonut(this.tasks);
 if (donut.isOverloaded) {
 this.setPipSpeech(`Workload alert: You have ${donut.scheduledFormatted} scheduled. Consider rescheduling low priority items.`);
 } else {
 this.setPipSpeech(`You are at ${donut.percentage}% capacity with ${donut.scheduledFormatted} planned. You are on track!`);
 }
 return;
 }

 // 8. What Next Recommendation
 if (lower.includes('what next') || lower.includes('what should i do')) {
 this.handlePipWhatNext();
 return;
 }

 // 9. Add Task on Any Day (Today, Tomorrow, Specific Date)
 const parsed = parseVoiceTaskCommand(transcript, this.selectedDayNumber);
 if (parsed) {
 const newTask: GlassTask = {
 id: `task-${Date.now()}`,
 title: parsed.title,
 estimatedMinutes: parsed.estimatedMinutes,
 priority: parsed.priority,
 scheduledStartMinute: parsed.scheduledStartMinute,
 status: 'todo',
 dayNumber: parsed.dayNumber,
 };
 this.tasks.push(newTask);
 this.saveTasks(true, `Added "${parsed.title}" via Pip`);
 this.selectedDayNumber = parsed.dayNumber;
 this.calendarDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth(), parsed.dayNumber);
 this.updateCalendarDays();
 this.refreshAllUI();

 const monthName = this.monthNames[this.calendarDate.getMonth()]?.slice(0, 3) || 'Nov';
 const h = Math.floor((parsed.scheduledStartMinute ?? 600) / 60);
 const m = (parsed.scheduledStartMinute ?? 600) % 60;
 const ampm = h >= 12 ? 'PM' : 'AM';
 const displayH = h % 12 === 0 ? 12 : h % 12;
 const timeFormatted = `${displayH}:${m < 10 ? '0' : ''}${m} ${ampm}`;

 this.setPipSpeech(
 `Added ${parsed.title} for ${monthName} ${parsed.dayNumber} at ${timeFormatted}! Switched to ${monthName} ${parsed.dayNumber}.`,
 true,
 true,
 );
 this.triggerPipEmote('celebrate');
 if (this.soundEnabled && this.audio) this.audio.playPinchTick();
 return;
 }

 this.setPipSpeech(`I heard: "${transcript}". You can ask me to add, delete, or edit a task, set a timer, or switch views.`);
 this.triggerPipEmote('thinking');
 }

 private handlePipWhatNext() {
 const mappedTasks: TaskItem[] = this.tasks.map((t) => ({
 id: t.id,
 title: t.title,
 priority: t.priority,
 estimatedMinutes: t.estimatedMinutes,
 scheduledStartMinute: t.scheduledStartMinute,
 status: (t.status === 'in_progress' ? 'in-progress' : t.status) as any,
 createdAt: Date.now(),
 completedAt: t.completedAt ?? null,
 }));
 const rec = recommendWhatNext(mappedTasks);
 if (rec && rec.task) {
 this.setPipSpeech(`Done: Recommended next task is "${rec.task.title}". ${rec.rationale}`);
 this.triggerPipEmote('thinking');
 } else {
 this.setPipSpeech('Done: All caught up! Start a new task or take a rest.');
 }
 }

 public setPipSpeech(text: string, speakAloud: boolean = true, force = false) {
    const pipAsset = this.getAsset('panel-right-pip');
    if (pipAsset) {
      const speechEl = pipAsset.getElementById('pip-speech-text') as any;
      if (speechEl) setText(speechEl, text);
    }
    const hubAsset = this.getAsset('panel-hub');
    if (hubAsset) {
      const hubPipText = hubAsset.getElementById('hub-pip-text') as any;
      if (hubPipText) setText(hubPipText, `Pip: ${text}`);
    }
    if (speakAloud && !this.voiceListening) {
      this.speakTextAloud(text, force);
    }
  }

 public triggerPipEmote(emote: 'celebrate' | 'thinking' | 'idle') {
 this.pipEmoteState = emote;
 if (this.pipEmoteTimer) window.clearTimeout(this.pipEmoteTimer);
 if (emote !== 'idle') {
 this.pipEmoteTimer = window.setTimeout(() => {
 this.pipEmoteState = 'idle';
 }, 4000);
 }
 }

 // --------------------------------------------------------------------------
 // Focus Panel Binding (Right Column Bottom: Habits & Deadlines)
 // --------------------------------------------------------------------------
 private bindFocusPanel() {
 const asset = this.getAsset('panel-right-focus');
 if (!asset) return;
 const handleFocus = asset.getElementById('handle-bar-focus');
 if (handleFocus) this.bindPanelDragHandle(handleFocus, 'panel-right-focus');

 // Zoom & Back
 const cardHabits = asset.getElementById('card-habits');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardHabits) this.addPress(cardHabits, () => this.zoomSection('panel-right-focus', 'Habits & Streaks'));
 const cardDeadlines = asset.getElementById('card-deadlines');
 // Container click bypassed to prevent bubbling into mic/controls: if (cardDeadlines) this.addPress(cardDeadlines, () => this.zoomSection('panel-right-focus', 'Upcoming Deadlines'));

 const zoomHabits = asset.getElementById('btn-zoom-habits');
 if (zoomHabits) {
 this.addPress(zoomHabits, () => this.zoomSection('panel-right-focus', 'Habits & Streaks', 1.18, 0.16));
 }
 const zoomDeadlines = asset.getElementById('btn-zoom-deadlines');
 if (zoomDeadlines) {
 this.addPress(zoomDeadlines, () => this.zoomSection('panel-right-focus', 'Upcoming Deadlines', 1.38, 0.16));
 }
  const focusResetBtn = asset.getElementById('btn-focus-reset-panels');
  if (focusResetBtn) this.addPress(focusResetBtn, () => this.resetPanelTransforms());

  const focusCloseBtn = asset.getElementById('btn-focus-close-deskmate');
  if (focusCloseBtn) this.addPress(focusCloseBtn, () => this.closeDeskMate());

 const habitsBack = asset.getElementById('btn-habits-back');
 if (habitsBack) {
 this.addPress(habitsBack, () => this.resetZoom());
 }

 for (let i = 0; i < this.habits.length; i++) {
 const habitRow = asset.getElementById(`habit-row-${i}`);
 if (habitRow) {
 this.addPress(habitRow, () => {
 const habit = this.habits[i];
 habit.completedCount = habit.completedCount >= 7 ? 0 : habit.completedCount + 1;
 this.setPipSpeech(`Updated habit "${habit.title}": ${habit.completedCount}/7 days.`);
 this.refreshFocusPanelUI();
 });
 }
 }

 for (let i = 0; i < this.deadlines.length; i++) {
 const deadlineRow = asset.getElementById(`deadline-row-${i}`);
 if (deadlineRow) {
 this.addPress(deadlineRow, () => {
 const dl = this.deadlines[i];
 this.setPipSpeech(`Upcoming deadline: "${dl.title}" due on ${dl.dateFormatted}.`);
 });
 }
 }
 }

 private toggleFocusTimer() {
 this.focusRunning = !this.focusRunning;
 if (this.focusRunning) {
 this.setPipSpeech('Focus sprint started! Let us dive into deep work.');
 } else {
 this.setPipSpeech('Focus sprint paused.');
 }
 this.refreshAllUI();
 }

 // --------------------------------------------------------------------------
 // Edit Sheet Panel Binding
 // --------------------------------------------------------------------------
 private bindEditSheet() {
 const asset = this.getAsset('panel-edit-sheet');
 if (!asset) return;

 const closeBtn = asset.getElementById('btn-sheet-close');
 if (closeBtn) {
 this.addPress(closeBtn, () => this.closeEditSheet());
 }

 const presets = ['Deep Work Sprint', 'Team Sync', 'Code Review', 'Write Report'];
 for (let i = 0; i < presets.length; i++) {
 const btn = asset.getElementById(`preset-${i}`);
 if (btn) {
 this.addPress(btn, () => {
 this.editDraftTitle = presets[i];
 this.updateEditSheetDisplay();
 });
 }
 }

 const durMinus = asset.getElementById('btn-dur-minus');
 if (durMinus) {
 this.addPress(durMinus, () => {
 this.editDraftDuration = Math.max(15, this.editDraftDuration - 15);
 this.updateEditSheetDisplay();
 });
 }

 const durPlus = asset.getElementById('btn-dur-plus');
 if (durPlus) {
 this.addPress(durPlus, () => {
 this.editDraftDuration = Math.min(240, this.editDraftDuration + 15);
 this.updateEditSheetDisplay();
 });
 }

 const priLow = asset.getElementById('btn-pri-low');
 if (priLow) {
 this.addPress(priLow, () => {
 this.editDraftPriority = 'low';
 this.updateEditSheetDisplay();
 });
 }

 const priMed = asset.getElementById('btn-pri-med');
 if (priMed) {
 this.addPress(priMed, () => {
 this.editDraftPriority = 'medium';
 this.updateEditSheetDisplay();
 });
 }

 const priHigh = asset.getElementById('btn-pri-high');
 if (priHigh) {
 this.addPress(priHigh, () => {
 this.editDraftPriority = 'high';
 this.updateEditSheetDisplay();
 });
 }

 const timeSlots = [
 { id: 'chip-time-9', minute: 9 * 60 },
 { id: 'chip-time-11', minute: 11 * 60 },
 { id: 'chip-time-14', minute: 14 * 60 },
 { id: 'chip-time-16', minute: 16 * 60 },
 ];
 for (const slot of timeSlots) {
 const btn = asset.getElementById(slot.id);
 if (btn) {
 this.addPress(btn, () => {
 this.editDraftStartTime = slot.minute;
 this.updateEditSheetDisplay();
 });
 }
 }

 const deleteBtn = asset.getElementById('btn-sheet-delete');
    if (deleteBtn) {
      this.addPress(deleteBtn, () => {
        if (this.editingTaskId) {
          const taskToDelete = this.tasks.find((t) => t.id === this.editingTaskId);
          this.tasks = this.tasks.filter((t) => t.id !== this.editingTaskId);
          this.saveTasks(true, `Deleted "${taskToDelete?.title || 'task'}"`);
          this.setPipSpeech(`Deleted task "${taskToDelete?.title || 'task'}".`);
        }
        this.closeEditSheet();
      });
    }

    const saveBtn = asset.getElementById('btn-sheet-save');
 if (saveBtn) {
 this.addPress(saveBtn, () => {
 if (this.editingTaskId) {
 const t = this.tasks.find((x) => x.id === this.editingTaskId);
 if (t) {
 t.title = this.editDraftTitle;
 t.estimatedMinutes = this.editDraftDuration;
 t.priority = this.editDraftPriority;
 t.scheduledStartMinute = this.editDraftStartTime;
          t.dayNumber = this.editDraftDayNumber;
        }
 this.saveTasks(true, `Updated "${this.editDraftTitle}"`);
 } else {
 const newTask: GlassTask = {
 id: `task-${Date.now()}`,
 title: this.editDraftTitle,
 estimatedMinutes: this.editDraftDuration,
 priority: this.editDraftPriority,
 scheduledStartMinute: this.editDraftStartTime,
 status: 'todo',
 dayNumber: this.editDraftDayNumber,
 };
 this.tasks.push(newTask);
 this.saveTasks(true, `Added "${this.editDraftTitle}"`);
        }
        this.selectedDayNumber = this.editDraftDayNumber;
        this.calendarDays.forEach((d) => { d.isSelected = d.dayNumber === this.selectedDayNumber; });
        this.closeEditSheet();
 });
 }
 }

  private openEditSheet(taskId: string | null, dayOverride?: number) {
    this.isEditSheetOpen = true;
    this.editingTaskId = taskId;
    this.deleteTapCount = 0;
    this.previousHubViewBeforeEdit = this.activeHubView === 'editor' ? 'overview' : this.activeHubView;

    if (taskId) {
      const task = this.tasks.find((t) => t.id === taskId);
      if (task) {
        this.editDraftTitle = task.title;
        this.editDraftDuration = task.estimatedMinutes;
        this.editDraftPriority = task.priority;
        this.editDraftStartTime = task.scheduledStartMinute;
        this.editDraftDayNumber = task.dayNumber ?? (dayOverride ?? this.selectedDayNumber);
      }
    } else {
      this.editDraftDayNumber = dayOverride ?? this.selectedDayNumber;
      this.editDraftTitle = 'Deep Work Sprint';
      this.editDraftDuration = 45;
      this.editDraftPriority = 'medium';
      this.editDraftStartTime = this.findNextAvailableSlot(this.editDraftDayNumber, this.editDraftDuration);
    }

    // Keep old 3D floating sheet hidden offscreen - task editor lives in-place in Center Hub!
    const sheetObj = this.world.getSceneObject('panel-edit-sheet');
    if (sheetObj) {
      sheetObj.position.set(0, -50, 0);
      sheetObj.visible = false;
    }

    // Switch Center Hub in-place to the Task Editor subview
    this.setHubView('editor');
    this.updateTaskEditorDisplay();
    this.setPipSpeech(
      taskId
        ? `Editing "${this.editDraftTitle}". Modify settings and click Save Task.`
        : 'Create New Task. Choose presets, duration, and click Save Task.',
    );
  }

  private closeEditSheet() {
    this.isEditSheetOpen = false;
    this.editingTaskId = null;
    this.deleteTapCount = 0;
    const sheetObj = this.world.getSceneObject('panel-edit-sheet');
    if (sheetObj) {
      sheetObj.position.set(0, -50, 0);
      sheetObj.visible = false;
    }
    const returnView = (this.previousHubViewBeforeEdit && this.previousHubViewBeforeEdit !== 'editor')
      ? this.previousHubViewBeforeEdit
      : 'overview';
    this.setHubView(returnView as any);
    this.refreshAllUI();
  }

 private updateTaskEditorDisplay() {
 const hubAsset = this.getAsset('panel-hub');
 if (!hubAsset) return;

 const titleEl = hubAsset.getElementById('editor-title') as any;
 if (titleEl) {
 setText(titleEl, this.editingTaskId ? `Edit: ${this.editDraftTitle}` : 'Create New Task');
 }

 const durEl = hubAsset.getElementById('ed-duration-display') as any;
 if (durEl) {
 setText(durEl, `${this.editDraftDuration}m`);
 }

    const currentWeek = this.computeCurrentWeek();
    for (let i = 0; i < 7; i++) {
      const dayInfo = currentWeek[i];
      const d = dayInfo.dayNumber;
      const isSel = this.editDraftDayNumber === d;

      const txtEl = hubAsset.getElementById(`ed-day-txt-${i}`) as any;
      if (txtEl) setText(txtEl, `${dayInfo.dayOfWeek} ${d}`);

      const dBtn = (hubAsset.getElementById(`ed-day-${i}`) || hubAsset.getElementById(`ed-day-${d}`)) as any;
      if (dBtn && typeof dBtn.setProperties === 'function') {
        dBtn.setProperties({
          backgroundColor: isSel ? 'rgba(235, 94, 40, 0.40)' : 'rgba(255, 255, 255, 0.05)',
          borderColor: isSel ? '#EB5E28' : 'rgba(255, 255, 255, 0.15)',
        });
      }
    }

    // Priority button styling
 const priButtons: Array<{ id: string; textId: string; pri: 'low' | 'medium' | 'high'; activeBg: string; activeBorder: string; activeColor: string }> = [
 { id: 'ed-pri-low', textId: 'ed-pri-low-text', pri: 'low', activeBg: 'rgba(59, 130, 246, 0.40)', activeBorder: '#3B82F6', activeColor: '#93C5FD' },
 { id: 'ed-pri-med', textId: 'ed-pri-med-text', pri: 'medium', activeBg: 'rgba(234, 179, 8, 0.40)', activeBorder: '#EAB308', activeColor: '#FDE047' },
 { id: 'ed-pri-high', textId: 'ed-pri-high-text', pri: 'high', activeBg: 'rgba(239, 68, 68, 0.40)', activeBorder: '#EF4444', activeColor: '#FCA5A5' },
 ];
 for (const p of priButtons) {
 const btn = hubAsset.getElementById(p.id) as any;
 const isActive = this.editDraftPriority === p.pri;
 if (btn && typeof btn.setProperties === 'function') {
 btn.setProperties({
 backgroundColor: isActive ? p.activeBg : 'rgba(255, 255, 255, 0.05)',
 borderColor: isActive ? p.activeBorder : 'rgba(255, 255, 255, 0.15)',
 });
 }
 const txt = hubAsset.getElementById(p.textId) as any;
 if (txt && typeof txt.setProperties === 'function') {
 txt.setProperties({
 color: isActive ? p.activeColor : 'rgba(255, 255, 255, 0.60)',
 });
 }
 }

 // Delete button visibility and label
 const delBtn = hubAsset.getElementById('ed-btn-delete') as any;
 const delLbl = hubAsset.getElementById('ed-btn-delete-label') as any;
 if (delBtn && typeof delBtn.setProperties === 'function') {
 delBtn.setProperties({
 display: this.editingTaskId ? 'flex' : 'none',
 });
 }
 if (delLbl) {
 setText(delLbl, this.deleteTapCount === 1 ? 'Alert: Confirm Delete?' : 'Delete Task');
 }
 }

 private updateEditSheetDisplay() {
 this.updateTaskEditorDisplay();
 }

 // --------------------------------------------------------------------------
 // Update Loop & Periodic Ticks
 // --------------------------------------------------------------------------
 private tickSecond() {
 const now = new Date();
 const currentMinute = now.getHours() * 60 + now.getMinutes();
 if (currentMinute !== this.lastClockMinute) {
 this.lastClockMinute = currentMinute;
 this.updateClockAndGreeting(now);
 }

 if (this.focusRunning && this.focusRemainingSeconds > 0) {
 this.focusRemainingSeconds--;
 if (this.focusRemainingSeconds === 0) {
 this.focusRunning = false;
 this.focusSessionsCompleted++;
 this.gardenPoints += 30;
 this.setPipSpeech('Sprint completed! Awesome deep focus session. +30 XP!');
 this.triggerPipEmote('celebrate');
 }
 this.updateFocusDisplay();
 }
 }

 private updateClockAndGreeting(now: Date) {
 const hubAsset = this.getAsset('panel-hub');
 if (!hubAsset) return;

 const clock = getClockViewModel(now);
 const timeEl = hubAsset.getElementById('hub-time') as any;
 const dateEl = hubAsset.getElementById('hub-date') as any;
 if (timeEl) setText(timeEl, clock.timeFormatted);
 if (dateEl) setText(dateEl, clock.dateFormatted);

 const greeting = generateGreeting(now, '', this.tasks, this.selectedDayNumber);
 const greetEl = hubAsset.getElementById('hub-greeting-text') as any;
 if (greetEl) setText(greetEl, greeting.greeting);

 const summaryEl = hubAsset.getElementById('hub-task-summary') as any;
 if (summaryEl) setText(summaryEl, greeting.subtitle);
 }

 private updateFocusDisplay() {
 const hubAsset = this.getAsset('panel-hub');
 if (!hubAsset) return;

 const ring = calculateFocusRing(
 this.focusRemainingSeconds,
 this.focusTotalSeconds,
 this.focusMode,
 this.focusRunning,
 );

 const timeEl = hubAsset.getElementById('hub-focus-time') as any;
 if (timeEl) setText(timeEl, ring.timeFormatted);

 const modeEl = hubAsset.getElementById('hub-focus-mode') as any;
 if (modeEl) setText(modeEl, ring.modeLabel);

 const playIcon = hubAsset.getElementById('hub-focus-play-icon') as any;
 if (playIcon) setText(playIcon, this.focusRunning ? 'Pause' : '>');

 const sessionsEl = hubAsset.getElementById('hub-focus-sessions-count') as any;
 if (sessionsEl) setText(sessionsEl, ` ${this.focusSessionsCompleted}/8 Sessions Today`);
 }

 public refreshAllUI() {
 this.updateClockAndGreeting(new Date());
 this.updateFocusDisplay();
 this.refreshTasksPanelUI();
 this.refreshHubPanelUI();
 this.refreshPipPanelUI();
 this.refreshFocusPanelUI();
 }

 private refreshTasksPanelUI() {
 const asset = this.getAsset('panel-left-tasks');
 if (!asset) return;

 for (let i = 0; i < 3; i++) {
      const day = this.calendarDays[i];
      const dayBtn = asset.getElementById(`cal-day-${i}`) as any;
      const dayTxt = asset.getElementById(`cal-date-text-${i}`) as any;
      const dayHdr = asset.getElementById(`cal-day-header-${i}`) as any;
      if (day && dayHdr) {
        setText(dayHdr, day.dayOfWeek);
      }
      if (day && dayTxt) {
        setText(dayTxt, day.dayNumber);
      }
      if (day && dayBtn && typeof dayBtn.setProperties === 'function') {
        const hasTasks = this.tasks.some((t) => this.getTaskDayNumber(t) === day.dayNumber);
        if (day.isSelected) {
          dayBtn.setProperties({
            backgroundColor: '#D97736',
            borderColor: '#FFFFFF',
          });
        } else if (hasTasks) {
          dayBtn.setProperties({
            backgroundColor: 'rgba(217, 119, 54, 0.22)',
            borderColor: 'rgba(217, 119, 54, 0.50)',
          });
        } else {
          dayBtn.setProperties({
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
          });
        }
      }
    }

    const schedTitleEl = asset.getElementById('hub-schedule-title') as any;
    if (schedTitleEl) {
      const isToday = this.selectedDayNumber === new Date().getDate();
      const monthName = this.monthNames[this.calendarDate.getMonth()]?.slice(0, 3) || 'Nov';
      const titleStr = isToday
        ? `Today's Schedule (8:00 AM - 6:00 PM)`
        : `${monthName} ${this.selectedDayNumber} Schedule (8:00 AM - 6:00 PM)`;
      setText(schedTitleEl, titleStr);
    }

    const dayTasks = this.getTasksForDay(this.selectedDayNumber);
    const completedCount = dayTasks.filter((t) => t.status === 'completed').length;
    const badgeEl = asset.getElementById('agenda-count-badge') as any;
    if (badgeEl) setText(badgeEl, `${completedCount}/${dayTasks.length} done`);

    for (let i = 0; i < 5; i++) {
      const task = dayTasks[i];
      const chkLbl = asset.getElementById(`agenda-chk-lbl-${i}`) as any;
      const chkBtn = asset.getElementById(`agenda-chk-${i}`) as any;
      const nameLbl = asset.getElementById(`agenda-name-${i}`) as any;
      const timeLbl = asset.getElementById(`agenda-time-${i}`) as any;

      if (task) {
        if (nameLbl) {
          setText(nameLbl, task.title);
          if (typeof nameLbl.setProperties === 'function') {
            nameLbl.setProperties({
              color: task.status === 'completed' ? 'rgba(255, 255, 255, 0.45)' : '#FFFFFF',
            });
          }
        }
        if (timeLbl) {
          const h = Math.floor((task.scheduledStartMinute ?? 540) / 60);
          const m = (task.scheduledStartMinute ?? 540) % 60;
          const ampm = h >= 12 ? 'PM' : 'AM';
          const dh = h % 12 === 0 ? 12 : h % 12;
          setText(timeLbl, `${dh}:${m < 10 ? '0' : ''}${m} ${ampm}`);
        }
        const isDone = task.status === 'completed';
        if (chkLbl) setText(chkLbl, isDone ? '[x]' : '');
        if (chkBtn && typeof chkBtn.setProperties === 'function') {
          chkBtn.setProperties({
            backgroundColor: isDone ? '#22C55E' : 'rgba(255, 255, 255, 0.05)',
            borderColor: isDone ? '#22C55E' : 'rgba(255, 255, 255, 0.35)',
          });
        }
      } else {
        if (nameLbl) setText(nameLbl, '');
        if (timeLbl) setText(timeLbl, '');
        if (chkLbl) setText(chkLbl, '');
        if (chkBtn && typeof chkBtn.setProperties === 'function') {
          chkBtn.setProperties({
            backgroundColor: 'transparent',
            borderColor: 'rgba(255, 255, 255, 0.10)',
          });
        }
      }
    }

 const morning = this.routines.find((r) => r.id === 'routine-morning');
 const morningBadge = asset.getElementById('routine-morning-badge') as any;
 if (morning && morningBadge) {
 setText(morningBadge, `[x] ${morning.completedCount}/${morning.totalCount}`);
 }

 const winddown = this.routines.find((r) => r.id === 'routine-winddown');
 const winddownBadge = asset.getElementById('routine-winddown-badge') as any;
 if (winddown && winddownBadge) {
 setText(winddownBadge, `${winddown.completedCount}/${winddown.totalCount}`);
 }
 }

 private refreshHubPanelUI() {
 const asset = this.getAsset('panel-hub');
 if (!asset) return;

 const donut = calculateWorkloadDonut(this.tasks);
 const donutPct = asset.getElementById('donut-percentage-text') as any;
 if (donutPct) setText(donutPct, `${donut.percentage}%`);

 const plannedText = asset.getElementById('legend-planned-text') as any;
 if (plannedText) setText(plannedText, `Planned ${donut.scheduledFormatted}`);

 const remText = asset.getElementById('legend-remaining-text') as any;
 if (remText) setText(remText, `Remaining ${donut.remainingFormatted}`);

 const insightText = asset.getElementById('workload-insight-text') as any;
 if (insightText) {
 setText(
 insightText,
 donut.isOverloaded
 ? 'Alert: Overloaded! Reschedule non-critical tasks.'
 : "Tip: You're on track! ~2h free after 7 PM.",
 );
 }

 const dayTasks = this.getTasksForDay(this.selectedDayNumber);
    const schedBlocks = tasksToScheduleBlocks(dayTasks);
    const trackWidthPx = 718;
    let prevRightPx = 0;

    for (let i = 0; i < 5; i++) {
      const block = schedBlocks[i];
      const blockEl = asset.getElementById(`block-${i}`) as any;
      const blockTitleEl = asset.getElementById(`block-title-${i}`) as any;
      const blockTimeEl = asset.getElementById(`block-time-${i}`) as any;
      if (block) {
        const leftPx = Math.round((block.relativeLeftPercent / 100) * trackWidthPx);
        const widthPx = Math.max(54, Math.round((block.widthPercent / 100) * trackWidthPx));
        const marginPx = Math.max(4, leftPx - prevRightPx);
        prevRightPx = leftPx + widthPx;

        if (blockEl && typeof blockEl.setProperties === 'function') {
          blockEl.setProperties({
            display: 'flex',
            width: `${widthPx}px`,
            marginLeft: `${marginPx}px`,
            backgroundColor: block.color || '#2563EB',
          });
        }
        if (blockTitleEl) setText(blockTitleEl, shortenScheduleTitle(block.title));
        if (blockTimeEl) setText(blockTimeEl, block.timeRangeFormatted);
      } else {
        if (blockEl && typeof blockEl.setProperties === 'function') {
          blockEl.setProperties({ display: 'none' });
        }
      }
    }

    // Dynamic now-marker on schedule timeline
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const clampedMin = Math.max(WORKDAY_START_MINUTE, Math.min(WORKDAY_END_MINUTE, currentMin));
    const nowPosPx = Math.round(((clampedMin - WORKDAY_START_MINUTE) / WORKDAY_TOTAL_MINUTES) * trackWidthPx);
    const nowMarkerEl = asset.getElementById('now-marker') as any;
    if (nowMarkerEl && typeof nowMarkerEl.setProperties === 'function') {
      nowMarkerEl.setProperties({
        marginLeft: `${Math.max(0, nowPosPx - 26)}px`,
      });
    }
    const nowMarkerText = asset.getElementById('now-marker-text') as any;
    if (nowMarkerText) {
      const h = now.getHours();
      const m = now.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const dispH = h % 12 === 0 ? 12 : h % 12;
      setText(nowMarkerText, `${dispH}:${m < 10 ? '0' : ''}${m} ${ampm}`);
    }

    const schedTitleEl = asset.getElementById('hub-schedule-title') as any;
    if (schedTitleEl) {
      const isToday = this.selectedDayNumber === new Date().getDate();
      const monthName = this.monthNames[this.calendarDate.getMonth()]?.slice(0, 3) || 'Nov';
      const titleStr = isToday
        ? "Today's Schedule (8:00 AM - 6:00 PM)"
        : `${monthName} ${this.selectedDayNumber}'s Schedule (8:00 AM - 6:00 PM)`;
      setText(schedTitleEl, titleStr);
    }

    const filtered = this.getFilteredTasks();
    const tasksCount = asset.getElementById('hub-tasks-count') as any;
    if (tasksCount) setText(tasksCount, `Tasks (${filtered.length})`);

    const emptyMsg = asset.getElementById('hub-tasks-empty-msg') as any;
    if (emptyMsg && typeof emptyMsg.setProperties === 'function') {
      emptyMsg.setProperties({ display: filtered.length === 0 ? 'flex' : 'none' });
    }

    for (let i = 0; i < 4; i++) {
      const task = filtered[i];
      const rowEl = asset.getElementById(`hub-task-row-${i}`) as any;
      const titleEl = asset.getElementById(`hub-task-title-${i}`) as any;
      const chkMark = asset.getElementById(`hub-chk-mark-${i}`) as any;
      const chkBox = asset.getElementById(`hub-chk-box-${i}`) as any;
      const badgeEl = asset.getElementById(`hub-task-badge-${i}`) as any;

      if (task) {
        if (rowEl && typeof rowEl.setProperties === 'function') {
          rowEl.setProperties({ display: 'flex' });
        }
        if (titleEl) setText(titleEl, task.title);
        const isDone = task.status === 'completed';
        if (chkMark) setText(chkMark, isDone ? '[x]' : '');
        if (chkBox && typeof chkBox.setProperties === 'function') {
          chkBox.setProperties({
            backgroundColor: isDone ? '#22C55E' : 'transparent',
            borderColor: isDone ? '#22C55E' : 'rgba(255, 255, 255, 0.35)',
          });
        }
        if (badgeEl) {
          const pri = task.priority === 'high' ? 'High' : task.priority === 'low' ? 'Low' : 'Med';
          setText(badgeEl, pri);
        }
      } else {
        if (rowEl && typeof rowEl.setProperties === 'function') {
          rowEl.setProperties({ display: 'none' });
        }
      }
    }

  // Dynamic Week View updates
    const currentWeek = this.computeCurrentWeek();
    const weekViewTitle = asset.getElementById('week-view-title') as any;
    if (weekViewTitle) {
      const startD = currentWeek[0].date;
      const endD = currentWeek[6].date;
      const startM = this.monthNames[startD.getMonth()]?.slice(0, 3) || 'Nov';
      const endM = this.monthNames[endD.getMonth()]?.slice(0, 3) || 'Nov';
      const mStr = startM === endM ? `${startM} ${startD.getDate()} - ${endD.getDate()}, ${endD.getFullYear()}` : `${startM} ${startD.getDate()} - ${endM} ${endD.getDate()}, ${endD.getFullYear()}`;
      setText(weekViewTitle, `Week Schedule - ${mStr}`);
    }

    for (let i = 0; i < 7; i++) {
      const dayInfo = currentWeek[i];
      const dayNum = dayInfo.dayNumber;

      const dayNameEl = asset.getElementById(`week-day-name-${i}`) as any;
      if (dayNameEl) {
        setText(dayNameEl, `${dayInfo.dayOfWeek} ${dayNum}${dayInfo.isToday ? ' - Today' : ''}`);
      }

      const tasksForDay = this.getTasksForDay(dayNum).sort((a, b) => (a.scheduledStartMinute ?? 540) - (b.scheduledStartMinute ?? 540));
      const countEl = asset.getElementById(`week-day-count-${i}`) as any;
      if (countEl) setText(countEl, `${tasksForDay.length} task${tasksForDay.length === 1 ? '' : 's'}`);

      const colEl = asset.getElementById(`week-col-${i}`) as any;
      if (colEl && typeof colEl.setProperties === 'function') {
        const isSelected = dayNum === this.selectedDayNumber;
        colEl.setProperties({
          backgroundColor: isSelected ? 'rgba(217, 119, 54, 0.25)' : (dayInfo.isToday ? 'rgba(217, 119, 54, 0.12)' : 'rgba(255, 255, 255, 0.04)'),
          borderColor: isSelected ? '#D97736' : (dayInfo.isToday ? 'rgba(217, 119, 54, 0.50)' : 'rgba(255, 255, 255, 0.08)'),
        });
      }

      for (let s = 0; s < 5; s++) {
        const task = tasksForDay[s];
        const btnEl = asset.getElementById(`week-task-btn-${i}-${s}`) as any;
        const txtEl = asset.getElementById(`week-task-txt-${i}-${s}`) as any;
        if (task) {
          if (txtEl) {
            const start = task.scheduledStartMinute ?? 540;
            const h = Math.floor(start / 60);
            const m = start % 60;
            const ampm = h >= 12 ? 'p' : 'a';
            const dh = h % 12 === 0 ? 12 : h % 12;
            const timeTag = `${dh}:${m < 10 ? '0' : ''}${m}${ampm} `;
            setText(txtEl, `${timeTag}${shortenScheduleTitle(task.title)}`);
          }
          if (btnEl && typeof btnEl.setProperties === 'function') {
            btnEl.setProperties({
              display: 'flex',
              backgroundColor: task.priority === 'high' ? 'rgba(239, 68, 68, 0.28)' : task.priority === 'low' ? 'rgba(59, 130, 246, 0.24)' : 'rgba(234, 179, 8, 0.24)',
              borderColor: task.priority === 'high' ? '#EF4444' : task.priority === 'low' ? '#3B82F6' : '#EAB308',
            });
          }
        } else if (s === 0 && tasksForDay.length === 0) {
          if (btnEl && typeof btnEl.setProperties === 'function') {
            btnEl.setProperties({
              display: 'flex',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              borderColor: 'rgba(255, 255, 255, 0.12)',
            });
          }
          if (txtEl) setText(txtEl, '+ Add Task');
        } else {
          if (btnEl && typeof btnEl.setProperties === 'function') {
            btnEl.setProperties({ display: 'none' });
          }
        }
      }
    }

    // Dynamic weather updates on hub header
    const tempEl = asset.getElementById('weather-temp') as any;
    if (tempEl) {
      const tempStr = this.weather.isCelsius ? `${this.weather.tempC}°C` : `${this.weather.tempF}°F`;
      setText(tempEl, tempStr);
    }
    const cityEl = asset.getElementById('weather-city') as any;
    if (cityEl) {
      setText(cityEl, this.weather.city);
    }

 // Dynamic Month View updates
    const currentMonthName = this.monthNames[this.calendarDate.getMonth()] || 'November';
    const monthTitleEl = asset.getElementById('month-view-title') as any;
    if (monthTitleEl) {
      setText(monthTitleEl, `${currentMonthName} ${this.calendarDate.getFullYear()} - Monthly Calendar`);
    }

    const todayDateNum = new Date().getDate();
    for (let d = 1; d <= 31; d++) {
      const tile = asset.getElementById(`month-date-${d}`) as any;
      const countEl = asset.getElementById(`month-count-${d}`) as any;
      const tasksOnDay = this.getTasksForDay(d);

      if (countEl) {
        setText(countEl, tasksOnDay.length > 0 ? `${tasksOnDay.length} task${tasksOnDay.length === 1 ? '' : 's'}` : '');
      }

      if (tile && typeof tile.setProperties === 'function') {
        const isSelected = d === this.selectedDayNumber;
        const isToday = d === todayDateNum;
        tile.setProperties({
          backgroundColor: isSelected ? 'rgba(217, 119, 54, 0.38)' : (isToday ? 'rgba(217, 119, 54, 0.14)' : 'rgba(255, 255, 255, 0.05)'),
          borderColor: isSelected ? '#D97736' : (isToday ? 'rgba(217, 119, 54, 0.60)' : 'rgba(255, 255, 255, 0.12)'),
        });
      }
    }

    const monthSelectedDayLabel = asset.getElementById('month-selected-day-label') as any;
 if (monthSelectedDayLabel) {
 const selTasks = this.getTasksForDay(this.selectedDayNumber);
 setText(
 monthSelectedDayLabel,
 `Selected Day: ${this.monthNames[this.calendarDate.getMonth()]?.slice(0, 3) || 'Nov'} ${this.selectedDayNumber} - ${selTasks.length} task${selTasks.length === 1 ? '' : 's'}`,
 );
 }

 const selTasks = this.getTasksForDay(this.selectedDayNumber).sort((a, b) => (a.scheduledStartMinute ?? 540) - (b.scheduledStartMinute ?? 540));
 for (let r = 0; r < 5; r++) {
 const task = selTasks[r];
 const rowBtn = asset.getElementById(`month-day-task-row-${r}`) as any;
 const titleLbl = asset.getElementById(`month-day-task-title-${r}`) as any;
 const timeLbl = asset.getElementById(`month-day-task-time-${r}`) as any;
 const priLbl = asset.getElementById(`month-day-task-pri-${r}`) as any;
 if (task) {
 if (rowBtn && typeof rowBtn.setProperties === 'function') {
 rowBtn.setProperties({ display: 'flex' });
 }
 if (titleLbl) setText(titleLbl, task.title);
 if (timeLbl) {
 const start = task.scheduledStartMinute ?? 540;
 const end = start + task.estimatedMinutes;
 setText(timeLbl, `${formatTimeOfDay(start)} - ${formatTimeOfDay(end)}`);
 }
 if (priLbl) {
 const pri = task.priority ? task.priority.toUpperCase() : 'MED';
 setText(priLbl, pri);
 if (typeof priLbl.setProperties === 'function') {
 priLbl.setProperties({
 color: task.priority === 'high' ? '#EF4444' : task.priority === 'low' ? '#3B82F6' : '#EAB308',
 });
 }
 }
 } else if (r === 0 && selTasks.length === 0) {
 if (rowBtn && typeof rowBtn.setProperties === 'function') {
 rowBtn.setProperties({ display: 'flex' });
 }
 if (titleLbl) setText(titleLbl, 'No tasks scheduled yet for this day. Click "+ Add Task" to schedule one!');
 if (timeLbl) setText(timeLbl, '');
 if (priLbl) setText(priLbl, '');
 } else {
 if (rowBtn && typeof rowBtn.setProperties === 'function') {
 rowBtn.setProperties({ display: 'none' });
 }
 }
 }

 // Dynamic Focus Studio updates
 const studioTimer = asset.getElementById('focus-studio-timer') as any;
 if (studioTimer) {
 const mins = Math.floor(this.focusRemainingSeconds / 60);
 const secs = this.focusRemainingSeconds % 60;
 setText(studioTimer, `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
 }

 const studioPlayText = asset.getElementById('btn-focus-studio-play-text') as any;
 if (studioPlayText) {
 setText(studioPlayText, this.focusRunning ? 'Pause Pause Sprint' : '> Start Sprint');
 }

 // Dynamic Garden Subview updates
 const gardenProgress = calculateGardenProgress(this.gardenPoints);
 const gardenTitle = asset.getElementById('garden-hub-title') as any;
 if (gardenTitle) setText(gardenTitle, `Productivity Garden - Level ${gardenProgress.level} `);
 const gardenXp = asset.getElementById('garden-hub-xp') as any;
    if (gardenXp) setText(gardenXp, `${this.gardenPoints} / 1,000 XP`);

    this.refreshNotesUI();
    this.refreshAllTasksListUI();
  }

 private refreshPipPanelUI() {
 const asset = this.getAsset('panel-right-pip');
 if (!asset) return;

 const garden = calculateGardenProgress(this.gardenPoints);
 const gardenLvl = asset.getElementById('garden-level-text') as any;
 if (gardenLvl) setText(gardenLvl, `Level ${garden.level} `);

 const gardenXp = asset.getElementById('garden-xp-text') as any;
 if (gardenXp) setText(gardenXp, `${this.gardenPoints} / 1,000 XP`);

 const gardenBar = asset.getElementById('garden-progress-bar-fill') as any;
 if (gardenBar && typeof gardenBar.setProperties === 'function') {
 const pct = Math.min(100, Math.round((this.gardenPoints / 1000) * 100));
 gardenBar.setProperties({ width: `${pct}%` });
 }

 const micBtn = asset.getElementById('btn-pip-mic') as any;
 if (micBtn && typeof micBtn.setProperties === 'function') {
 micBtn.setProperties({
 backgroundColor: this.voiceListening ? '#EF4444' : 'rgba(255, 255, 255, 0.08)',
 borderColor: this.voiceListening ? '#EF4444' : 'rgba(255, 255, 255, 0.18)',
 });
 }
 }

 private refreshFocusPanelUI() {
 const asset = this.getAsset('panel-right-focus');
 if (!asset) return;

 for (let i = 0; i < this.habits.length; i++) {
 const countEl = asset.getElementById(`habit-count-${i}`) as any;
 if (countEl) setText(countEl, `${this.habits[i].completedCount}/7`);
 }
 }

  private setupPointers() {
    if (this.pointersInitialized) return;
    const raySpaces = (this.player as any)?.raySpaces;
    if (!raySpaces?.left || !raySpaces?.right) return;

    const createPointerVisual = (handedness: 'left' | 'right') => {
      // Cylindrical laser beam extending along negative Z
      const beamGeo = new CylinderGeometry(0.0016, 0.0016, 1.8, 8, 1, true);
      beamGeo.rotateX(Math.PI / 2).translate(0, 0, -0.9);
      const beamMat = new MeshBasicMaterial({
        color: handedness === 'left' ? 0x818CF8 : 0xA78BFA,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const beam = new Mesh(beamGeo, beamMat);
      beam.renderOrder = 999;
      beam.raycast = () => {}; // Never intercept or block pointer raycasts

      // Cursor reticle ring at end of pointer - pure clean white
      const reticleGeo = new RingGeometry(0.007, 0.015, 32);
      const reticleMat = new MeshBasicMaterial({
        color: 0xFFFFFF,
        side: DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const reticle = new Mesh(reticleGeo, reticleMat);
      reticle.position.set(0, 0, -1.8);
      reticle.renderOrder = 1000;
      reticle.raycast = () => {}; // Never intercept or block pointer raycasts

      raySpaces[handedness].add(beam);
      raySpaces[handedness].add(reticle);

      return { beam, reticle };
    };

    const left = createPointerVisual('left');
    this.leftBeam = left.beam;
    this.leftReticle = left.reticle;

    const right = createPointerVisual('right');
    this.rightBeam = right.beam;
    this.rightReticle = right.reticle;

    this.pointersInitialized = true;
  }

  private updatePointers(time: number, _delta: number) {
    const raySpaces = (this.player as any)?.raySpaces;
    if (!raySpaces) return;

    const panelNames = ['panel-hub', 'panel-left-tasks', 'panel-right-pip', 'panel-right-focus', 'panel-sheet'];
    const panelObjects: Object3D[] = [];
    for (const name of panelNames) {
      const obj = this.world.getSceneObject(name);
      if (obj && obj.visible) {
        panelObjects.push(obj);
      }
    }

    const hands: Array<'left' | 'right'> = ['left', 'right'];
    for (const hand of hands) {
      const space = raySpaces[hand];
      const beam = hand === 'left' ? this.leftBeam : this.rightBeam;
      const reticle = hand === 'left' ? this.leftReticle : this.rightReticle;
      if (!space || !beam || !reticle) continue;

      space.getWorldPosition(this.pointerRayOrigin);
      space.getWorldQuaternion(this.pointerTempQuat);
      this.pointerRayDir.set(0, 0, -1).applyQuaternion(this.pointerTempQuat);

      this.pointerRaycaster.set(this.pointerRayOrigin, this.pointerRayDir);
      this.pointerRaycaster.far = 4.0;

      let hitDist = 1.8;
      let hasHit = false;

      if (panelObjects.length > 0) {
        const hits = this.pointerRaycaster.intersectObjects(panelObjects, true);
        if (hits.length > 0 && hits[0].distance > 0.05) {
          hitDist = hits[0].distance;
          hasHit = true;
        }
      }

      beam.scale.set(1, 1, hitDist / 1.8);
      reticle.position.set(0, 0, -hitDist + 0.002);

      const beamMat = beam.material as MeshBasicMaterial;
      const reticleMat = reticle.material as MeshBasicMaterial;

      const isPulsed = (time - this.lastTriggerPulseTime[hand]) < 0.25;
      if (isPulsed) {
        beamMat.color.setHex(0xFFFFFF);
        reticleMat.color.setHex(0xFFFFFF);
        reticle.scale.setScalar(0.75);
      } else {
        beamMat.color.setHex(hand === 'left' ? 0x818CF8 : 0xA78BFA);
        reticleMat.color.setHex(0xFFFFFF);
        reticle.scale.setScalar(hasHit ? 1.0 : 0.85);
      }
      beamMat.opacity = hasHit ? 0.90 : 0.65;
      reticleMat.opacity = hasHit ? 0.98 : 0.60;
    }

    // Process drag gestures from XR controllers and hands
    const inputXr = this.world.input?.xr;
    for (const hand of hands) {
      const space = raySpaces[hand];
      const gamepad = inputXr?.gamepads?.[hand];
      if (gamepad) {
        const axes = gamepad.gamepad?.axes || [];
        const thumbstickY = axes[3] ?? axes[1] ?? (typeof (gamepad as any)?.getAxisValueByIdx === 'function' ? (gamepad as any).getAxisValueByIdx(3) : 0);
        if (Math.abs(thumbstickY) > 0.30) {
          const step = -thumbstickY * _delta * 0.40;
          this.workspaceOffset.z = Math.max(-0.45, Math.min(0.40, Number((this.workspaceOffset.z + step).toFixed(3))));
          this.applyWorkspaceOffset();
        }
      }
      const selectState = inputXr?.getSelectState(hand);

      const triggerHeld = gamepad ? (gamepad.getButtonValueByIdx(0) > 0.5 || Boolean(gamepad.gamepad?.buttons?.[0]?.pressed)) : false;
      const gripHeld = gamepad ? (gamepad.getButtonValueByIdx(1) > 0.5 || Boolean(gamepad.gamepad?.buttons?.[1]?.pressed)) : false;
      const pinchHeld = Boolean(selectState?.active);
      const isInputActive = gripHeld || pinchHeld || (this.activeDrag?.hand === hand && triggerHeld);

      if (this.activeDrag && this.activeDrag.hand === hand) {
        if (!isInputActive) {
          this.stopDraggingPanel();
        }
      } else if (!this.activeDrag) {
        if (gripHeld) {

          const gripSpace = (this.player as any)?.gripSpaces?.[hand] || space;
          gripSpace.getWorldPosition(this.dragTempPos);

          for (const name of panelNames) {
            const pObj = this.world.getSceneObject(name);
            if (!pObj || !pObj.visible) continue;
            const dist = this.dragTempPos.distanceTo(pObj.position);
            if (dist < 0.55) {
              this.startDraggingPanel(name, hand, null, 'proximity');
              break;
            }
          }

          if (!this.activeDrag && panelObjects.length > 0) {

            space.getWorldPosition(this.pointerRayOrigin);
            space.getWorldQuaternion(this.pointerTempQuat);
            this.pointerRayDir.set(0, 0, -1).applyQuaternion(this.pointerTempQuat);
            this.pointerRaycaster.set(this.pointerRayOrigin, this.pointerRayDir);

            const hits = this.pointerRaycaster.intersectObjects(panelObjects, true);
            if (hits.length > 0 && hits[0].distance > 0.005) {
              let hitRoot: Object3D | null = hits[0].object;
              while (hitRoot && !panelNames.includes(hitRoot.name) && hitRoot.parent) {
                hitRoot = hitRoot.parent;
              }
              const hitPanelId = hitRoot?.name && panelNames.includes(hitRoot.name) ? hitRoot.name : 'panel-right-pip';
              this.startDraggingPanel(hitPanelId, hand, hits[0].point, 'distance');
            }
          }
        }
      }
    }

    if (this.activeDrag) {
      this.updateDrag();
    }
  }

  update(time: number, delta: number) {
    if (!this.pointersInitialized) {
      this.setupPointers();
    }
    if (this.pointersInitialized) {
      this.updatePointers(time, delta);
    }
    if (!this.isBound) {
      this.bindPanels();
    }

 if (!this.pipRobotObject) {
 this.pipRobotObject = this.world.getSceneObject('pip-robot');
 }

 if (this.pipRobotObject) {
 const head = this.pipRobotObject.getObjectByName('pip-head');
 const outerRing = this.pipRobotObject.getObjectByName('pip-outer-ring');
 const innerRing = this.pipRobotObject.getObjectByName('pip-inner-ring');

 if (head) {
 if (this.pipEmoteState === 'celebrate') {
 head.position.y = 0.05 + Math.abs(Math.sin(time * 8)) * 0.035;
 head.rotation.y = Math.sin(time * 6) * 0.25;
 } else if (this.pipEmoteState === 'thinking') {
 head.position.y = 0.05 + Math.sin(time * 3) * 0.01;
 head.rotation.z = 0.15 + Math.sin(time * 2) * 0.05;
 } else {
 head.position.y = 0.05 + Math.sin(time * 2.2) * 0.008;
 head.rotation.y = Math.sin(time * 1.2) * 0.08;
 head.rotation.z = 0;
 }
 }

 if (outerRing) {
 outerRing.rotation.z += delta * (this.pipEmoteState === 'celebrate' ? 2.5 : 0.8);
 }
 if (innerRing) {
 innerRing.rotation.z -= delta * (this.pipEmoteState === 'celebrate' ? 3.0 : 1.1);
 }
 }
 }
}