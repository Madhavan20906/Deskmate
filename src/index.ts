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

  const welcomeObj = world.getSceneObject('welcome-panel');
  if (welcomeObj) welcomeObj.visible = false;

  (window as unknown as { __launchXR?: () => void }).__launchXR = () => {
    world.launchXR();
  };

  const nav = navigator as Navigator & {
    xr?: { isSessionSupported?: (m: string) => Promise<boolean> };
  };
  if (nav.xr?.isSessionSupported) {
    nav.xr
      .isSessionSupported('immersive-ar')
      .then((supported) => {
        if (supported) world.launchXR();
      })
      .catch(() => {});
  } else if (!isQuestOrNativeXR()) {
    setTimeout(() => {
      try {
        world.launchXR();
      } catch {}
    }, 200);
  }

  world.renderer.xr.addEventListener('sessionstart', () => {
    enforceSeatedXRPose();
    const w = world.getSceneObject('welcome-panel');
    if (w) w.visible = false;
  });
  world.renderer.xr.addEventListener('sessionend', () => {
    const w = world.getSceneObject('welcome-panel');
    if (w) w.visible = false;
  });

  world.registerSystem(PanelSystem);
  world.registerSystem(WorkspaceSystem);
}

bootstrap().catch(console.error);
