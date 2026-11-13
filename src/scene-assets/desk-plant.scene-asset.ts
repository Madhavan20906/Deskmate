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
 * Procedural low-poly 3D desk plant:
 * - Ceramic terracotta pot with rim
 * - Rich dark soil disc
 * - Multi-tiered articulated stem and lush leaves
 * - Milestone bloom flower that unfolds at Bloom/Canopy stages
 */
export function createDeskPlantAsset(): Object3D {
  const root = new Group();
  root.name = 'desk-plant';

  // Shared reusable materials
  const potMaterial = new MeshStandardMaterial({
    color: 0xd9825b, // Warm terracotta
    roughness: 0.75,
    metalness: 0.05,
  });

  const soilMaterial = new MeshStandardMaterial({
    color: 0x2e1f14, // Dark potting soil
    roughness: 0.95,
    metalness: 0.0,
  });

  const stemMaterial = new MeshStandardMaterial({
    color: 0x388e3c, // Forest green stem
    roughness: 0.6,
    metalness: 0.05,
  });

  const leafMaterial = new MeshStandardMaterial({
    color: 0x4caf50, // Vibrant foliage green
    roughness: 0.45,
    metalness: 0.05,
    side: DoubleSide,
  });

  const flowerCoreMaterial = new MeshStandardMaterial({
    color: 0xffeb3b, // Golden yellow center
    roughness: 0.4,
    metalness: 0.1,
    emissive: 0xffd54f,
    emissiveIntensity: 0.3,
  });

  const petalMaterial = new MeshStandardMaterial({
    color: 0xff6b81, // Coral pink bloom petals
    roughness: 0.5,
    metalness: 0.05,
    side: DoubleSide,
    emissive: 0xff4081,
    emissiveIntensity: 0.2,
  });

  // 1. Ceramic Pot (height: 0.08m, radius: 0.04m -> 0.05m)
  const potGeo = new CylinderGeometry(0.048, 0.036, 0.08, 14);
  const potMesh = new Mesh(potGeo, potMaterial);
  potMesh.name = 'plant-pot';
  potMesh.position.set(0, 0.04, 0);
  root.add(potMesh);

  // Pot rim collar
  const rimGeo = new CylinderGeometry(0.052, 0.05, 0.015, 14);
  const rimMesh = new Mesh(rimGeo, potMaterial);
  rimMesh.position.set(0, 0.075, 0);
  root.add(rimMesh);

  // 2. Soil Surface Disc
  const soilGeo = new CylinderGeometry(0.044, 0.044, 0.008, 14);
  const soilMesh = new Mesh(soilGeo, soilMaterial);
  soilMesh.name = 'plant-soil';
  soilMesh.position.set(0, 0.076, 0);
  root.add(soilMesh);

  // 3. Dynamic Stem Group (sways on hand proximity and perks up on tasks)
  const stemGroup = new Group();
  stemGroup.name = 'plant-stem-group';
  stemGroup.position.set(0, 0.078, 0);
  root.add(stemGroup);

  // Lower stem segment
  const stemLowerGeo = new CylinderGeometry(0.005, 0.007, 0.06, 8);
  const stemLowerMesh = new Mesh(stemLowerGeo, stemMaterial);
  stemLowerMesh.position.set(0, 0.03, 0);
  stemGroup.add(stemLowerMesh);

  // Upper stem segment
  const stemUpperGeo = new CylinderGeometry(0.004, 0.005, 0.06, 8);
  const stemUpperMesh = new Mesh(stemUpperGeo, stemMaterial);
  stemUpperMesh.position.set(0, 0.085, 0);
  stemGroup.add(stemUpperMesh);

  // 4. Stylized Leaves (tier 1 lower, tier 2 mid, tier 3 high)
  const leafGeo = new SphereGeometry(0.024, 6, 6);
  leafGeo.scale(1.0, 0.2, 2.2); // Flatten into leaf blade

  const leafConfigs = [
    // Tier 1 (Lower leaves)
    { pos: [0.015, 0.035, 0.015], rot: [0.4, 0.2, -0.6], scale: [1.0, 1.0, 1.1] },
    { pos: [-0.018, 0.04, -0.01], rot: [-0.5, 2.1, 0.6], scale: [1.1, 1.0, 1.2] },
    { pos: [0.012, 0.045, -0.02], rot: [-0.3, -1.8, -0.5], scale: [0.9, 1.0, 1.0] },
    // Tier 2 (Mid leaves)
    { pos: [-0.01, 0.07, 0.02], rot: [0.5, 0.8, 0.5], scale: [1.2, 1.0, 1.3] },
    { pos: [0.02, 0.075, -0.01], rot: [-0.4, -0.7, -0.6], scale: [1.1, 1.0, 1.2] },
    { pos: [-0.02, 0.085, -0.015], rot: [-0.3, 2.8, 0.4], scale: [1.0, 1.0, 1.1] },
    // Tier 3 (Upper tender leaves)
    { pos: [0.01, 0.105, 0.01], rot: [0.3, 0.4, -0.4], scale: [0.85, 1.0, 0.95] },
    { pos: [-0.01, 0.11, -0.01], rot: [-0.3, -2.5, 0.4], scale: [0.85, 1.0, 0.95] },
  ];

  leafConfigs.forEach((cfg, idx) => {
    const leaf = new Mesh(leafGeo, leafMaterial);
    leaf.name = `plant-leaf-${idx + 1}`;
    leaf.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    leaf.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
    leaf.scale.set(cfg.scale[0], cfg.scale[1], cfg.scale[2]);
    stemGroup.add(leaf);
  });

  // 5. Milestone Bloom Flower Group (at the apex of the stem)
  const flowerGroup = new Group();
  flowerGroup.name = 'plant-flower-group';
  flowerGroup.position.set(0, 0.118, 0);
  // Default scale starts at small bud, scales up dynamically to 1.0 at Bloom/Canopy
  flowerGroup.scale.set(0.15, 0.15, 0.15);
  stemGroup.add(flowerGroup);

  // Flower center core
  const coreGeo = new SphereGeometry(0.009, 8, 8);
  const coreMesh = new Mesh(coreGeo, flowerCoreMaterial);
  flowerGroup.add(coreMesh);

  // Radiating petals
  const petalGeo = new SphereGeometry(0.012, 6, 6);
  petalGeo.scale(0.8, 0.25, 1.8);

  const petalCount = 6;
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    const petal = new Mesh(petalGeo, petalMaterial);
    petal.name = `flower-petal-${i + 1}`;
    petal.position.set(Math.cos(angle) * 0.014, 0.002, Math.sin(angle) * 0.014);
    petal.rotation.set(0.35, -angle + Math.PI / 2, 0);
    flowerGroup.add(petal);
  }

  return root;
}
