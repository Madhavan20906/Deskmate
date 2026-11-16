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
 UndoStack,
} from './glass-data-adapters.js';

import { GhostDeskmateAudio } from './audio.js';
import { recommendWhatNext, planDaySchedule, TaskItem, parseVoiceTaskCommand } from './productivity-engine.js';

const STORAGE_KEY_TASKS = 'deskmate.tasks.v1';

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
 private selectedDayNumber = 18;
 private selectedMonthIndex = 10; // November
 private readonly monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
 private agendaItems: AgendaItemViewModel[] = JSON.parse(JSON.stringify(SEED_AGENDA_ITEMS));
 private routines: RoutineGroup[] = JSON.parse(JSON.stringify(SEED_ROUTINES));
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

 // Audio & Settings
 private audio: GhostDeskmateAudio | null = null;
 private soundEnabled = true;

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

 // 1-second interval for clock check and focus countdown
 const interval = window.setInterval(() => {
 this.tickSecond();
 }, 1000);
 this.cleanupFuncs.push(() => window.clearInterval(interval));

 this.bindPanels();
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
 this.tasks = parsed;
 this.ensureWeekTasksPopulated();
 return;
 }
 }
 } catch (err) {
 console.warn('[DeskMate] Could not load stored tasks, using seed data:', err);
 }
 this.tasks = JSON.parse(JSON.stringify(SEED_TASKS));
 this.ensureWeekTasksPopulated();
 this.saveTasks(false);
 }

 private ensureWeekTasksPopulated() {
 for (const t of this.tasks) {
 if (t.dayNumber === undefined) {
 t.dayNumber = 18;
 }
 }

 const defaultMultiDayTasks: GlassTask[] = [
 {
 id: 'seed-task-16-a',
 title: 'Review System Specs',
 priority: 'medium',
 estimatedMinutes: 60,
 scheduledStartMinute: 10 * 60,
 status: 'completed',
 dayNumber: 16,
 },
 {
 id: 'seed-task-17-a',
 title: 'Data Pipeline Benchmark',
 priority: 'high',
 estimatedMinutes: 90,
 scheduledStartMinute: 11 * 60,
 status: 'completed',
 dayNumber: 17,
 },
 {
 id: 'seed-task-19-a',
 title: 'Code Refactoring',
 priority: 'medium',
 estimatedMinutes: 90,
 scheduledStartMinute: 10 * 60,
 status: 'todo',
 dayNumber: 19,
 },
 {
 id: 'seed-task-20-a',
 title: 'Write Technical Report',
 priority: 'high',
 estimatedMinutes: 60,
 scheduledStartMinute: 14 * 60,
 status: 'todo',
 dayNumber: 20,
 },
 {
 id: 'seed-task-21-a',
 title: 'Project Submission & Demo',
 priority: 'high',
 estimatedMinutes: 60,
 scheduledStartMinute: 11 * 60,
 status: 'todo',
 dayNumber: 21,
 },
 {
 id: 'seed-task-22-a',
 title: 'Weekly Review & Planning',
 priority: 'low',
 estimatedMinutes: 45,
 scheduledStartMinute: 16 * 60,
 status: 'todo',
 dayNumber: 22,
 },
 ];

 for (const defTask of defaultMultiDayTasks) {
 if (!this.tasks.some((t) => t.id === defTask.id || (t.dayNumber === defTask.dayNumber && t.title === defTask.title))) {
 this.tasks.push(defTask);
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
 const selTasks = this.tasks.filter((t) => (t.dayNumber ?? 18) === this.selectedDayNumber);
 this.setPipSpeech(`Pip here! Nov ${this.selectedDayNumber} has ${selTasks.length} task${selTasks.length === 1 ? '' : 's'}. Speak or click microphone to add more!`);
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

 public applyWorkspaceOffset() {
  const presets: Record<string, Record<string, { pos: [number, number, number]; rotDeg: [number, number, number]; scale: number }>> = {
   Arc: {
    'panel-left-tasks': { pos: [-0.58, 1.48, -0.68], rotDeg: [0, 22, 0], scale: 0.10 },
    'panel-hub': { pos: [0, 1.48, -0.72], rotDeg: [0, 0, 0], scale: 0.10 },
    'panel-right-pip': { pos: [0.56, 1.66, -0.68], rotDeg: [0, -22, 0], scale: 0.10 },
    'pip-robot': { pos: [0.60, 1.84, -0.48], rotDeg: [0, -22, 0], scale: 0.45 },
    'panel-right-focus': { pos: [0.56, 1.28, -0.68], rotDeg: [0, -22, 0], scale: 0.10 },
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
 obj.scale.set(def.scale, def.scale, def.scale);
 obj.visible = true;
 }
 }

 try {
 window.localStorage.setItem('deskmate.workspace-offset.v1', JSON.stringify(this.workspaceOffset));
 } catch {}
 }

 public resetPanelTransforms() {
 this.applyWorkspaceOffset();
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
 this.setPipSpeech(`Opened ${sectionTitle}. Click "< Back" anytime to return.`);
 }

 public resetZoom() {
 this.zoomedPanelId = null;
 this.resetPanelTransforms();
 this.setHubView('overview');

 if (this.soundEnabled && this.audio) {
 this.audio.playPinchTick();
 }
 this.setPipSpeech('Returned to full workspace overview. All changes are preserved.');
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
 if (cardCalendar) this.addPress(cardCalendar, () => this.zoomSection('panel-left-tasks', 'Mini Calendar'));
 const cardAgendaHdr = asset.getElementById('card-agenda-header');
 if (cardAgendaHdr) this.addPress(cardAgendaHdr, () => this.zoomSection('panel-left-tasks', "Today's Agenda"));
 const cardQuickAdd = asset.getElementById('card-quickadd');
 if (cardQuickAdd) this.addPress(cardQuickAdd, () => this.zoomSection('panel-left-tasks', 'Quick Add'));
 const cardRoutines = asset.getElementById('card-routines');
 if (cardRoutines) this.addPress(cardRoutines, () => this.zoomSection('panel-left-tasks', 'Routines'));

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

 // Mini Calendar Navigation (Multi-week live date shifting)
 const prevMonth = asset.getElementById('cal-prev-month');
 if (prevMonth) {
 this.addPress(prevMonth, () => {
 this.calendarStartDay = Math.max(1, this.calendarStartDay - 7);
 this.updateCalendarDays();
 this.refreshTasksPanelUI();
 this.refreshHubPanelUI();
 });
 }
 const nextMonth = asset.getElementById('cal-next-month');
 if (nextMonth) {
 this.addPress(nextMonth, () => {
 this.calendarStartDay = Math.min(25, this.calendarStartDay + 7);
 this.updateCalendarDays();
 this.refreshTasksPanelUI();
 this.refreshHubPanelUI();
 });
 }

 for (let i = 0; i < 7; i++) {
 const dayBtn = asset.getElementById(`cal-day-${i}`);
 if (dayBtn) {
 this.addPress(dayBtn, () => {
 const selected = this.calendarDays[i];
 if (!selected) return;
 this.selectedDayNumber = selected.dayNumber;
 this.calendarDays.forEach((d) => {
 d.isSelected = d.dayNumber === this.selectedDayNumber;
 });
 const count = this.tasks.filter((t) => (t.dayNumber ?? 18) === this.selectedDayNumber).length;
 this.setPipSpeech(`Viewing schedule for ${selected.dayOfWeek}, Nov ${selected.dayNumber} (${count} tasks). Tasks added will be scheduled for this day.`);
 this.refreshTasksPanelUI();
 this.refreshHubPanelUI();
 });
 }
 }

 // Agenda Checkboxes & Titles
 for (let i = 0; i < this.agendaItems.length; i++) {
 const chkBtn = asset.getElementById(`agenda-chk-${i}`);
 if (chkBtn) {
 this.addPress(chkBtn, () => this.toggleAgendaItem(i));
 }
 const rowName = asset.getElementById(`agenda-name-${i}`);
 if (rowName) {
 this.addPress(rowName, () => {
 const item = this.agendaItems[i];
 this.setPipSpeech(`Agenda item: "${item.title}" at ${item.timeFormatted}.`);
 });
 }
 }

 // Quick Add Pills
 const quickTask = asset.getElementById('quick-add-task');
 if (quickTask) {
 this.addPress(quickTask, () => this.openEditSheet(null));
 }
 const quickEvent = asset.getElementById('quick-add-event');
 if (quickEvent) {
 this.addPress(quickEvent, () => {
 const newEvent: GlassTask = {
 id: `event-${Date.now()}`,
 title: 'Design Review & Sync',
 priority: 'medium',
 estimatedMinutes: 60,
 scheduledStartMinute: 16 * 60,
 status: 'todo',
 dayNumber: this.selectedDayNumber,
 };
 this.tasks.push(newEvent);
 this.saveTasks(true, 'Added "Design Review & Sync" event');
 this.setPipSpeech(`Added new event "Design Review & Sync" on Nov ${this.selectedDayNumber} at 4:00 PM.`);
 });
 }
 const quickFocus = asset.getElementById('quick-add-focus');
 if (quickFocus) {
 this.addPress(quickFocus, () => this.toggleFocusTimer());
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
 }

 private updateCalendarDays() {
 const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
 this.calendarDays = [];
 for (let i = 0; i < 7; i++) {
 const dayNum = this.calendarStartDay + i;
 this.calendarDays.push({
 dayOfWeek: daysOfWeek[i % 7],
 dayNumber: dayNum,
 isToday: dayNum === 18,
 isSelected: dayNum === this.selectedDayNumber,
 });
 }
 this.updateCalendarHeader();
 }

 private updateCalendarHeader() {
 const asset = this.getAsset('panel-left-tasks');
 if (!asset) return;
 const monthLabel = asset.getElementById('cal-month-label') as any;
 if (monthLabel) {
 const endDay = this.calendarStartDay + 6;
 setText(monthLabel, `Nov ${this.calendarStartDay} - ${endDay}`);
 }
 this.setPipSpeech(`Switched calendar week to Nov ${this.calendarStartDay} - ${this.calendarStartDay + 6}, 2026.`);
 }

 private toggleAgendaItem(index: number) {
 if (!this.agendaItems[index]) return;
 const item = this.agendaItems[index];
 item.isCompleted = !item.isCompleted;

 if (item.isCompleted) {
 this.gardenPoints += 20;
 this.setPipSpeech(`Checked off "${item.title}"! +20 XP awarded.`);
 this.triggerPipEmote('celebrate');
 } else {
 this.setPipSpeech(`Reopened agenda item "${item.title}".`);
 }

 this.refreshTasksPanelUI();
 this.refreshHubPanelUI();
 this.refreshPipPanelUI();
 }

 // --------------------------------------------------------------------------
 // Center Hub Panel Binding
 // --------------------------------------------------------------------------
 private bindHubPanel() {
 const asset = this.getAsset('panel-hub');
 if (!asset) return;

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

 // Header Action Buttons
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
 this.addPress(addBlockBtn, () => this.openEditSheet(null));
 }

 const zoomSchedBtn = asset.getElementById('btn-zoom-schedule');
 if (zoomSchedBtn) {
 this.addPress(zoomSchedBtn, () => this.zoomSection('panel-hub', "Today's Schedule"));
 }

 // Schedule Blocks (Click to open edit sheet)
 for (let i = 0; i < 5; i++) {
 const blockEl = asset.getElementById(`block-${i}`);
 if (blockEl) {
 this.addPress(blockEl, () => {
 if (this.tasks[i]) {
 this.openEditSheet(this.tasks[i].id);
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
 if (task) this.openEditSheet(task.id);
 });
 }
 }

 const hubAddTaskBtn = asset.getElementById('hub-btn-add-task');
 if (hubAddTaskBtn) {
 this.addPress(hubAddTaskBtn, () => this.openEditSheet(null));
 }

 // Card 2 (Focus Session): Zoom, Play, -5m, +5m, Reset, Break, Mode Settings
 const zoomFocusBtn = asset.getElementById('btn-zoom-focus');
 if (zoomFocusBtn) {
 this.addPress(zoomFocusBtn, () => this.zoomSection('panel-hub', 'Focus Session'));
 }

 // Card Containers (Surrounding click expands that section to Center Hub view)
 const cardSchedule = asset.getElementById('card-schedule');
 if (cardSchedule) this.addPress(cardSchedule, () => this.zoomSection('panel-hub', "Today's Schedule"));
 const cardTasks = asset.getElementById('card-tasks');
 if (cardTasks) this.addPress(cardTasks, () => this.zoomSection('panel-hub', 'Tasks List'));
 const cardFocus = asset.getElementById('card-focus');
 if (cardFocus) this.addPress(cardFocus, () => this.zoomSection('panel-hub', 'Focus Session'));
 const cardWorkload = asset.getElementById('card-workload');
 if (cardWorkload) this.addPress(cardWorkload, () => this.zoomSection('panel-hub', 'Workload Analysis'));

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
 if (this.focusMode === 'pomodoro') {
 this.focusMode = 'short_break';
 this.focusTotalSeconds = 5 * 60;
 this.focusRemainingSeconds = 5 * 60;
 } else if (this.focusMode === 'short_break') {
 this.focusMode = 'long_break';
 this.focusTotalSeconds = 15 * 60;
 this.focusRemainingSeconds = 15 * 60;
 } else {
 this.focusMode = 'pomodoro';
 this.focusTotalSeconds = 25 * 60;
 this.focusRemainingSeconds = 25 * 60;
 }
 this.setPipSpeech(`Focus mode switched to ${this.focusMode.replace('_', ' ').toUpperCase()}.`);
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
 this.setHubView('month');
 } else if (item.id === 'dock-timeline') {
 this.setHubView('week');
 } else if (item.id === 'dock-notes') {
 this.setHubView('notes');
 } else if (item.id === 'dock-goals') {
 this.setHubView('goals');
 } else if (item.id === 'dock-reports') {
 this.setHubView('analytics');
 } else if (item.id === 'dock-capture') {
 this.openEditSheet(null);
 }
 this.setPipSpeech(`Dock: Opened ${item.label}.`);
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

 const weekDays = ['Sun 16', 'Mon 17', 'Tue 18', 'Wed 19', 'Thu 20', 'Fri 21', 'Sat 22'];
 for (let i = 0; i < 7; i++) {
 const dayNum = 16 + i;
 const dayBtn = asset.getElementById(`week-day-btn-${i}`);
 if (dayBtn) {
 this.addPress(dayBtn, () => {
 this.selectedDayNumber = dayNum;
 this.scheduleView = 'day';
 this.setHubView('overview');
 this.setPipSpeech(`Switched to ${weekDays[i]} schedule. Add or modify tasks for this day.`);
 });
 }

 const addBtn = asset.getElementById(`week-day-add-${i}`);
 if (addBtn) {
 this.addPress(addBtn, () => {
 this.selectedDayNumber = dayNum;
 this.openEditSheet(null);
 });
 }
 }

 // Month View Subview Controls
 const monthTabDay = asset.getElementById('month-tab-day');
 if (monthTabDay) this.addPress(monthTabDay, () => this.setScheduleView('day'));
 const monthTabWeek = asset.getElementById('month-tab-week');
 if (monthTabWeek) this.addPress(monthTabWeek, () => this.setScheduleView('week'));
 const monthTabMonth = asset.getElementById('month-tab-month');
 if (monthTabMonth) this.addPress(monthTabMonth, () => this.setScheduleView('month'));

 for (let d = 16; d <= 22; d++) {
 const tile = asset.getElementById(`month-date-${d}`);
 if (tile) {
 this.addPress(tile, () => {
 this.selectedDayNumber = d;
 this.setPipSpeech(`Selected Nov ${d}. Click "+ Add Task for this Day" to schedule.`);
 this.refreshHubPanelUI();
 });
 }
 }

 const monthAddBtn = asset.getElementById('btn-month-add-task');
 if (monthAddBtn) {
 this.addPress(monthAddBtn, () => this.openEditSheet(null));
 }

 // Tasks Subview Controls
 const tasksAddBtn = asset.getElementById('btn-tasks-add-task');
 if (tasksAddBtn) {
 this.addPress(tasksAddBtn, () => this.openEditSheet(null));
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
 const studioReset = asset.getElementById('focus-studio-reset');
 if (studioReset) {
 this.addPress(studioReset, () => {
 this.focusRunning = false;
 this.focusRemainingSeconds = 25 * 60;
 this.focusTotalSeconds = 25 * 60;
 this.focusMode = 'pomodoro';
 this.setPipSpeech('Focus timer reset to 25m Pomodoro.');
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
 }
 this.saveTasks(true, `Updated "${this.editDraftTitle}"`);
 this.setPipSpeech(`Updated task "${this.editDraftTitle}".`);
 } else {
 const newTask: GlassTask = {
 id: `task-${Date.now()}`,
 title: this.editDraftTitle,
 estimatedMinutes: this.editDraftDuration,
 priority: this.editDraftPriority,
 scheduledStartMinute: this.editDraftStartTime,
 status: 'todo',
 dayNumber: this.selectedDayNumber,
 };
 this.tasks.push(newTask);
 this.saveTasks(true, `Added "${this.editDraftTitle}"`);
 this.setPipSpeech(`Created new task "${this.editDraftTitle}" for Nov ${this.selectedDayNumber}.`);
 this.triggerPipEmote('celebrate');
 }
 this.closeEditSheet();
 };

 const editorSaveTop = asset.getElementById('btn-editor-save');
 if (editorSaveTop) this.addPress(editorSaveTop, onSaveTask);

 const editorSaveBottom = asset.getElementById('ed-btn-save-bottom');
 if (editorSaveBottom) this.addPress(editorSaveBottom, onSaveTask);

 const presets = [
 'Deep Work Sprint',
 'Team Sync',
 'Code Review',
 'Write Report',
 'ML Benchmark',
 'Gym / Health',
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
 if (this.deleteTapCount === 0) {
 this.deleteTapCount = 1;
 this.updateTaskEditorDisplay();
 if (this.deleteResetTimer) window.clearTimeout(this.deleteResetTimer);
 this.deleteResetTimer = window.setTimeout(() => {
 this.deleteTapCount = 0;
 this.updateTaskEditorDisplay();
 }, 5000);
 } else {
 const taskToDelete = this.tasks.find((t) => t.id === this.editingTaskId);
 this.tasks = this.tasks.filter((t) => t.id !== this.editingTaskId);
 this.saveTasks(true, `Deleted "${taskToDelete?.title || 'task'}"`);
 this.setPipSpeech(`Deleted task "${taskToDelete?.title || ''}".`);
 this.closeEditSheet();
 }
 });
 }

 // Garden Subview Controls
 const gardenWater = asset.getElementById('btn-garden-water');
 if (gardenWater) {
 this.addPress(gardenWater, () => {
 this.gardenPoints += 20;
 this.setPipSpeech('Water Watered the Great Oak! +20 XP awarded.');
 this.triggerPipEmote('celebrate');
 this.refreshAllUI();
 });
 }
 const gardenTend = asset.getElementById('btn-garden-tend');
 if (gardenTend) {
 this.addPress(gardenTend, () => {
 this.gardenPoints += 10;
 this.setPipSpeech('Prune Pruned the foliage! +10 XP awarded.');
 this.triggerPipEmote('celebrate');
 this.refreshAllUI();
 });
 }
 const gardenNurture = asset.getElementById('btn-garden-nurture');
 if (gardenNurture) {
 this.addPress(gardenNurture, () => {
 this.gardenPoints += 30;
 this.setPipSpeech('Nurture Organic fertilizer applied! +30 XP! Tree is thriving!');
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
 this.setPipSpeech('Quick Note added to spatial scratchpad.');
 });
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

 // Spatial DeskMate Workspace Mover Dock Controls
 const moverCloser = asset.getElementById('btn-mover-closer');
 if (moverCloser) {
 this.addPress(moverCloser, () => {
 this.workspaceOffset.z = Math.min(0.40, Number((this.workspaceOffset.z + 0.15).toFixed(2)));
 this.applyWorkspaceOffset();
 this.setPipSpeech(`Pulled DeskMate closer (Z: ${(this.workspaceOffset.z * 100).toFixed(0)}cm).`);
 });
 }

 const moverFarther = asset.getElementById('btn-mover-farther');
 if (moverFarther) {
 this.addPress(moverFarther, () => {
 this.workspaceOffset.z = Math.max(-0.45, Number((this.workspaceOffset.z - 0.15).toFixed(2)));
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
 return this.tasks.filter((t) => {
 const taskDay = t.dayNumber ?? 18;
 if (taskDay !== this.selectedDayNumber) return false;
 if (this.taskFilter === 'all') return true;
 return t.priority === this.taskFilter;
 });
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
 this.setPipSpeech(`Switched to ${tab.toUpperCase()} tab.`);
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
 if (cardPip) this.addPress(cardPip, () => this.zoomSection('panel-right-pip', 'Pip Companion'));
 const cardGarden = asset.getElementById('card-garden');
 if (cardGarden) this.addPress(cardGarden, () => this.zoomSection('panel-right-pip', 'Productivity Garden'));

 const zoomPip = asset.getElementById('btn-zoom-pip');
 if (zoomPip) {
 this.addPress(zoomPip, () => this.zoomSection('panel-right-pip', 'Pip Companion', 1.18, 0.16));
 }
 const zoomGarden = asset.getElementById('btn-zoom-garden');
 if (zoomGarden) {
 this.addPress(zoomGarden, () => this.zoomSection('panel-right-pip', 'Productivity Garden', 1.38, 0.16));
 }
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

 const micBtn = asset.getElementById('btn-pip-mic');
 if (micBtn) {
 this.addPress(micBtn, () => {
 this.handleVoiceInputTrigger();
 });
 }
 }

 private handleVoiceInputTrigger() {
 const SpeechRec =
 typeof window !== 'undefined' &&
 ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

 if (SpeechRec) {
 try {
 const rec = new SpeechRec();
 rec.continuous = false;
 rec.interimResults = false;
 rec.lang = 'en-US';
 rec.onstart = () => {
 this.voiceListening = true;
 this.setPipSpeech('Listening for voice... Say any task and day (e.g. "Add task on Friday")');
 this.triggerPipEmote('thinking');
 this.refreshPipPanelUI();
 };
 rec.onresult = (evt: any) => {
 this.voiceListening = false;
 this.refreshPipPanelUI();
 const transcript = evt.results?.[0]?.[0]?.transcript || '';
 if (transcript) {
 this.executeVoiceCommand(transcript);
 }
 };
 rec.onerror = () => {
 this.voiceListening = false;
 this.refreshPipPanelUI();
 this.triggerNextSimulatedVoiceCommand();
 };
 rec.start();
 return;
 } catch {}
 }

 this.triggerNextSimulatedVoiceCommand();
 }

 private triggerNextSimulatedVoiceCommand() {
 const cmd = this.sampleVoiceCommands[this.simulatedVoiceIndex % this.sampleVoiceCommands.length];
 this.simulatedVoiceIndex++;
 this.voiceListening = true;
 this.refreshPipPanelUI();
 this.setPipSpeech(`Voice input: "${cmd}"`);
 this.triggerPipEmote('thinking');

 window.setTimeout(() => {
 this.voiceListening = false;
 this.refreshPipPanelUI();
 this.executeVoiceCommand(cmd);
 }, 700);
 }

 public speakTextAloud(text: string) {
 if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
 try {
 window.speechSynthesis.cancel();
 const clean = text.replace(/[*_#`[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
 const utterance = new SpeechSynthesisUtterance(clean);
 utterance.rate = 1.05;
 utterance.pitch = 1.1;
 utterance.volume = 1.0;
 window.speechSynthesis.speak(utterance);
 } catch (e) {
 console.warn('Speech synthesis failed:', e);
 }
 }
 }

 public executeVoiceCommand(transcript: string) {
 const lower = transcript.toLowerCase();

 // 1. Section Navigation: switch to, open, show, bring to view
 if (
 lower.includes('switch to') ||
 lower.includes('open ') ||
 lower.includes('show ') ||
 lower.includes('bring ') ||
 lower.includes('view ') ||
 lower.includes('go to ') ||
 lower.includes('navigate to ')
 ) {
 if (lower.includes('calendar') || lower.includes('month')) {
 this.zoomSection('panel-left-tasks', 'Mini Calendar');
 this.setPipSpeech('Done: Brought Mini Calendar to view.');
 return;
 }
 if (lower.includes('task') || lower.includes('agenda')) {
 this.zoomSection('panel-left-tasks', 'Agenda');
 this.setPipSpeech('Done: Brought Agenda and Tasks to view.');
 return;
 }
 if (lower.includes('habit') || lower.includes('streak')) {
 this.zoomSection('panel-right-focus', 'Habits & Streaks');
 this.setPipSpeech('Done: Brought Habits and Streaks to view.');
 return;
 }
 if (lower.includes('deadline') || lower.includes('upcoming')) {
 this.zoomSection('panel-right-focus', 'Upcoming Deadlines');
 this.setPipSpeech('Done: Brought Upcoming Deadlines to view.');
 return;
 }
 if (lower.includes('schedule') || lower.includes('day')) {
 this.switchNavTab('schedule');
 this.resetZoom();
 this.setPipSpeech('Done: Brought Day Schedule to view.');
 return;
 }
 if (lower.includes('timer') || lower.includes('focus')) {
 this.zoomSection('panel-hub', 'Focus Session');
 this.setPipSpeech('Done: Brought Focus Timer to view.');
 return;
 }
 if (lower.includes('routine')) {
 this.zoomSection('panel-left-tasks', 'Routines');
 this.setPipSpeech('Done: Brought Routines to view.');
 return;
 }
 if (lower.includes('garden')) {
 this.zoomSection('panel-right-pip', 'Productivity Garden');
 this.setPipSpeech('Done: Brought Productivity Garden to view.');
 return;
 }
 if (lower.includes('overview') || lower.includes('dashboard') || lower.includes('back')) {
 this.resetZoom();
 this.setPipSpeech('Done: Returned to full workspace overview.');
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
 this.setPipSpeech(`Done: Removed task "${removed.title}".`);
 return;
 } else {
 this.setPipSpeech(`Not done: Could not find any task matching "${query}".`);
 return;
 }
 }
 }

 // 3. Edit / Modify / Update Task
 if (lower.startsWith('edit') || lower.startsWith('update') || lower.startsWith('change') || lower.startsWith('modify')) {
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
 this.setPipSpeech(`Done: Changed priority of "${task.title}" to ${newPrio}.`);
 return;
 }
 }

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
 this.setPipSpeech(`Done: Changed duration of "${task.title}" to ${newDur} minutes.`);
 return;
 }
 }

 const editQuery = lower
 .replace(/^(?:edit|update|change|modify)\s+(?:task\s+)?/, '')
 .replace(/^(?:the\s+)/, '')
 .trim();
 if (editQuery) {
 const task = this.tasks.find((t) => t.title.toLowerCase().includes(editQuery));
 if (task) {
 this.openEditSheet(task.id);
 this.triggerPipEmote('thinking');
 this.setPipSpeech(`Done: Opened editor for "${task.title}". Modify details in the Command Hub.`);
 return;
 } else {
 this.setPipSpeech(`Not done: Could not find any task matching "${editQuery}".`);
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
 this.setPipSpeech(`Done: Marked "${task.title}" as completed! +20 XP awarded.`);
 return;
 } else {
 this.setPipSpeech(`Not done: Could not find a task matching "${query}".`);
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
 this.setPipSpeech(`Done: Kept timer at ${minutes} minutes and started focus session.`);
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
 this.setPipSpeech('Done: Planned your day with 10-minute rest buffers. You are all set!');
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

 // 9. Add Task on Any Day
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
 this.refreshAllUI();

 const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
 const dayName = daysOfWeek[parsed.dayNumber % 7] || 'Day';
 this.setPipSpeech(
 `Done: Added task "${parsed.title}" on ${dayName}, Nov ${parsed.dayNumber} (${parsed.estimatedMinutes}m, ${parsed.priority} priority).`,
 );
 this.triggerPipEmote('celebrate');
 if (this.soundEnabled && this.audio) this.audio.playPinchTick();
 return;
 }

 this.setPipSpeech(`Not done: I heard "${transcript}". Tell me what to add, delete, edit, or switch to!`);
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

 public setPipSpeech(text: string, speakAloud: boolean = true) {
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
 if (speakAloud) {
 this.speakTextAloud(text);
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

 // Zoom & Back
 const cardHabits = asset.getElementById('card-habits');
 if (cardHabits) this.addPress(cardHabits, () => this.zoomSection('panel-right-focus', 'Habits & Streaks'));
 const cardDeadlines = asset.getElementById('card-deadlines');
 if (cardDeadlines) this.addPress(cardDeadlines, () => this.zoomSection('panel-right-focus', 'Upcoming Deadlines'));

 const zoomHabits = asset.getElementById('btn-zoom-habits');
 if (zoomHabits) {
 this.addPress(zoomHabits, () => this.zoomSection('panel-right-focus', 'Habits & Streaks', 1.18, 0.16));
 }
 const zoomDeadlines = asset.getElementById('btn-zoom-deadlines');
 if (zoomDeadlines) {
 this.addPress(zoomDeadlines, () => this.zoomSection('panel-right-focus', 'Upcoming Deadlines', 1.38, 0.16));
 }
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
 if (this.deleteTapCount === 0) {
 this.deleteTapCount = 1;
 this.updateEditSheetDisplay();

 if (this.deleteResetTimer !== null) window.clearTimeout(this.deleteResetTimer);
 this.deleteResetTimer = window.setTimeout(() => {
 this.deleteTapCount = 0;
 this.updateEditSheetDisplay();
 }, 5000);
 } else {
 if (this.editingTaskId) {
 const taskToDelete = this.tasks.find((t) => t.id === this.editingTaskId);
 this.tasks = this.tasks.filter((t) => t.id !== this.editingTaskId);
 this.saveTasks(true, `Deleted "${taskToDelete?.title || 'task'}"`);
 }
 this.closeEditSheet();
 }
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
 dayNumber: this.selectedDayNumber,
 };
 this.tasks.push(newTask);
 this.saveTasks(true, `Added "${this.editDraftTitle}"`);
 }
 this.closeEditSheet();
 });
 }
 }

 private openEditSheet(taskId: string | null) {
 this.isEditSheetOpen = true;
 this.editingTaskId = taskId;
 this.deleteTapCount = 0;

 if (taskId) {
 const task = this.tasks.find((t) => t.id === taskId);
 if (task) {
 this.editDraftTitle = task.title;
 this.editDraftDuration = task.estimatedMinutes;
 this.editDraftPriority = task.priority;
 this.editDraftStartTime = task.scheduledStartMinute;
 }
 } else {
 this.editDraftTitle = 'Deep Work Sprint';
 this.editDraftDuration = 45;
 this.editDraftPriority = 'medium';
 this.editDraftStartTime = 540;
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
 this.setHubView('overview');
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

 const greeting = generateGreeting(now, '', this.tasks);
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

 for (let i = 0; i < 7; i++) {
 const day = this.calendarDays[i];
 const dayBtn = asset.getElementById(`cal-day-${i}`) as any;
 const dayTxt = asset.getElementById(`cal-date-text-${i}`) as any;
 if (day && dayTxt) {
 setText(dayTxt, day.dayNumber);
 }
 if (day && dayBtn && typeof dayBtn.setProperties === 'function') {
 const hasTasks = this.tasks.some((t) => (t.dayNumber ?? 18) === day.dayNumber);
 if (day.isSelected) {
 dayBtn.setProperties({
 backgroundColor: '#D97736',
 borderColor: '#F3B27A',
 });
 } else if (hasTasks) {
 dayBtn.setProperties({
 backgroundColor: 'rgba(217, 119, 54, 0.22)',
 borderColor: 'rgba(217, 119, 54, 0.50)',
 });
 } else {
 dayBtn.setProperties({
 backgroundColor: 'transparent',
 borderColor: 'transparent',
 });
 }
 }
 }

 const completedCount = this.agendaItems.filter((a) => a.isCompleted).length;
 const badgeEl = asset.getElementById('agenda-count-badge') as any;
 if (badgeEl) setText(badgeEl, `${completedCount}/${this.agendaItems.length} done`);

 for (let i = 0; i < this.agendaItems.length; i++) {
 const item = this.agendaItems[i];
 const chkLbl = asset.getElementById(`agenda-chk-lbl-${i}`) as any;
 const chkBtn = asset.getElementById(`agenda-chk-${i}`) as any;
 const nameLbl = asset.getElementById(`agenda-name-${i}`) as any;

 if (chkLbl) setText(chkLbl, item.isCompleted ? '[x]' : '');
 if (chkBtn && typeof chkBtn.setProperties === 'function') {
 chkBtn.setProperties({
 backgroundColor: item.isCompleted ? '#22C55E' : 'rgba(255, 255, 255, 0.05)',
 borderColor: item.isCompleted ? '#22C55E' : 'rgba(255, 255, 255, 0.35)',
 });
 }
 if (nameLbl && typeof nameLbl.setProperties === 'function') {
 nameLbl.setProperties({
 color: item.isCompleted ? 'rgba(255, 255, 255, 0.45)' : '#FFFFFF',
 });
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

 const dayTasks = this.tasks.filter((t) => (t.dayNumber ?? 18) === this.selectedDayNumber);
 const schedBlocks = tasksToScheduleBlocks(dayTasks);
 for (let i = 0; i < 5; i++) {
 const block = schedBlocks[i];
 const blockEl = asset.getElementById(`block-${i}`) as any;
 const blockTitleEl = asset.getElementById(`block-title-${i}`) as any;
 const blockTimeEl = asset.getElementById(`block-time-${i}`) as any;
 if (block) {
 if (blockEl && typeof blockEl.setProperties === 'function') {
 blockEl.setProperties({ display: 'flex' });
 }
 if (blockTitleEl) setText(blockTitleEl, shortenScheduleTitle(block.title));
 if (blockTimeEl) setText(blockTimeEl, block.timeRangeFormatted);
 } else {
 if (blockEl && typeof blockEl.setProperties === 'function') {
 blockEl.setProperties({ display: 'none' });
 }
 }
 }

 const filtered = this.getFilteredTasks();
 const tasksCount = asset.getElementById('hub-tasks-count') as any;
 if (tasksCount) setText(tasksCount, `Tasks (${filtered.length})`);

 for (let i = 0; i < 4; i++) {
 const task = filtered[i];
 const titleEl = asset.getElementById(`hub-task-title-${i}`) as any;
 const chkMark = asset.getElementById(`hub-chk-mark-${i}`) as any;
 const chkBox = asset.getElementById(`hub-chk-box-${i}`) as any;

 if (task) {
 if (titleEl) setText(titleEl, task.title);
 const isDone = task.status === 'completed';
 if (chkMark) setText(chkMark, isDone ? '[x]' : '');
 if (chkBox && typeof chkBox.setProperties === 'function') {
 chkBox.setProperties({
 backgroundColor: isDone ? '#22C55E' : 'transparent',
 borderColor: isDone ? '#22C55E' : 'rgba(255, 255, 255, 0.35)',
 });
 }
 }
 }

 // Dynamic Week View updates
 for (let i = 0; i < 7; i++) {
 const dayNum = 16 + i;
 const tasksForDay = this.tasks.filter((t) => (t.dayNumber ?? 18) === dayNum);
 const countEl = asset.getElementById(`week-day-count-${i}`) as any;
 if (countEl) setText(countEl, `${tasksForDay.length} task${tasksForDay.length === 1 ? '' : 's'}`);

 const colEl = asset.getElementById(`week-col-${i}`) as any;
 if (colEl && typeof colEl.setProperties === 'function') {
 const isSelected = dayNum === this.selectedDayNumber;
 colEl.setProperties({
 backgroundColor: isSelected ? 'rgba(217, 119, 54, 0.25)' : 'rgba(255, 255, 255, 0.04)',
 borderColor: isSelected ? '#D97736' : 'rgba(255, 255, 255, 0.08)',
 });
 }
 }

 const t0 = this.tasks.find((t) => (t.dayNumber ?? 18) === 16);
 const w0 = asset.getElementById('week-task-0') as any;
 if (w0) setText(w0, t0 ? t0.title : 'No tasks');

 const t1 = this.tasks.find((t) => (t.dayNumber ?? 18) === 17);
 const w1 = asset.getElementById('week-task-1') as any;
 if (w1) setText(w1, t1 ? t1.title : 'No tasks');

 const t2s = this.tasks.filter((t) => (t.dayNumber ?? 18) === 18);
 const w2a = asset.getElementById('week-task-2-a') as any;
 const w2b = asset.getElementById('week-task-2-b') as any;
 const w2c = asset.getElementById('week-task-2-c') as any;
 if (w2a) setText(w2a, t2s[0]?.title || 'Finish ML');
 if (w2b) setText(w2b, t2s[1]?.title || 'Implement API');
 if (w2c) setText(w2c, t2s[2]?.title || 'Team Meet');

 const t3 = this.tasks.find((t) => (t.dayNumber ?? 18) === 19);
 const w3 = asset.getElementById('week-task-3') as any;
 if (w3) setText(w3, t3 ? t3.title : 'No tasks');

 const t4 = this.tasks.find((t) => (t.dayNumber ?? 18) === 20);
 const w4 = asset.getElementById('week-task-4') as any;
 if (w4) setText(w4, t4 ? t4.title : 'No tasks');

 const t5 = this.tasks.find((t) => (t.dayNumber ?? 18) === 21);
 const w5 = asset.getElementById('week-task-5') as any;
 if (w5) setText(w5, t5 ? t5.title : 'No tasks');

 const t6 = this.tasks.find((t) => (t.dayNumber ?? 18) === 22);
 const w6 = asset.getElementById('week-task-6') as any;
 if (w6) setText(w6, t6 ? t6.title : 'Weekend Rest');

 // Dynamic Month View updates
 for (let d = 16; d <= 22; d++) {
 const tile = asset.getElementById(`month-date-${d}`) as any;
 if (tile && typeof tile.setProperties === 'function') {
 const isSelected = d === this.selectedDayNumber;
 tile.setProperties({
 backgroundColor: isSelected ? 'rgba(217, 119, 54, 0.35)' : 'rgba(255, 255, 255, 0.05)',
 borderColor: isSelected ? '#D97736' : 'rgba(255, 255, 255, 0.12)',
 });
 }
 }

 const monthSelectedDayLabel = asset.getElementById('month-selected-day-label') as any;
 if (monthSelectedDayLabel) {
 const selTasks = this.tasks.filter((t) => (t.dayNumber ?? 18) === this.selectedDayNumber);
 setText(
 monthSelectedDayLabel,
 `Selected Day: Nov ${this.selectedDayNumber} - ${selTasks.length} task${selTasks.length === 1 ? '' : 's'}`,
 );
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

 update(time: number, delta: number) {
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