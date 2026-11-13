import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from '@iwsdk/core';

/**
 * Procedural low-poly 3D Productivity Marbles & Jar:
 * - Frosted translucent glass jar with polished rim
 * - Shallow carved warm oak tray beside the jar
 * - Jewel-toned marbles resting inside the jar matching daily token count
 * - Pickable token marble in the tray ready to pinch-drop
 */
export function createMarblesJarAsset(): Object3D {
  const root = new Group();
  root.name = 'marbles-jar';

  // Shared reusable materials
  const glassMaterial = new MeshStandardMaterial({
    color: 0xe0f7fa, // Crystal cyan glass
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.5,
  });

  const rimMaterial = new MeshStandardMaterial({
    color: 0x90caf9,
    roughness: 0.2,
    metalness: 0.3,
  });

  const trayMaterial = new MeshStandardMaterial({
    color: 0x8d6e63, // Carved walnut/oak wood
    roughness: 0.7,
    metalness: 0.05,
  });

  // Jewel marble colors (emerald, amber, sapphire, ruby, amethyst)
  const marbleColors = [0x2ecc71, 0xf39c12, 0x3498db, 0xe74c3c, 0x9b59b6];
  const marbleMaterials = marbleColors.map(
    (c) =>
      new MeshStandardMaterial({
        color: c,
        roughness: 0.25,
        metalness: 0.2,
      }),
  );

  // 1. Frosted Glass Jar (r: 0.042m, h: 0.10m)
  const jarBodyGeo = new CylinderGeometry(0.042, 0.04, 0.10, 16, 1, true);
  const jarBodyMesh = new Mesh(jarBodyGeo, glassMaterial);
  jarBodyMesh.name = 'JarBody';
  jarBodyMesh.position.set(0, 0.05, 0);
  root.add(jarBodyMesh);

  // Jar Base Floor (solid glass bottom)
  const jarBaseGeo = new CylinderGeometry(0.04, 0.04, 0.008, 16);
  const jarBaseMesh = new Mesh(jarBaseGeo, glassMaterial);
  jarBaseMesh.position.set(0, 0.004, 0);
  root.add(jarBaseMesh);

  // Jar Top Neck / Rim Collar
  const jarRimGeo = new CylinderGeometry(0.044, 0.042, 0.012, 16);
  const jarRimMesh = new Mesh(jarRimGeo, rimMaterial);
  jarRimMesh.position.set(0, 0.10, 0);
  root.add(jarRimMesh);

  // 2. Marbles Container inside Jar
  const jarMarblesGroup = new Group();
  jarMarblesGroup.name = 'JarMarblesGroup';
  jarMarblesGroup.position.set(0, 0.012, 0);
  root.add(jarMarblesGroup);

  // Deterministic resting positions for up to 10 stored marbles in the jar
  const sphereGeo = new SphereGeometry(0.011, 8, 8);
  const jarMarbleOffsets = [
    [0.0, 0.006, 0.0],
    [0.018, 0.006, 0.01],
    [-0.018, 0.006, -0.01],
    [0.01, 0.006, -0.018],
    [-0.012, 0.006, 0.016],
    [0.008, 0.024, 0.006],
    [-0.01, 0.024, -0.008],
    [0.014, 0.024, -0.01],
    [-0.012, 0.024, 0.012],
    [0.0, 0.04, 0.0],
  ];

  jarMarbleOffsets.forEach((pos, idx) => {
    const marbleMesh = new Mesh(sphereGeo, marbleMaterials[idx % marbleMaterials.length]);
    marbleMesh.name = `JarMarble-${idx + 1}`;
    marbleMesh.position.set(pos[0], pos[1], pos[2]);
    // Visible state will be toggled dynamically based on token count
    jarMarblesGroup.add(marbleMesh);
  });

  // 3. Carved Wood Tray (beside the jar)
  const trayGroup = new Group();
  trayGroup.position.set(-0.088, 0, 0.015);
  root.add(trayGroup);

  const trayBaseGeo = new BoxGeometry(0.075, 0.012, 0.055);
  const trayBaseMesh = new Mesh(trayBaseGeo, trayMaterial);
  trayBaseMesh.position.set(0, 0.006, 0);
  trayGroup.add(trayBaseMesh);

  // Tray rim lips
  const rimFrontGeo = new BoxGeometry(0.075, 0.008, 0.005);
  const rimFront = new Mesh(rimFrontGeo, trayMaterial);
  rimFront.position.set(0, 0.014, 0.025);
  trayGroup.add(rimFront);

  const rimBack = new Mesh(rimFrontGeo, trayMaterial);
  rimBack.position.set(0, 0.014, -0.025);
  trayGroup.add(rimBack);

  // 4. Pickable Tray Marble (ready to pinch and drop into the jar)
  const trayMarbleMesh = new Mesh(sphereGeo, marbleMaterials[0]); // Green token
  trayMarbleMesh.name = 'TrayPickableMarble';
  trayMarbleMesh.position.set(-0.088, 0.018, 0.015);
  root.add(trayMarbleMesh);

  return root;
}
