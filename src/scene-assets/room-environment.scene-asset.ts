import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from '@iwsdk/core';

export interface RoomEnvironmentTheme {
  floorColor: number;
  floorRoughness: number;
  wallColor: number;
  accentWallColor: number;
  rugColor: number;
  artColor: number;
  chairColor: number;
  ambientLightColor: number;
}

export const ROOM_THEMES: Record<string, RoomEnvironmentTheme> = {
  living_room: {
    floorColor: 0xc89d66, // Warm natural oak
    floorRoughness: 0.45,
    wallColor: 0xf5f0e8, // Soft sunlit linen
    accentWallColor: 0xe8dfd1,
    rugColor: 0xdcd3c4, // Warm woven wool
    artColor: 0xd87a56, // Terracotta abstract circle
    chairColor: 0xd97c48, // Warm cinnamon armchair
    ambientLightColor: 0xfff6ea,
  },
  bedroom: {
    floorColor: 0x8a6240, // Cozy walnut
    floorRoughness: 0.55,
    wallColor: 0xddd7cc, // Muted taupe
    accentWallColor: 0x5a6875, // Soft slate accent
    rugColor: 0xb5afa4, // Plush grey-taupe
    artColor: 0x6e8898, // Muted botanical slate
    chairColor: 0x485868, // Slate upholstered armchair
    ambientLightColor: 0xffeed8,
  },
  kitchen: {
    floorColor: 0xd8d3cb, // Modern limestone terrazzo
    floorRoughness: 0.35,
    wallColor: 0xf8f8f6, // Crisp warm white
    accentWallColor: 0x2e5058, // Deep teal tile accent
    rugColor: 0xb0c0c2,
    artColor: 0x367c74, // Contemporary emerald geometry
    chairColor: 0x3b5f65, // Modern teal stool
    ambientLightColor: 0xf0f7ff,
  },
  office: {
    floorColor: 0x4a3220, // Rich executive espresso wood
    floorRoughness: 0.38,
    wallColor: 0xece9e3, // Clean studio white
    accentWallColor: 0x1a2c3d, // Executive navy accent
    rugColor: 0x2e3842, // Charcoal geometric wool
    artColor: 0x2b4c6f, // Deep indigo architectural art
    chairColor: 0x28333e, // Charcoal executive leather chair
    ambientLightColor: 0xf4f6fa,
  },
};

let activeRoomTheme: RoomEnvironmentTheme = ROOM_THEMES.living_room;
let floorMeshRef: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null;
let backWallMeshRef: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null;
let leftWallMeshRef: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null;
let rightWallMeshRef: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null;
let rugMeshRef: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null;
let artCanvasMeshRef: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null;
let armchairMeshRef: Mesh<BoxGeometry, MeshStandardMaterial> | null = null;

export function applyRoomEnvironmentTheme(themeKey: string): void {
  const theme = ROOM_THEMES[themeKey] ?? ROOM_THEMES.living_room;
  activeRoomTheme = theme;
  if (floorMeshRef) {
    floorMeshRef.material.color.setHex(theme.floorColor);
    floorMeshRef.material.roughness = theme.floorRoughness;
    floorMeshRef.material.needsUpdate = true;
  }
  if (backWallMeshRef) {
    backWallMeshRef.material.color.setHex(theme.accentWallColor);
    backWallMeshRef.material.needsUpdate = true;
  }
  if (leftWallMeshRef) {
    leftWallMeshRef.material.color.setHex(theme.wallColor);
    leftWallMeshRef.material.needsUpdate = true;
  }
  if (rightWallMeshRef) {
    rightWallMeshRef.material.color.setHex(theme.wallColor);
    rightWallMeshRef.material.needsUpdate = true;
  }
  if (rugMeshRef) {
    rugMeshRef.material.color.setHex(theme.rugColor);
    rugMeshRef.material.needsUpdate = true;
  }
  if (artCanvasMeshRef) {
    artCanvasMeshRef.material.color.setHex(theme.artColor);
    artCanvasMeshRef.material.needsUpdate = true;
  }
  if (armchairMeshRef) {
    armchairMeshRef.material.color.setHex(theme.chairColor);
    armchairMeshRef.material.needsUpdate = true;
  }
}

export function createRoomEnvironmentAsset(): Object3D {
  const root = new Group();
  root.name = 'RoomEnvironmentArchitecture';

  const theme = activeRoomTheme;

  // 1. Large architectural hardwood floor (10m x 10m)
  const floorGeo = new PlaneGeometry(10, 10);
  const floorMat = new MeshStandardMaterial({
    color: theme.floorColor,
    roughness: theme.floorRoughness,
    metalness: 0.05,
  });
  const floor = new Mesh(floorGeo, floorMat);
  floor.name = 'RoomFloor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  root.add(floor);
  floorMeshRef = floor;

  // 2. Room Ceiling (10m x 10m) at y = 3.6m
  const ceilingGeo = new PlaneGeometry(10, 10);
  const ceilingMat = new MeshStandardMaterial({
    color: 0xfdfdfd,
    roughness: 0.9,
    metalness: 0.0,
  });
  const ceiling = new Mesh(ceilingGeo, ceilingMat);
  ceiling.name = 'RoomCeiling';
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.6, 0);
  root.add(ceiling);

  // 3. Executive area rug under desk (3.0m x 2.2m)
  const rugGeo = new PlaneGeometry(3.0, 2.2);
  const rugMat = new MeshStandardMaterial({
    color: theme.rugColor,
    roughness: 0.92,
    metalness: 0.0,
  });
  const rug = new Mesh(rugGeo, rugMat);
  rug.name = 'RoomAreaRug';
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.002, -0.70); // Just above floor, centered under desk
  root.add(rug);
  rugMeshRef = rug;

  // 4. Back wall (10m x 3.6m) behind desk
  const wallGeo = new PlaneGeometry(10, 3.6);
  const wallMat = new MeshStandardMaterial({
    color: theme.accentWallColor,
    roughness: 0.85,
    metalness: 0.0,
  });
  const backWall = new Mesh(wallGeo, wallMat);
  backWall.name = 'RoomBackWall';
  backWall.position.set(0, 1.8, -2.6);
  root.add(backWall);
  backWallMeshRef = backWall;

  // 5. Baseboard trim along back wall
  const baseboardGeo = new BoxGeometry(10, 0.12, 0.02);
  const baseboardMat = new MeshStandardMaterial({
    color: 0xf5f5f5,
    roughness: 0.45,
  });
  const baseboard = new Mesh(baseboardGeo, baseboardMat);
  baseboard.name = 'RoomBaseboard';
  baseboard.position.set(0, 0.06, -2.59);
  root.add(baseboard);

  // 6. Left architectural wall (10m x 3.6m) with sunlit window frame
  const leftWallGeo = new PlaneGeometry(10, 3.6);
  const leftWallMat = new MeshStandardMaterial({
    color: theme.wallColor,
    roughness: 0.85,
  });
  const leftWall = new Mesh(leftWallGeo, leftWallMat);
  leftWall.name = 'RoomLeftWall';
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-4.5, 1.8, 0);
  root.add(leftWall);
  leftWallMeshRef = leftWall;

  // Window frame on left wall
  const windowFrameGeo = new BoxGeometry(0.04, 2.4, 3.2);
  const windowFrameMat = new MeshStandardMaterial({
    color: 0x242424,
    roughness: 0.4,
    metalness: 0.6,
  });
  const windowFrame = new Mesh(windowFrameGeo, windowFrameMat);
  windowFrame.name = 'RoomWindowFrame';
  windowFrame.position.set(-4.46, 1.9, -0.6);
  root.add(windowFrame);

  // Window glass / sunlit horizon daylight view
  const windowGlassGeo = new PlaneGeometry(3.1, 2.3);
  const windowGlassMat = new MeshBasicMaterial({
    color: 0xf2f8ff,
  });
  const windowGlass = new Mesh(windowGlassGeo, windowGlassMat);
  windowGlass.name = 'RoomWindowGlass';
  windowGlass.rotation.y = Math.PI / 2;
  windowGlass.position.set(-4.44, 1.9, -0.6);
  root.add(windowGlass);

  // 7. Right architectural wall (10m x 3.6m)
  const rightWallGeo = new PlaneGeometry(10, 3.6);
  const rightWallMat = new MeshStandardMaterial({
    color: theme.wallColor,
    roughness: 0.85,
  });
  const rightWall = new Mesh(rightWallGeo, rightWallMat);
  rightWall.name = 'RoomRightWall';
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(4.5, 1.8, 0);
  root.add(rightWall);
  rightWallMeshRef = rightWall;

  // 8. Framed modern art piece on back wall above the workstation
  const artFrameGeo = new BoxGeometry(1.8, 1.1, 0.03);
  const artFrameMat = new MeshStandardMaterial({
    color: 0x181818,
    roughness: 0.3,
    metalness: 0.5,
  });
  const artFrame = new Mesh(artFrameGeo, artFrameMat);
  artFrame.name = 'RoomArtFrame';
  artFrame.position.set(0, 2.45, -2.58);
  root.add(artFrame);

  // Canvas inside frame
  const artCanvasGeo = new PlaneGeometry(1.72, 1.02);
  const artCanvasMat = new MeshStandardMaterial({
    color: theme.artColor,
    roughness: 0.65,
  });
  const artCanvas = new Mesh(artCanvasGeo, artCanvasMat);
  artCanvas.name = 'RoomArtCanvas';
  artCanvas.position.set(0, 2.45, -2.56);
  root.add(artCanvas);
  artCanvasMeshRef = artCanvas;

  // 9. Modern accent armchair in background left corner (x = -2.1, z = -1.6)
  const chairGroup = new Group();
  chairGroup.name = 'RoomArmchairGroup';
  chairGroup.position.set(-2.2, 0, -1.6);
  chairGroup.rotation.y = Math.PI / 5; // Angled toward center

  const chairSeatGeo = new BoxGeometry(0.72, 0.38, 0.68);
  const chairMat = new MeshStandardMaterial({
    color: theme.chairColor,
    roughness: 0.85,
  });
  const chairSeat = new Mesh(chairSeatGeo, chairMat);
  chairSeat.position.set(0, 0.28, 0);
  chairGroup.add(chairSeat);
  armchairMeshRef = chairSeat;

  const chairBackGeo = new BoxGeometry(0.72, 0.58, 0.16);
  const chairBack = new Mesh(chairBackGeo, chairMat);
  chairBack.position.set(0, 0.68, -0.26);
  chairGroup.add(chairBack);

  root.add(chairGroup);

  // 10. Modern architectural floor lamp in background right corner (x = 2.0, z = -1.8)
  const lampGroup = new Group();
  lampGroup.name = 'RoomFloorLampGroup';
  lampGroup.position.set(2.1, 0, -1.8);

  const lampPoleGeo = new CylinderGeometry(0.018, 0.018, 1.75, 12);
  const lampPoleMat = new MeshStandardMaterial({
    color: 0x1f1f1f,
    roughness: 0.3,
    metalness: 0.8,
  });
  const lampPole = new Mesh(lampPoleGeo, lampPoleMat);
  lampPole.position.set(0, 0.88, 0);
  lampGroup.add(lampPole);

  const lampShadeGeo = new CylinderGeometry(0.24, 0.28, 0.36, 20);
  const lampShadeMat = new MeshStandardMaterial({
    color: 0xfdfbf7,
    roughness: 0.9,
    metalness: 0.0,
  });
  const lampShade = new Mesh(lampShadeGeo, lampShadeMat);
  lampShade.position.set(0, 1.70, 0);
  lampGroup.add(lampShade);

  root.add(lampGroup);

  // 11. Modern credenza console on the right wall (x = 2.4, z = -1.8)
  const credenzaGeo = new BoxGeometry(1.6, 0.65, 0.42);
  const credenzaMat = new MeshStandardMaterial({
    color: 0x2b221b, // Dark walnut console
    roughness: 0.5,
    metalness: 0.1,
  });
  const credenza = new Mesh(credenzaGeo, credenzaMat);
  credenza.name = 'RoomCredenza';
  credenza.position.set(2.8, 0.325, -2.35);
  root.add(credenza);

  return root;
}
