/**
 * DeskMate Desktop Preview & 360 Look-Around System
 * Provides:
 * 1. Emulated Meta Quest 3 preview with balanced readable distance.
 * 2. Full 360-degree interactive camera look-around (drag mouse or touch to look 360° all around the room).
 * 3. Unified room environment switcher (Living Room, Bedroom, Kitchen, Office).
 * 4. Quick 360 rotation (Left / Front / Right) and Zoom controls.
 */

import { Quaternion, Vector3 } from '@iwsdk/core';

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
// Desk is at [0, 0, -0.70], tabletop at y = 0.745, cards at y = 0.94, dashboard at z = -0.78.
const DEFAULT_POSE = {
  x: 0,
  y: 1.18,
  z: 0.32,
  pitchRad: -0.21,
  fovyRad: (54 * Math.PI) / 180,
};

let currentZ = DEFAULT_POSE.z;
let currentEnv: EnvironmentId = 'sunlit_living_room';
let handsEnabled = true;

let currentYaw = 0; // 360° horizontal rotation angle
let currentPitch = DEFAULT_POSE.pitchRad; // Vertical tilt angle

const qPitch = new Quaternion();
const qYaw = new Quaternion();
const vAxisX = new Vector3(1, 0, 0);
const vAxisY = new Vector3(0, 1, 0);

function positionHandsOnDesk(device: any) {
  if (!device.hands) return;
  if (!handsEnabled) {
    if (device.hands.left) device.hands.left.connected = false;
    if (device.hands.right) device.hands.right.connected = false;
    return;
  }
  // Position hands resting naturally on tabletop surface near the Desk Ruler
  if (device.hands.left?.position) {
    device.hands.left.connected = true;
    device.hands.left.position.set(-0.24, 0.745, -0.38);
  }
  if (device.hands.right?.position) {
    device.hands.right.connected = true;
    device.hands.right.position.set(0.24, 0.745, -0.38);
  }
}

export async function initDesktopPreviewIfNeeded(): Promise<boolean> {
  // Never run emulator if visitor is already in Meta Quest Browser
  if (isQuestOrNativeXR()) {
    return false;
  }

  try {
    const win = window as any;
    if (!win.IWER_DEVICE) {
      // Dynamic import of the IWSDK Dev / IWER runtime
      const { startIwsdkDevRuntime } = await (
        // @ts-expect-error Dev runtime import
        import('../node_modules/@iwsdk/vite-plugin-dev/dist/injection/runtime.js')
      );

      win.__IWER_MCP_MANAGED = true;
      try {
        startIwsdkDevRuntime({
          device: 'metaQuest3',
          activation: 'always',
          verbose: false,
          sem: { defaultScene: 'sunlit_living_room' },
          ai: { devUI: false },
          workspace: null,
          userAgentException: '/OculusBrowser/',
          iwer: true,
          nativeXRControl: false,
        });
      } finally {
        delete win.__IWER_MCP_MANAGED;
      }
    }

    const device = win.IWER_DEVICE;
    if (device) {
      device.primaryInputMode = 'hand';
      device.stereoEnabled = false;
      positionHandsOnDesk(device);
      applyCameraPose(device, currentZ);

      // Interactive hand tap response: when clicking, right hand pinches toward the tabletop
      if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', () => {
          if (device.hands?.right?.position) {
            device.hands.right.position.set(0.12, 0.73, -0.44);
            setTimeout(() => {
              device.hands?.right?.position?.set(0.24, 0.745, -0.38);
            }, 250);
          }
        });
      }

      setup360LookControls(device);
    }

    // Attach floating control toolbar
    setupPreviewToolbar();

    return true;
  } catch (err) {
    console.warn('[DeskMate] Desktop preview initialization bypassed:', err);
    return false;
  }
}

function applyCameraPose(device: any, z: number) {
  device.fovy = DEFAULT_POSE.fovyRad;
  const deltaZ = z - DEFAULT_POSE.z;
  const targetY = DEFAULT_POSE.y + deltaZ * 0.08;

  device.position.set(0, targetY, z);
  qPitch.setFromAxisAngle(vAxisX, currentPitch);
  qYaw.setFromAxisAngle(vAxisY, currentYaw);
  device.quaternion.copy(qYaw).multiply(qPitch);
}

export function enforceSeatedXRPose() {
  const win = window as any;
  const device = win.IWER_DEVICE;
  if (device) {
    const restore = () => {
      applyCameraPose(device, currentZ);
      positionHandsOnDesk(device);
    };
    restore();
    setTimeout(restore, 50);
    setTimeout(restore, 150);
    setTimeout(restore, 350);
    setTimeout(restore, 700);
  }
}

/**
 * 360-Degree Camera Drag-To-Look Controls
 * Allows visitors on desktop or mobile to freely look 360° all around the room.
 */
function setup360LookControls(device: any) {
  if (typeof window === 'undefined') return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;

  window.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('#deskmate-preview-hud') || target?.closest('button') || target?.closest('a')) {
      return;
    }
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;

    // Rotate horizontal yaw in 360 degrees
    currentYaw -= dx * 0.0035;
    // Tilt vertical pitch within natural head-tilt limits (-50° to +50°)
    currentPitch = Math.max(-0.85, Math.min(0.85, currentPitch - dy * 0.0035));

    applyCameraPose(device, currentZ);
  });

  const endDrag = () => {
    isDragging = false;
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}

export function switchEnvironment(env: EnvironmentId) {
  currentEnv = env;
  const win = window as any;

  // Seamless 360-degree panoramic sky dome switch
  if (typeof win.__switchRoom360 === 'function') {
    win.__switchRoom360(env);
  }

  const buttons: Record<EnvironmentId, string> = {
    sunlit_living_room: 'dm-btn-env-living',
    bedroom: 'dm-btn-env-bedroom',
    kitchen: 'dm-btn-env-kitchen',
    home_office: 'dm-btn-env-office',
  };

  (Object.keys(buttons) as EnvironmentId[]).forEach((key) => {
    const btn = document.getElementById(buttons[key]);
    if (!btn) return;
    if (key === env) {
      btn.style.background = '#0082fb';
      btn.style.color = '#ffffff';
    } else {
      btn.style.background = 'rgba(255, 255, 255, 0.08)';
      btn.style.color = '#cbd5e1';
    }
  });
}

function adjustZoom(delta: number) {
  const win = window as any;
  const device = win.IWER_DEVICE;
  if (!device) return;

  // Clamp z between 0.18m (close) and 1.20m (far)
  currentZ = Math.min(1.20, Math.max(0.18, currentZ + delta));
  applyCameraPose(device, currentZ);
}

function resetZoomAndRotation() {
  const win = window as any;
  const device = win.IWER_DEVICE;
  if (!device) return;

  currentZ = DEFAULT_POSE.z;
  currentYaw = 0;
  currentPitch = DEFAULT_POSE.pitchRad;
  applyCameraPose(device, currentZ);
}

function rotateYawDegrees(deg: number) {
  const win = window as any;
  const device = win.IWER_DEVICE;
  if (!device) return;

  currentYaw += (deg * Math.PI) / 180;
  applyCameraPose(device, currentZ);
}

function setupPreviewToolbar() {
  if (document.getElementById('deskmate-preview-hud')) return;

  const hud = document.createElement('div');
  hud.id = 'deskmate-preview-hud';
  hud.style.position = 'fixed';
  hud.style.top = '16px';
  hud.style.left = '50%';
  hud.style.transform = 'translateX(-50%)';
  hud.style.zIndex = '9999';
  hud.style.display = 'flex';
  hud.style.alignItems = 'center';
  hud.style.gap = '12px';
  hud.style.padding = '8px 16px';
  hud.style.borderRadius = '999px';
  hud.style.background = 'rgba(15, 23, 42, 0.90)';
  hud.style.backdropFilter = 'blur(18px)';
  (hud.style as any).webkitBackdropFilter = 'blur(18px)';
  hud.style.border = '1px solid rgba(56, 189, 248, 0.35)';
  hud.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5)';
  hud.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  hud.style.color = '#e2e8f0';
  hud.style.userSelect = 'none';

  hud.innerHTML = `
    <!-- 360 Room Environment Switcher -->
    <div style="display: flex; align-items: center; background: rgba(0, 0, 0, 0.4); padding: 3px; border-radius: 999px; gap: 3px;">
      <button id="dm-btn-env-living" title="Sunlit Living Room 360" style="border: 0; background: #0082fb; color: #ffffff; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        🛋️ Living Room
      </button>
      <button id="dm-btn-env-bedroom" title="Cozy Bedroom 360" style="border: 0; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        🛏️ Bedroom
      </button>
      <button id="dm-btn-env-kitchen" title="Modern Kitchen 360" style="border: 0; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        🍳 Kitchen
      </button>
      <button id="dm-btn-env-office" title="Executive Office 360" style="border: 0; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        💼 Office
      </button>
    </div>

    <!-- 360 Look Around Controls -->
    <div style="display: flex; align-items: center; gap: 4px; border-left: 1px solid rgba(255, 255, 255, 0.15); padding-left: 10px;">
      <span style="font-size: 11px; color: #38bdf8; font-weight: 600; margin-right: 2px;">360°:</span>
      <button id="dm-btn-look-left" title="Look 45° Left" style="padding: 3px 8px; height: 26px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.08); color: #cbd5e1; font-size: 11px; font-weight: 600; cursor: pointer;">⟲ 45°</button>
      <button id="dm-btn-front-view" title="Reset Front View" style="padding: 3px 8px; height: 26px; border-radius: 999px; border: 1px solid rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 11px; font-weight: 600; cursor: pointer;">Front</button>
      <button id="dm-btn-look-right" title="Look 45° Right" style="padding: 3px 8px; height: 26px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.08); color: #cbd5e1; font-size: 11px; font-weight: 600; cursor: pointer;">⟳ 45°</button>
    </div>

    <!-- Zoom Controls -->
    <div style="display: flex; align-items: center; gap: 4px; border-left: 1px solid rgba(255, 255, 255, 0.15); padding-left: 10px;">
      <span style="font-size: 11px; color: #94a3b8; font-weight: 500; margin-right: 2px;">Zoom:</span>
      <button id="dm-btn-zoom-out" title="Zoom Out" style="width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.08); color: #fff; font-size: 15px; font-weight: bold; cursor: pointer; display: grid; place-items: center;">-</button>
      <button id="dm-btn-zoom-in" title="Zoom In" style="width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.08); color: #fff; font-size: 15px; font-weight: bold; cursor: pointer; display: grid; place-items: center;">+</button>
    </div>

    <!-- Hands Toggle -->
    <div style="border-left: 1px solid rgba(255, 255, 255, 0.15); padding-left: 10px;">
      <button id="dm-btn-toggle-hands" title="Toggle Hands Wireframe" style="border: 0; background: rgba(255, 255, 255, 0.08); color: #34d399; padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        ✋ Hands: ON
      </button>
    </div>
  `;

  document.body.appendChild(hud);

  // Wire buttons
  document.getElementById('dm-btn-env-living')?.addEventListener('click', () => switchEnvironment('sunlit_living_room'));
  document.getElementById('dm-btn-env-bedroom')?.addEventListener('click', () => switchEnvironment('bedroom'));
  document.getElementById('dm-btn-env-kitchen')?.addEventListener('click', () => switchEnvironment('kitchen'));
  document.getElementById('dm-btn-env-office')?.addEventListener('click', () => switchEnvironment('home_office'));

  document.getElementById('dm-btn-look-left')?.addEventListener('click', () => rotateYawDegrees(45));
  document.getElementById('dm-btn-look-right')?.addEventListener('click', () => rotateYawDegrees(-45));
  document.getElementById('dm-btn-front-view')?.addEventListener('click', () => resetZoomAndRotation());

  document.getElementById('dm-btn-zoom-in')?.addEventListener('click', () => adjustZoom(-0.12));
  document.getElementById('dm-btn-zoom-out')?.addEventListener('click', () => adjustZoom(0.12));

  const toggleHandsBtn = document.getElementById('dm-btn-toggle-hands');
  toggleHandsBtn?.addEventListener('click', () => {
    handsEnabled = !handsEnabled;
    const win = window as any;
    const device = win.IWER_DEVICE;
    if (device) {
      positionHandsOnDesk(device);
    }
    if (toggleHandsBtn) {
      toggleHandsBtn.textContent = handsEnabled ? '✋ Hands: ON' : '✋ Hands: OFF';
      toggleHandsBtn.style.color = handsEnabled ? '#34d399' : '#94a3b8';
    }
  });
}
