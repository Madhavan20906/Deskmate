import {
  Entity,
  Group,
  Quaternion,
  UIKitMLAsset,
  Vector3,
  XRPlane,
  createSystem,
} from '@iwsdk/core';

type DetectedPlane = {
  orientation: 'horizontal' | 'vertical';
  polygon: ReadonlyArray<{ x: number; z: number }>;
  semanticLabel?: string;
};

type WorkspacePlacement = {
  schemaVersion: 1;
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

type PlacementLoadResult = {
  placement: WorkspacePlacement | null;
  writable: boolean;
  message: string;
};

const PLACEMENT_STORAGE_KEY = 'deskmate.workspace-placement.v1';
const DEFAULT_WORKSPACE_POSITION = [0, 0, 0] as const;
const WORKSPACE_NODE_IDS = [
  'panel-left-tasks',
  'panel-hub',
  'panel-right-pip',
  'pip-robot',
  'panel-right-focus',
  'panel-edit-sheet',
] as const;

const isFiniteTuple = <T extends number>(
  value: unknown,
  length: number,
): value is T[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));

function isWorkspacePlacement(value: unknown): value is WorkspacePlacement {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1 &&
    isFiniteTuple(record.position, 3) &&
    isFiniteTuple(record.quaternion, 4);
}

function readWorkspacePlacement(): PlacementLoadResult {
  try {
    // Always clear stale or out-of-sync room placements so the desk and DeskMate start perfectly aligned in front of viewer
    window.localStorage.removeItem(PLACEMENT_STORAGE_KEY);
    return {
      placement: null,
      writable: true,
      message: 'Workspace aligned to your desk.',
    };
  } catch {
    return {
      placement: null,
      writable: false,
      message: '',
    };
  }
}

function polygonArea(polygon: DetectedPlane['polygon']): number {
  if (polygon.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    if (current === undefined || next === undefined) return 0;
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return Math.abs(twiceArea) / 2;
}

export class WorkspaceSystem extends createSystem({
  planes: { required: [XRPlane] },
}) {
  private workspaceRoot!: Group;
  private workspaceEntity!: Entity;
  private savedPlacement: WorkspacePlacement | null = null;
  private storageWritable = true;
  private viewerPosition = new Vector3();
  private planePosition = new Vector3();
  private placementPosition = new Vector3();
  private forward = new Vector3();
  private direction = new Vector3();
  private worldUp = new Vector3(0, 1, 0);
  private worldRotation = new Quaternion();
  private parentWorldRotation = new Quaternion();

  init(): void {
    const loadedPlacement = readWorkspacePlacement();
    this.savedPlacement = loadedPlacement.placement;
    this.storageWritable = loadedPlacement.writable;

    this.workspaceRoot = new Group();
    this.workspaceRoot.name = 'Deskmate Workspace Anchor';
    this.workspaceRoot.position.fromArray([...DEFAULT_WORKSPACE_POSITION]);
    this.workspaceEntity = this.world.createTransformEntity(this.workspaceRoot);
  }

  update(): void {
    if (this.savedPlacement !== null) {
      const [x, y, z] = this.savedPlacement.position;
      if (Math.abs(x) < 2.5 && y > -0.5 && y < 1.6 && Math.abs(z) < 2.5) {
        this.workspaceRoot.position.fromArray(this.savedPlacement.position);
        this.workspaceRoot.quaternion.fromArray(this.savedPlacement.quaternion);
      } else {
        this.workspaceRoot.position.fromArray([...DEFAULT_WORKSPACE_POSITION]);
        this.workspaceRoot.quaternion.identity();
      }
      this.savedPlacement = null;
    }
  }

  public pinToDesk(): void {
    if (this.xrManager.getSession() === null) return;
    const desk = this.findDeskPlane();
    if (desk === null) return;
    const deskObject = desk.object3D;
    const parent = this.workspaceRoot.parent;
    if (deskObject === undefined || parent === null) return;

    deskObject.getWorldPosition(this.placementPosition);
    this.world.camera.getWorldPosition(this.viewerPosition);
    const yaw = Math.atan2(
      this.viewerPosition.x - this.placementPosition.x,
      this.viewerPosition.z - this.placementPosition.z,
    );
    this.worldRotation.setFromAxisAngle(this.worldUp, yaw);
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(this.placementPosition);
    parent.getWorldQuaternion(this.parentWorldRotation);
    this.workspaceRoot.position.copy(this.placementPosition);
    this.workspaceRoot.quaternion
      .copy(this.parentWorldRotation.invert())
      .multiply(this.worldRotation);
  }

  public resetWorkspace(): void {
    this.workspaceRoot.position.fromArray([...DEFAULT_WORKSPACE_POSITION]);
    this.workspaceRoot.quaternion.identity();
    this.savedPlacement = null;
    if (this.storageWritable) {
      try {
        window.localStorage.removeItem(PLACEMENT_STORAGE_KEY);
      } catch {}
    }
  }

  private findDeskPlane(): Entity | null {
    this.world.camera.getWorldPosition(this.viewerPosition);
    this.world.camera.getWorldDirection(this.forward);
    let bestEntity: Entity | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as
        | DetectedPlane
        | undefined;
      const object = entity.object3D;
      if (
        plane?.orientation !== 'horizontal' ||
        object === undefined ||
        polygonArea(plane.polygon) < 0.25
      ) {
        continue;
      }

      const label = plane.semanticLabel?.toLowerCase() ?? '';
      if (label.includes('floor') || label.includes('ceiling')) continue;
      object.getWorldPosition(this.planePosition);
      if (this.planePosition.y < 0.4 || this.planePosition.y > 1.4) continue;

      this.direction.subVectors(this.planePosition, this.viewerPosition);
      const distance = this.direction.length();
      if (distance < 0.3 || distance > 2.5) continue;
      this.direction.normalize();
      const alignment = this.forward.dot(this.direction);
      if (alignment < 0.3) continue;

      const score = polygonArea(plane.polygon) * 2 + alignment * 2 - distance;
      if (score > bestScore) {
        bestScore = score;
        bestEntity = entity;
      }
    }
    return bestEntity;
  }
}
