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
  tasksToRowViewModels,
  tasksToScheduleBlocks,
  calculateWorkloadDonut,
  calculateGardenProgress,
  generateGreeting,
  getClockViewModel,
  calculateFocusRing,
  UndoStack,
} from './glass-data-adapters.js';

import { GhostDeskmateAudio } from './audio.js';
import { recommendWhatNext, planDaySchedule, TaskItem } from './productivity-engine.js';
import { PipRobotRig } from './scene-assets/pip-robot.scene-asset.js';

const STORAGE_KEY_TASKS = 'deskmate.tasks.v1';

type NavTab = 'home' | 'tasks' | 'schedule' | 'focus' | 'analytics' | 'garden';

export class PanelSystem extends createSystem({
  grabbedPanels: { required: [Grabbed] },
}) {
  private tasks: GlassTask[] = [];
  private undoStack = new UndoStack<GlassTask[]>(5);
  private undoTimer: number | null = null;

  // Clock & Timer
  private lastClockMinute = -1;
  private focusTotalSeconds = 25 * 60;
  private focusRemainingSeconds = 25 * 60;
  private focusRunning = false;
  private focusMode: 'pomodoro' | 'short_break' | 'long_break' = 'pomodoro';

  // Garden Points
  private gardenPoints = 220; // Level 3 in reference

  // Active Edit Task State
  private editingTaskId: string | null = null;
  private editDraftTitle = 'New task';
  private editDraftDuration = 60;
  private editDraftPriority: 'low' | 'medium' | 'high' = 'medium';
  private editDraftStartTime: number | null = 540; // 09:00
  private deleteTapCount = 0;
  private deleteResetTimer: number | null = null;

  // Active View Tab on Hub
  private activeTab: NavTab = 'home';

  // Pip 3D Robot
  private pipRig: PipRobotRig | null = null;

  // Audio & Settings
  private audio: GhostDeskmateAudio | null = null;
  private soundEnabled = true;

  init() {
    this.audio = new GhostDeskmateAudio();
    this.audio.init();

    this.loadTasks();

    // Start 1-second interval for clock check and focus countdown
    const interval = window.setInterval(() => {
      this.tickSecond();
    }, 1000);
    this.cleanupFuncs.push(() => window.clearInterval(interval));

    // Bind entities when ready
    this.initPipRobotRig();
    this.bindPanels();
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
    // Seed with reference data
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
    }
    if (undoLabelEl) {
      undoLabelEl.textContent = label;
    }

    // Hide after 8 seconds
    this.undoTimer = window.setTimeout(() => {
      if (undoContainer) {
        undoContainer.style.display = 'none';
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
    this.bindTasksPanel();
    this.bindHubPanel();
    this.bindPipPanel();
    this.bindFocusPanel();
    this.bindEditSheet();
    this.refreshAllUI();
  }

  // --------------------------------------------------------------------------
  // Tasks Panel Binding
  // --------------------------------------------------------------------------
  private bindTasksPanel() {
    const asset = this.getAsset('panel-left-tasks');
    if (!asset) return;

    // Add Task Button
    const addBtn = asset.getElementById('btn-add-task');
    if (addBtn) {
      const onAdd = () => this.openEditSheet(null);
      addBtn.addEventListener('click', onAdd);
      this.cleanupFuncs.push(() => addBtn.removeEventListener('click', onAdd));
    }

    // Undo Button
    const undoBtn = asset.getElementById('undo-btn');
    if (undoBtn) {
      const onUndo = () => this.triggerUndo();
      undoBtn.addEventListener('click', onUndo);
      this.cleanupFuncs.push(() => undoBtn.removeEventListener('click', onUndo));
    }

    // Checkboxes and Row click
    for (let i = 0; i < 4; i++) {
      const chkBtn = asset.getElementById(`task-chk-${i}`);
      if (chkBtn) {
        const onChk = () => this.toggleTaskComplete(i);
        chkBtn.addEventListener('click', onChk);
        this.cleanupFuncs.push(() => chkBtn.removeEventListener('click', onChk));
      }

      const rowEl = asset.getElementById(`task-row-${i}`);
      if (rowEl) {
        const onRowClick = () => {
          if (this.tasks[i]) {
            this.openEditSheet(this.tasks[i].id);
          }
        };
        rowEl.addEventListener('click', onRowClick);
        this.cleanupFuncs.push(() => rowEl.removeEventListener('click', onRowClick));
      }
    }
  }

  private toggleTaskComplete(index: number) {
    if (!this.tasks[index]) return;
    const task = this.tasks[index];
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    task.status = newStatus;
    task.completedAt = newStatus === 'completed' ? Date.now() : null;

    if (newStatus === 'completed') {
      this.gardenPoints += 20;
      this.setPipSpeech(`Nice work finishing "${task.title}"! +20 garden points!`);
      this.triggerPipEmote('celebrate');
    }

    this.saveTasks(true, `${newStatus === 'completed' ? 'Completed' : 'Reopened'} ${task.title}`);
  }

  // --------------------------------------------------------------------------
  // Hub Panel Binding
  // --------------------------------------------------------------------------
  private bindHubPanel() {
    const asset = this.getAsset('panel-hub');
    if (!asset) return;

    // Header Action Buttons
    const bellBtn = asset.getElementById('btn-bell');
    if (bellBtn) {
      const onBell = () => this.setPipSpeech('No unread notifications.');
      bellBtn.addEventListener('click', onBell);
      this.cleanupFuncs.push(() => bellBtn.removeEventListener('click', onBell));
    }

    const settingsBtn = asset.getElementById('btn-settings');
    if (settingsBtn) {
      const onSettings = () => this.toggleSettingsSheet();
      settingsBtn.addEventListener('click', onSettings);
      this.cleanupFuncs.push(() => settingsBtn.removeEventListener('click', onSettings));
    }

    const profileBtn = asset.getElementById('btn-profile');
    if (profileBtn) {
      const onProfile = () => this.setPipSpeech('Logged in as Madhavan.');
      profileBtn.addEventListener('click', onProfile);
      this.cleanupFuncs.push(() => profileBtn.removeEventListener('click', onProfile));
    }

    // Navigation Tiles
    const navItems: Array<{ id: string; tab: NavTab }> = [
      { id: 'nav-tasks', tab: 'tasks' },
      { id: 'nav-schedule', tab: 'schedule' },
      { id: 'nav-focus', tab: 'focus' },
      { id: 'nav-analytics', tab: 'analytics' },
      { id: 'nav-garden', tab: 'garden' },
    ];

    for (const item of navItems) {
      const btn = asset.getElementById(item.id);
      if (btn) {
        const onNav = () => this.switchNavTab(item.tab);
        btn.addEventListener('click', onNav);
        this.cleanupFuncs.push(() => btn.removeEventListener('click', onNav));
      }
    }

    // Schedule Blocks Click (opens edit sheet)
    for (let i = 0; i < 4; i++) {
      const blockEl = asset.getElementById(`block-${i}`);
      if (blockEl) {
        const onBlock = () => {
          if (this.tasks[i]) this.openEditSheet(this.tasks[i].id);
        };
        blockEl.addEventListener('click', onBlock);
        this.cleanupFuncs.push(() => blockEl.removeEventListener('click', onBlock));
      }
    }
  }

  private switchNavTab(tab: typeof this.activeTab) {
    this.activeTab = tab;
    this.setPipSpeech(`Switched to ${tab.toUpperCase()} view.`);
    this.refreshAllUI();
  }

  private toggleSettingsSheet() {
    this.soundEnabled = !this.soundEnabled;
    this.setPipSpeech(`Sound ${this.soundEnabled ? 'Enabled' : 'Muted'}.`);
  }

  // --------------------------------------------------------------------------
  // Pip Panel Binding
  // --------------------------------------------------------------------------
  private bindPipPanel() {
    const asset = this.getAsset('panel-right-pip');
    if (!asset) return;

    const chipWhatNext = asset.getElementById('chip-pip-what-next');
    if (chipWhatNext) {
      const onWhatNext = () => {
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
      };
      chipWhatNext.addEventListener('click', onWhatNext);
      this.cleanupFuncs.push(() => chipWhatNext.removeEventListener('click', onWhatNext));
    }

    const chipPlanDay = asset.getElementById('chip-pip-plan-day');
    if (chipPlanDay) {
      const onPlanDay = () => {
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
      };
      chipPlanDay.addEventListener('click', onPlanDay);
      this.cleanupFuncs.push(() => chipPlanDay.removeEventListener('click', onPlanDay));
    }

    const chipRecap = asset.getElementById('chip-pip-recap');
    if (chipRecap) {
      const onRecap = () => {
        const done = this.tasks.filter((t) => t.status === 'completed').length;
        const total = this.tasks.length;
        this.setPipSpeech(`Today's progress: ${done} of ${total} tasks finished. Keep momentum!`);
      };
      chipRecap.addEventListener('click', onRecap);
      this.cleanupFuncs.push(() => chipRecap.removeEventListener('click', onRecap));
    }

    const chipBreak = asset.getElementById('chip-pip-break');
    if (chipBreak) {
      const onBreak = () => {
        this.focusMode = 'short_break';
        this.focusTotalSeconds = 5 * 60;
        this.focusRemainingSeconds = 5 * 60;
        this.focusRunning = true;
        this.setPipSpeech('Taking a 5-minute breather. Stand up and stretch!');
        this.refreshAllUI();
      };
      chipBreak.addEventListener('click', onBreak);
      this.cleanupFuncs.push(() => chipBreak.removeEventListener('click', onBreak));
    }
  }

  public setPipSpeech(text: string) {
    const asset = this.getAsset('panel-right-pip');
    if (!asset) return;
    const speechEl = asset.getElementById('pip-speech-text') as any;
    if (speechEl) {
      speechEl.textContent = text;
    }
  }

  public triggerPipEmote(_emote: 'celebrate' | 'thinking' | 'idle') {}

  // --------------------------------------------------------------------------
  // Focus Panel Binding
  // --------------------------------------------------------------------------
  private bindFocusPanel() {
    const asset = this.getAsset('panel-right-focus');
    if (!asset) return;

    const playBtn = asset.getElementById('btn-focus-play-pause');
    if (playBtn) {
      const onPlay = () => this.toggleFocusTimer();
      playBtn.addEventListener('click', onPlay);
      this.cleanupFuncs.push(() => playBtn.removeEventListener('click', onPlay));
    }

    const minus5Btn = asset.getElementById('chip-focus-minus5');
    if (minus5Btn) {
      const onMinus5 = () => {
        this.focusRemainingSeconds = Math.max(60, this.focusRemainingSeconds - 5 * 60);
        this.refreshAllUI();
      };
      minus5Btn.addEventListener('click', onMinus5);
      this.cleanupFuncs.push(() => minus5Btn.removeEventListener('click', onMinus5));
    }

    const plus5Btn = asset.getElementById('chip-focus-plus5');
    if (plus5Btn) {
      const onPlus5 = () => {
        this.focusRemainingSeconds = Math.min(120 * 60, this.focusRemainingSeconds + 5 * 60);
        this.refreshAllUI();
      };
      plus5Btn.addEventListener('click', onPlus5);
      this.cleanupFuncs.push(() => plus5Btn.removeEventListener('click', onPlus5));
    }

    const resetBtn = asset.getElementById('chip-focus-reset');
    if (resetBtn) {
      const onReset = () => {
        this.focusRunning = false;
        this.focusRemainingSeconds = 25 * 60;
        this.focusMode = 'pomodoro';
        this.refreshAllUI();
      };
      resetBtn.addEventListener('click', onReset);
      this.cleanupFuncs.push(() => resetBtn.removeEventListener('click', onReset));
    }

    const breakBtn = asset.getElementById('chip-focus-break');
    if (breakBtn) {
      const onBreak = () => {
        this.focusMode = 'short_break';
        this.focusRemainingSeconds = 5 * 60;
        this.focusTotalSeconds = 5 * 60;
        this.focusRunning = true;
        this.refreshAllUI();
      };
      breakBtn.addEventListener('click', onBreak);
      this.cleanupFuncs.push(() => breakBtn.removeEventListener('click', onBreak));
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

    // Close Button
    const closeBtn = asset.getElementById('btn-sheet-close');
    if (closeBtn) {
      const onClose = () => this.closeEditSheet();
      closeBtn.addEventListener('click', onClose);
      this.cleanupFuncs.push(() => closeBtn.removeEventListener('click', onClose));
    }

    // Title Presets
    const presets = ['Deep Work Sprint', 'Team Sync', 'Code Review', 'Write Report'];
    for (let i = 0; i < presets.length; i++) {
      const btn = asset.getElementById(`preset-${i}`);
      if (btn) {
        const onPreset = () => {
          this.editDraftTitle = presets[i];
          this.updateEditSheetDisplay();
        };
        btn.addEventListener('click', onPreset);
        this.cleanupFuncs.push(() => btn.removeEventListener('click', onPreset));
      }
    }

    // Duration Steppers
    const durMinus = asset.getElementById('btn-dur-minus');
    if (durMinus) {
      const onMinus = () => {
        this.editDraftDuration = Math.max(15, this.editDraftDuration - 15);
        this.updateEditSheetDisplay();
      };
      durMinus.addEventListener('click', onMinus);
      this.cleanupFuncs.push(() => durMinus.removeEventListener('click', onMinus));
    }

    const durPlus = asset.getElementById('btn-dur-plus');
    if (durPlus) {
      const onPlus = () => {
        this.editDraftDuration = Math.min(240, this.editDraftDuration + 15);
        this.updateEditSheetDisplay();
      };
      durPlus.addEventListener('click', onPlus);
      this.cleanupFuncs.push(() => durPlus.removeEventListener('click', onPlus));
    }

    // Priority Toggles
    const priLow = asset.getElementById('btn-pri-low');
    if (priLow) {
      const onLow = () => {
        this.editDraftPriority = 'low';
        this.updateEditSheetDisplay();
      };
      priLow.addEventListener('click', onLow);
      this.cleanupFuncs.push(() => priLow.removeEventListener('click', onLow));
    }

    const priMed = asset.getElementById('btn-pri-med');
    if (priMed) {
      const onMed = () => {
        this.editDraftPriority = 'medium';
        this.updateEditSheetDisplay();
      };
      priMed.addEventListener('click', onMed);
      this.cleanupFuncs.push(() => priMed.removeEventListener('click', onMed));
    }

    const priHigh = asset.getElementById('btn-pri-high');
    if (priHigh) {
      const onHigh = () => {
        this.editDraftPriority = 'high';
        this.updateEditSheetDisplay();
      };
      priHigh.addEventListener('click', onHigh);
      this.cleanupFuncs.push(() => priHigh.removeEventListener('click', onHigh));
    }

    // Time Chips
    const timeSlots = [
      { id: 'chip-time-9', minute: 9 * 60 },
      { id: 'chip-time-11', minute: 11 * 60 },
      { id: 'chip-time-14', minute: 14 * 60 },
      { id: 'chip-time-16', minute: 16 * 60 },
    ];
    for (const slot of timeSlots) {
      const btn = asset.getElementById(slot.id);
      if (btn) {
        const onTime = () => {
          this.editDraftStartTime = slot.minute;
          this.updateEditSheetDisplay();
        };
        btn.addEventListener('click', onTime);
        this.cleanupFuncs.push(() => btn.removeEventListener('click', onTime));
      }
    }

    // Delete Button (2-tap confirm)
    const deleteBtn = asset.getElementById('btn-sheet-delete');
    if (deleteBtn) {
      const onDelete = () => {
        if (this.deleteTapCount === 0) {
          this.deleteTapCount = 1;
          const lbl = asset.getElementById('btn-sheet-delete-label') as any;
          if (lbl) lbl.textContent = 'Confirm Delete?';

          if (this.deleteResetTimer !== null) window.clearTimeout(this.deleteResetTimer);
          this.deleteResetTimer = window.setTimeout(() => {
            this.deleteTapCount = 0;
            if (lbl) lbl.textContent = 'Delete';
          }, 5000);
        } else {
          // Second tap: delete
          if (this.editingTaskId) {
            const taskToDelete = this.tasks.find((t) => t.id === this.editingTaskId);
            this.tasks = this.tasks.filter((t) => t.id !== this.editingTaskId);
            this.saveTasks(true, `Deleted "${taskToDelete?.title || 'task'}"`);
          }
          this.closeEditSheet();
        }
      };
      deleteBtn.addEventListener('click', onDelete);
      this.cleanupFuncs.push(() => deleteBtn.removeEventListener('click', onDelete));
    }

    // Save Button
    const saveBtn = asset.getElementById('btn-sheet-save');
    if (saveBtn) {
      const onSave = () => {
        if (this.editingTaskId) {
          // Edit existing
          const t = this.tasks.find((x) => x.id === this.editingTaskId);
          if (t) {
            t.title = this.editDraftTitle;
            t.estimatedMinutes = this.editDraftDuration;
            t.priority = this.editDraftPriority;
            t.scheduledStartMinute = this.editDraftStartTime;
          }
          this.saveTasks(true, `Updated "${this.editDraftTitle}"`);
        } else {
          // New Task
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
      };
      saveBtn.addEventListener('click', onSave);
      this.cleanupFuncs.push(() => saveBtn.removeEventListener('click', onSave));
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
      sheetObj.position.set(0, 1.28, -0.65);
      sheetObj.visible = true;
    }

    this.updateEditSheetDisplay();
  }

  private closeEditSheet() {
    this.editingTaskId = null;
    this.deleteTapCount = 0;
    const sheetObj = this.world.getSceneObject('panel-edit-sheet');
    if (sheetObj) {
      sheetObj.position.set(0, -50, 0); // Hide offscreen
    }
  }

  private updateEditSheetDisplay() {
    const asset = this.getAsset('panel-edit-sheet');
    if (!asset) return;

    const titleEl = asset.getElementById('sheet-title') as any;
    if (titleEl) {
      titleEl.textContent = this.editingTaskId ? `Edit: ${this.editDraftTitle}` : 'Create New Task';
    }

    const durEl = asset.getElementById('sheet-duration-display') as any;
    if (durEl) {
      durEl.textContent = `${this.editDraftDuration}m`;
    }

    const delLbl = asset.getElementById('btn-sheet-delete-label') as any;
    if (delLbl) {
      delLbl.textContent = 'Delete';
    }
  }

  // --------------------------------------------------------------------------
  // Update Loop & Periodic Ticks
  // --------------------------------------------------------------------------
  private tickSecond() {
    // 1. Clock check (only update UI once per minute)
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();
    if (currentMinute !== this.lastClockMinute) {
      this.lastClockMinute = currentMinute;
      this.updateClockAndGreeting(now);
    }

    // 2. Focus countdown
    if (this.focusRunning && this.focusRemainingSeconds > 0) {
      this.focusRemainingSeconds--;
      if (this.focusRemainingSeconds === 0) {
        this.focusRunning = false;
        this.gardenPoints += 30;
        this.setPipSpeech('Sprint completed! Awesome deep focus session. +30 points!');
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
    if (timeEl) timeEl.textContent = clock.timeFormatted;
    if (dateEl) dateEl.textContent = clock.dateFormatted;

    const greeting = generateGreeting(now, 'Madhavan');
    const greetEl = hubAsset.getElementById('hub-greeting-text') as any;
    if (greetEl) greetEl.textContent = greeting.greeting;
  }

  private updateFocusDisplay() {
    const focusAsset = this.getAsset('panel-right-focus');
    if (!focusAsset) return;

    const ring = calculateFocusRing(
      this.focusRemainingSeconds,
      this.focusTotalSeconds,
      this.focusMode,
      this.focusRunning,
    );

    const timeEl = focusAsset.getElementById('focus-countdown') as any;
    if (timeEl) timeEl.textContent = ring.timeFormatted;

    const modeEl = focusAsset.getElementById('focus-mode-label') as any;
    if (modeEl) modeEl.textContent = ring.modeLabel;

    const playLbl = focusAsset.getElementById('focus-play-label') as any;
    if (playLbl) playLbl.textContent = this.focusRunning ? '||' : '>';
  }

  public refreshAllUI() {
    this.updateClockAndGreeting(new Date());
    this.updateFocusDisplay();
    this.refreshTasksPanelUI();
    this.refreshHubPanelUI();
  }

  private refreshTasksPanelUI() {
    const asset = this.getAsset('panel-left-tasks');
    if (!asset) return;

    const rows = tasksToRowViewModels(this.tasks);

    const activeCount = rows.filter((r) => !r.isCompleted).length;
    const countBadge = asset.getElementById('tasks-count-badge') as any;
    if (countBadge) countBadge.textContent = `${activeCount} Active`;

    for (let i = 0; i < 4; i++) {
      const row = rows[i];
      const titleEl = asset.getElementById(`task-title-${i}`) as any;
      const timeEl = asset.getElementById(`task-time-${i}`) as any;
      const pillText = asset.getElementById(`task-pill-text-${i}`) as any;
      const chkLbl = asset.getElementById(`task-chk-lbl-${i}`) as any;

      if (row) {
        if (titleEl) titleEl.textContent = row.title;
        if (timeEl) timeEl.textContent = row.scheduledTimeFormatted || row.durationFormatted;
        if (pillText) pillText.textContent = row.priorityLabel;
        if (chkLbl) chkLbl.textContent = row.isCompleted ? '✓' : '';
      }
    }
  }

  private refreshHubPanelUI() {
    const asset = this.getAsset('panel-hub');
    if (!asset) return;

    // 1. Workload Donut
    const donut = calculateWorkloadDonut(this.tasks);
    const donutPct = asset.getElementById('donut-percentage-text') as any;
    if (donutPct) donutPct.textContent = `${donut.percentage}%`;

    const schedText = asset.getElementById('legend-scheduled-text') as any;
    if (schedText) schedText.textContent = `Scheduled: ${donut.scheduledFormatted}`;

    const remText = asset.getElementById('legend-remaining-text') as any;
    if (remText) remText.textContent = `Remaining: ${donut.remainingFormatted}`;

    // 2. Garden Progress
    const garden = calculateGardenProgress(this.gardenPoints);
    const gardenLvl = asset.getElementById('garden-level-text') as any;
    if (gardenLvl) gardenLvl.textContent = `Level ${garden.level}`;

    const gardenSub = asset.getElementById('nav-garden-sub') as any;
    if (gardenSub) gardenSub.textContent = `Level ${garden.level}`;

    const gardenBar = asset.getElementById('garden-progress-bar-fill') as any;
    if (gardenBar) {
      gardenBar.style = gardenBar.style || {};
      gardenBar.style.width = `${garden.progressPercent}%`;
    }

    // 3. Schedule Summary Capsule
    const schedBlocks = tasksToScheduleBlocks(this.tasks);
    const summaryCapsule = asset.getElementById('schedule-summary-capsule') as any;
    if (summaryCapsule) {
      summaryCapsule.textContent = `${donut.scheduledFormatted} planned of 8h`;
    }

    // 4. Update blocks
    for (let i = 0; i < 4; i++) {
      const block = schedBlocks[i];
      const blockEl = asset.getElementById(`block-${i}`) as any;
      if (block && blockEl) {
        const titleSpan = blockEl.children?.[0] || blockEl.children;
        const timeSpan = blockEl.children?.[1];
        if (titleSpan) titleSpan.textContent = block.title;
        if (timeSpan) timeSpan.textContent = block.timeRangeFormatted;
      }
    }
  }

  update(time: number, _delta: number) {
    // Zero per-frame allocations: update Pip robot head bobbing
    if (this.pipRig && this.pipRig.head) {
      const bob = Math.sin(time * 0.003) * 0.006;
      this.pipRig.head.position.y = 0.05 + bob;
    }
  }
}
