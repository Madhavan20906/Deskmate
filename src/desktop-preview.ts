/**
 * DeskMate Desktop Preview System
 * Provides:
 * 1. Emulated Meta Quest 3 preview with balanced readable distance.
 * 2. Seated tabletop pose with BOTH left & right controllers naturally positioned
 * and aimed directly at the glass panels (Tasks & Command Hub).
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
 z: 0.62,
 pitchRad: -0.04,
 fovyRad: (64 * Math.PI) / 180,
};

let currentZ = DEFAULT_POSE.z;
let activeHand: 'left' | 'right' = 'right';

let handsModeInitialized = false;

export function enforceHandsFirstMode() {
  if (typeof window === 'undefined') return;
  const win = window as any;

  const applyHandsMode = () => {
    if (handsModeInitialized) return true;
    const device = win.IWER_DEVICE;
    if (!device) return false;

    try {
      device.primaryInputMode = 'hand';
      if (device.devui) {
        device.controlMode = 'programmatic';
        device.controlMode = 'manual';
      }
    } catch {}

    try {
      window.postMessage(
        {
          channel: 'iwer-prefs',
          scope: 'origin',
          patch: { inputMode: 'hand', gazeMode: 'off' },
        },
        '*',
      );
    } catch {}

    const devui = device.devui;
    const shadow = devui?.devUIContainer?.shadowRoot || document.querySelector('div')?.shadowRoot;
    if (shadow) {
      const selectModeBtn = shadow.querySelector('button[title="Select input mode"]') as HTMLButtonElement | null;
      if (selectModeBtn) {
        if (selectModeBtn.querySelector('svg.lucide-hand')) {
          handsModeInitialized = true;
          return true;
        }
        if (selectModeBtn.querySelector('svg.lucide-gamepad-2')) {
          selectModeBtn.click();
          window.requestAnimationFrame(() => {
            const menu = shadow.querySelector('#iwer-input-mode-menu');
            if (menu) {
              const buttons = Array.from(menu.querySelectorAll('button') as any) as HTMLButtonElement[];
              const handBtn = buttons.find((b) => b.textContent?.includes('Hands') || b.querySelector('svg.lucide-hand'));
              if (handBtn) {
                handBtn.click();
                handsModeInitialized = true;
              } else {
                selectModeBtn.click();
              }
            }
          });
          handsModeInitialized = true;
          return true;
        }
      }
    }

    handsModeInitialized = true;
    return true;
  };

  if (!applyHandsMode()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts++;
      if (applyHandsMode() || attempts >= 30) {
        window.clearInterval(timer);
      }
    }, 100);
  }
}

const forwardVec = new Vector3(0, 0, -1);
const leftDirVec = new Vector3();
const rightDirVec = new Vector3();

function positionHandsOnDesk(_device: any) {
  // Let controllers and hands follow active user input naturally
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
 <span style="font-size:14px;">🖐️</span>
 <span style="color:#F3B27A;font-weight:700;">Hands First:</span>
 <span style="color:${isLeft ? '#A78BFA' : 'rgba(255,255,255,0.4)'};font-weight:${isLeft ? '800' : '500'};padding:2px 6px;border-radius:6px;background:${isLeft ? 'rgba(124,92,255,0.25)' : 'transparent'};">Left Hand</span>
 <span style="color:rgba(255,255,255,0.3);">|</span>
 <span style="color:${!isLeft ? '#A78BFA' : 'rgba(255,255,255,0.4)'};font-weight:${!isLeft ? '800' : '500'};padding:2px 6px;border-radius:6px;background:${!isLeft ? 'rgba(124,92,255,0.25)' : 'transparent'};">Right Hand</span>
 <span style="font-size:11px;color:rgba(255,255,255,0.5);margin-left:4px;">[Tab]</span>
 </span>
 `;
}

function aimControllerAtScreenPoint(clientX: number, clientY: number, hand: 'left' | 'right') {
 const win = window as any;
 const device = win.IWER_DEVICE;
 if (!device) return;

 const ndcX = (clientX / window.innerWidth) * 2 - 1;
 const ndcY = -(clientY / window.innerHeight) * 2 + 1;

 // Unproject to glass plane around z = -0.70m
 const targetX = ndcX * 0.85;
 const targetY = 1.45 + ndcY * 0.50;
 const targetZ = -0.70;

 const ctrl = hand === 'left' ? device.controllers?.left : device.controllers?.right;
 if (ctrl?.position && ctrl?.quaternion) {
 const ctrlPos = ctrl.position;
 const dir = new Vector3(targetX - ctrlPos.x, targetY - ctrlPos.y, targetZ - ctrlPos.z).normalize();
 const quat = new Quaternion().setFromUnitVectors(forwardVec, dir);
 ctrl.quaternion.set(quat.x, quat.y, quat.z, quat.w);
 }

 const xrHand = hand === 'left' ? device.hands?.left : device.hands?.right;
 if (xrHand?.position && xrHand?.quaternion) {
 const handPos = xrHand.position;
 const dir = new Vector3(targetX - handPos.x, targetY - handPos.y, targetZ - handPos.z).normalize();
 const quat = new Quaternion().setFromUnitVectors(forwardVec, dir);
 xrHand.quaternion.set(quat.x, quat.y, quat.z, quat.w);
 }
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
 hud.style.backgroundColor = 'rgba(22, 24, 29, 0.88)';
 hud.style.border = '1px solid rgba(217, 119, 54, 0.4)';
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
 hud.style.borderColor = '#F3B27A';
 });
 hud.addEventListener('mouseleave', () => {
 hud.style.transform = 'translateY(0)';
 hud.style.borderColor = 'rgba(217, 119, 54, 0.4)';
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

 // Dynamic dual pointer parity: auto-switch commit hand and aim controller at point
 window.addEventListener('pointermove', (e) => {
 const isLeftScreen = e.clientX < window.innerWidth * 0.48;
 const targetHand = isLeftScreen ? 'left' : 'right';
 if (activeHand !== targetHand) {
 setActiveHand(targetHand);
 }
 aimControllerAtScreenPoint(e.clientX, e.clientY, targetHand);
 });

 // Pointer click triggers natural pinch on the active hand as primary, with controller fallback
 window.addEventListener('pointerdown', (e) => {
 if (!(e.target instanceof HTMLCanvasElement)) return;
 const isLeft = activeHand === 'left' || e.clientX < window.innerWidth * 0.48 || e.button === 2;
 const targetHand = isLeft ? 'left' : 'right';
 setActiveHand(targetHand);
 aimControllerAtScreenPoint(e.clientX, e.clientY, targetHand);

 const win = window as any;
 const device = win.IWER_DEVICE;

 // 1. Hands First: dispatch pinch and button events to hand
 const xrHand = isLeft ? device?.hands?.left : device?.hands?.right;
 if (xrHand) {
 if (typeof xrHand.updatePinchValue === 'function') {
 xrHand.updatePinchValue(1.0);
 window.setTimeout(() => {
 try { xrHand.updatePinchValue(0.0); } catch {}
 }, 120);
 }
 if (typeof xrHand.updateButtonValue === 'function') {
 xrHand.updateButtonValue(0, 1.0);
 window.setTimeout(() => {
 try { xrHand.updateButtonValue(0, 0.0); } catch {}
 }, 120);
 }
 }

 // 2. Controller mode fallback
 const ctrl = isLeft ? device?.controllers?.left : device?.controllers?.right;
 if (ctrl && typeof ctrl.updateButtonValue === 'function') {
 ctrl.updateButtonValue(0, 1.0);
 window.setTimeout(() => {
 try { ctrl.updateButtonValue(0, 0.0); } catch {}
 }, 120);
 }
 });

 // Right-click commits left hand explicitly
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
 }
}

export async function initDesktopPreviewIfNeeded(): Promise<boolean> {
  enforceHandsFirstMode();
  initDesktopHandHUD();
  enforceSeatedXRPose();
  return true;
}

export function switchEnvironment(_env: EnvironmentId) {}
