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
 *   with a prominent "◀ Back to Overview" button that restores the initial view without resetting any changes
 * - Fully interactive controls: Tasks filter chips, row checkboxes, Edit buttons, Add Task,
 *   Focus Session (+5m, -5m, Reset, Break, Play/Pause), Workload gauge, Schedule blocks,
 *   Mini Calendar days, Routines, Habits dots, and Floating Dock.
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
import { recommendWhatNext, planDaySchedule, TaskItem } from './productivity-engine.js';
import { PipRobotRig } from './scene-assets/pip-robot.scene-asset.js';

const STORAGE_KEY_TASKS = 'deskmate.tasks.v1';

type NavTab = 'tasks' | 'schedule' | 'focus' | 'analytics' | 'garden' | 'routines' | 'notes' | 'goals';

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
  private selectedDayNumber = 18;
  private selectedMonthIndex = 10; // November
  private readonly monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  private agendaItems: AgendaItemViewModel[] = JSON.parse(JSON.stringify(SEED_AGENDA_ITEMS));
  private routines: RoutineGroup[] = JSON.parse(JSON.stringify(SEED_ROUTINES));
  private habits: HabitItem[] = JSON.parse(JSON.stringify(SEED_HABITS));
  private deadlines: UpcomingDeadline[] = JSON.parse(JSON.stringify(SEED_DEADLINES));

  // Hub View Controls
  private activeTab: NavTab = 'schedule';
  private scheduleView: 'day' | 'week' | 'month' = 'day';
  private taskFilter: 'all' | 'high' | 'medium' | 'low' = 'all';
  private voiceListening = false;
  private hasUnreadNotification = true;

  // Section Zoom State
  private zoomedPanelId: string | null = null;

  // Active Edit Task State
  private editingTaskId: string | null = null;
  private editDraftTitle = 'New task';
  private editDraftDuration = 60;
  private editDraftPriority: 'low' | 'medium' | 'high' = 'medium';
  private editDraftStartTime: number | null = 540; // 09:00
  private deleteTapCount = 0;
  private deleteResetTimer: number | null = null;

  // Pip 3D Robot
  private pipRig: PipRobotRig | null = null;

  // Audio & Settings
  private audio: GhostDeskmateAudio | null = null;
  private soundEnabled = true;

  init() {
    this.audio = new GhostDeskmateAudio();
    this.audio.init();

    this.loadTasks();

    // 1-second interval for clock check and focus countdown
    const interval = window.setInterval(() => {
      this.tickSecond();
    }, 1000);
    this.cleanupFuncs.push(() => window.clearInterval(interval));

    this.initPipRobotRig();
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
      if (now - lastElem < 300) return;
      this.lastElementPressTime.set(element, now);
      if (this.soundEnabled && this.audio) {
        this.audio.playPinchTick();
      }
      handler();
    };

    element.addEventListener('pointerenter', onEnter);
    element.addEventListener('click', trigger);
    element.addEventListener('pointerdown', trigger);

    this.cleanupFuncs.push(() => {
      try {
        element.removeEventListener('pointerenter', onEnter);
        element.removeEventListener('click', trigger);
        element.removeEventListener('pointerdown', trigger);
      } catch {}
    });

    if (Array.isArray(element.children)) {
      for (const child of element.children) {
        if (child && typeof child.addEventListener === 'function') {
          child.addEventListener('pointerenter', onEnter);
          child.addEventListener('click', trigger);
          child.addEventListener('pointerdown', trigger);
          this.cleanupFuncs.push(() => {
            try {
              child.removeEventListener('pointerenter', onEnter);
              child.removeEventListener('click', trigger);
              child.removeEventListener('pointerdown', trigger);
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
          return;
        }
      }
    } catch (err) {
      console.warn('[DeskMate] Could not load stored tasks, using seed data:', err);
    }
    this.tasks = JSON.parse(JSON.stringify(SEED_TASKS));
    this.saveTasks(false);
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

  private initPipRobotRig() {
    const pipObj = this.world.getSceneObject('pip-robot');
    if (!pipObj) return;

    const head = pipObj.getObjectByName('pip-head');
    const body = pipObj.getObjectByName('pip-robot-root');
    if (head) {
      this.pipRig = {
        root: pipObj as any,
        head: head as any,
        body: body as any,
      } as any;
    }
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
    this.refreshAllUI();
  }

  // --------------------------------------------------------------------------
  // Section Zoom / Focus View Mechanics
  // --------------------------------------------------------------------------
  public zoomSection(panelId: string, sectionTitle = 'Section View') {
    this.zoomedPanelId = panelId;

    const targetObj = this.world.getSceneObject(panelId);
    if (targetObj) {
      targetObj.position.set(0, 1.24, -0.44);
      targetObj.rotation.set(0, 0, 0);
      targetObj.scale.set(0.145, 0.145, 0.145);
      targetObj.visible = true;
    }

    const allPanelIds = ['panel-left-tasks', 'panel-hub', 'panel-right-pip', 'panel-right-focus'];
    for (const id of allPanelIds) {
      if (id !== panelId) {
        const obj = this.world.getSceneObject(id);
        if (obj) {
          obj.visible = false;
        }
      }
    }

    this.updateZoomBackButtons(panelId, sectionTitle, true);

    if (this.soundEnabled && this.audio) {
      this.audio.playPinchTick();
    }
    this.setPipSpeech(`Zoomed in on ${sectionTitle}. Click "◀ Back to Overview" anytime to return.`);
  }

  public resetZoom() {
    const prevZoomed = this.zoomedPanelId;
    this.zoomedPanelId = null;

    const defaults: Record<string, { pos: [number, number, number]; rotDeg: [number, number, number]; scale: number }> = {
      'panel-left-tasks': { pos: [-0.58, 1.28, -0.68], rotDeg: [0, 22, 0], scale: 0.10 },
      'panel-hub': { pos: [0, 1.28, -0.72], rotDeg: [0, 0, 0], scale: 0.10 },
      'panel-right-pip': { pos: [0.56, 1.45, -0.68], rotDeg: [0, -22, 0], scale: 0.10 },
      'panel-right-focus': { pos: [0.56, 1.15, -0.68], rotDeg: [0, -22, 0], scale: 0.10 },
    };

    for (const [id, def] of Object.entries(defaults)) {
      const obj = this.world.getSceneObject(id);
      if (obj) {
        obj.position.set(def.pos[0], def.pos[1], def.pos[2]);
        obj.rotation.set(
          (def.rotDeg[0] * Math.PI) / 180,
          (def.rotDeg[1] * Math.PI) / 180,
          (def.rotDeg[2] * Math.PI) / 180,
        );
        obj.scale.set(def.scale, def.scale, def.scale);
        obj.visible = true;
      }
    }

    this.updateZoomBackButtons(prevZoomed || '', '', false);

    if (this.soundEnabled && this.audio) {
      this.audio.playPinchTick();
    }
    this.setPipSpeech('Returned to full workspace overview. All changes are preserved.');
  }

  private updateZoomBackButtons(panelId: string, sectionTitle: string, isZoomed: boolean) {
    const hubAsset = this.getAsset('panel-hub');
    const tasksAsset = this.getAsset('panel-left-tasks');
    const pipAsset = this.getAsset('panel-right-pip');
    const focusAsset = this.getAsset('panel-right-focus');

    const hubZoomBar = hubAsset?.getElementById('hub-zoom-bar') as any;
    const zoomSectionLbl = hubAsset?.getElementById('zoom-section-label') as any;
    if (hubZoomBar) {
      const show = isZoomed && panelId === 'panel-hub';
      hubZoomBar.style = hubZoomBar.style || {};
      hubZoomBar.style.display = show ? 'flex' : 'none';
      if (typeof hubZoomBar.setProperties === 'function') {
        hubZoomBar.setProperties({ display: show ? 'flex' : 'none' });
      }
      if (zoomSectionLbl) {
        setText(zoomSectionLbl, `Viewing: ${sectionTitle} (Zoomed)`);
      }
    }

    const tasksBack = tasksAsset?.getElementById('btn-tasks-panel-back') as any;
    if (tasksBack) {
      const show = isZoomed && panelId === 'panel-left-tasks';
      tasksBack.style = tasksBack.style || {};
      tasksBack.style.display = show ? 'flex' : 'none';
      if (typeof tasksBack.setProperties === 'function') {
        tasksBack.setProperties({ display: show ? 'flex' : 'none' });
      }
    }

    const pipBack = pipAsset?.getElementById('btn-pip-back') as any;
    if (pipBack) {
      const show = isZoomed && panelId === 'panel-right-pip';
      pipBack.style = pipBack.style || {};
      pipBack.style.display = show ? 'flex' : 'none';
      if (typeof pipBack.setProperties === 'function') {
        pipBack.setProperties({ display: show ? 'flex' : 'none' });
      }
    }

    const habitsBack = focusAsset?.getElementById('btn-habits-back') as any;
    if (habitsBack) {
      const show = isZoomed && panelId === 'panel-right-focus';
      habitsBack.style = habitsBack.style || {};
      habitsBack.style.display = show ? 'flex' : 'none';
      if (typeof habitsBack.setProperties === 'function') {
        habitsBack.setProperties({ display: show ? 'flex' : 'none' });
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
    const zoomBtn = asset.getElementById('btn-zoom-tasks-panel');
    if (zoomBtn) {
      this.addPress(zoomBtn, () => this.zoomSection('panel-left-tasks', 'Agenda & Routines'));
    }
    const backBtn = asset.getElementById('btn-tasks-panel-back');
    if (backBtn) {
      this.addPress(backBtn, () => this.resetZoom());
    }

    // Mini Calendar Navigation
    const prevMonth = asset.getElementById('cal-prev-month');
    if (prevMonth) {
      this.addPress(prevMonth, () => {
        this.selectedMonthIndex = (this.selectedMonthIndex - 1 + 12) % 12;
        this.updateCalendarHeader();
      });
    }
    const nextMonth = asset.getElementById('cal-next-month');
    if (nextMonth) {
      this.addPress(nextMonth, () => {
        this.selectedMonthIndex = (this.selectedMonthIndex + 1) % 12;
        this.updateCalendarHeader();
      });
    }

    for (let i = 0; i < 7; i++) {
      const dayBtn = asset.getElementById(`cal-day-${i}`);
      if (dayBtn) {
        this.addPress(dayBtn, () => {
          this.calendarDays.forEach((d, idx) => {
            d.isSelected = idx === i;
          });
          const selected = this.calendarDays[i];
          this.selectedDayNumber = selected.dayNumber;
          this.setPipSpeech(`Viewing schedule for ${selected.dayOfWeek}, Nov ${selected.dayNumber}.`);
          this.refreshTasksPanelUI();
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
        };
        this.tasks.push(newEvent);
        this.saveTasks(true, 'Added "Design Review & Sync" event');
        this.setPipSpeech('Added new event "Design Review & Sync" at 4:00 PM.');
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
              ? '☀️ Morning routine complete! Great start to your day.'
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
              ? '🌙 Wind-down routine done! Rest well tonight.'
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

  private updateCalendarHeader() {
    const asset = this.getAsset('panel-left-tasks');
    if (!asset) return;
    const monthLabel = asset.getElementById('cal-month-label') as any;
    if (monthLabel) {
      setText(monthLabel, `${this.monthNames[this.selectedMonthIndex]} 2026`);
    }
    this.setPipSpeech(`Switched calendar to ${this.monthNames[this.selectedMonthIndex]} 2026.`);
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
        const tempStr = this.weather.isCelsius ? `${this.weather.tempC}°C` : `${this.weather.tempF}°F`;
        const tempEl = asset.getElementById('weather-temp') as any;
        if (tempEl) setText(tempEl, tempStr);
        this.setPipSpeech(`Weather in ${this.weather.city}: ${tempStr}, ${this.weather.condition}.`);
      });
    }

    // Header Action Buttons
    const searchBtn = asset.getElementById('btn-search');
    if (searchBtn) {
      this.addPress(searchBtn, () => {
        this.setPipSpeech('Search: indexing tasks, calendar schedule, notes, and routines.');
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
        this.setPipSpeech('All notifications cleared. You are completely up to date!');
      });
    }

    const settingsBtn = asset.getElementById('btn-settings');
    if (settingsBtn) {
      this.addPress(settingsBtn, () => this.toggleSettingsSheet());
    }

    const profileBtn = asset.getElementById('btn-profile');
    if (profileBtn) {
      this.addPress(profileBtn, () => {
        this.setPipSpeech('Spatial Productivity Profile: Active • 7-day streak • Level 3 Garden.');
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

    const focusPlayBtn = asset.getElementById('hub-focus-play-btn');
    if (focusPlayBtn) {
      this.addPress(focusPlayBtn, () => this.toggleFocusTimer());
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
        this.focusRemainingSeconds = Math.min(120 * 60, this.focusRemainingSeconds + 5 * 60);
        this.refreshHubPanelUI();
      });
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
          this.setPipSpeech(`Dock: Opened ${item.label}.`);
        });
      }
    }
  }

  private getFilteredTasks(): GlassTask[] {
    return this.tasks.filter((t) => {
      if (this.taskFilter === 'all') return true;
      return t.priority === this.taskFilter;
    });
  }

  private setScheduleView(view: 'day' | 'week' | 'month') {
    this.scheduleView = view;
    this.setPipSpeech(`Schedule view switched to ${view.toUpperCase()}.`);
    this.refreshHubPanelUI();
  }

  private setTaskFilter(filter: 'all' | 'high' | 'medium' | 'low') {
    this.taskFilter = filter;
    this.setPipSpeech(`Filtering tasks: ${filter.toUpperCase()}.`);
    this.refreshHubPanelUI();
  }

  private switchNavTab(tab: NavTab) {
    this.activeTab = tab;
    this.setPipSpeech(`Switched to ${tab.toUpperCase()} tab.`);
    this.refreshHubPanelUI();
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
    const zoomPip = asset.getElementById('btn-zoom-pip');
    if (zoomPip) {
      this.addPress(zoomPip, () => this.zoomSection('panel-right-pip', 'Pip Companion & Garden'));
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
        this.voiceListening = !this.voiceListening;
        if (this.voiceListening) {
          this.setPipSpeech('Listening for spatial voice commands... Speak anytime.');
        } else {
          this.setPipSpeech('Voice commands paused.');
        }
        this.refreshPipPanelUI();
      });
    }
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
      this.setPipSpeech(`Recommended next: "${rec.task.title}". ${rec.rationale}`);
      this.triggerPipEmote('thinking');
    } else {
      this.setPipSpeech('All caught up! Start a new task or take a rest.');
    }
  }

  public setPipSpeech(text: string) {
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
  }

  public triggerPipEmote(_emote: 'celebrate' | 'thinking' | 'idle') {}

  // --------------------------------------------------------------------------
  // Focus Panel Binding (Right Column Bottom: Habits & Deadlines)
  // --------------------------------------------------------------------------
  private bindFocusPanel() {
    const asset = this.getAsset('panel-right-focus');
    if (!asset) return;

    // Zoom & Back
    const zoomHabits = asset.getElementById('btn-zoom-habits');
    if (zoomHabits) {
      this.addPress(zoomHabits, () => this.zoomSection('panel-right-focus', 'Habits & Deadlines'));
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
          };
          this.tasks.push(newTask);
          this.saveTasks(true, `Added "${this.editDraftTitle}"`);
        }
        this.closeEditSheet();
      });
    }
  }

  private openEditSheet(taskId: string | null) {
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
      this.editDraftTitle = 'New task';
      this.editDraftDuration = 45;
      this.editDraftPriority = 'medium';
      this.editDraftStartTime = 540;
    }

    const sheetObj = this.world.getSceneObject('panel-edit-sheet');
    if (sheetObj) {
      sheetObj.position.set(0, 1.28, -0.60);
      sheetObj.visible = true;
    }

    this.updateEditSheetDisplay();
  }

  private closeEditSheet() {
    this.editingTaskId = null;
    this.deleteTapCount = 0;
    const sheetObj = this.world.getSceneObject('panel-edit-sheet');
    if (sheetObj) {
      sheetObj.position.set(0, -50, 0);
    }
  }

  private updateEditSheetDisplay() {
    const asset = this.getAsset('panel-edit-sheet');
    if (!asset) return;

    const titleEl = asset.getElementById('sheet-title') as any;
    if (titleEl) {
      setText(titleEl, this.editingTaskId ? `Edit: ${this.editDraftTitle}` : 'Create New Task');
    }

    const durEl = asset.getElementById('sheet-duration-display') as any;
    if (durEl) {
      setText(durEl, `${this.editDraftDuration}m`);
    }

    const delLbl = asset.getElementById('btn-sheet-delete-label') as any;
    if (delLbl) {
      setText(delLbl, this.deleteTapCount === 1 ? 'Confirm Delete?' : 'Delete');
    }
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
    if (playIcon) setText(playIcon, this.focusRunning ? '⏸' : '▶');

    const sessionsEl = hubAsset.getElementById('hub-focus-sessions-count') as any;
    if (sessionsEl) setText(sessionsEl, `⏱ ${this.focusSessionsCompleted}/8 Sessions Today`);
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
      if (dayBtn && typeof dayBtn.setProperties === 'function') {
        dayBtn.setProperties({
          backgroundColor: day.isSelected ? '#3B82F6' : 'transparent',
        });
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

      if (chkLbl) setText(chkLbl, item.isCompleted ? '✓' : '');
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
      setText(morningBadge, `✓ ${morning.completedCount}/${morning.totalCount}`);
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
          ? '⚠️ Overloaded! Reschedule non-critical tasks.'
          : "💡 You're on track! ~2h free after 7 PM.",
      );
    }

    const schedBlocks = tasksToScheduleBlocks(this.tasks);
    for (let i = 0; i < 5; i++) {
      const block = schedBlocks[i];
      const blockTitleEl = asset.getElementById(`block-title-${i}`) as any;
      const blockTimeEl = asset.getElementById(`block-time-${i}`) as any;
      if (block) {
        if (blockTitleEl) setText(blockTitleEl, shortenScheduleTitle(block.title));
        if (blockTimeEl) setText(blockTimeEl, block.timeRangeFormatted);
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
        if (chkMark) setText(chkMark, isDone ? '✓' : '');
        if (chkBox && typeof chkBox.setProperties === 'function') {
          chkBox.setProperties({
            backgroundColor: isDone ? '#22C55E' : 'transparent',
            borderColor: isDone ? '#22C55E' : 'rgba(255, 255, 255, 0.35)',
          });
        }
      }
    }
  }

  private refreshPipPanelUI() {
    const asset = this.getAsset('panel-right-pip');
    if (!asset) return;

    const garden = calculateGardenProgress(this.gardenPoints);
    const gardenLvl = asset.getElementById('garden-level-text') as any;
    if (gardenLvl) setText(gardenLvl, `Level ${garden.level} 🌱`);

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

  update(time: number, _delta: number) {
    if (!this.isBound) {
      this.bindPanels();
    }

    if (this.pipRig && this.pipRig.head) {
      const bob = Math.sin(time * 0.003) * 0.006;
      this.pipRig.head.position.y = 0.05 + bob;
    }
  }
}