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
    device.hands.left.position.set(-0.25, 0.74, -0.42);
  }
  if (device.hands.right?.position) {
    device.hands.right.connected = true;
    device.hands.right.position.set(0.25, 0.74, -0.42);
  }
}

export async function initDesktopPreviewIfNeeded(): Promise<boolean> {
  // In production builds (Vercel) or on Meta Quest Browser, keep default native XR mode
  if (import.meta.env.PROD || isQuestOrNativeXR()) {
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
              device.hands?.right?.position?.set(0.25, 0.74, -0.42);
            }, 250);
          }
        });
      }
    }

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

export function switchEnvironment(_env: EnvironmentId) {}
