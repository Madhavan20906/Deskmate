/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PanelSystem } from './panel.js';
import { soundManager } from './audio.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
)
  .then((world) => {
    world.registerSystem(PanelSystem);

    const domXrBtn = document.getElementById('dom-xr-btn');
    const xrLauncher = document.getElementById('xr-launcher');
    const exitWorkspaceContainer = document.getElementById('exit-workspace');
    const exitWorkspaceBtn = document.getElementById('exit-workspace-btn');

    const initialPos = { x: 0, y: 1.28, z: -0.05 };
    const seatedPos = { x: 0, y: 1.20, z: -0.10 };
    const initialLookAt = { x: 0, y: 1.10, z: -0.92 };
    const seatedLookAt = { x: 0, y: 1.02, z: -0.90 };

    let isTransitioning = false;

    // 2D Desktop Camera Look variables
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let yaw = 0;
    let pitch = 0;
    let baseRotX = world.camera.rotation.x;
    let baseRotY = world.camera.rotation.y;
    let baseRotZ = world.camera.rotation.z;

    const syncBaseRotation = () => {
      baseRotX = world.camera.rotation.x - pitch;
      baseRotY = world.camera.rotation.y - yaw;
      baseRotZ = world.camera.rotation.z;
    };

    const enterWorkspaceView = () => {
      if (isTransitioning) return;
      isTransitioning = true;
      if (xrLauncher) xrLauncher.style.display = 'none';
      if (exitWorkspaceContainer) exitWorkspaceContainer.style.display = 'flex';

      soundManager.playChime();

      let progress = 0;
      const startX = world.camera.position.x;
      const startY = world.camera.position.y;
      const startZ = world.camera.position.z;

      const animateIn = () => {
        progress += 0.045;
        const t = Math.min(1, progress);
        const ease = 0.5 - 0.5 * Math.cos(Math.PI * t);

        world.camera.position.x = startX + (seatedPos.x - startX) * ease;
        world.camera.position.y = startY + (seatedPos.y - startY) * ease;
        world.camera.position.z = startZ + (seatedPos.z - startZ) * ease;

        world.camera.lookAt(
          initialLookAt.x + (seatedLookAt.x - initialLookAt.x) * ease,
          initialLookAt.y + (seatedLookAt.y - initialLookAt.y) * ease,
          initialLookAt.z + (seatedLookAt.z - initialLookAt.z) * ease,
        );

        yaw = 0;
        pitch = 0;
        syncBaseRotation();

        if (progress < 1) {
          requestAnimationFrame(animateIn);
        } else {
          isTransitioning = false;
        }
      };
      requestAnimationFrame(animateIn);
    };

    const exitWorkspaceView = () => {
      if (isTransitioning) return;
      isTransitioning = true;
      if (exitWorkspaceContainer) exitWorkspaceContainer.style.display = 'none';
      if (xrLauncher) xrLauncher.style.display = 'flex';

      let progress = 0;
      const startX = world.camera.position.x;
      const startY = world.camera.position.y;
      const startZ = world.camera.position.z;

      const animateOut = () => {
        progress += 0.045;
        const t = Math.min(1, progress);
        const ease = 0.5 - 0.5 * Math.cos(Math.PI * t);

        world.camera.position.x = startX + (initialPos.x - startX) * ease;
        world.camera.position.y = startY + (initialPos.y - startY) * ease;
        world.camera.position.z = startZ + (initialPos.z - startZ) * ease;

        world.camera.lookAt(
          seatedLookAt.x + (initialLookAt.x - seatedLookAt.x) * ease,
          seatedLookAt.y + (initialLookAt.y - seatedLookAt.y) * ease,
          seatedLookAt.z + (initialLookAt.z - seatedLookAt.z) * ease,
        );

        yaw = 0;
        pitch = 0;
        syncBaseRotation();

        if (progress < 1) {
          requestAnimationFrame(animateOut);
        } else {
          isTransitioning = false;
        }
      };
      requestAnimationFrame(animateOut);
    };

    if (domXrBtn) {
      domXrBtn.addEventListener('click', () => {
        // 1. Immediately glide camera into the seated workspace view
        enterWorkspaceView();

        // 2. Also trigger native WebXR session if running on Meta Quest
        try {
          world.launchXR();
        } catch (err) {
          console.warn('[XR] Launch attempt:', err);
        }
      });
    }

    if (exitWorkspaceBtn) {
      exitWorkspaceBtn.addEventListener('click', () => {
        exitWorkspaceView();
      });
    }

    world.visibilityState.subscribe((visibilityState) => {
      const is2D = visibilityState === VisibilityState.NonImmersive;
      if (!is2D) {
        if (xrLauncher) xrLauncher.style.display = 'none';
        if (exitWorkspaceContainer) exitWorkspaceContainer.style.display = 'none';
      }
    });

    // 2D Desktop Camera Look: Allow right-drag (or canvas drag) to look around the room
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2 || (e.target as HTMLElement).id === 'scene-container') {
        isDragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging || isTransitioning) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      yaw -= dx * 0.003;
      pitch -= dy * 0.003;
      pitch = Math.max(-0.45, Math.min(0.35, pitch));
      yaw = Math.max(-0.85, Math.min(0.85, yaw));

      world.camera.rotation.set(baseRotX + pitch, baseRotY + yaw, baseRotZ);
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('contextmenu', (e) => {
      // Prevent default right-click menu so right-drag camera navigation works effortlessly
      e.preventDefault();
    });
  })
  .catch((err) => {
    console.error('[Deskmate] Failed to initialize world:', err);
  });
