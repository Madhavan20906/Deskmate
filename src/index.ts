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
    const xrHint = document.getElementById('xr-hint');

    if (domXrBtn && xrLauncher) {
      domXrBtn.addEventListener('click', async () => {
        try {
          if (!navigator.xr) {
            if (xrHint) {
              xrHint.textContent = 'ℹ️ WebXR not detected. Open on Meta Quest or IWER emulator to enter VR/AR!';
              xrHint.style.color = '#f2bf7b';
            }
            return;
          }
          const isArSupported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
          const isVrSupported = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);

          if (!isArSupported && !isVrSupported) {
            if (xrHint) {
              xrHint.textContent = 'ℹ️ No XR headset connected. Exploring in 3D desktop preview (Right-drag to look around).';
              xrHint.style.color = '#8ce2d2';
            }
            return;
          }
          world.launchXR();
        } catch (err) {
          console.warn('[XR] Launch attempt:', err);
          world.launchXR();
        }
      });

      world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        xrLauncher.style.display = is2D ? 'flex' : 'none';
      });
    }

    // 2D Desktop Camera Look: Allow right-drag to rotate camera and explore the room
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let yaw = 0;
    let pitch = 0;
    let initialRotX = 0;
    let initialRotY = 0;
    let initialRotZ = 0;

    const setupCameraRotation = () => {
      initialRotX = world.camera.rotation.x;
      initialRotY = world.camera.rotation.y;
      initialRotZ = world.camera.rotation.z;
    };
    setupCameraRotation();

    window.addEventListener('mousedown', (e) => {
      if (e.button === 2 || (e.target as HTMLElement).id === 'scene-container') {
        isDragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      yaw -= dx * 0.003;
      pitch -= dy * 0.003;
      pitch = Math.max(-0.45, Math.min(0.35, pitch));
      yaw = Math.max(-0.85, Math.min(0.85, yaw));

      world.camera.rotation.set(initialRotX + pitch, initialRotY + yaw, initialRotZ);
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
