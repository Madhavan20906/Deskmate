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
// Desk is at [0, 0, -0.70], tabletop at y = 0.745, cards at y = 0.94, dashboard at y = 1.25, z = -0.78.
// Camera at z = 0.32, y = 1.18 with -12° pitch brings the Dashboard, 3 Task Cards, AND the Desk Ruler all into view!
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

function setupHandTrackingAndCursor(device: any) {
  if (typeof window === 'undefined') return;

  // Visual 2D/3D cursor dot element that follows mouse pointer and highlights hovered targets
  let cursorDot = document.getElementById('deskmate-hand-cursor');
  if (!cursorDot) {
    cursorDot = document.createElement('div');
    cursorDot.id = 'deskmate-hand-cursor';
    cursorDot.style.position = 'fixed';
    cursorDot.style.width = '18px';
    cursorDot.style.height = '18px';
    cursorDot.style.borderRadius = '50%';
    cursorDot.style.border = '2px solid #53cbb5';
    cursorDot.style.backgroundColor = 'rgba(83, 203, 181, 0.35)';
    cursorDot.style.boxShadow = '0 0 12px #53cbb5';
    cursorDot.style.pointerEvents = 'none';
    cursorDot.style.zIndex = '99999';
    cursorDot.style.transform = 'translate(-50%, -50%)';
    cursorDot.style.transition = 'width 0.1s ease, height 0.1s ease, background-color 0.1s ease, border-color 0.1s ease';
    document.body.appendChild(cursorDot);
  }

  window.addEventListener('pointermove', (e: MouseEvent) => {
    if (cursorDot) {
      cursorDot.style.left = `${e.clientX}px`;
      cursorDot.style.top = `${e.clientY}px`;
    }

    if (!handsEnabled || !device.hands?.right?.position) return;

    // Convert screen coordinates to tabletop reach bounds
    const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
    const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;

    // Map to tabletop bounds: x [-0.55, 0.55], y [0.745, 1.25], z [-0.72, -0.38]
    const targetX = ndcX * 0.52;
    const targetY = Math.max(0.745, Math.min(1.28, 0.88 + ndcY * 0.36));
    const targetZ = Math.max(-0.72, Math.min(-0.38, -0.52 - ndcY * 0.18));

    // Smoothly glide right hand toward mouse hover target
    device.hands.right.position.set(targetX, targetY, targetZ);
  });

  window.addEventListener('pointerdown', () => {
    if (cursorDot) {
      cursorDot.style.width = '12px';
      cursorDot.style.height = '12px';
      cursorDot.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
      cursorDot.style.borderColor = '#ffffff';
      cursorDot.style.boxShadow = '0 0 16px #00d2ff';
    }
  });

  window.addEventListener('pointerup', () => {
    if (cursorDot) {
      cursorDot.style.width = '18px';
      cursorDot.style.height = '18px';
      cursorDot.style.backgroundColor = 'rgba(83, 203, 181, 0.35)';
      cursorDot.style.borderColor = '#53cbb5';
      cursorDot.style.boxShadow = '0 0 12px #53cbb5';
    }
  });
}

export async function initDesktopPreviewIfNeeded(): Promise<boolean> {
  // Never run emulator if visitor is already in Meta Quest Browser
  if (isQuestOrNativeXR()) {
    return false;
  }

  try {
    const win = window as any;
    if (import.meta.env.DEV && !win.IWER_DEVICE) {
      try {
        const devRuntimePath = '../node_modules/@iwsdk/vite-plugin-dev/dist/injection/runtime.js';
        const { startIwsdkDevRuntime } = await import(
          /* @vite-ignore */ devRuntimePath
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
      } catch (devErr) {
        console.warn('[DeskMate] Dev runtime could not be loaded:', devErr);
      }
    }

    const device = win.IWER_DEVICE;
    if (device) {
      device.primaryInputMode = 'hand';
      device.stereoEnabled = false;
      positionHandsOnDesk(device);
      applyCameraPose(device, currentZ);
      setupHandTrackingAndCursor(device);
    } else {
      setupHandTrackingAndCursor({});
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
  // Calculate y and pitch proportionally to keep the desk and dashboard centered as you zoom
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

export function switchEnvironment(env: EnvironmentId) {
  currentEnv = env;
  const win = window as any;

  // Clicking an environment button is a user gesture: automatically enter XR so the 3D room renders immediately!
  const launch = win.__launchXR;
  if (typeof launch === 'function') {
    try {
      launch();
    } catch {
      // Ignored if session already active or pending
    }
  }

  const sem = win.IWER_DEVICE?.sem;
  if (sem && typeof sem.loadDefaultEnvironment === 'function') {
    sem.loadDefaultEnvironment(env).then(() => {
      enforceSeatedXRPose();
    }).catch((err: unknown) => {
      console.warn('[DeskMate] Could not switch environment to ' + env, err);
    });
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

  // Clamp z between 0.50m (close) and 1.35m (far)
  currentZ = Math.min(1.35, Math.max(0.50, currentZ + delta));
  applyCameraPose(device, currentZ);
}

function resetZoom() {
  const win = window as any;
  const device = win.IWER_DEVICE;
  if (!device) return;

  currentZ = DEFAULT_POSE.z;
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
  hud.style.padding = '8px 14px';
  hud.style.borderRadius = '999px';
  hud.style.background = 'rgba(15, 23, 42, 0.88)';
  hud.style.backdropFilter = 'blur(18px)';
  (hud.style as any).webkitBackdropFilter = 'blur(18px)';
  hud.style.border = '1px solid rgba(83, 203, 181, 0.35)';
  hud.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
  hud.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  hud.style.color = '#e2e8f0';
  hud.style.userSelect = 'none';

  hud.innerHTML = `
    <!-- Environment Switcher (Matches IWSDK Dev XR environments) -->
    <div style="display: flex; align-items: center; background: rgba(0, 0, 0, 0.4); padding: 2px; border-radius: 999px; gap: 2px;">
      <button id="dm-btn-env-living" title="Sunlit Living Room (Default)" style="border: 0; background: #0082fb; color: #ffffff; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        🛋️ Living Room
      </button>
      <button id="dm-btn-env-bedroom" title="Cozy Bedroom" style="border: 0; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        🛏️ Bedroom
      </button>
      <button id="dm-btn-env-kitchen" title="Modern Kitchen" style="border: 0; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        🍳 Kitchen
      </button>
      <button id="dm-btn-env-office" title="Home Office" style="border: 0; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        💼 Office
      </button>
    </div>

    <!-- Zoom Controls -->
    <div style="display: flex; align-items: center; gap: 4px; border-left: 1px solid rgba(255, 255, 255, 0.15); padding-left: 10px;">
      <span style="font-size: 11px; color: #94a3b8; font-weight: 500; margin-right: 2px;">View:</span>
      <button id="dm-btn-zoom-out" title="Zoom Out" style="width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.08); color: #fff; font-size: 15px; font-weight: bold; cursor: pointer; display: grid; place-items: center;">-</button>
      <button id="dm-btn-zoom-reset" title="Reset Distance" style="padding: 2px 8px; height: 26px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.08); color: #cbd5e1; font-size: 11px; font-weight: 500; cursor: pointer;">Reset</button>
      <button id="dm-btn-zoom-in" title="Zoom In" style="width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.08); color: #fff; font-size: 15px; font-weight: bold; cursor: pointer; display: grid; place-items: center;">+</button>
    </div>

    <!-- Hands Toggle -->
    <div style="border-left: 1px solid rgba(255, 255, 255, 0.15); padding-left: 10px;">
      <button id="dm-btn-toggle-hands" title="Toggle Hands Wireframe (Useful for recording clean video without emulator lines)" style="border: 0; background: rgba(255, 255, 255, 0.08); color: #34d399; padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
        ✋ Hands: ON
      </button>
    </div>

    <!-- Enter Quest XR Button -->
    <div style="border-left: 1px solid rgba(255, 255, 255, 0.15); padding-left: 10px;">
      <button id="dm-btn-enter-xr" style="border: 0; background: linear-gradient(135deg, #0082fb 0%, #00d2ff 100%); color: #ffffff; padding: 7px 16px; border-radius: 999px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 7px; box-shadow: 0 0 16px rgba(0, 130, 251, 0.55); letter-spacing: 0.3px;">
        <span style="font-size: 15px;">🥽</span>
        <span>Enter Quest XR</span>
      </button>
    </div>
  `;

  document.body.appendChild(hud);

  // Wire buttons
  document.getElementById('dm-btn-env-living')?.addEventListener('click', () => switchEnvironment('sunlit_living_room'));
  document.getElementById('dm-btn-env-bedroom')?.addEventListener('click', () => switchEnvironment('bedroom'));
  document.getElementById('dm-btn-env-kitchen')?.addEventListener('click', () => switchEnvironment('kitchen'));
  document.getElementById('dm-btn-env-office')?.addEventListener('click', () => switchEnvironment('home_office'));
  document.getElementById('dm-btn-zoom-in')?.addEventListener('click', () => adjustZoom(-0.12));
  document.getElementById('dm-btn-zoom-out')?.addEventListener('click', () => adjustZoom(0.12));
  document.getElementById('dm-btn-zoom-reset')?.addEventListener('click', () => resetZoom());

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

  document.getElementById('dm-btn-enter-xr')?.addEventListener('click', () => {
    const launch = (window as any).__launchXR;
    if (typeof launch === 'function') {
      launch();
      setTimeout(enforceSeatedXRPose, 100);
      setTimeout(enforceSeatedXRPose, 300);
      setTimeout(enforceSeatedXRPose, 600);
    }
  });

  // Also attach bottom helper tip
  const tip = document.createElement('div');
  tip.id = 'deskmate-preview-tip';
  tip.style.position = 'fixed';
  tip.style.bottom = '14px';
  tip.style.left = '50%';
  tip.style.transform = 'translateX(-50%)';
  tip.style.zIndex = '9998';
  tip.style.padding = '6px 16px';
  tip.style.borderRadius = '999px';
  tip.style.background = 'rgba(15, 23, 42, 0.75)';
  tip.style.backdropFilter = 'blur(12px)';
  (tip.style as any).webkitBackdropFilter = 'blur(12px)';
  tip.style.border = '1px solid rgba(255, 255, 255, 0.08)';
  tip.style.fontSize = '12px';
  tip.style.color = '#94a3b8';
  tip.style.pointerEvents = 'none';
  tip.style.userSelect = 'none';
  tip.textContent = '💡 Tip: Click any room above (🛋️ Living Room, 🛏️ Bedroom...) or "Enter Quest XR" to step inside your room in full 3D!';
  document.body.appendChild(tip);
}
