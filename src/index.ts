/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PanelSystem } from './panel.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
)
  .then((world) => {
    world.registerSystem(PanelSystem);

    const domXrBtn = document.getElementById('dom-xr-btn');
    const xrLauncher = document.getElementById('xr-launcher');

    if (domXrBtn && xrLauncher) {
      domXrBtn.addEventListener('click', () => {
        world.launchXR();
      });

      world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        xrLauncher.style.display = is2D ? 'flex' : 'none';
      });
    }
  })
  .catch((err) => {
    console.error('[Deskmate] Failed to initialize world:', err);
  });
