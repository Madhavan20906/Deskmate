/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PanelSystem } from './panel.js';
import { WorkspaceSystem } from './workspace.js';
import { initDesktopPreviewIfNeeded, isQuestOrNativeXR, enforceSeatedXRPose } from './desktop-preview.js';

async function bootstrap() {
  const options = {
    ...projectOptions,
    input: {
      ...projectOptions.input,
      canvasPointerEvents: { enabled: true, activeDuringXR: true },
    },
  };

  const world = await World.create(
    document.getElementById('scene-container') as HTMLDivElement,
    options,
  );

  // Ensure razor-sharp WebGL rendering on Retina / high-DPI displays so all text is crystal clear
  const pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  world.renderer.setPixelRatio(pixelRatio);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    });
  }

  const overlay = document.querySelector('.xr-overlay') as HTMLElement | null;
  const updateSessionUI = () => {
    if (overlay) {
      if (world.session) {
        overlay.classList.add('xr-session-active');
      } else {
        overlay.classList.remove('xr-session-active');
      }
    }
  };

  (window as unknown as { __launchXR?: () => void }).__launchXR = () => {
    world.launchXR();
  };

  const launchButton =
    document.getElementById('xr-overlay-launch-btn') ??
    document.querySelector('.xr-launch-button');
  launchButton?.addEventListener('click', () => {
    world.launchXR();
  });

  const nav = navigator as Navigator & {
    xr?: { isSessionSupported?: (m: string) => Promise<boolean> };
  };
  if (nav.xr?.isSessionSupported) {
    nav.xr
      .isSessionSupported('immersive-ar')
      .then((supported) => {
        if (supported) {
          try {
            world.launchXR();
          } catch {
            // User gesture required; handled by launch button & pointerdown below
          }
        }
      })
      .catch(() => {});
  }

  // Any user gesture enters XR mode on devices/browsers that support it
  window.addEventListener(
    'pointerdown',
    () => {
      if (!world.session && !world.sessionRequestPending) {
        try {
          world.launchXR();
        } catch {
          // Ignored if unsupported on device
        }
      }
    },
    { once: true },
  );

  // Configure both left & right pointers to be fully active, visible, and vibrant
  const configurePointers = () => {
    const xr = world.input?.xr;
    if (!xr?.multiPointers) return;
    for (const handedness of ['left', 'right'] as const) {
      const mp = xr.multiPointers[handedness] as any;
      if (mp?.ray?.visual) {
        // Mode 1 = Visible: always renders ray beam so user can see and aim both pointers
        mp.ray.visual.rayDisplayMode = 1;
        if (mp.ray.visual.ray?.material?.uniforms?.color) {
          mp.ray.visual.ray.material.uniforms.color.value.setHex(0xA78BFA);
        }
      }
    }
  };

  configurePointers();
  if (!isQuestOrNativeXR()) {
    void initDesktopPreviewIfNeeded();
    window.setTimeout(() => {
      configurePointers();
      enforceSeatedXRPose();
    }, 250);
  }

  world.renderer.xr.addEventListener('sessionstart', () => {
    updateSessionUI();
    configurePointers();
    if (!isQuestOrNativeXR()) {
      enforceSeatedXRPose();
    }
  });
  world.renderer.xr.addEventListener('sessionend', () => {
    updateSessionUI();
  });
  updateSessionUI();

  world.registerSystem(PanelSystem);
  world.registerSystem(WorkspaceSystem);
}

bootstrap().catch(console.error);
