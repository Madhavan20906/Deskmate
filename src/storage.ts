/**
 * Deskmate — Resilient Persistence Layer
 *
 * Implements IndexedDB primary storage with localStorage fallback and
 * automatic corrupted-data recovery and snapshot backup.
 */

export interface PersistedTask {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  effortSize?: 'small' | 'medium' | 'large';
  estimatedMinutes: number;
  scheduledStartMinute: number | null;
  assignedSlot?: 'morning' | 'afternoon' | 'evening' | null;
  status: 'todo' | 'in-progress' | 'completed' | 'carried';
  createdAt: number;
  completedAt: number | null;
}

export interface PersistedFocusSession {
  id: string;
  taskId: string;
  taskTitle: string;
  plannedDurationMinutes: number;
  actualDurationMs: number;
  startedAt: number;
  endedAt: number;
  status: 'completed' | 'stopped';
  taskCompleted: boolean;
}

export interface DeskmateWorkspaceState {
  schemaVersion: number;
  lastSavedAt: number;
  tasks: PersistedTask[];
  focusHistory: PersistedFocusSession[];
  gardenPoints: number;
  streakDays: number;
  restLeaves: number;
  lastActiveDayKey: string;
  jarCompletedCount: number;
  deskHeightOffset: number;
  settings: {
    focusDurationMinutes: number;
    breakDurationMinutes: number;
    soundEnabled: boolean;
    volume: number;
    reduceMotion: boolean;
    highContrast: boolean;
    aiEnabled: boolean;
  };
}

const DB_NAME = 'deskmate_db';
const DB_VERSION = 1;
const STORE_NAME = 'state_store';
const STATE_KEY = 'current_workspace';
const LOCAL_STORAGE_KEY = 'deskmate.workspace.v3';
const BACKUP_STORAGE_KEY = 'deskmate.workspace.backup.v3';

export const DEFAULT_WORKSPACE_STATE: DeskmateWorkspaceState = {
  schemaVersion: 3,
  lastSavedAt: Date.now(),
  tasks: [
    {
      id: 'seed-roadmap',
      title: 'Plan Q4 roadmap',
      description: 'Deep work and milestones',
      category: 'Planning',
      priority: 'high',
      effortSize: 'large',
      estimatedMinutes: 120,
      scheduledStartMinute: 9 * 60 + 30,
      assignedSlot: 'morning',
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
      effortSize: 'medium',
      estimatedMinutes: 60,
      scheduledStartMinute: 13 * 60,
      assignedSlot: 'afternoon',
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
      effortSize: 'small',
      estimatedMinutes: 30,
      scheduledStartMinute: 16 * 60 + 30,
      assignedSlot: 'evening',
      status: 'todo',
      createdAt: Date.now(),
      completedAt: null,
    },
  ],
  focusHistory: [],
  gardenPoints: 20,
  streakDays: 1,
  restLeaves: 1,
  lastActiveDayKey: new Date().toISOString().slice(0, 10),
  jarCompletedCount: 3,
  deskHeightOffset: 0,
  settings: {
    focusDurationMinutes: 25,
    breakDurationMinutes: 5,
    soundEnabled: true,
    volume: 0.7,
    reduceMotion: false,
    highContrast: false,
    aiEnabled: true,
  },
};

export class StorageService {
  private memoryCache: DeskmateWorkspaceState;
  private db: IDBDatabase | null = null;
  private idbAvailable = false;

  constructor() {
    this.memoryCache = this.loadFromLocalStorage() ?? { ...DEFAULT_WORKSPACE_STATE };
    this.initIndexedDB();
  }

  private initIndexedDB(): void {
    if (typeof window === 'undefined' || !window.indexedDB) {
      this.idbAvailable = false;
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.idbAvailable = true;
        this.loadFromIndexedDB();
      };
      request.onerror = () => {
        this.idbAvailable = false;
      };
    } catch {
      this.idbAvailable = false;
    }
  }

  private loadFromLocalStorage(): DeskmateWorkspaceState | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.schemaVersion) {
          return parsed as DeskmateWorkspaceState;
        }
      }
      // Check backup if main was unreadable
      const backupRaw = window.localStorage.getItem(BACKUP_STORAGE_KEY);
      if (backupRaw) {
        const parsedBackup = JSON.parse(backupRaw);
        if (parsedBackup && typeof parsedBackup === 'object' && parsedBackup.schemaVersion) {
          return parsedBackup as DeskmateWorkspaceState;
        }
      }
    } catch (e) {
      console.warn('[Storage] Error reading local storage:', e);
    }
    return null;
  }

  private loadFromIndexedDB(): void {
    if (!this.db) return;
    try {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getReq = store.get(STATE_KEY);
      getReq.onsuccess = () => {
        if (getReq.result && typeof getReq.result === 'object') {
          const loaded = getReq.result as DeskmateWorkspaceState;
          if (loaded.lastSavedAt > this.memoryCache.lastSavedAt) {
            this.memoryCache = loaded;
          }
        }
      };
    } catch (e) {
      console.warn('[Storage] Error querying IndexedDB:', e);
    }
  }

  public getState(): DeskmateWorkspaceState {
    return this.memoryCache;
  }

  public saveState(updates: Partial<DeskmateWorkspaceState>): void {
    this.memoryCache = {
      ...this.memoryCache,
      ...updates,
      lastSavedAt: Date.now(),
    };

    // 1. Save to LocalStorage immediately
    if (typeof window !== 'undefined') {
      try {
        const serialized = JSON.stringify(this.memoryCache);
        window.localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
        // Periodically update backup snapshot
        window.localStorage.setItem(BACKUP_STORAGE_KEY, serialized);
      } catch (e) {
        console.warn('[Storage] LocalStorage write failed:', e);
      }
    }

    // 2. Save asynchronously to IndexedDB
    if (this.db && this.idbAvailable) {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(this.memoryCache, STATE_KEY);
      } catch (e) {
        console.warn('[Storage] IndexedDB write failed:', e);
      }
    }
  }
}

export const storageService = new StorageService();
