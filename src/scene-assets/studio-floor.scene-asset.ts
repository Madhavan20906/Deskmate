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
} from '@iwsdk/core';

export function createStudioFloorModel(): Group {
  const root = new Group();
  root.name = 'StudioFloor';

  // Broad architectural studio floor disc that fades into the dome gradient via DomeFade
  const floorGeometry = new CylinderGeometry(8.0, 8.0, 0.02, 64);
  const floorMaterial = new MeshStandardMaterial({
    color: new Color(0x111720),
    roughness: 0.82,
    metalness: 0.08,
  });
  const floorMesh = new Mesh(floorGeometry, floorMaterial);
  floorMesh.name = 'FloorPlane';
  floorMesh.position.y = -0.01;
  floorMesh.receiveShadow = true;
  root.add(floorMesh);

  // Woven architectural workstation rug directly grounding the desk and chair zone
  const rugGeometry = new CylinderGeometry(1.75, 1.75, 0.008, 48);
  const rugMaterial = new MeshStandardMaterial({
    color: new Color(0x182430),
    roughness: 0.9,
    metalness: 0.03,
  });
  const rugMesh = new Mesh(rugGeometry, rugMaterial);
  rugMesh.name = 'WorkstationRug';
  rugMesh.position.set(0, 0.004, -0.85);
  rugMesh.receiveShadow = true;
  root.add(rugMesh);

  // Subtle woven border ring for executive rug finish
  const borderGeometry = new CylinderGeometry(1.77, 1.77, 0.009, 48);
  const borderMaterial = new MeshStandardMaterial({
    color: new Color(0x2d4354),
    roughness: 0.7,
    metalness: 0.15,
  });
  const borderMesh = new Mesh(borderGeometry, borderMaterial);
  borderMesh.name = 'RugBorder';
  borderMesh.position.set(0, 0.003, -0.85);
  borderMesh.receiveShadow = true;
  root.add(borderMesh);

  return root;
}
