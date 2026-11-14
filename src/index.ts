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
import { initDesktopPreviewIfNeeded, isQuestOrNativeXR } from './desktop-preview.js';

async function bootstrap() {
  const isPreview = await initDesktopPreviewIfNeeded();

  const options = isPreview
    ? {
        ...projectOptions,
        input: {
          ...projectOptions.input,
          canvasPointerEvents: { enabled: true, activeDuringXR: true },
        },
      }
    : projectOptions;

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
  if ('getDigitalGoodsService' in window && nav.xr?.isSessionSupported) {
    nav.xr
      .isSessionSupported('immersive-ar')
      .then((supported) => {
        if (supported) world.launchXR();
      })
      .catch(() => {});
  } else if (!isQuestOrNativeXR()) {
    // In desktop preview & local dev, automatically enter the emulated XR session so the user immediately sees the sunlit living room and 3D desk
    setTimeout(() => {
      world.launchXR();
    }, 200);
  }

  world.renderer.xr.addEventListener('sessionstart', updateSessionUI);
  world.renderer.xr.addEventListener('sessionend', updateSessionUI);
  updateSessionUI();

  world.registerSystem(PanelSystem);
  world.registerSystem(WorkspaceSystem);
}

bootstrap().catch(console.error);
