/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';

export function createGhostDeskmateModel(): Group {
  const root = new Group();
  root.name = 'GhostDeskmate';

  // Base desk presence disc
  const baseGeometry = new CylinderGeometry(0.08, 0.08, 0.012, 32);
  const baseMaterial = new MeshStandardMaterial({
    color: new Color(0x1a2634),
    roughness: 0.7,
    metalness: 0.2,
  });
  const base = new Mesh(baseGeometry, baseMaterial);
  base.name = 'GhostBase';
  base.position.y = 0.006;
  root.add(base);

  // Translucent glowing presence orb (representing body doubling companion)
  const coreGeometry = new SphereGeometry(0.05, 32, 24);
  const coreMaterial = new MeshStandardMaterial({
    color: new Color(0x7ea8f8),
    emissive: new Color(0x3d70e0),
    emissiveIntensity: 0.55,
    roughness: 0.25,
    transparent: true,
    opacity: 0.85,
  });
  const core = new Mesh(coreGeometry, coreMaterial);
  core.name = 'GhostCore';
  core.position.y = 0.09;
  root.add(core);

  // Inner bright heart light
  const innerGeometry = new SphereGeometry(0.025, 16, 16);
  const innerMaterial = new MeshStandardMaterial({
    color: new Color(0xdbe6ff),
    emissive: new Color(0xffffff),
    emissiveIntensity: 0.8,
    roughness: 0.1,
  });
  const innerLight = new Mesh(innerGeometry, innerMaterial);
  innerLight.name = 'GhostHeart';
  innerLight.position.y = 0.09;
  root.add(innerLight);

  // Companion hand-glow indicators (two soft resting glowing spheres on the desk)
  const handGlowGeometry = new SphereGeometry(0.018, 16, 16);
  const handGlowMaterial = new MeshStandardMaterial({
    color: new Color(0x9fc0ff),
    emissive: new Color(0x5588ee),
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.7,
  });

  const leftHandGlow = new Mesh(handGlowGeometry, handGlowMaterial);
  leftHandGlow.name = 'GhostLeftHandGlow';
  leftHandGlow.position.set(-0.045, 0.02, 0.04);
  leftHandGlow.scale.set(1.1, 0.5, 1.2);
  root.add(leftHandGlow);

  const rightHandGlow = new Mesh(handGlowGeometry, handGlowMaterial);
  rightHandGlow.name = 'GhostRightHandGlow';
  rightHandGlow.position.set(0.045, 0.02, 0.04);
  rightHandGlow.scale.set(1.1, 0.5, 1.2);
  root.add(rightHandGlow);

  return root;
}
