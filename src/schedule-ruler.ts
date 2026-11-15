/**
 * DeskMate: The Desk Ruler Pure Logic Module
 *
 * Implements pure deterministic mathematical models and rules for:
 * 1. Time <-> Ruler 3D spatial mapping (08:00 to 18:00)
 * 2. 15-minute magnetic snapping & duration calculations
 * 3. Tile visual dimensions & 4.5cm minimum width indicators
 * 4. Free time gap calculations
 * 5. Overlap resolution (Return, Swap, Move later)
 * 6. Workday & 8-hour capacity overflow partitioning
 * 7. Summary capsule status formatting
 * 8. Real-time Sun orb "Now" marker positioning
 * 9. Ergonomic seated reach validation (<= 0.65m radius)
 */

export const WORKDAY_START_MINUTE = 8 * 60; // 08:00 = 480
export const WORKDAY_END_MINUTE = 18 * 60;  // 18:00 = 1080
export const WORKDAY_TOTAL_MINUTES = WORKDAY_END_MINUTE - WORKDAY_START_MINUTE; // 600 min (10 hours)
export const MAX_CAPACITY_MINUTES = 8 * 60; // 480 min (8 hours)

// Ruler scale: 0.060m (6.0cm) per hour -> 10 hours = 0.60m total width.
// At table front (y=0.74, z=-0.48), ruler endpoints at x=±0.30m are at Euclidean distance
// exactly 0.645m from the seated torso (y=1.05, z=0), strictly proving and meeting
// the R8 <= 0.65m seated reach requirement without leaning!
export const DEFAULT_SCALE_PER_HOUR = 0.060; // meters per hour
export const MIN_TILE_WIDTH_METERS = 0.045;   // 4.5 cm minimum width for grip ergonomics

export interface RulerZoneSlice {
  name: 'morning' | 'midday' | 'evening';
  label: string;
  startMinute: number;
  endMinute: number;
  startX: number;
  endX: number;
  width: number;
  colorHex: string;
}

export interface FreeSlot {
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  startX: number;
  width: number;
}

export interface ScheduledTileInput {
  id: string;
  title?: string;
  priority?: 'low' | 'medium' | 'high';
  estimatedMinutes: number;
  scheduledStartMinute: number | null;
  status: string;
}

export interface SchedulePartitionResult<T extends ScheduledTileInput> {
  rulerTasks: T[];
  trayTasks: T[];
  overflowTasks: T[];
  totalScheduledMinutes: number;
  exceedsCapacity: boolean;
  hasWorkdayOverflow: boolean;
}

export interface OverlapResolution {
  hasConflict: boolean;
  conflictingTaskId: string | null;
  canSwap: boolean;
  swapStartMinute: number | null;
  canPushLater: boolean;
  pushLaterStartMinute: number | null;
}

/**
 * Returns total width of the ruler in meters.
 */
export function getRulerTotalWidth(scalePerHour: number = DEFAULT_SCALE_PER_HOUR): number {
  return (WORKDAY_TOTAL_MINUTES / 60) * scalePerHour;
}

/**
 * Returns the starting X coordinate (left edge) of the ruler when centered at centerX.
 */
export function getRulerStartX(centerX = 0, scalePerHour: number = DEFAULT_SCALE_PER_HOUR): number {
  return centerX - getRulerTotalWidth(scalePerHour) / 2;
}

/**
 * Converts a minute of day (e.g. 480 for 08:00) to ruler local X coordinate.
 */
export function minuteToRulerX(
  minute: number,
  centerX = 0,
  scalePerHour: number = DEFAULT_SCALE_PER_HOUR,
): number {
  const startX = getRulerStartX(centerX, scalePerHour);
  const offsetHours = (minute - WORKDAY_START_MINUTE) / 60;
  return startX + offsetHours * scalePerHour;
}

/**
 * Converts a ruler local X coordinate back to minute of day (unrounded float).
 */
export function rulerXToMinute(
  x: number,
  centerX = 0,
  scalePerHour: number = DEFAULT_SCALE_PER_HOUR,
): number {
  const startX = getRulerStartX(centerX, scalePerHour);
  const offsetHours = (x - startX) / scalePerHour;
  return WORKDAY_START_MINUTE + offsetHours * 60;
}

/**
 * Snaps a minute of day to 15-minute intervals, clamped between 08:00 and 18:00.
 */
export function snapTo15Minutes(minute: number): number {
  const rounded = Math.round(minute / 15) * 15;
  return Math.max(WORKDAY_START_MINUTE, Math.min(WORKDAY_END_MINUTE, rounded));
}

/**
 * Computes visual tile width in meters given task duration in minutes.
 * If true width is less than 4.5cm, returns 4.5cm minimum width.
 */
export function getTileVisualWidth(
  durationMinutes: number,
  scalePerHour: number = DEFAULT_SCALE_PER_HOUR,
  minWidth = MIN_TILE_WIDTH_METERS,
): { visualWidth: number; trueWidth: number; isMinWidthPadded: boolean } {
  const safeDuration = Math.max(0, durationMinutes);
  const trueWidth = (safeDuration / 60) * scalePerHour;
  const isMinWidthPadded = trueWidth < minWidth;
  const visualWidth = Math.max(minWidth, trueWidth);
  return { visualWidth, trueWidth, isMinWidthPadded };
}

/**
 * Clamps tile resizing in 15-minute increments within workday and neighbor bounds.
 */
export function clampResizeEndMinute(
  startMinute: number,
  rawEndMinute: number,
  minDuration = 15,
  maxDuration = 480,
  nextNeighborStartMinute?: number | null,
): number {
  let snappedEnd = snapTo15Minutes(rawEndMinute);
  const minEnd = startMinute + minDuration;
  const maxEnd = startMinute + maxDuration;

  snappedEnd = Math.max(minEnd, Math.min(maxEnd, snappedEnd));
  snappedEnd = Math.min(WORKDAY_END_MINUTE, snappedEnd);

  if (typeof nextNeighborStartMinute === 'number' && nextNeighborStartMinute > startMinute) {
    snappedEnd = Math.min(nextNeighborStartMinute, snappedEnd);
  }

  return snappedEnd;
}

/**
 * Resolves overlap when dropping or moving a task onto the ruler.
 */
export function checkOverlapAndResolve(
  movingTaskId: string,
  proposedStart: number,
  duration: number,
  currentSchedule: Array<{ id: string; startMinute: number; duration: number }>,
  workdayEnd: number = WORKDAY_END_MINUTE,
): OverlapResolution {
  const proposedEnd = proposedStart + duration;
  const otherTasks = currentSchedule.filter((t) => t.id !== movingTaskId);

  // Find direct collision
  const collision = otherTasks.find(
    (t) => proposedStart < t.startMinute + t.duration && proposedEnd > t.startMinute,
  );

  if (!collision) {
    return {
      hasConflict: false,
      conflictingTaskId: null,
      canSwap: false,
      swapStartMinute: null,
      canPushLater: false,
      pushLaterStartMinute: null,
    };
  }

  // Calculate swap possibility: moving task takes collision.startMinute, collision takes proposedStart
  const canSwap = true;
  const swapStartMinute = collision.startMinute;

  // Calculate push later possibility: move proposed task immediately after colliding task
  const pushLaterStart = collision.startMinute + collision.duration;
  const canPushLater = pushLaterStart + duration <= workdayEnd;

  return {
    hasConflict: true,
    conflictingTaskId: collision.id,
    canSwap,
    swapStartMinute,
    canPushLater,
    pushLaterStartMinute: canPushLater ? pushLaterStart : null,
  };
}

/**
 * Computes all unassigned gaps (free time) on the ruler.
 */
export function computeFreeSlots(
  scheduledTasks: Array<{ startMinute: number; duration: number }>,
  centerX = 0,
  scalePerHour: number = DEFAULT_SCALE_PER_HOUR,
  workdayStart: number = WORKDAY_START_MINUTE,
  workdayEnd: number = WORKDAY_END_MINUTE,
): FreeSlot[] {
  const sorted = [...scheduledTasks]
    .filter((t) => t.startMinute >= workdayStart && t.startMinute < workdayEnd)
    .sort((a, b) => a.startMinute - b.startMinute);

  const slots: FreeSlot[] = [];
  let cursor = workdayStart;

  for (const t of sorted) {
    if (t.startMinute > cursor) {
      const durationMinutes = t.startMinute - cursor;
      const startX = minuteToRulerX(cursor, centerX, scalePerHour);
      const width = (durationMinutes / 60) * scalePerHour;
      slots.push({
        startMinute: cursor,
        endMinute: t.startMinute,
        durationMinutes,
        startX,
        width,
      });
    }
    cursor = Math.max(cursor, t.startMinute + t.duration);
  }

  if (cursor < workdayEnd) {
    const durationMinutes = workdayEnd - cursor;
    const startX = minuteToRulerX(cursor, centerX, scalePerHour);
    const width = (durationMinutes / 60) * scalePerHour;
    slots.push({
      startMinute: cursor,
      endMinute: workdayEnd,
      durationMinutes,
      startX,
      width,
    });
  }

  return slots;
}

/**
 * Partitions tasks into:
 * 1. rulerTasks: Scheduled tasks that fit in 08:00 - 18:00 and within 8h capacity
 * 2. trayTasks: Unscheduled tasks
 * 3. overflowTasks: Scheduled tasks that exceed 8h capacity or run past 18:00
 */
export function partitionSchedule<T extends ScheduledTileInput>(
  tasks: T[],
  capacityMinutes: number = MAX_CAPACITY_MINUTES,
  workdayStart: number = WORKDAY_START_MINUTE,
  workdayEnd: number = WORKDAY_END_MINUTE,
): SchedulePartitionResult<T> {
  const trayTasks: T[] = [];
  const scheduled: T[] = [];

  for (const task of tasks) {
    if (
      task.scheduledStartMinute === null ||
      task.scheduledStartMinute < 0 ||
      typeof task.scheduledStartMinute !== 'number'
    ) {
      trayTasks.push(task);
    } else {
      scheduled.push(task);
    }
  }

  // Sort scheduled tasks by start minute
  scheduled.sort(
    (a, b) => (a.scheduledStartMinute as number) - (b.scheduledStartMinute as number),
  );

  const rulerTasks: T[] = [];
  const overflowTasks: T[] = [];
  let cumulativeMinutes = 0;
  let hasWorkdayOverflow = false;

  for (const task of scheduled) {
    const start = task.scheduledStartMinute as number;
    const end = start + task.estimatedMinutes;

    const runsPastWorkday = start < workdayStart || end > workdayEnd;
    const pushesPastCapacity = cumulativeMinutes + task.estimatedMinutes > capacityMinutes;

    if (runsPastWorkday || pushesPastCapacity) {
      overflowTasks.push(task);
      if (runsPastWorkday) {
        hasWorkdayOverflow = true;
      }
    } else {
      rulerTasks.push(task);
      cumulativeMinutes += task.estimatedMinutes;
    }
  }

  return {
    rulerTasks,
    trayTasks,
    overflowTasks,
    totalScheduledMinutes: cumulativeMinutes,
    exceedsCapacity: overflowTasks.length > 0 || cumulativeMinutes >= capacityMinutes,
    hasWorkdayOverflow,
  };
}

/**
 * Returns formatted summary capsule text.
 * E.g. "4h planned of 8h, 0 conflicts" or "4.5h planned of 8h, 1 conflict"
 */
export function formatSummaryCapsule(
  scheduledMinutes: number,
  capacityMinutes: number = MAX_CAPACITY_MINUTES,
  conflictCount = 0,
): string {
  const plannedHours = (scheduledMinutes / 60).toFixed(1).replace(/\.0$/, '');
  const capHours = (capacityMinutes / 60).toFixed(0);
  const conflictText = conflictCount === 1 ? '1 conflict' : `${conflictCount} conflicts`;
  return `${plannedHours}h planned of ${capHours}h, ${conflictText}`;
}

/**
 * Calculates real-time position of the glowing Sun Now marker.
 */
export function getNowMarkerPosition(
  currentMinute: number,
  centerX = 0,
  scalePerHour: number = DEFAULT_SCALE_PER_HOUR,
  workdayStart = WORKDAY_START_MINUTE,
  workdayEnd = WORKDAY_END_MINUTE,
): { x: number; isWithinWorkday: boolean; isPastWorkday: boolean; clampedX: number } {
  const isWithinWorkday = currentMinute >= workdayStart && currentMinute <= workdayEnd;
  const isPastWorkday = currentMinute > workdayEnd;
  const clampedMinute = Math.max(workdayStart, Math.min(workdayEnd, currentMinute));
  const x = minuteToRulerX(currentMinute, centerX, scalePerHour);
  const clampedX = minuteToRulerX(clampedMinute, centerX, scalePerHour);

  return { x, isWithinWorkday, isPastWorkday, clampedX };
}

/**
 * Generates the 3 morning, midday, and evening color wash slices on the ruler.
 */
export function getZoneSlices(
  centerX = 0,
  scalePerHour: number = DEFAULT_SCALE_PER_HOUR,
): RulerZoneSlice[] {
  const zones: Array<{ name: 'morning' | 'midday' | 'evening'; label: string; start: number; end: number; colorHex: string }> = [
    { name: 'morning', label: 'Morning (08:00 - 11:30)', start: 8 * 60, end: 11 * 60 + 30, colorHex: '#1e3847' },
    { name: 'midday', label: 'Midday (11:30 - 14:30)', start: 11 * 60 + 30, end: 14 * 60 + 30, colorHex: '#183a3f' },
    { name: 'evening', label: 'Evening (14:30 - 18:00)', start: 14 * 60 + 30, end: 18 * 60, colorHex: '#272545' },
  ];

  return zones.map((z) => {
    const startX = minuteToRulerX(z.start, centerX, scalePerHour);
    const endX = minuteToRulerX(z.end, centerX, scalePerHour);
    return {
      name: z.name,
      label: z.label,
      startMinute: z.start,
      endMinute: z.end,
      startX,
      endX,
      width: endX - startX,
      colorHex: z.colorHex,
    };
  });
}

/**
 * Validates seated reach: verifies distance from user seated torso to target 3D point.
 */
export function isWithinSeatedReach(
  point: { x: number; y: number; z: number },
  torso: { x: number; y: number; z: number } = { x: 0, y: 1.05, z: 0 },
  maxReachMeters = 0.65,
): { distance: number; isReachable: boolean } {
  const dx = point.x - torso.x;
  const dy = point.y - torso.y;
  const dz = point.z - torso.z;
  const distance = Math.hypot(dx, dy, dz);
  return { distance, isReachable: distance <= maxReachMeters };
}
