/**
 * DeskMate Desktop Preview System
 * Provides:
 * 1. Emulated Meta Quest 3 preview with balanced readable distance.
 * 2. Seated tabletop pose with BOTH left & right controllers naturally positioned
 *    and aimed directly at the glass panels (Tasks & Command Hub).
 * 3. Equal dual-pointer active parity with seamless Tab key / on-screen toggle between Left & Right controllers.
 * 4. Dedicated "Wear Headset / Enter XR" trigger for judges using a physical Meta Quest.
 */

import { Vector3, Quaternion } from '@iwsdk/core';

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
// Desk is at [0, 0, -0.75], tabletop at y = 0.74, cards at y = 1.00, dashboard at y = 1.48.
// Camera at z = 0.85, y = 1.45 frames the Dashboard and Task Cards comfortably at chest-to-eye height.
const DEFAULT_POSE = {
  x: 0,
  y: 1.45,
  z: 0.85,
  pitchRad: -0.06,
  fovyRad: (64 * Math.PI) / 180,
};

let currentZ = DEFAULT_POSE.z;
let activeHand: 'left' | 'right' = 'right';

const forwardVec = new Vector3(0, 0, -1);
const leftDirVec = new Vector3();
const rightDirVec = new Vector3();

function positionHandsOnDesk(device: any) {
  if (!device) return;

  // Panel targets in world space
  // panel-left-tasks: [-0.58, 1.48, -0.68]
  // panel-hub: [0, 1.48, -0.72]
  const leftPos = new Vector3(-0.25, 1.25, -0.36);
  const leftTarget = new Vector3(-0.58, 1.48, -0.68);
  leftDirVec.subVectors(leftTarget, leftPos).normalize();
  const leftQuat = new Quaternion().setFromUnitVectors(forwardVec, leftDirVec);

  const rightPos = new Vector3(0.25, 1.25, -0.36);
  const rightTarget = new Vector3(0.0, 1.48, -0.72);
  rightDirVec.subVectors(rightTarget, rightPos).normalize();
  const rightQuat = new Quaternion().setFromUnitVectors(forwardVec, rightDirVec);

  // Position controllers if available
  const leftCtrl = device.controllers?.left;
  const rightCtrl = device.controllers?.right;

  if (leftCtrl?.position && leftCtrl?.quaternion) {
    leftCtrl.position.set(leftPos.x, leftPos.y, leftPos.z);
    leftCtrl.quaternion.set(leftQuat.x, leftQuat.y, leftQuat.z, leftQuat.w);
  }

  if (rightCtrl?.position && rightCtrl?.quaternion) {
    rightCtrl.position.set(rightPos.x, rightPos.y, rightPos.z);
    rightCtrl.quaternion.set(rightQuat.x, rightQuat.y, rightQuat.z, rightQuat.w);
  }

  // Also position hands if device uses hand mode
  const leftHand = device.hands?.left;
  const rightHand = device.hands?.right;

  if (leftHand?.position && leftHand?.quaternion) {
    leftHand.position.set(leftPos.x, leftPos.y, leftPos.z);
    leftHand.quaternion.set(leftQuat.x, leftQuat.y, leftQuat.z, leftQuat.w);
  }

  if (rightHand?.position && rightHand?.quaternion) {
    rightHand.position.set(rightPos.x, rightPos.y, rightPos.z);
    rightHand.quaternion.set(rightQuat.x, rightQuat.y, rightQuat.z, rightQuat.w);
  }
}

export function setActiveHand(hand: 'left' | 'right') {
  activeHand = hand;
  if (typeof window !== 'undefined') {
    window.postMessage(
      {
        channel: 'iwer-prefs',
        scope: 'origin',
        patch: { gazeCommitHand: hand },
      },
      '*',
    );
    const win = window as any;
    if (win.IWER_DEVICE?.devui?.setGazeCommitHand) {
      win.IWER_DEVICE.devui.setGazeCommitHand(hand);
    }
  }
  updateHandHUD();
}

export function toggleActiveHand(): 'left' | 'right' {
  const next = activeHand === 'right' ? 'left' : 'right';
  setActiveHand(next);
  return next;
}

export function getActiveHand(): 'left' | 'right' {
  return activeHand;
}

function updateHandHUD() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('desktop-hand-switcher');
  if (!btn) return;

  const isLeft = activeHand === 'left';
  btn.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px;">
      <span style="font-size:14px;">🎮</span>
      <span style="color:rgba(255,255,255,0.7);">Active Pointer:</span>
      <span style="color:${isLeft ? '#A78BFA' : 'rgba(255,255,255,0.4)'};font-weight:${isLeft ? '800' : '500'};padding:2px 6px;border-radius:6px;background:${isLeft ? 'rgba(124,92,255,0.25)' : 'transparent'};">Left</span>
      <span style="color:rgba(255,255,255,0.3);">|</span>
      <span style="color:${!isLeft ? '#A78BFA' : 'rgba(255,255,255,0.4)'};font-weight:${!isLeft ? '800' : '500'};padding:2px 6px;border-radius:6px;background:${!isLeft ? 'rgba(124,92,255,0.25)' : 'transparent'};">Right</span>
      <span style="font-size:11px;color:rgba(255,255,255,0.5);margin-left:4px;">[Tab]</span>
    </span>
  `;
}

let hudInitialized = false;
export function initDesktopHandHUD() {
  if (hudInitialized || typeof document === 'undefined' || isQuestOrNativeXR()) return;
  hudInitialized = true;

  const hud = document.createElement('div');
  hud.id = 'desktop-hand-switcher';
  hud.style.position = 'fixed';
  hud.style.bottom = '20px';
  hud.style.left = '20px';
  hud.style.zIndex = '9999';
  hud.style.padding = '8px 14px';
  hud.style.borderRadius = '999px';
  hud.style.backgroundColor = 'rgba(11, 16, 32, 0.88)';
  hud.style.border = '1px solid rgba(124, 92, 255, 0.4)';
  hud.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
  hud.style.backdropFilter = 'blur(12px)';
  (hud.style as any).webkitBackdropFilter = 'blur(12px)';
  hud.style.cursor = 'pointer';
  hud.style.userSelect = 'none';
  hud.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  hud.style.fontSize = '12px';
  hud.style.transition = 'transform 0.15s ease, border-color 0.15s ease';

  hud.addEventListener('mouseenter', () => {
    hud.style.transform = 'translateY(-2px)';
    hud.style.borderColor = '#A78BFA';
  });
  hud.addEventListener('mouseleave', () => {
    hud.style.transform = 'translateY(0)';
    hud.style.borderColor = 'rgba(124, 92, 255, 0.4)';
  });
  hud.addEventListener('click', () => {
    toggleActiveHand();
  });

  document.body.appendChild(hud);
  updateHandHUD();

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Tab' || e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      toggleActiveHand();
    } else if (e.key === '1') {
      setActiveHand('left');
    } else if (e.key === '2') {
      setActiveHand('right');
    }
  });

  // Dynamic dual pointer parity: auto-switch commit hand when pointing to left vs right workspace sides
  window.addEventListener('pointermove', (e) => {
    const isLeftScreen = e.clientX < window.innerWidth * 0.46;
    const targetHand = isLeftScreen ? 'left' : 'right';
    if (activeHand !== targetHand) {
      setActiveHand(targetHand);
    }
  });

  // Right-click commits left hand explicitly, left-click commits active hand
  window.addEventListener('contextmenu', (e) => {
    if (e.target instanceof HTMLCanvasElement) {
      setActiveHand('left');
    }
  });
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
    positionHandsOnDesk(device);
  }
}

export async function initDesktopPreviewIfNeeded(): Promise<boolean> {
  initDesktopHandHUD();
  enforceSeatedXRPose();
  return true;
}

export function switchEnvironment(_env: EnvironmentId) {}
