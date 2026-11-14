/**
 * DeskMate Desktop Preview System
 * Provides an emulated Meta Quest 3 desktop preview with the sunlit living room
 * environment for deployed platforms (Vercel, desktop browsers) without altering
 * the native Meta Quest XR experience or public/scenes/main.iwsdk.scene.json.
 */

export function isQuestOrNativeXR(): boolean {
  if (typeof navigator === 'undefined') return false;
  // If running inside Meta Quest Browser or a VR headset
  const isOculus = /OculusBrowser/i.test(navigator.userAgent);
  return isOculus;
}

export async function initDesktopPreviewIfNeeded(): Promise<boolean> {
  // Never enable emulator on Quest headset
  if (isQuestOrNativeXR()) {
    return false;
  }

  // Only run if WebXR is not natively available or user is on desktop browser
  try {
    const { startIwsdkDevRuntime } = await (
      // @ts-expect-error Dev runtime import
      import('../node_modules/@iwsdk/vite-plugin-dev/dist/injection/runtime.js')
    );

    const win = window as any;
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

    const device = win.IWER_DEVICE;
    if (device) {
      // Hands input mode
      device.primaryInputMode = 'hand';
      // Single clean view for desktop monitor, not stereo goggles
      device.stereoEnabled = false;
      // FOV tuned so the entire desk, cards, companion, and room fit nicely
      device.fovy = (62 * Math.PI) / 180;
      
      // Position the camera directly in front of the DeskMate workstation:
      // Desk is at [0, 0, -0.80], top at y = 0.74, cards/dashboard at [0, 1.35, -0.95].
      // Placing the camera at z = 0.40, y = 1.44 provides an ideal viewing distance (~1.25m from desk)
      device.position.set(0, 1.44, 0.40);
      
      // Pitch down by ~11 degrees (-0.19 rad) to frame both the desk surface (Pip, Dial, Plant, Lamp, Jar)
      // and the floating cards & dashboard without being too zoomed in or zoomed out
      const pitchRad = -0.19;
      device.quaternion.set(Math.sin(pitchRad / 2), 0, 0, Math.cos(pitchRad / 2));
    }

    // Attach desktop preview banner to DOM
    setupPreviewBanner();

    return true;
  } catch (err) {
    console.warn('[DeskMate] Desktop preview initialization bypassed:', err);
    return false;
  }
}

function setupPreviewBanner() {
  if (document.getElementById('desktop-preview-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'desktop-preview-bar';
  bar.style.position = 'fixed';
  bar.style.bottom = '16px';
  bar.style.left = '50%';
  bar.style.transform = 'translateX(-50%)';
  bar.style.zIndex = '9999';
  bar.style.display = 'flex';
  bar.style.flexDirection = 'column';
  bar.style.alignItems = 'center';
  bar.style.gap = '6px';
  bar.style.padding = '10px 20px';
  bar.style.borderRadius = '999px';
  bar.style.background = 'rgba(15, 23, 42, 0.85)';
  bar.style.backdropFilter = 'blur(16px)';
  (bar.style as any).webkitBackdropFilter = 'blur(16px)';
  bar.style.border = '1px solid rgba(83, 203, 181, 0.35)';
  bar.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.45)';
  bar.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  bar.style.color = '#e2e8f0';
  bar.style.pointerEvents = 'auto';
  bar.style.userSelect = 'none';

  bar.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #53cbb5; box-shadow: 0 0 10px #53cbb5;"></span>
      <span style="font-size: 13px; font-weight: 600; letter-spacing: 0.3px; color: #f8fafc;">Desktop preview · emulated Meta Quest 3</span>
      <span style="font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(83, 203, 181, 0.15); color: #53cbb5; font-weight: 500;">Sunlit Living Room</span>
    </div>
    <div style="font-size: 12px; color: #94a3b8;">
      Move mouse to look around · Click to interact with cards, Pip, dial, lamp & jar
    </div>
  `;

  document.body.appendChild(bar);
}
