import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from '@iwsdk/core';

/**
 * Procedural low-poly 3D Focus Lamp:
 * - Weighted modern matte charcoal base with physical toggle switch
 * - Articulated brass/aluminum dual-segment arm and elbow joints
 * - Angled lampshade focusing downward
 * - Warm emissive bulb with dynamic state (on/off)
 * - Projected desk light pool disc illuminating the work surface during sprint
 */
export function createFocusLampAsset(): Object3D {
  const root = new Group();
  root.name = 'focus-lamp';

  // Shared reusable materials
  const baseMaterial = new MeshStandardMaterial({
    color: 0x24282f, // Matte slate charcoal
    roughness: 0.5,
    metalness: 0.35,
  });

  const armMaterial = new MeshStandardMaterial({
    color: 0xc89b58, // Brushed warm brass
    roughness: 0.3,
    metalness: 0.7,
  });

  const buttonMaterial = new MeshStandardMaterial({
    color: 0xef4444, // Physical coral-red toggle cap
    roughness: 0.4,
    metalness: 0.1,
    emissive: 0xff6b6b,
    emissiveIntensity: 0.25,
  });

  const bulbMaterial = new MeshStandardMaterial({
    color: 0xfff6dd,
    roughness: 0.2,
    metalness: 0.0,
    emissive: 0xffe89e,
    emissiveIntensity: 0.0, // Starts off
  });

  const lightPoolMaterial = new MeshBasicMaterial({
    color: 0xfffae6,
    transparent: true,
    opacity: 0.0, // Starts hidden/off
    depthWrite: false,
  });

  // 1. Lamp Base
  const baseGeo = new CylinderGeometry(0.036, 0.04, 0.012, 16);
  const baseMesh = new Mesh(baseGeo, baseMaterial);
  baseMesh.name = 'lamp-base';
  baseMesh.position.set(0, 0.006, 0);
  root.add(baseMesh);

  // 2. Physical Poke Toggle Switch (on the lamp base)
  const switchCollarGeo = new CylinderGeometry(0.009, 0.009, 0.004, 12);
  const switchCollarMesh = new Mesh(switchCollarGeo, baseMaterial);
  switchCollarMesh.position.set(0, 0.013, 0.02);
  root.add(switchCollarMesh);

  const switchButtonGeo = new CylinderGeometry(0.0065, 0.0065, 0.008, 12);
  const switchButtonMesh = new Mesh(switchButtonGeo, buttonMaterial);
  switchButtonMesh.name = 'LampToggleButton';
  switchButtonMesh.position.set(0, 0.017, 0.02);
  root.add(switchButtonMesh);

  // 3. Lower Arm
  const armLowerGeo = new CylinderGeometry(0.004, 0.004, 0.12, 8);
  const armLowerMesh = new Mesh(armLowerGeo, armMaterial);
  armLowerMesh.position.set(0, 0.068, -0.012);
  armLowerMesh.rotation.x = -0.15;
  root.add(armLowerMesh);

  // Elbow Joint
  const elbowGeo = new SphereGeometry(0.0075, 8, 8);
  const elbowMesh = new Mesh(elbowGeo, armMaterial);
  elbowMesh.position.set(0, 0.128, -0.022);
  root.add(elbowMesh);

  // 4. Upper Arm (angling forward over desk)
  const armUpperGeo = new CylinderGeometry(0.0035, 0.0035, 0.13, 8);
  const armUpperMesh = new Mesh(armUpperGeo, armMaterial);
  armUpperMesh.position.set(0, 0.18, 0.02);
  armUpperMesh.rotation.x = 0.55;
  root.add(armUpperMesh);

  // Head Joint
  const headJointGeo = new SphereGeometry(0.007, 8, 8);
  const headJointMesh = new Mesh(headJointGeo, armMaterial);
  headJointMesh.position.set(0, 0.235, 0.065);
  root.add(headJointMesh);

  // 5. Lampshade
  const shadeGroup = new Group();
  shadeGroup.position.set(0, 0.23, 0.075);
  shadeGroup.rotation.x = 0.45; // Angles down toward desk work area
  root.add(shadeGroup);

  const shadeGeo = new CylinderGeometry(0.014, 0.038, 0.045, 16);
  const shadeMesh = new Mesh(shadeGeo, baseMaterial);
  shadeMesh.name = 'lamp-shade';
  shadeMesh.position.set(0, -0.02, 0);
  shadeGroup.add(shadeMesh);

  // 6. Warm Bulb
  const bulbGeo = new SphereGeometry(0.014, 10, 10);
  const bulbMesh = new Mesh(bulbGeo, bulbMaterial);
  bulbMesh.name = 'LampBulb';
  bulbMesh.position.set(0, -0.032, 0);
  shadeGroup.add(bulbMesh);

  // 7. Desk Light Pool (radiates warm glow directly on the desk beneath the lamp)
  const lightPoolGeo = new CylinderGeometry(0.18, 0.18, 0.001, 24);
  const lightPoolMesh = new Mesh(lightPoolGeo, lightPoolMaterial);
  lightPoolMesh.name = 'LampLightPool';
  lightPoolMesh.position.set(0, 0.0015, 0.09); // Directly under shade on desk surface
  root.add(lightPoolMesh);

  return root;
}
