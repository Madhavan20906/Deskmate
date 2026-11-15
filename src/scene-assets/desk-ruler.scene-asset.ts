import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from '@iwsdk/core';

/**
 * Procedural 3D Desk Ruler Scene Asset
 * Evaluated deterministically for runtime and editor.
 * Physical schedule bar that sits directly on the desk surface in WebXR.
 */
export function createDeskRulerAsset(): Object3D {
  const root = new Group();
  root.name = 'ProceduralDeskRuler';

  // Base Ruler Materials
  const matRulerBase = new MeshStandardMaterial({
    color: 0x16222c,
    roughness: 0.55,
    metalness: 0.35,
  });

  const matMorning = new MeshStandardMaterial({
    color: 0x1c3545,
    roughness: 0.45,
    metalness: 0.2,
    emissive: 0x0f2533,
    emissiveIntensity: 0.35,
  });

  const matMidday = new MeshStandardMaterial({
    color: 0x143c40,
    roughness: 0.45,
    metalness: 0.2,
    emissive: 0x092629,
    emissiveIntensity: 0.35,
  });

  const matEvening = new MeshStandardMaterial({
    color: 0x272445,
    roughness: 0.45,
    metalness: 0.2,
    emissive: 0x16132d,
    emissiveIntensity: 0.35,
  });

  const matNotch = new MeshStandardMaterial({
    color: 0xa0c4d8,
    roughness: 0.25,
    metalness: 0.85,
  });

  const matSunOrb = new MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });

  // Task Tile Priority Materials matching user design mockup
  const matCoral = new MeshStandardMaterial({
    color: 0x7c2d12,
    emissive: 0x9a3412,
    emissiveIntensity: 0.4,
    roughness: 0.35,
  });

  const matTeal = new MeshStandardMaterial({
    color: 0x064e3b,
    emissive: 0x065f46,
    emissiveIntensity: 0.4,
    roughness: 0.35,
  });

  const matPurple = new MeshStandardMaterial({
    color: 0x3b0764,
    emissive: 0x581c87,
    emissiveIntensity: 0.4,
    roughness: 0.35,
  });

  const matFreeSlot = new MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.1,
  });

  const matTray = new MeshStandardMaterial({
    color: 0x131f28,
    roughness: 0.5,
    metalness: 0.4,
  });

  // 1. Structural Bar (10 hours: 08:00 to 18:00 at 0.060m/hr = 0.60m total length)
  const totalLength = 0.60;
  const rulerHeight = 0.012;
  const rulerDepth = 0.055;

  const barGeo = new BoxGeometry(totalLength + 0.012, rulerHeight, rulerDepth + 0.008);
  const barMesh = new Mesh(barGeo, matRulerBase);
  barMesh.name = 'RulerBarBaseMesh';
  barMesh.position.set(0, rulerHeight / 2, 0);
  root.add(barMesh);

  // 2. Zone Washes (Morning 08:00-11:30, Midday 11:30-14:30, Evening 14:30-18:00)
  const morningMesh = new Mesh(new BoxGeometry(0.21, 0.002, rulerDepth), matMorning);
  morningMesh.position.set(-0.195, rulerHeight + 0.001, 0);
  root.add(morningMesh);

  const middayMesh = new Mesh(new BoxGeometry(0.18, 0.002, rulerDepth), matMidday);
  middayMesh.position.set(0, rulerHeight + 0.001, 0);
  root.add(middayMesh);

  const eveningMesh = new Mesh(new BoxGeometry(0.21, 0.002, rulerDepth), matEvening);
  eveningMesh.position.set(0.195, rulerHeight + 0.001, 0);
  root.add(eveningMesh);

  // 3. Hour Notches
  const notchGeo = new BoxGeometry(0.002, 0.003, 0.018);
  const halfNotchGeo = new BoxGeometry(0.0014, 0.002, 0.010);
  const notchesGroup = new Group();
  notchesGroup.name = 'RulerNotches';

  for (let h = 0; h <= 10; h++) {
    const x = -0.30 + h * 0.060;
    const notch = new Mesh(notchGeo, matNotch);
    notch.position.set(x, rulerHeight + 0.002, -rulerDepth / 2 + 0.011);
    notchesGroup.add(notch);

    if (h < 10) {
      const halfNotch = new Mesh(halfNotchGeo, matNotch);
      halfNotch.position.set(x + 0.030, rulerHeight + 0.0015, -rulerDepth / 2 + 0.008);
      notchesGroup.add(halfNotch);
    }
  }
  root.add(notchesGroup);

  // 4. Trays (Left Unscheduled Tray, Right Overflow Tray)
  const trayGeo = new BoxGeometry(0.14, 0.010, 0.075);
  const leftTray = new Mesh(trayGeo, matTray);
  leftTray.position.set(-0.41, 0.005, 0);
  leftTray.name = 'LeftUnscheduledTray';
  root.add(leftTray);

  const rightTray = new Mesh(trayGeo, matTray);
  rightTray.position.set(0.41, 0.005, 0);
  rightTray.name = 'RightOverflowTray';
  root.add(rightTray);

  // 5. Sun Orb Now Marker (positioned at 13:30, x = 0.03m)
  const sunOrb = new Mesh(new SphereGeometry(0.014, 16, 12), matSunOrb);
  sunOrb.name = 'SunNowOrb';
  sunOrb.position.set(0.03, rulerHeight + 0.024, 0);
  root.add(sunOrb);

  // 6. Pre-rendered Physical Task Slabs matching design mockup
  // Free slot 1 (08:00 - 09:30 = 90m = 0.09m width, center x = -0.255)
  const free1 = new Mesh(new BoxGeometry(0.088, 0.004, 0.046), matFreeSlot);
  free1.position.set(-0.255, rulerHeight + 0.002, 0);
  root.add(free1);

  // Roadmap (09:30 - 11:30 = 120m = 0.12m width, center x = -0.15)
  const roadmapTile = new Mesh(new BoxGeometry(0.118, 0.018, 0.048), matCoral);
  roadmapTile.name = 'TileRoadmap';
  roadmapTile.position.set(-0.15, rulerHeight + 0.009, 0);
  root.add(roadmapTile);

  // Free slot 2 (11:30 - 13:00 = 90m = 0.09m width, center x = -0.045)
  const free2 = new Mesh(new BoxGeometry(0.088, 0.004, 0.046), matFreeSlot);
  free2.position.set(-0.045, rulerHeight + 0.002, 0);
  root.add(free2);

  // Brief (13:00 - 14:00 = 60m = 0.06m width, center x = 0.03)
  const briefTile = new Mesh(new BoxGeometry(0.058, 0.018, 0.048), matTeal);
  briefTile.name = 'TileBrief';
  briefTile.position.set(0.03, rulerHeight + 0.009, 0);
  root.add(briefTile);

  // Free slot 3 (14:00 - 15:00 = 60m = 0.06m width, center x = 0.09)
  const free3 = new Mesh(new BoxGeometry(0.058, 0.004, 0.046), matFreeSlot);
  free3.position.set(0.09, rulerHeight + 0.002, 0);
  root.add(free3);

  // Inbox (15:00 - 16:00 = 60m = 0.06m width, center x = 0.15)
  const inboxTile = new Mesh(new BoxGeometry(0.058, 0.018, 0.048), matPurple);
  inboxTile.name = 'TileInbox';
  inboxTile.position.set(0.15, rulerHeight + 0.009, 0);
  root.add(inboxTile);

  // Free slot 4 (16:00 - 18:00 = 120m = 0.12m width, center x = 0.24)
  const free4 = new Mesh(new BoxGeometry(0.118, 0.004, 0.046), matFreeSlot);
  free4.position.set(0.24, rulerHeight + 0.002, 0);
  root.add(free4);

  return root;
}
