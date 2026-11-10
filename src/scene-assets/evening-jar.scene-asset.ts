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

export function createEveningJarModel(): Group {
  const root = new Group();
  root.name = 'EveningJar';

  // Glass jar base/body
  const jarGeometry = new CylinderGeometry(0.045, 0.045, 0.11, 24);
  const glassMaterial = new MeshStandardMaterial({
    color: new Color(0xdff4f7),
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.45,
  });
  const jarBody = new Mesh(jarGeometry, glassMaterial);
  jarBody.name = 'JarBody';
  jarBody.position.y = 0.055;
  root.add(jarBody);

  // Wooden / cork stopper lid
  const corkGeometry = new CylinderGeometry(0.042, 0.046, 0.02, 24);
  const corkMaterial = new MeshStandardMaterial({
    color: new Color(0xc49b71),
    roughness: 0.75,
  });
  const cork = new Mesh(corkGeometry, corkMaterial);
  cork.name = 'CorkLid';
  cork.position.y = 0.115;
  root.add(cork);

  // Glass rim ring
  const rimGeometry = new CylinderGeometry(0.048, 0.048, 0.008, 24);
  const rim = new Mesh(rimGeometry, glassMaterial);
  rim.name = 'JarRim';
  rim.position.y = 0.108;
  root.add(rim);

  // Accumulated reward marbles/stars inside the jar (representing completed tasks)
  const tokenColors = [0x53cbb5, 0xffd166, 0xef476f, 0x118ab2, 0x06d6a0, 0x77dec9];
  const tokenGeometry = new SphereGeometry(0.012, 12, 12);

  const tokenPositions = [
    [-0.018, 0.022, -0.01],
    [0.016, 0.024, 0.012],
    [-0.005, 0.02, 0.018],
    [0.008, 0.042, -0.014],
    [-0.014, 0.045, 0.01],
    [0.012, 0.058, 0.005],
  ];

  tokenPositions.forEach((pos, idx) => {
    const tokenMaterial = new MeshStandardMaterial({
      color: new Color(tokenColors[idx % tokenColors.length]),
      emissive: new Color(tokenColors[idx % tokenColors.length]),
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });
    const token = new Mesh(tokenGeometry, tokenMaterial);
    token.name = `RewardToken_${idx + 1}`;
    token.position.set(pos[0], pos[1], pos[2]);
    root.add(token);
  });

  return root;
}
