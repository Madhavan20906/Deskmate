/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';

export function createDeskSurfaceModel(): Group {
  const root = new Group();
  root.name = 'DeskSurface';

  // Warm minimalist wooden desk top
  // Dimensions: 1.40m wide, 0.75m deep, 0.035m thick. Surface at y = 0.72m
  const topGeometry = new BoxGeometry(1.40, 0.035, 0.75);
  const woodMaterial = new MeshStandardMaterial({
    color: new Color(0x322822),
    roughness: 0.6,
    metalness: 0.05,
  });
  const tabletop = new Mesh(topGeometry, woodMaterial);
  tabletop.name = 'Tabletop';
  tabletop.position.set(0, 0.7025, 0);
  root.add(tabletop);

  // Desk pad / blotter in dark slate
  const padGeometry = new BoxGeometry(1.05, 0.005, 0.55);
  const padMaterial = new MeshStandardMaterial({
    color: new Color(0x1c272e),
    roughness: 0.8,
  });
  const deskPad = new Mesh(padGeometry, padMaterial);
  deskPad.name = 'DeskPad';
  deskPad.position.set(0, 0.7225, 0.02);
  root.add(deskPad);

  // 4 Slender metal legs
  const legGeometry = new CylinderGeometry(0.018, 0.015, 0.685, 16);
  const legMaterial = new MeshStandardMaterial({
    color: new Color(0x1a1e22),
    roughness: 0.4,
    metalness: 0.7,
  });

  const legPositions = [
    [-0.64, 0.3425, -0.32],
    [0.64, 0.3425, -0.32],
    [-0.64, 0.3425, 0.32],
    [0.64, 0.3425, 0.32],
  ];

  legPositions.forEach((pos, index) => {
    const leg = new Mesh(legGeometry, legMaterial);
    leg.name = `DeskLeg_${index + 1}`;
    leg.position.set(pos[0], pos[1], pos[2]);
    root.add(leg);
  });

  return root;
}
