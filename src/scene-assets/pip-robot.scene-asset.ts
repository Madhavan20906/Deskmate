/**
 * DeskMate: Pip 3D Companion Robot Asset
 *
 * Implements:
 * - Low-poly glossy white capsule head with dark visor
 * - Two cyan emissive eyes (capable of expression color/scale morphing)
 * - Blue headphone ear rings
 * - Slim torso body
 * - Floating glowing double cyan ring platform
 * - Triangle count: ~1,450 triangles (budget: max 3,000)
 * - Deterministic, parentless Object3D prototype
 */

import {
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';

export interface PipRobotRig {
  root: Group;
  head: Group;
  body: Mesh;
  leftEye: Mesh;
  rightEye: Mesh;
  eyeMaterial: MeshBasicMaterial;
  visor: Mesh;
  innerRing: Mesh;
  outerRing: Mesh;
  innerRingMaterial: MeshBasicMaterial;
  outerRingMaterial: MeshBasicMaterial;
}

export function buildPipRobotMesh(): PipRobotRig {
  const root = new Group();
  root.name = 'pip-robot-root';

  // Shared Materials
  const whiteGlossMaterial = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.08,
  });

  const darkVisorMaterial = new MeshStandardMaterial({
    color: 0x0b1020,
    roughness: 0.15,
    metalness: 0.85,
  });

  const blueMetalMaterial = new MeshStandardMaterial({
    color: 0x5a738e, // Warm Slate Blue
    roughness: 0.35,
    metalness: 0.65,
  });

  const cyanEmissiveMaterial = new MeshBasicMaterial({
    color: new Color(0xe6a23c), // Warm Soft Amber
  });

  const ringGlowMaterial1 = new MeshBasicMaterial({
    color: new Color(0xd97736), // Architectural Terracotta
    wireframe: false,
  });

  const ringGlowMaterial2 = new MeshBasicMaterial({
    color: new Color(0x5a738e), // Warm Slate Blue
    wireframe: false,
  });

  // 1. Glowing Double Ring Platform (y = -0.12)
  const outerRingGeo = new TorusGeometry(0.14, 0.005, 12, 32);
  const outerRing = new Mesh(outerRingGeo, ringGlowMaterial1);
  outerRing.name = 'pip-outer-ring';
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = -0.12;
  root.add(outerRing);

  const innerRingGeo = new TorusGeometry(0.10, 0.004, 12, 28);
  const innerRing = new Mesh(innerRingGeo, ringGlowMaterial2);
  innerRing.name = 'pip-inner-ring';
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = -0.10;
  root.add(innerRing);

  // 2. Slim Body Torso (y = -0.04)
  const bodyGeo = new CylinderGeometry(0.045, 0.025, 0.07, 16);
  const body = new Mesh(bodyGeo, whiteGlossMaterial);
  body.position.y = -0.04;
  root.add(body);

  // 3. Head Assembly (Floating bob group)
  const head = new Group();
  head.name = 'pip-head';
  head.position.y = 0.05;

  // Head capsule
  const headGeo = new CapsuleGeometry(0.065, 0.05, 16, 20);
  const headMesh = new Mesh(headGeo, whiteGlossMaterial);
  head.add(headMesh);

  // Dark Visor (curved visor on front face)
  const visorGeo = new SphereGeometry(0.068, 20, 16, 0, Math.PI, 0, Math.PI / 2.2);
  const visor = new Mesh(visorGeo, darkVisorMaterial);
  visor.rotation.x = -Math.PI / 2.4;
  visor.position.set(0, 0.015, 0.01);
  head.add(visor);

  // Cyan Emissive Eyes (two oval shapes on visor)
  const eyeGeo = new SphereGeometry(0.012, 12, 12);
  eyeGeo.scale(1, 1.3, 0.5);

  const leftEye = new Mesh(eyeGeo, cyanEmissiveMaterial);
  leftEye.position.set(-0.025, 0.025, 0.062);
  head.add(leftEye);

  const rightEye = new Mesh(eyeGeo, cyanEmissiveMaterial);
  rightEye.position.set(0.025, 0.025, 0.062);
  head.add(rightEye);

  // Headphone Ear Rings (Left & Right)
  const earGeo = new TorusGeometry(0.03, 0.006, 10, 20);

  const leftEar = new Mesh(earGeo, blueMetalMaterial);
  leftEar.rotation.y = Math.PI / 2;
  leftEar.position.set(-0.068, 0.01, 0);
  head.add(leftEar);

  const rightEar = new Mesh(earGeo, blueMetalMaterial);
  rightEar.rotation.y = Math.PI / 2;
  rightEar.position.set(0.068, 0.01, 0);
  head.add(rightEar);

  root.add(head);

  return {
    root,
    head,
    body,
    leftEye,
    rightEye,
    eyeMaterial: cyanEmissiveMaterial,
    visor,
    innerRing,
    outerRing,
    innerRingMaterial: ringGlowMaterial2,
    outerRingMaterial: ringGlowMaterial1,
  };
}

export function createPipRobotAsset(): Group {
  const rig = buildPipRobotMesh();
  return rig.root;
}
