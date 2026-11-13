import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from '@iwsdk/core';

export function createSprintDialAsset(): Object3D {
  const root = new Group();
  root.name = 'SprintDial';

  // Base plinth material (matte dark metallic)
  const baseMaterial = new MeshStandardMaterial({
    color: 0x18242d,
    roughness: 0.5,
    metalness: 0.6,
  });

  // Knurled rotary knob material
  const knobMaterial = new MeshStandardMaterial({
    color: 0x243542,
    roughness: 0.35,
    metalness: 0.7,
  });

  // Glowing ring material (emissive teal)
  const glowMaterial = new MeshStandardMaterial({
    color: 0x8ce2d2,
    emissive: 0x53cbb5,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });

  // Pointer indicator material
  const pointerMaterial = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x8ce2d2,
    emissiveIntensity: 0.9,
    roughness: 0.1,
  });

  // Base plinth (height 0.018m, radius 0.068m)
  const baseGeo = new CylinderGeometry(0.068, 0.072, 0.018, 24);
  const baseMesh = new Mesh(baseGeo, baseMaterial);
  baseMesh.name = 'DialBase';
  baseMesh.position.set(0, 0.009, 0);
  root.add(baseMesh);

  // Glowing perimeter ring
  const ringGeo = new TorusGeometry(0.069, 0.0025, 8, 28);
  ringGeo.rotateX(Math.PI / 2);
  const ringMesh = new Mesh(ringGeo, glowMaterial);
  ringMesh.name = 'GlowingRing';
  ringMesh.position.set(0, 0.018, 0);
  root.add(ringMesh);

  // Rotary Knob group (this node rotates)
  const knobGroup = new Group();
  knobGroup.name = 'RotaryKnob';
  knobGroup.position.set(0, 0.018, 0);

  const knobGeo = new CylinderGeometry(0.054, 0.054, 0.022, 24);
  const knobMesh = new Mesh(knobGeo, knobMaterial);
  knobMesh.name = 'KnobMesh';
  knobMesh.position.set(0, 0.011, 0);
  knobGroup.add(knobMesh);

  // Pointer notch on knob top edge
  const notchGeo = new BoxGeometry(0.006, 0.004, 0.024);
  const notchMesh = new Mesh(notchGeo, pointerMaterial);
  notchMesh.name = 'DialNotch';
  notchMesh.position.set(0, 0.023, -0.038);
  knobGroup.add(notchMesh);

  // 12 tactile tick markers around knob top
  const tickGeo = new BoxGeometry(0.003, 0.002, 0.008);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const tick = new Mesh(tickGeo, baseMaterial);
    tick.position.set(
      Math.sin(angle) * 0.046,
      0.0225,
      Math.cos(angle) * 0.046,
    );
    tick.rotation.y = angle;
    knobGroup.add(tick);
  }

  root.add(knobGroup);

  return root;
}
