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

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
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

  world.renderer.xr.addEventListener('sessionstart', updateSessionUI);
  world.renderer.xr.addEventListener('sessionend', updateSessionUI);
  updateSessionUI();

  world.registerSystem(PanelSystem);
  world.registerSystem(WorkspaceSystem);
});
