/**
 * DeskMate Desktop Preview System
 * Provides:
 * 1. Emulated Meta Quest 3 preview with balanced readable distance (neither too close nor too far).
 * 2. Unified environment selector (Living Room, Bedroom, Kitchen, Office) matching IWSDK XR emulator.
 * 3. Quick Zoom in / Zoom out / Reset controls.
 * 4. Dedicated "Wear Headset / Enter XR" trigger for judges using a physical Meta Quest.
 */

export function isQuestOrNativeXR(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /OculusBrowser/i.test(navigator.userAgent);
}

export type EnvironmentId =
  | 'sunlit_living_room'
  | 'bedroom'
  | 'kitchen'
  | 'home_office';

// Default comfortable readable seated viewing pose:
// Desk is at [0, 0, -0.75], tabletop at y = 0.74, cards at y = 1.00, dashboard at y = 1.28.
// Camera at z = 0.85, y = 1.25 with -7° pitch frames the Dashboard, Task Cards, and entire desk comfortably.
const DEFAULT_POSE = {
  x: 0,
  y: 1.25,
  z: 0.85,
  pitchRad: -0.12,
  fovyRad: (64 * Math.PI) / 180,
};

let currentZ = DEFAULT_POSE.z;
let currentYaw = 0;
let currentPitch = DEFAULT_POSE.pitchRad;
let currentEnv: EnvironmentId = 'sunlit_living_room';
let handsEnabled = true;

function positionHandsOnDesk(_device: any) {
  // Let the user and IWER emulator control hands/controllers freely
}

export async function initDesktopPreviewIfNeeded(): Promise<boolean> {
  // Return false to use standard projectOptions and default IWER emulator without hijacking
  return false;
}

function applyCameraPose(device: any, z: number) {
  device.fovy = DEFAULT_POSE.fovyRad;
  const deltaZ = z - DEFAULT_POSE.z;
  const targetY = DEFAULT_POSE.y + deltaZ * 0.08;
  const pitchRad = DEFAULT_POSE.pitchRad - deltaZ * 0.03;

  device.position.set(0, targetY, z);
  device.quaternion.set(Math.sin(pitchRad / 2), 0, 0, Math.cos(pitchRad / 2));
}

export function enforceSeatedXRPose() {
  const win = window as any;
  const device = win.IWER_DEVICE;
  if (device) {
    applyCameraPose(device, currentZ);
  }
}

export function switchEnvironment(_env: EnvironmentId) {}
