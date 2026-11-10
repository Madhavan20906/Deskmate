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

  // 1. Executive American Walnut tabletop with rich warm tones
  // Dimensions: 1.40m wide, 0.75m deep, 0.032m thick. Surface at y = 0.72m
  const topGeometry = new BoxGeometry(1.40, 0.032, 0.75);
  const woodMaterial = new MeshStandardMaterial({
    color: new Color(0x3e2e23),
    roughness: 0.52,
    metalness: 0.04,
  });
  const tabletop = new Mesh(topGeometry, woodMaterial);
  tabletop.name = 'Tabletop';
  tabletop.position.set(0, 0.704, 0);
  tabletop.castShadow = true;
  tabletop.receiveShadow = true;
  root.add(tabletop);

  // Tabletop under-chamfer / sub-frame in brushed anodized graphite
  const subFrameGeometry = new BoxGeometry(1.34, 0.02, 0.69);
  const metalFrameMaterial = new MeshStandardMaterial({
    color: new Color(0x1c232a),
    roughness: 0.38,
    metalness: 0.75,
  });
  const subFrame = new Mesh(subFrameGeometry, metalFrameMaterial);
  subFrame.name = 'SubFrame';
  subFrame.position.set(0, 0.678, 0);
  subFrame.castShadow = true;
  root.add(subFrame);

  // 2. Premium leather desk blotter pad in deep midnight slate
  const padGeometry = new BoxGeometry(1.06, 0.006, 0.52);
  const padMaterial = new MeshStandardMaterial({
    color: new Color(0x15222c),
    roughness: 0.72,
    metalness: 0.08,
  });
  const deskPad = new Mesh(padGeometry, padMaterial);
  deskPad.name = 'DeskPad';
  deskPad.position.set(0, 0.723, 0.04);
  deskPad.receiveShadow = true;
  root.add(deskPad);

  // Subtle perimeter stitching border for high-end tactile feel
  const padBorderGeometry = new BoxGeometry(1.072, 0.005, 0.532);
  const padBorderMaterial = new MeshStandardMaterial({
    color: new Color(0x2a3e4e),
    roughness: 0.6,
    metalness: 0.2,
  });
  const padBorder = new Mesh(padBorderGeometry, padBorderMaterial);
  padBorder.name = 'DeskPadBorder';
  padBorder.position.set(0, 0.722, 0.04);
  root.add(padBorder);

  // 3. Modern architectural LED desk lamp on rear-left corner
  const lampBaseGeometry = new CylinderGeometry(0.065, 0.065, 0.012, 24);
  const lampBase = new Mesh(lampBaseGeometry, metalFrameMaterial);
  lampBase.name = 'LampBase';
  lampBase.position.set(-0.54, 0.726, -0.24);
  lampBase.castShadow = true;
  root.add(lampBase);

  // Lamp vertical stem
  const lampStemGeometry = new CylinderGeometry(0.007, 0.007, 0.38, 16);
  const lampStem = new Mesh(lampStemGeometry, metalFrameMaterial);
  lampStem.name = 'LampStem';
  lampStem.position.set(-0.54, 0.916, -0.24);
  lampStem.castShadow = true;
  root.add(lampStem);

  // Lamp cantilever arm angled toward center of desk
  const lampArmGeometry = new CylinderGeometry(0.006, 0.006, 0.22, 16);
  const lampArm = new Mesh(lampArmGeometry, metalFrameMaterial);
  lampArm.name = 'LampArm';
  lampArm.position.set(-0.46, 1.07, -0.16);
  lampArm.rotation.z = -0.7;
  lampArm.rotation.y = 0.5;
  lampArm.castShadow = true;
  root.add(lampArm);

  // Lamp head / horizontal lightbar
  const lampHeadGeometry = new BoxGeometry(0.24, 0.012, 0.028);
  const lampHead = new Mesh(lampHeadGeometry, metalFrameMaterial);
  lampHead.name = 'LampHead';
  lampHead.position.set(-0.38, 1.12, -0.10);
  lampHead.rotation.y = 0.3;
  lampHead.castShadow = true;
  root.add(lampHead);

  // Warm glowing LED diffuser panel
  const lampDiffuserGeometry = new BoxGeometry(0.22, 0.004, 0.022);
  const lampDiffuserMaterial = new MeshStandardMaterial({
    color: new Color(0xfff5e6),
    emissive: new Color(0xffe6c2),
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  const lampDiffuser = new Mesh(lampDiffuserGeometry, lampDiffuserMaterial);
  lampDiffuser.name = 'LampDiffuser';
  lampDiffuser.position.set(-0.38, 1.112, -0.10);
  lampDiffuser.rotation.y = 0.3;
  root.add(lampDiffuser);

  // 4. Executive desk accessories: Ceramic mug & machined tray
  // Ceramic mug with coaster on right side
  const coasterGeometry = new CylinderGeometry(0.048, 0.048, 0.006, 24);
  const coasterMaterial = new MeshStandardMaterial({
    color: new Color(0x283845),
    roughness: 0.8,
  });
  const coaster = new Mesh(coasterGeometry, coasterMaterial);
  coaster.name = 'CoffeeCoaster';
  coaster.position.set(0.56, 0.723, 0.16);
  root.add(coaster);

  const mugGeometry = new CylinderGeometry(0.038, 0.032, 0.082, 24);
  const mugMaterial = new MeshStandardMaterial({
    color: new Color(0xecf1f5),
    roughness: 0.25,
    metalness: 0.1,
  });
  const mug = new Mesh(mugGeometry, mugMaterial);
  mug.name = 'CoffeeMug';
  mug.position.set(0.56, 0.764, 0.16);
  mug.castShadow = true;
  root.add(mug);

  const coffeeLiquidGeometry = new CylinderGeometry(0.032, 0.032, 0.004, 16);
  const coffeeMaterial = new MeshStandardMaterial({
    color: new Color(0x24160e),
    roughness: 0.2,
  });
  const coffeeLiquid = new Mesh(coffeeLiquidGeometry, coffeeMaterial);
  coffeeLiquid.name = 'CoffeeLiquid';
  coffeeLiquid.position.set(0.56, 0.796, 0.16);
  root.add(coffeeLiquid);

  // Machined aluminum accessory & stylus tray on front-left
  const trayGeometry = new BoxGeometry(0.18, 0.008, 0.045);
  const tray = new Mesh(trayGeometry, metalFrameMaterial);
  tray.name = 'AccessoryTray';
  tray.position.set(-0.36, 0.725, 0.25);
  root.add(tray);

  const stylusGeometry = new CylinderGeometry(0.004, 0.004, 0.14, 12);
  const stylusMaterial = new MeshStandardMaterial({
    color: new Color(0x53cbb5),
    roughness: 0.3,
    metalness: 0.7,
  });
  const stylus = new Mesh(stylusGeometry, stylusMaterial);
  stylus.name = 'Stylus';
  stylus.position.set(-0.36, 0.731, 0.25);
  stylus.rotation.z = Math.PI / 2;
  root.add(stylus);

  // 5. Four sturdy, precision-engineered metal desk legs
  const legGeometry = new CylinderGeometry(0.019, 0.015, 0.67, 16);
  const legPositions = [
    [-0.64, 0.335, -0.32],
    [0.64, 0.335, -0.32],
    [-0.64, 0.335, 0.32],
    [0.64, 0.335, 0.32],
  ];

  legPositions.forEach((pos, index) => {
    const leg = new Mesh(legGeometry, metalFrameMaterial);
    leg.name = `DeskLeg_${index + 1}`;
    leg.position.set(pos[0], pos[1], pos[2]);
    leg.castShadow = true;
    root.add(leg);

    // Floor leveling foot / glide
    const footGeometry = new CylinderGeometry(0.024, 0.024, 0.008, 16);
    const footMaterial = new MeshStandardMaterial({
      color: new Color(0x11161b),
      roughness: 0.8,
    });
    const foot = new Mesh(footGeometry, footMaterial);
    foot.name = `DeskFoot_${index + 1}`;
    foot.position.set(pos[0], 0.004, pos[2]);
    root.add(foot);
  });

  // Cross-brace structural bar
  const braceGeometry = new BoxGeometry(1.24, 0.014, 0.014);
  const brace = new Mesh(braceGeometry, metalFrameMaterial);
  brace.name = 'CrossBrace';
  brace.position.set(0, 0.26, -0.32);
  brace.castShadow = true;
  root.add(brace);

  return root;
}
