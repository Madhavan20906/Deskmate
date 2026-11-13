import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from '@iwsdk/core';

/**
 * Procedural low-poly 3D Ghost Deskmate companion:
 * - Translucent ethereal floating body with flowing tail
 * - Expressive glossy eyes and cheerful blush
 * - Articulated right arm that waves back when user waves
 * - Interactive palm for high-five celebration at the end of a focus sprint
 */
export function createGhostAsset(): Object3D {
  const root = new Group();
  root.name = 'ghost-companion';

  // Shared reusable materials
  const ghostMaterial = new MeshStandardMaterial({
    color: 0xe0f2fe, // Soft ethereal sky-white
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.28,
  });

  const eyeMaterial = new MeshStandardMaterial({
    color: 0x0f172a, // Deep slate glossy eye
    roughness: 0.1,
    metalness: 0.8,
  });

  const blushMaterial = new MeshStandardMaterial({
    color: 0xf472b6, // Soft glowing rose blush
    roughness: 0.5,
    metalness: 0.0,
    transparent: true,
    opacity: 0.65,
    side: DoubleSide,
  });

  // 1. Floating Body Group (animates gentle idle hover)
  const floatGroup = new Group();
  floatGroup.name = 'GhostFloatGroup';
  root.add(floatGroup);

  // Dome Head
  const headGeo = new SphereGeometry(0.062, 16, 12);
  const headMesh = new Mesh(headGeo, ghostMaterial);
  headMesh.name = 'GhostHead';
  headMesh.position.set(0, 0.04, 0);
  floatGroup.add(headMesh);

  // Undulating Lower Ghost Skirt/Tail
  const skirtGeo = new CylinderGeometry(0.061, 0.038, 0.07, 16, 1, true);
  const skirtMesh = new Mesh(skirtGeo, ghostMaterial);
  skirtMesh.name = 'GhostSkirt';
  skirtMesh.position.set(0, -0.01, 0);
  floatGroup.add(skirtMesh);

  // Stylized tail ruffles at bottom
  const ruffleGeo = new SphereGeometry(0.012, 6, 6);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const ruffle = new Mesh(ruffleGeo, ghostMaterial);
    ruffle.position.set(Math.cos(angle) * 0.036, -0.045, Math.sin(angle) * 0.036);
    floatGroup.add(ruffle);
  }

  // 2. Cute Face
  const faceGroup = new Group();
  faceGroup.name = 'GhostFace';
  faceGroup.position.set(0, 0.045, 0.052);
  floatGroup.add(faceGroup);

  const eyeGeo = new SphereGeometry(0.007, 8, 8);
  eyeGeo.scale(1.0, 1.3, 0.7);

  const leftEye = new Mesh(eyeGeo, eyeMaterial);
  leftEye.position.set(-0.022, 0.005, 0.005);
  faceGroup.add(leftEye);

  const rightEye = new Mesh(eyeGeo, eyeMaterial);
  rightEye.position.set(0.022, 0.005, 0.005);
  faceGroup.add(rightEye);

  // Blush spots
  const blushGeo = new SphereGeometry(0.008, 6, 6);
  blushGeo.scale(1.2, 0.6, 0.3);

  const leftBlush = new Mesh(blushGeo, blushMaterial);
  leftBlush.position.set(-0.032, -0.008, 0.002);
  faceGroup.add(leftBlush);

  const rightBlush = new Mesh(blushGeo, blushMaterial);
  rightBlush.position.set(0.032, -0.008, 0.002);
  faceGroup.add(rightBlush);

  // 3. Left Nub Arm
  const armLeftGeo = new SphereGeometry(0.012, 8, 8);
  armLeftGeo.scale(1.6, 0.9, 0.9);
  const leftArm = new Mesh(armLeftGeo, ghostMaterial);
  leftArm.position.set(-0.065, 0.01, 0.005);
  leftArm.rotation.z = 0.45;
  floatGroup.add(leftArm);

  // 4. Articulated Right Waving / High-Five Arm
  const armRightPivot = new Group();
  armRightPivot.name = 'GhostRightArm';
  armRightPivot.position.set(0.062, 0.015, 0.005);
  armRightPivot.rotation.z = -0.3; // Resting pose
  floatGroup.add(armRightPivot);

  const armRightGeo = new CylinderGeometry(0.009, 0.012, 0.045, 8);
  const armRightMesh = new Mesh(armRightGeo, ghostMaterial);
  armRightMesh.position.set(0.018, 0.015, 0);
  armRightMesh.rotation.z = -Math.PI / 4;
  armRightPivot.add(armRightMesh);

  // High-Five Palm Mitten
  const palmGeo = new SphereGeometry(0.014, 8, 8);
  palmGeo.scale(1.3, 0.6, 1.1); // Flatten into open palm
  const palmMesh = new Mesh(palmGeo, ghostMaterial);
  palmMesh.name = 'GhostPalm';
  palmMesh.position.set(0.038, 0.032, 0.002);
  armRightPivot.add(palmMesh);

  return root;
}
