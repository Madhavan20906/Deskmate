import {
  Entity,
  Group,
  Quaternion,
  UIKitMLAsset,
  Vector3,
  XRAnchor,
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
const DEFAULT_WORKSPACE_POSITION = [0, 0.75, -0.85] as const;
const WORKSPACE_NODE_IDS = [
  'workspace-desk',
  'pip-companion',
  'sprint-dial',
  'desk-plant',
  'focus-lamp',
  'workspace-dashboard',
  'task-card-roadmap',
  'task-card-design-review',
  'task-card-inbox',
  'task-card-slot-4',
  'task-card-slot-5',
  'task-card-slot-6',
  'welcome-panel',
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
    const stored = window.localStorage.getItem(PLACEMENT_STORAGE_KEY);
    if (stored === null) {
      return { placement: null, writable: true, message: '' };
    }

    const parsed: unknown = JSON.parse(stored);
    if (!isWorkspacePlacement(parsed)) {
      return {
        placement: null,
        writable: false,
        message: 'Saved desk position is invalid. Existing data is protected.',
      };
    }
    return {
      placement: parsed,
      writable: true,
      message: 'Restoring your saved desk workspace.',
    };
  } catch {
    return {
      placement: null,
      writable: false,
      message: 'Saved desk position is unavailable. Existing data is protected.',
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
  private statusLabel!: NonNullable<
    ReturnType<UIKitMLAsset['getElementById']>
  >;
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
    const dashboard = this.world.requireSceneObject<UIKitMLAsset>(
      'workspace-dashboard',
    );
    const pinButton = dashboard.getElementById('workspace-pin');
    const resetButton = dashboard.getElementById('workspace-reset');
    const statusLabel = dashboard.getElementById('workspace-anchor-status');
    if (pinButton == null || resetButton == null || statusLabel == null) {
      throw new Error('Workspace placement controls are missing from the dashboard.');
    }
    this.statusLabel = statusLabel;

    const loadedPlacement = readWorkspacePlacement();
    this.savedPlacement = loadedPlacement.placement;
    this.storageWritable = loadedPlacement.writable;
    this.setStatus(
      loadedPlacement.message ||
        'Workspace ready. Enter XR, look at a tabletop, then pin your desk.',
    );

    this.workspaceRoot = new Group();
    this.workspaceRoot.name = 'Deskmate Workspace Anchor';
    this.workspaceRoot.position.fromArray([...DEFAULT_WORKSPACE_POSITION]);
    this.workspaceEntity = this.world.createTransformEntity(this.workspaceRoot);

    for (const nodeId of WORKSPACE_NODE_IDS) {
      const object = this.world.getSceneObject(nodeId);
      if (object === undefined) {
        throw new Error(`Workspace scene node "${nodeId}" could not be found.`);
      }
      object.position.sub(this.workspaceRoot.position);
      this.workspaceRoot.add(object);
    }
    this.workspaceEntity.addComponent(XRAnchor);

    pinButton.name = 'Pin the workspace above the tabletop in view';
    resetButton.name = 'Reset the workspace to its default position';
    const pinWorkspace = () => this.pinToDesk();
    const resetWorkspace = () => this.resetWorkspace();
    pinButton.addEventListener('click', pinWorkspace);
    resetButton.addEventListener('click', resetWorkspace);
    this.cleanupFuncs.push(
      () => pinButton.removeEventListener('click', pinWorkspace),
      () => resetButton.removeEventListener('click', resetWorkspace),
    );
  }

  update(): void {
    if (
      this.savedPlacement !== null &&
      this.workspaceEntity.getValue(XRAnchor, 'attached')
    ) {
      this.workspaceRoot.position.fromArray(this.savedPlacement.position);
      this.workspaceRoot.quaternion.fromArray(this.savedPlacement.quaternion);
      this.savedPlacement = null;
      this.setStatus('Workspace restored to its saved room position.');
    }
  }

  private pinToDesk(): void {
    if (this.xrManager.getSession() === null) {
      this.setStatus('Enter XR to scan your room and pin the workspace to a desk.');
      return;
    }
    if (!this.workspaceEntity.getValue(XRAnchor, 'attached')) {
      this.setStatus('Room anchor is still settling. Try again in a moment.');
      return;
    }

    const desk = this.findDeskPlane();
    if (desk === null) {
      this.setStatus('No tabletop found in view. Look at a flat desk surface and try again.');
      return;
    }
    const deskObject = desk.object3D;
    const parent = this.workspaceRoot.parent;
    if (deskObject === undefined || parent === null) {
      this.setStatus('The desk surface is no longer available. Scan it and try again.');
      return;
    }

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
    this.persistWorkspacePosition('Workspace pinned above the detected desk.');
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
      if (distance > 3.5 || this.direction.normalize().dot(this.forward) < -0.1) {
        continue;
      }
      const namedDesk = label.includes('desk') || label.includes('table');
      const score =
        (namedDesk ? 3 : 0) +
        Math.min(polygonArea(plane.polygon), 2) -
        distance * 0.25 -
        Math.abs(this.planePosition.y - 0.75);
      if (score > bestScore) {
        bestScore = score;
        bestEntity = entity;
      }
    }
    return bestEntity;
  }

  private resetWorkspace(): void {
    this.workspaceRoot.position.fromArray([...DEFAULT_WORKSPACE_POSITION]);
    this.workspaceRoot.quaternion.identity();
    this.savedPlacement = null;
    if (!this.storageWritable) {
      this.setStatus('Workspace reset for this session. Saved room data is protected.');
      return;
    }
    try {
      window.localStorage.removeItem(PLACEMENT_STORAGE_KEY);
      this.setStatus('Workspace reset to its default position.');
    } catch {
      this.storageWritable = false;
      this.setStatus('Workspace reset for this session. Browser storage is unavailable.');
    }
  }

  private persistWorkspacePosition(message: string): void {
    if (!this.storageWritable) {
      this.setStatus(`${message} Saved room data is protected; this change is session-only.`);
      return;
    }
    const placement: WorkspacePlacement = {
      schemaVersion: 1,
      position: this.workspaceRoot.position.toArray(),
      quaternion: this.workspaceRoot.quaternion.toArray(),
    };
    try {
      window.localStorage.setItem(
        PLACEMENT_STORAGE_KEY,
        JSON.stringify(placement),
      );
      this.setStatus(`${message} Position saved on this browser.`);
    } catch {
      this.storageWritable = false;
      this.setStatus(`${message} Browser storage is unavailable; this change is session-only.`);
    }
  }

  private setStatus(message: string): void {
    this.statusLabel.setProperties({ text: message });
  }
}
