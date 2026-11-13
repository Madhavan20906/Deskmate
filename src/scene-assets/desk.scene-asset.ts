import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from '@iwsdk/core';

export function createDeskAsset(): Object3D {
  const root = new Group();
  root.name = 'ProceduralDesk';

  const woodMaterial = new MeshStandardMaterial({
    color: 0x1e2832,
    roughness: 0.5,
    metalness: 0.1,
  });

  const frameMaterial = new MeshStandardMaterial({
    color: 0x0f161c,
    roughness: 0.7,
    metalness: 0.4,
  });

  // Main desktop slab (width 1.5m, depth 0.8m, thickness 0.035m)
  const topGeo = new BoxGeometry(1.5, 0.035, 0.8);
  const topMesh = new Mesh(topGeo, woodMaterial);
  topMesh.position.set(0, 0.72, 0);
  topMesh.name = 'DeskTop';
  root.add(topMesh);

  // Beveled desk edge highlight
  const trimGeo = new BoxGeometry(1.52, 0.008, 0.82);
  const trimMesh = new Mesh(trimGeo, frameMaterial);
  trimMesh.position.set(0, 0.705, 0);
  trimMesh.name = 'DeskTrim';
  root.add(trimMesh);

  // Left and Right legs (trestle loop design)
  const legGeo = new BoxGeometry(0.04, 0.70, 0.7);
  const leftLeg = new Mesh(legGeo, frameMaterial);
  leftLeg.position.set(-0.68, 0.35, 0);
  leftLeg.name = 'DeskLeftLeg';
  root.add(leftLeg);

  const rightLeg = new Mesh(legGeo, frameMaterial);
  rightLeg.position.set(0.68, 0.35, 0);
  rightLeg.name = 'DeskRightLeg';
  root.add(rightLeg);

  // Back cross brace for stability
  const braceGeo = new BoxGeometry(1.32, 0.04, 0.02);
  const brace = new Mesh(braceGeo, frameMaterial);
  brace.position.set(0, 0.35, -0.32);
  brace.name = 'DeskBackBrace';
  root.add(brace);

  return root;
}
