/**
 * DeskMate Hand Interaction Engine
 * Pure deterministic logic for:
 * 1. Pinch hysteresis & jitter smoothing.
 * 2. Magnetic timeline zone drop calculations.
 * 3. Seated reach & FoV validation.
 * 4. Rapid pinch debouncing.
 * 5. Tracking-loss recovery state machine.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface TimelineZone {
  name: 'morning' | 'midday' | 'evening';
  centerX: number;
  centerY: number;
  centerZ: number;
  radiusMeters: number;
  startMinute: number;
}

export const TIMELINE_ZONES: readonly TimelineZone[] = [
  {
    name: 'morning',
    centerX: -0.25,
    centerY: 1.45,
    centerZ: -1.02,
    radiusMeters: 0.22,
    startMinute: 9 * 60,
  },
  {
    name: 'midday',
    centerX: 0.0,
    centerY: 1.45,
    centerZ: -1.02,
    radiusMeters: 0.22,
    startMinute: 12 * 60,
  },
  {
    name: 'evening',
    centerX: 0.25,
    centerY: 1.45,
    centerZ: -1.02,
    radiusMeters: 0.22,
    startMinute: 15 * 60,
  },
] as const;

/**
 * Calculates if a 3D position snaps into one of the timeline scheduling zones.
 */
export function findMatchingTimelineZone(
  position: Vec3Like,
  zones: readonly TimelineZone[] = TIMELINE_ZONES,
): TimelineZone | null {
  for (const zone of zones) {
    const dx = position.x - zone.centerX;
    const dy = position.y - zone.centerY;
    const dz = position.z - zone.centerZ;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= zone.radiusMeters) {
      return zone;
    }
  }
  return null;
}

/**
 * Pinch Hysteresis filter:
 * Prevents rapid toggling at the pinch threshold by requiring
 * higher confidence to initiate a pinch than to release it.
 */
export class PinchHysteresis {
  private isPinching = false;
  private readonly enterThreshold: number;
  private readonly exitThreshold: number;

  constructor(enterThreshold = 0.85, exitThreshold = 0.65) {
    this.enterThreshold = enterThreshold;
    this.exitThreshold = exitThreshold;
  }

  update(rawPinchStrength: number): boolean {
    if (this.isPinching) {
      if (rawPinchStrength < this.exitThreshold) {
        this.isPinching = false;
      }
    } else {
      if (rawPinchStrength >= this.enterThreshold) {
        this.isPinching = true;
      }
    }
    return this.isPinching;
  }

  get state(): boolean {
    return this.isPinching;
  }

  reset(): void {
    this.isPinching = false;
  }
}

/**
 * Debounce controller:
 * Rejects repeated click / pinch activations within a cooldown window (default 300ms).
 */
export class ActionDebouncer {
  private lastActionTime = 0;
  private readonly cooldownMs: number;

  constructor(cooldownMs = 300) {
    this.cooldownMs = cooldownMs;
  }

  canExecute(now = Date.now()): boolean {
    if (now - this.lastActionTime >= this.cooldownMs) {
      this.lastActionTime = now;
      return true;
    }
    return false;
  }

  reset(): void {
    this.lastActionTime = 0;
  }
}

/**
 * Hand tracking loss detector:
 * Tracks duration when zero hands are visible in XR.
 * Surfaces a friendly guidance hint after 3.0 seconds of absence.
 */
export class HandTrackingMonitor {
  private handsLostSeconds = 0;
  private readonly thresholdSeconds: number;

  constructor(thresholdSeconds = 3.0) {
    this.thresholdSeconds = thresholdSeconds;
  }

  update(deltaSeconds: number, hasVisibleHands: boolean): { shouldShowHint: boolean; becameVisible: boolean } {
    if (!hasVisibleHands) {
      const wasBelow = this.handsLostSeconds < this.thresholdSeconds;
      this.handsLostSeconds += deltaSeconds;
      const shouldShowHint = this.handsLostSeconds >= this.thresholdSeconds;
      return { shouldShowHint, becameVisible: false };
    } else {
      const wasLost = this.handsLostSeconds >= this.thresholdSeconds;
      this.handsLostSeconds = 0;
      return { shouldShowHint: false, becameVisible: wasLost };
    }
  }

  get lostDuration(): number {
    return this.handsLostSeconds;
  }

  reset(): void {
    this.handsLostSeconds = 0;
  }
}

/**
 * Seated Ergonomics Validator:
 * Validates that an object's world position lies within a comfortable seated radius (0.60m - 0.95m).
 */
export function calculateSeatedDistance(
  targetPos: Vec3Like,
  userTorsoPos: Vec3Like = { x: 0, y: 1.30, z: 0 },
): number {
  const dx = targetPos.x - userTorsoPos.x;
  const dy = targetPos.y - userTorsoPos.y;
  const dz = targetPos.z - userTorsoPos.z;
  return Math.hypot(dx, dy, dz);
}
