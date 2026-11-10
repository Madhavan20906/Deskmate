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

export function createPipCompanionModel(): Group {
  const root = new Group();
  root.name = 'PipCompanion';

  // Perch coaster on the desk
  const perchGeometry = new CylinderGeometry(0.09, 0.09, 0.015, 32);
  const perchMaterial = new MeshStandardMaterial({
    color: new Color(0x2a3d45),
    roughness: 0.6,
    metalness: 0.1,
  });
  const perch = new Mesh(perchGeometry, perchMaterial);
  perch.name = 'PerchCoaster';
  perch.position.y = 0.0075;
  root.add(perch);

  // Soft creature body
  const bodyGeometry = new SphereGeometry(0.065, 32, 24);
  const bodyMaterial = new MeshStandardMaterial({
    color: new Color(0x77dec9),
    roughness: 0.35,
    metalness: 0.05,
  });
  const body = new Mesh(bodyGeometry, bodyMaterial);
  body.name = 'Body';
  body.position.y = 0.065;
  body.scale.set(1.05, 0.95, 1.0);
  root.add(body);

  // Head
  const headGeometry = new SphereGeometry(0.055, 32, 24);
  const head = new Mesh(headGeometry, bodyMaterial);
  head.name = 'Head';
  head.position.y = 0.125;
  head.scale.set(1.0, 0.92, 0.95);
  root.add(head);

  // Eyes (glossy dark beads with catchlights)
  const eyeGeometry = new SphereGeometry(0.011, 16, 16);
  const eyeMaterial = new MeshStandardMaterial({
    color: new Color(0x111c24),
    roughness: 0.1,
    metalness: 0.8,
  });
  const highlightGeometry = new SphereGeometry(0.0035, 8, 8);
  const highlightMaterial = new MeshStandardMaterial({
    color: new Color(0xffffff),
    roughness: 0.1,
    emissive: new Color(0xffffff),
    emissiveIntensity: 0.6,
  });

  // Left eye
  const leftEye = new Mesh(eyeGeometry, eyeMaterial);
  leftEye.name = 'LeftEye';
  leftEye.position.set(-0.022, 0.132, 0.046);
  root.add(leftEye);

  const leftHighlight = new Mesh(highlightGeometry, highlightMaterial);
  leftHighlight.name = 'LeftEyeHighlight';
  leftHighlight.position.set(-0.02, 0.136, 0.054);
  root.add(leftHighlight);

  // Right eye
  const rightEye = new Mesh(eyeGeometry, eyeMaterial);
  rightEye.name = 'RightEye';
  rightEye.position.set(0.022, 0.132, 0.046);
  root.add(rightEye);

  const rightHighlight = new Mesh(highlightGeometry, highlightMaterial);
  rightHighlight.name = 'RightEyeHighlight';
  rightHighlight.position.set(0.024, 0.136, 0.054);
  root.add(rightHighlight);

  // Rosy cheeks
  const cheekGeometry = new SphereGeometry(0.009, 12, 12);
  const cheekMaterial = new MeshStandardMaterial({
    color: new Color(0xf7a8b8),
    roughness: 0.5,
  });
  const leftCheek = new Mesh(cheekGeometry, cheekMaterial);
  leftCheek.name = 'LeftCheek';
  leftCheek.position.set(-0.038, 0.118, 0.036);
  leftCheek.scale.set(1.2, 0.6, 0.5);
  root.add(leftCheek);

  const rightCheek = new Mesh(cheekGeometry, cheekMaterial);
  rightCheek.name = 'RightCheek';
  rightCheek.position.set(0.038, 0.118, 0.036);
  rightCheek.scale.set(1.2, 0.6, 0.5);
  root.add(rightCheek);

  // Cute leaf sprout on head (symbolizing the focus garden connection)
  const stemGeometry = new CylinderGeometry(0.003, 0.003, 0.025, 8);
  const leafMaterial = new MeshStandardMaterial({
    color: new Color(0x56ab2f),
    roughness: 0.4,
  });
  const stem = new Mesh(stemGeometry, leafMaterial);
  stem.name = 'SproutStem';
  stem.position.set(0, 0.185, 0);
  root.add(stem);

  const leafGeometry = new SphereGeometry(0.016, 12, 12);
  const leftLeaf = new Mesh(leafGeometry, leafMaterial);
  leftLeaf.name = 'LeftSproutLeaf';
  leftLeaf.position.set(-0.012, 0.198, 0);
  leftLeaf.scale.set(1.2, 0.4, 0.7);
  leftLeaf.rotation.z = 0.4;
  root.add(leftLeaf);

  const rightLeaf = new Mesh(leafGeometry, leafMaterial);
  rightLeaf.name = 'RightSproutLeaf';
  rightLeaf.position.set(0.012, 0.198, 0);
  rightLeaf.scale.set(1.2, 0.4, 0.7);
  rightLeaf.rotation.z = -0.4;
  root.add(rightLeaf);

  return root;
}
