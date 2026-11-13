import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from '@iwsdk/core';

export function createPipAsset(): Object3D {
  const root = new Group();
  root.name = 'PipCompanion';

  // Body material: friendly teal/cyan
  const bodyMaterial = new MeshStandardMaterial({
    color: 0x53cbb5,
    roughness: 0.28,
    metalness: 0.08,
  });

  // Glossy eye material
  const eyeMaterial = new MeshStandardMaterial({
    color: 0x143139,
    roughness: 0.1,
    metalness: 0.8,
  });

  // Blush material
  const blushMaterial = new MeshStandardMaterial({
    color: 0xfca5a5,
    roughness: 0.6,
  });

  // Antenna material: cheerful sunny gold
  const goldMaterial = new MeshStandardMaterial({
    color: 0xf5d90a,
    roughness: 0.3,
    metalness: 0.5,
  });

  // Main round body (radius 0.065m)
  const bodyGeo = new SphereGeometry(0.065, 18, 14);
  const bodyMesh = new Mesh(bodyGeo, bodyMaterial);
  bodyMesh.name = 'PipBody';
  bodyMesh.position.set(0, 0.065, 0);
  root.add(bodyMesh);

  // Eyes group for head tracking
  const eyesGroup = new Group();
  eyesGroup.name = 'PipEyesGroup';
  eyesGroup.position.set(0, 0.075, 0.052);

  const eyeGeo = new SphereGeometry(0.011, 12, 10);
  eyeGeo.scale(0.55, 1.2, 0.4);

  const leftEye = new Mesh(eyeGeo, eyeMaterial);
  leftEye.name = 'PipLeftEye';
  leftEye.position.set(-0.022, 0, 0);
  eyesGroup.add(leftEye);

  const rightEye = new Mesh(eyeGeo, eyeMaterial);
  rightEye.name = 'PipRightEye';
  rightEye.position.set(0.022, 0, 0);
  eyesGroup.add(rightEye);

  // Blush cheeks
  const cheekGeo = new SphereGeometry(0.009, 8, 8);
  cheekGeo.scale(1.2, 0.5, 0.3);

  const leftCheek = new Mesh(cheekGeo, blushMaterial);
  leftCheek.name = 'PipLeftCheek';
  leftCheek.position.set(-0.038, -0.012, 0);
  eyesGroup.add(leftCheek);

  const rightCheek = new Mesh(cheekGeo, blushMaterial);
  rightCheek.name = 'PipRightCheek';
  rightCheek.position.set(0.038, -0.012, 0);
  eyesGroup.add(rightCheek);

  bodyMesh.add(eyesGroup);

  // Antenna sprout atop head
  const antennaGroup = new Group();
  antennaGroup.name = 'PipAntennaGroup';
  antennaGroup.position.set(0, 0.062, 0);

  const stemGeo = new CylinderGeometry(0.003, 0.004, 0.032, 8);
  const stemMesh = new Mesh(stemGeo, bodyMaterial);
  stemMesh.position.set(0, 0.016, 0);
  antennaGroup.add(stemMesh);

  const bulbGeo = new SphereGeometry(0.010, 10, 10);
  const bulbMesh = new Mesh(bulbGeo, goldMaterial);
  bulbMesh.name = 'PipAntennaBulb';
  bulbMesh.position.set(0, 0.034, 0);
  antennaGroup.add(bulbMesh);

  bodyMesh.add(antennaGroup);

  return root;
}
