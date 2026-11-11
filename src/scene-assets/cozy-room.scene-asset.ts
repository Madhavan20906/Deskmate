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
  PlaneGeometry,
} from '@iwsdk/core';

/**
 * Creates a modern Scandinavian / warm Japandi cozy study & bedroom environment.
 * Provides architectural walls, hardwood parquet flooring, sunlit window,
 * acoustic wood slat accent wall, and wall shelving so the workspace feels
 * grounded in a real, calming physical room in desktop preview and VR mode.
 */
export function createCozyRoomModel(): Group {
  const root = new Group();
  root.name = 'CozyRoom';

  // 1. Warm honey-oak herringbone hardwood floor
  const floorGeo = new PlaneGeometry(8.0, 8.0);
  const floorMat = new MeshStandardMaterial({
    color: new Color(0x7c5d42),
    roughness: 0.55,
    metalness: 0.05,
  });
  const floor = new Mesh(floorGeo, floorMat);
  floor.name = 'HardwoodFloor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -0.8);
  floor.receiveShadow = true;
  root.add(floor);

  // Baseboards / Skirting boards
  const baseboardMat = new MeshStandardMaterial({
    color: new Color(0x3e2e23),
    roughness: 0.5,
  });
  const baseboardBackGeo = new BoxGeometry(8.0, 0.12, 0.02);
  const baseboardBack = new Mesh(baseboardBackGeo, baseboardMat);
  baseboardBack.position.set(0, 0.06, -2.48);
  root.add(baseboardBack);

  const baseboardLeftGeo = new BoxGeometry(0.02, 0.12, 8.0);
  const baseboardLeft = new Mesh(baseboardLeftGeo, baseboardMat);
  baseboardLeft.position.set(-3.48, 0.06, -0.8);
  root.add(baseboardLeft);

  const baseboardRight = new Mesh(baseboardLeftGeo, baseboardMat);
  baseboardRight.position.set(3.48, 0.06, -0.8);
  root.add(baseboardRight);

  // 2. Cozy textured wool area rug under desk
  const rugGeo = new BoxGeometry(3.2, 0.006, 2.6);
  const rugMat = new MeshStandardMaterial({
    color: new Color(0xd2cbbe),
    roughness: 0.95,
    metalness: 0.0,
  });
  const rug = new Mesh(rugGeo, rugMat);
  rug.name = 'WoolRug';
  rug.position.set(0, 0.003, -0.85);
  rug.receiveShadow = true;
  root.add(rug);

  // 3. Back Wall - Warm limewash plaster in soft linen
  const wallMat = new MeshStandardMaterial({
    color: new Color(0xe2ddd5),
    roughness: 0.88,
    metalness: 0.02,
  });
  const backWallGeo = new BoxGeometry(8.0, 3.6, 0.04);
  const backWall = new Mesh(backWallGeo, wallMat);
  backWall.name = 'BackWall';
  backWall.position.set(0, 1.8, -2.5);
  backWall.receiveShadow = true;
  root.add(backWall);

  // 4. Modern vertical oak slat accent paneling behind the workspace
  const slatWidth = 2.4;
  const slatHeight = 3.0;
  const slatBackingGeo = new BoxGeometry(slatWidth, slatHeight, 0.02);
  const slatBackingMat = new MeshStandardMaterial({
    color: new Color(0x22262a),
    roughness: 0.9,
  });
  const slatBacking = new Mesh(slatBackingGeo, slatBackingMat);
  slatBacking.position.set(0, 1.5, -2.47);
  slatBacking.receiveShadow = true;
  root.add(slatBacking);

  const ribMat = new MeshStandardMaterial({
    color: new Color(0x9d7a56),
    roughness: 0.6,
    metalness: 0.08,
  });
  const ribCount = 36;
  const ribSpacing = slatWidth / ribCount;
  const ribGeo = new BoxGeometry(0.028, slatHeight - 0.1, 0.02);

  for (let i = 0; i < ribCount; i += 1) {
    const rib = new Mesh(ribGeo, ribMat);
    const x = -slatWidth / 2 + (i + 0.5) * ribSpacing;
    rib.position.set(x, 1.5, -2.455);
    rib.castShadow = true;
    rib.receiveShadow = true;
    root.add(rib);
  }

  // 5. Left Wall with Sunlit Architectural Window
  const leftWallGeo = new BoxGeometry(0.04, 3.6, 8.0);
  const leftWall = new Mesh(leftWallGeo, wallMat);
  leftWall.name = 'LeftWall';
  leftWall.position.set(-3.5, 1.8, -0.8);
  leftWall.receiveShadow = true;
  root.add(leftWall);

  // Window frame on left wall
  const windowFrameMat = new MeshStandardMaterial({
    color: new Color(0x23272b),
    roughness: 0.4,
    metalness: 0.6,
  });
  const winFrameGeo = new BoxGeometry(0.08, 1.8, 2.2);
  const winFrame = new Mesh(winFrameGeo, windowFrameMat);
  winFrame.position.set(-3.46, 1.75, -1.0);
  root.add(winFrame);

  // Soft glowing sky panel behind the window
  const skyPanelGeo = new PlaneGeometry(2.1, 1.7);
  const skyPanelMat = new MeshStandardMaterial({
    color: new Color(0x9bc2e6),
    emissive: new Color(0xd2e5f8),
    emissiveIntensity: 0.7,
    roughness: 0.3,
  });
  const skyPanel = new Mesh(skyPanelGeo, skyPanelMat);
  skyPanel.rotation.y = Math.PI / 2;
  skyPanel.position.set(-3.43, 1.75, -1.0);
  root.add(skyPanel);

  // Window mullions (vertical & horizontal cross bars)
  const mullionVertGeo = new BoxGeometry(0.06, 1.74, 0.03);
  const mullionVert = new Mesh(mullionVertGeo, windowFrameMat);
  mullionVert.position.set(-3.44, 1.75, -1.0);
  root.add(mullionVert);

  const mullionHorizGeo = new BoxGeometry(0.06, 0.03, 2.14);
  const mullionHoriz = new Mesh(mullionHorizGeo, windowFrameMat);
  mullionHoriz.position.set(-3.44, 1.75, -1.0);
  root.add(mullionHoriz);

  // 6. Right Wall
  const rightWall = new Mesh(leftWallGeo, wallMat);
  rightWall.name = 'RightWall';
  rightWall.position.set(3.5, 1.8, -0.8);
  rightWall.receiveShadow = true;
  root.add(rightWall);

  // 7. Minimalist Oak Wall Shelf with books & plant on the right
  const shelfGeo = new BoxGeometry(1.2, 0.028, 0.22);
  const shelfMat = new MeshStandardMaterial({
    color: new Color(0x6e523c),
    roughness: 0.5,
  });
  const shelf = new Mesh(shelfGeo, shelfMat);
  shelf.position.set(1.9, 1.85, -2.38);
  shelf.castShadow = true;
  shelf.receiveShadow = true;
  root.add(shelf);

  // Shelf brackets
  const bracketGeo = new BoxGeometry(0.02, 0.16, 0.2);
  const bracketL = new Mesh(bracketGeo, windowFrameMat);
  bracketL.position.set(1.4, 1.78, -2.38);
  root.add(bracketL);
  const bracketR = new Mesh(bracketGeo, windowFrameMat);
  bracketR.position.set(2.4, 1.78, -2.38);
  root.add(bracketR);

  // Stylized books on shelf
  const bookColors = [0x3d5a80, 0xee6c4d, 0x293241, 0x53cbb5];
  bookColors.forEach((color, idx) => {
    const bookGeo = new BoxGeometry(0.038, 0.16 + (idx % 2) * 0.03, 0.14);
    const bookMat = new MeshStandardMaterial({
      color: new Color(color),
      roughness: 0.6,
    });
    const book = new Mesh(bookGeo, bookMat);
    book.position.set(1.55 + idx * 0.045, 1.95, -2.38);
    book.castShadow = true;
    root.add(book);
  });

  // Small potted succulent on shelf
  const potGeo = new CylinderGeometry(0.04, 0.03, 0.08, 16);
  const potMat = new MeshStandardMaterial({
    color: new Color(0xf4f1ea),
    roughness: 0.4,
  });
  const pot = new Mesh(potGeo, potMat);
  pot.position.set(2.2, 1.90, -2.38);
  pot.castShadow = true;
  root.add(pot);

  const plantGeo = new CylinderGeometry(0.005, 0.05, 0.07, 8);
  const plantMat = new MeshStandardMaterial({
    color: new Color(0x40826d),
    roughness: 0.7,
  });
  const plant = new Mesh(plantGeo, plantMat);
  plant.position.set(2.2, 1.96, -2.38);
  root.add(plant);

  // 8. Ceiling with modern architectural recessed shadow gap
  const ceilingGeo = new BoxGeometry(8.0, 0.04, 8.0);
  const ceilingMat = new MeshStandardMaterial({
    color: new Color(0xf7f5f2),
    roughness: 0.9,
  });
  const ceiling = new Mesh(ceilingGeo, ceilingMat);
  ceiling.name = 'Ceiling';
  ceiling.position.set(0, 3.6, -0.8);
  root.add(ceiling);

  return root;
}
