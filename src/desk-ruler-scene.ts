/**
 * DeskMate: The Desk Ruler Scene & Visuals
 *
 * Implements the physical 3D Desk Ruler, tiles, trays, sun orb now marker,
 * summary capsule, free slot decals, and detail card.
 *
 * Rules:
 * - Zero per-frame allocations (R4)
 * - Shared geometries and materials
 * - Targets >= 4cm wide with >= 1.5cm gaps (R3)
 * - Text >= 14px equivalent at 0.6m (R7)
 * - Seated reach <= 0.65m radius (R8)
 * - Import Three.js from '@iwsdk/core'
 */

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Raycaster,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import {
  DEFAULT_SCALE_PER_HOUR,
  MIN_TILE_WIDTH_METERS,
  WORKDAY_END_MINUTE,
  WORKDAY_START_MINUTE,
  formatSummaryCapsule,
  getNowMarkerPosition,
  getTileVisualWidth,
  minuteToRulerX,
  rulerXToMinute,
  snapTo15Minutes,
  type FreeSlot,
  type SchedulePartitionResult,
  type ScheduledTileInput,
} from './schedule-ruler.js';

export interface TileClickEvent {
  taskId: string;
  slotIndex: number;
  isEndHandle: boolean;
  isFreeSlot: boolean;
  freeSlotMinutes?: number;
  isFixItButton?: boolean;
}

export class DeskRulerScene {
  public readonly root = new Group();

  // Positioning
  public readonly rulerCenter = new Vector3(0, 0.74, -0.48);
  private readonly scalePerHour = DEFAULT_SCALE_PER_HOUR; // 0.060m / hr -> 0.60m total length

  // Meshes & Groups
  private rulerBarMesh!: Mesh;
  private morningZoneMesh!: Mesh;
  private middayZoneMesh!: Mesh;
  private eveningZoneMesh!: Mesh;
  private hourNotchesGroup = new Group();
  private hourLabelsGroup = new Group();

  // Sun Orb Now marker
  private sunOrbMesh!: Mesh;
  private sunLightPoolMesh!: Mesh;
  private pastDimOverlayMesh!: Mesh;

  // Trays
  private trayGroup = new Group();
  private overflowGroup = new Group();
  private overflowFixItButton!: Mesh;
  private fixItCanvas!: HTMLCanvasElement;
  private fixItTexture!: CanvasTexture;

  // Summary capsule
  private summaryCapsuleMesh!: Mesh;
  private summaryCanvas!: HTMLCanvasElement;
  private summaryTexture!: CanvasTexture;

  // Ghost landing indicator & conflict outline
  private ghostLandingMesh!: Mesh;
  private conflictOutlineMesh!: Mesh;

  // Free slots pool
  private freeSlotsGroup = new Group();
  private freeSlotMeshes: Mesh[] = [];

  // Tile visual pool (Max 12 tiles)
  private tilesGroup = new Group();
  private tilePool: Array<{
    group: Group;
    baseMesh: Mesh;
    indicatorMesh: Mesh;
    resizeHandleMesh: Mesh;
    notchesGroup: Group;
    labelMesh: Mesh;
    canvas: HTMLCanvasElement;
    texture: CanvasTexture;
    taskId: string;
    slotIndex: number;
    visualWidth: number;
    trueWidth: number;
    startMinute: number;
    durationMinutes: number;
    isPadded: boolean;
    isHovered: boolean;
    isGrabbed: boolean;
    isResizing: boolean;
  }> = [];

  // Callbacks for interactions
  public onTileSelect: ((taskId: string) => void) | null = null;
  public onTileResize: ((taskId: string, newDuration: number) => void) | null = null;
  public onFreeSlotClick: ((minute: number) => void) | null = null;
  public onFixItClick: (() => void) | null = null;
  public onDetailAction: ((action: 'startFocus' | 'edit' | 'complete' | 'delete', taskId: string) => void) | null = null;
  public onConfirmPlan: (() => void) | null = null;
  public onCancelPlan: (() => void) | null = null;

  // Plan My Day Preview Group & Buttons
  private planPreviewGroup = new Group();
  private planPreviewTiles: Mesh[] = [];
  private confirmPlanBtn!: Mesh;
  private cancelPlanBtn!: Mesh;
  public isPlanPreviewActive = false;

  // Detail card
  private detailCardGroup = new Group();
  private detailCardCanvas!: HTMLCanvasElement;
  private detailCardTexture!: CanvasTexture;
  private detailCardMesh!: Mesh;
  private detailStartFocusBtn!: Mesh;
  private detailEditBtn!: Mesh;
  private detailCompleteBtn!: Mesh;
  private detailDeleteBtn!: Mesh;
  private detailCloseBtn!: Mesh;
  public detailCardVisible = false;
  public detailCardTaskId: string | null = null;

  // Shared Materials
  private matRulerBase!: MeshStandardMaterial;
  private matMorning!: MeshStandardMaterial;
  private matMidday!: MeshStandardMaterial;
  private matEvening!: MeshStandardMaterial;
  private matNotch!: MeshStandardMaterial;
  private matSunOrb!: MeshStandardMaterial;
  private matSunPool!: MeshBasicMaterial;
  private matGhostLanding!: MeshStandardMaterial;
  private matConflictOutline!: MeshStandardMaterial;
  private matFreeSlot!: MeshStandardMaterial;
  private matResizeHandle!: MeshStandardMaterial;
  private matResizeHandleActive!: MeshStandardMaterial;

  // Priority Materials
  private matCoralHigh!: MeshStandardMaterial;
  private matTealMedium!: MeshStandardMaterial;
  private matPurpleLow!: MeshStandardMaterial;
  private matCompleted!: MeshStandardMaterial;
  private matCoralFocus!: MeshStandardMaterial;
  private matTealFocus!: MeshStandardMaterial;
  private matPurpleFocus!: MeshStandardMaterial;

  // Shared Geometries
  private geoBoxUnit = new BoxGeometry(1, 1, 1);
  private geoSphereUnit = new SphereGeometry(1, 16, 16);
  private geoPlaneUnit = new PlaneGeometry(1, 1);

  // Reusable vectors for zero allocation
  private tempVec = new Vector3();
  private raycaster = new Raycaster();

  constructor() {
    this.root.name = 'DeskRulerScene';
    this.initMaterials();
    this.buildRulerBar();
    this.buildSunNowMarker();
    this.buildTrays();
    this.buildSummaryCapsule();
    this.buildGhostLandingAndConflict();
    this.buildTilePool();
    this.buildFreeSlotsPool();
    this.buildPlanPreview();
    this.buildDetailCard();
    this.setupEventListeners();

    // Position ruler root cleanly above the desk
    this.root.position.copy(this.rulerCenter);
  }

  private initMaterials(): void {
    this.matRulerBase = new MeshStandardMaterial({
      color: 0x16222c,
      roughness: 0.6,
      metalness: 0.3,
    });

    this.matMorning = new MeshStandardMaterial({
      color: 0x1c3545,
      roughness: 0.45,
      metalness: 0.2,
      emissive: 0x0d212d,
      emissiveIntensity: 0.4,
    });

    this.matMidday = new MeshStandardMaterial({
      color: 0x15393d,
      roughness: 0.45,
      metalness: 0.2,
      emissive: 0x092629,
      emissiveIntensity: 0.4,
    });

    this.matEvening = new MeshStandardMaterial({
      color: 0x272445,
      roughness: 0.45,
      metalness: 0.2,
      emissive: 0x16132d,
      emissiveIntensity: 0.4,
    });

    this.matNotch = new MeshStandardMaterial({
      color: 0x8aa5b5,
      roughness: 0.3,
      metalness: 0.8,
    });

    this.matSunOrb = new MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xfbbf24,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });

    this.matSunPool = new MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.35,
    });

    this.matGhostLanding = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.5,
      roughness: 0.2,
    });

    this.matConflictOutline = new MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.8,
    });

    this.matFreeSlot = new MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      metalness: 0.1,
    });

    this.matResizeHandle = new MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.4,
      metalness: 0.6,
    });

    this.matResizeHandleActive = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });

    // Priority materials
    this.matCoralHigh = new MeshStandardMaterial({
      color: 0xf87171,
      roughness: 0.35,
      metalness: 0.2,
    });

    this.matTealMedium = new MeshStandardMaterial({
      color: 0x2dd4bf,
      roughness: 0.35,
      metalness: 0.2,
    });

    this.matPurpleLow = new MeshStandardMaterial({
      color: 0xc084fc,
      roughness: 0.35,
      metalness: 0.2,
    });

    this.matCompleted = new MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
      metalness: 0.3,
    });

    // Focus state materials with pulse emission
    this.matCoralFocus = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xef4444,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    this.matTealFocus = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x14b8a6,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    this.matPurpleFocus = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xa855f7,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
  }

  private buildRulerBar(): void {
    const totalLength = 0.60; // 10 hours * 0.060m
    const rulerDepth = 0.055;
    const rulerHeight = 0.012;

    // Main structural bar
    const barGeo = new BoxGeometry(totalLength + 0.01, rulerHeight, rulerDepth + 0.006);
    this.rulerBarMesh = new Mesh(barGeo, this.matRulerBase);
    this.rulerBarMesh.name = 'RulerBarBase';
    this.rulerBarMesh.position.set(0, 0, 0);
    this.root.add(this.rulerBarMesh);

    // 3 Zone color washes
    // Morning: 08:00 - 11:30 (3.5 hr = 0.21m) -> x from -0.30 to -0.09 (center -0.195)
    const morningGeo = new BoxGeometry(0.21, 0.002, rulerDepth);
    this.morningZoneMesh = new Mesh(morningGeo, this.matMorning);
    this.morningZoneMesh.position.set(-0.195, rulerHeight / 2 + 0.001, 0);
    this.root.add(this.morningZoneMesh);

    // Midday: 11:30 - 14:30 (3.0 hr = 0.18m) -> x from -0.09 to +0.09 (center 0)
    const middayGeo = new BoxGeometry(0.18, 0.002, rulerDepth);
    this.middayZoneMesh = new Mesh(middayGeo, this.matMidday);
    this.middayZoneMesh.position.set(0, rulerHeight / 2 + 0.001, 0);
    this.root.add(this.middayZoneMesh);

    // Evening: 14:30 - 18:00 (3.5 hr = 0.21m) -> x from +0.09 to +0.30 (center +0.195)
    const eveningGeo = new BoxGeometry(0.21, 0.002, rulerDepth);
    this.eveningZoneMesh = new Mesh(eveningGeo, this.matEvening);
    this.eveningZoneMesh.position.set(0.195, rulerHeight / 2 + 0.001, 0);
    this.root.add(this.eveningZoneMesh);

    // Hour Notches and Labels
    this.hourNotchesGroup.name = 'HourNotches';
    this.hourLabelsGroup.name = 'HourLabels';

    const notchGeo = new BoxGeometry(0.0018, 0.0035, 0.016);
    const halfNotchGeo = new BoxGeometry(0.0012, 0.0022, 0.009);

    for (let h = 8; h <= 18; h++) {
      const minute = h * 60;
      const x = minuteToRulerX(minute, 0, this.scalePerHour);

      // Hour notch
      const notch = new Mesh(notchGeo, this.matNotch);
      notch.position.set(x, rulerHeight / 2 + 0.002, -rulerDepth / 2 + 0.01);
      this.hourNotchesGroup.add(notch);

      // Half-hour tick
      if (h < 18) {
        const halfX = minuteToRulerX(minute + 30, 0, this.scalePerHour);
        const halfNotch = new Mesh(halfNotchGeo, this.matNotch);
        halfNotch.position.set(halfX, rulerHeight / 2 + 0.0015, -rulerDepth / 2 + 0.006);
        this.hourNotchesGroup.add(halfNotch);
      }

      // Hour label plaque
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 128;
      labelCanvas.height = 64;
      const ctx = labelCanvas.getContext('2d')!;
      ctx.fillStyle = '#101a22';
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${String(h).padStart(2, '0')}:00`, 64, 32);

      const labelTex = new CanvasTexture(labelCanvas);
      const labelMat = new MeshBasicMaterial({ map: labelTex });
      const labelGeo = new PlaneGeometry(0.038, 0.016);
      labelGeo.rotateX(-Math.PI / 2);
      const labelMesh = new Mesh(labelGeo, labelMat);
      labelMesh.position.set(x, rulerHeight / 2 + 0.002, rulerDepth / 2 - 0.012);
      this.hourLabelsGroup.add(labelMesh);
    }

    this.root.add(this.hourNotchesGroup);
    this.root.add(this.hourLabelsGroup);
  }

  private buildSunNowMarker(): void {
    // Glowing sun orb
    const orbGeo = new SphereGeometry(0.012, 16, 16);
    this.sunOrbMesh = new Mesh(orbGeo, this.matSunOrb);
    this.sunOrbMesh.name = 'SunNowOrb';
    this.sunOrbMesh.position.set(0, 0.024, -0.01);
    this.root.add(this.sunOrbMesh);

    // Light pool on ruler
    const poolGeo = new CylinderGeometry(0.032, 0.032, 0.001, 24);
    this.sunLightPoolMesh = new Mesh(poolGeo, this.matSunPool);
    this.sunLightPoolMesh.name = 'SunLightPool';
    this.sunLightPoolMesh.position.set(0, 0.008, 0);
    this.root.add(this.sunLightPoolMesh);

    // Dim overlay for past time
    const pastGeo = new BoxGeometry(0.60, 0.0025, 0.055);
    const matDim = new MeshBasicMaterial({
      color: 0x05080c,
      transparent: true,
      opacity: 0.35,
    });
    this.pastDimOverlayMesh = new Mesh(pastGeo, matDim);
    this.pastDimOverlayMesh.name = 'PastDimOverlay';
    this.pastDimOverlayMesh.visible = false;
    this.root.add(this.pastDimOverlayMesh);
  }

  private buildTrays(): void {
    // Left Tray: Unscheduled Tasks
    const trayGeo = new BoxGeometry(0.14, 0.010, 0.16);
    const trayBaseMat = new MeshStandardMaterial({
      color: 0x141f27,
      roughness: 0.5,
      metalness: 0.4,
    });

    const leftTrayMesh = new Mesh(trayGeo, trayBaseMat);
    leftTrayMesh.position.set(-0.41, 0, 0);
    this.trayGroup.add(leftTrayMesh);

    // Left Tray Label
    const leftLabelCanvas = document.createElement('canvas');
    leftLabelCanvas.width = 256;
    leftLabelCanvas.height = 64;
    const lCtx = leftLabelCanvas.getContext('2d')!;
    lCtx.fillStyle = '#0f172a';
    lCtx.fillRect(0, 0, 256, 64);
    lCtx.fillStyle = '#94a3b8';
    lCtx.font = 'bold 26px sans-serif';
    lCtx.textAlign = 'center';
    lCtx.textBaseline = 'middle';
    lCtx.fillText('UNSCHEDULED TRAY', 128, 32);

    const leftLabelTex = new CanvasTexture(leftLabelCanvas);
    const leftLabelMesh = new Mesh(
      new PlaneGeometry(0.12, 0.028),
      new MeshBasicMaterial({ map: leftLabelTex }),
    );
    leftLabelMesh.geometry.rotateX(-Math.PI / 2);
    leftLabelMesh.position.set(-0.41, 0.006, -0.065);
    this.trayGroup.add(leftLabelMesh);
    this.root.add(this.trayGroup);

    // Right Tray: Doesn't Fit / Overflow
    const rightTrayMesh = new Mesh(trayGeo, trayBaseMat);
    rightTrayMesh.position.set(0.41, 0, 0);
    this.overflowGroup.add(rightTrayMesh);

    // Overflow Label
    const rightLabelCanvas = document.createElement('canvas');
    rightLabelCanvas.width = 256;
    rightLabelCanvas.height = 64;
    const rCtx = rightLabelCanvas.getContext('2d')!;
    rCtx.fillStyle = '#0f172a';
    rCtx.fillRect(0, 0, 256, 64);
    rCtx.fillStyle = '#f87171';
    rCtx.font = 'bold 26px sans-serif';
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'middle';
    rCtx.fillText('DOESN\'T FIT / OVERFLOW', 128, 32);

    const rightLabelTex = new CanvasTexture(rightLabelCanvas);
    const rightLabelMesh = new Mesh(
      new PlaneGeometry(0.12, 0.028),
      new MeshBasicMaterial({ map: rightLabelTex }),
    );
    rightLabelMesh.geometry.rotateX(-Math.PI / 2);
    rightLabelMesh.position.set(0.41, 0.006, -0.065);
    this.overflowGroup.add(rightLabelMesh);

    // "Fix it" One-Tap Button
    this.fixItCanvas = document.createElement('canvas');
    this.fixItCanvas.width = 256;
    this.fixItCanvas.height = 96;
    this.updateFixItButtonVisual(false);

    this.fixItTexture = new CanvasTexture(this.fixItCanvas);
    const fixItGeo = new BoxGeometry(0.10, 0.022, 0.038);
    this.overflowFixItButton = new Mesh(
      fixItGeo,
      new MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xb91c1c,
        emissiveIntensity: 0.6,
        roughness: 0.3,
      }),
    );
    this.overflowFixItButton.name = 'OverflowFixItButton';
    this.overflowFixItButton.position.set(0.41, 0.025, 0.05);

    const fixItLabelMesh = new Mesh(
      new PlaneGeometry(0.09, 0.032),
      new MeshBasicMaterial({ map: this.fixItTexture }),
    );
    fixItLabelMesh.geometry.rotateX(-Math.PI / 2);
    fixItLabelMesh.position.set(0, 0.012, 0);
    this.overflowFixItButton.add(fixItLabelMesh);

    this.overflowGroup.add(this.overflowFixItButton);
    this.overflowGroup.visible = true;
    this.root.add(this.overflowGroup);
  }

  private updateFixItButtonVisual(hasOverflow: boolean): void {
    const ctx = this.fixItCanvas.getContext('2d')!;
    ctx.fillStyle = hasOverflow ? '#b91c1c' : '#334155';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = hasOverflow ? '#fca5a5' : '#64748b';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 88);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FIX IT', 128, 48);
  }

  private buildSummaryCapsule(): void {
    this.summaryCanvas = document.createElement('canvas');
    this.summaryCanvas.width = 512;
    this.summaryCanvas.height = 96;
    this.updateSummaryCapsuleText('0h planned of 8h, 0 conflicts');

    this.summaryTexture = new CanvasTexture(this.summaryCanvas);
    const capsuleGeo = new BoxGeometry(0.28, 0.022, 0.014);
    const matCapsule = new MeshStandardMaterial({
      color: 0x131f28,
      roughness: 0.4,
      metalness: 0.5,
    });
    this.summaryCapsuleMesh = new Mesh(capsuleGeo, matCapsule);
    this.summaryCapsuleMesh.name = 'SummaryCapsule';
    this.summaryCapsuleMesh.position.set(0, 0.055, -0.025);

    const labelPlane = new Mesh(
      new PlaneGeometry(0.27, 0.020),
      new MeshBasicMaterial({ map: this.summaryTexture }),
    );
    labelPlane.geometry.rotateX(-Math.PI / 4); // Angled 45 deg toward seated user
    labelPlane.position.set(0, 0.008, 0.004);
    this.summaryCapsuleMesh.add(labelPlane);

    this.root.add(this.summaryCapsuleMesh);
  }

  public updateSummaryCapsuleText(text: string): void {
    const ctx = this.summaryCanvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 96);

    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 88);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 48);

    if (this.summaryTexture) {
      this.summaryTexture.needsUpdate = true;
    }
  }

  private buildGhostLandingAndConflict(): void {
    // Translucent landing spot ghost outline
    const ghostGeo = new BoxGeometry(0.06, 0.015, 0.044);
    this.ghostLandingMesh = new Mesh(ghostGeo, this.matGhostLanding);
    this.ghostLandingMesh.name = 'GhostLandingIndicator';
    this.ghostLandingMesh.visible = false;
    this.ghostLandingMesh.position.set(0, 0.015, 0);
    this.root.add(this.ghostLandingMesh);

    // Conflict shake red outline
    const conflictGeo = new BoxGeometry(0.062, 0.018, 0.046);
    this.conflictOutlineMesh = new Mesh(conflictGeo, this.matConflictOutline);
    this.conflictOutlineMesh.name = 'ConflictOutlineMesh';
    this.conflictOutlineMesh.visible = false;
    this.conflictOutlineMesh.position.set(0, 0.016, 0);
    this.root.add(this.conflictOutlineMesh);
  }

  private buildTilePool(): void {
    this.tilesGroup.name = 'TilesGroup';
    this.root.add(this.tilesGroup);

    // Pre-allocate 12 reusable tiles (zero runtime allocation!)
    for (let i = 0; i < 12; i++) {
      const tileGroup = new Group();
      tileGroup.name = `DeskRulerTile_${i}`;

      // Base slab mesh (default 1m box, scaled dynamically)
      const baseMesh = new Mesh(this.geoBoxUnit, this.matTealMedium);
      baseMesh.name = `TileBaseMesh_${i}`;
      tileGroup.add(baseMesh);

      // Duration indicator line (for 4.5cm padded short tasks)
      const indGeo = new BoxGeometry(0.003, 0.002, 0.038);
      const indMat = new MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x2dd4bf,
        emissiveIntensity: 0.8,
      });
      const indicatorMesh = new Mesh(indGeo, indMat);
      indicatorMesh.position.set(0, 0.009, 0);
      indicatorMesh.visible = false;
      tileGroup.add(indicatorMesh);

      // Priority notches group (1, 2, or 3 tactile stripes on left edge)
      const notchesGroup = new Group();
      notchesGroup.name = `TileNotches_${i}`;
      const notchGeo = new BoxGeometry(0.002, 0.004, 0.008);
      const notchMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });

      for (let n = 0; n < 3; n++) {
        const notch = new Mesh(notchGeo, notchMat);
        notch.position.set(0, 0.008, (n - 1) * 0.012);
        notchesGroup.add(notch);
      }
      tileGroup.add(notchesGroup);

      // Right-edge Resize Grip Handle
      const handleGeo = new CylinderGeometry(0.005, 0.005, 0.024, 12);
      handleGeo.rotateX(Math.PI / 2);
      const resizeHandleMesh = new Mesh(handleGeo, this.matResizeHandle);
      resizeHandleMesh.name = `TileResizeHandle_${i}`;
      resizeHandleMesh.position.set(0.02, 0.008, 0);
      tileGroup.add(resizeHandleMesh);

      // Top label canvas texture
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 96;
      const texture = new CanvasTexture(canvas);
      const labelMat = new MeshBasicMaterial({ map: texture });
      const labelPlane = new Mesh(this.geoPlaneUnit, labelMat);
      labelPlane.geometry.rotateX(-Math.PI / 2);
      labelPlane.position.set(0, 0.009, 0);
      tileGroup.add(labelPlane);

      tileGroup.visible = false;
      this.tilesGroup.add(tileGroup);

      this.tilePool.push({
        group: tileGroup,
        baseMesh,
        indicatorMesh,
        resizeHandleMesh,
        notchesGroup,
        labelMesh: labelPlane,
        canvas,
        texture,
        taskId: '',
        slotIndex: i,
        visualWidth: 0.06,
        trueWidth: 0.06,
        startMinute: 480,
        durationMinutes: 60,
        isPadded: false,
        isHovered: false,
        isGrabbed: false,
        isResizing: false,
      });
    }
  }

  private buildFreeSlotsPool(): void {
    this.freeSlotsGroup.name = 'FreeSlotsGroup';
    this.root.add(this.freeSlotsGroup);

    // Up to 8 free slots
    for (let i = 0; i < 8; i++) {
      const slotGeo = new BoxGeometry(1, 0.002, 0.046);
      const slotMesh = new Mesh(slotGeo, this.matFreeSlot);
      slotMesh.name = `FreeSlotMesh_${i}`;
      slotMesh.visible = false;
      this.freeSlotsGroup.add(slotMesh);
      this.freeSlotMeshes.push(slotMesh);
    }
  }

  private buildDetailCard(): void {
    this.detailCardGroup.name = 'TileDetailCardGroup';
    this.detailCardGroup.position.set(0, 0.12, 0.08);

    this.detailCardCanvas = document.createElement('canvas');
    this.detailCardCanvas.width = 512;
    this.detailCardCanvas.height = 320;
    this.detailCardTexture = new CanvasTexture(this.detailCardCanvas);

    // Card background
    const cardGeo = new BoxGeometry(0.32, 0.20, 0.012);
    const cardMat = new MeshStandardMaterial({
      color: 0x111c24,
      roughness: 0.5,
      metalness: 0.4,
    });
    this.detailCardMesh = new Mesh(cardGeo, cardMat);

    const textPlane = new Mesh(
      new PlaneGeometry(0.31, 0.19),
      new MeshBasicMaterial({ map: this.detailCardTexture }),
    );
    textPlane.position.set(0, 0, 0.007);
    this.detailCardMesh.add(textPlane);
    this.detailCardGroup.add(this.detailCardMesh);

    // Big Touch Action Buttons: [Start Focus], [Edit], [Complete], [Delete], [Close]
    const btnGeo = new BoxGeometry(0.075, 0.024, 0.016);
    const matBtnAction = new MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 });
    const matBtnEdit = new MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
    const matBtnDel = new MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    const matBtnClose = new MeshStandardMaterial({ color: 0x64748b, roughness: 0.3 });

    this.detailStartFocusBtn = new Mesh(btnGeo, matBtnAction);
    this.detailStartFocusBtn.name = 'DetailBtn_StartFocus';
    this.detailStartFocusBtn.position.set(-0.11, -0.07, 0.012);

    this.detailEditBtn = new Mesh(btnGeo, matBtnEdit);
    this.detailEditBtn.name = 'DetailBtn_Edit';
    this.detailEditBtn.position.set(-0.035, -0.07, 0.012);

    this.detailCompleteBtn = new Mesh(btnGeo, matBtnAction);
    this.detailCompleteBtn.name = 'DetailBtn_Complete';
    this.detailCompleteBtn.position.set(0.04, -0.07, 0.012);

    this.detailDeleteBtn = new Mesh(btnGeo, matBtnDel);
    this.detailDeleteBtn.name = 'DetailBtn_Delete';
    this.detailDeleteBtn.position.set(0.115, -0.07, 0.012);

    this.detailCloseBtn = new Mesh(new BoxGeometry(0.032, 0.024, 0.016), matBtnClose);
    this.detailCloseBtn.name = 'DetailBtn_Close';
    this.detailCloseBtn.position.set(0.135, 0.08, 0.012);

    this.detailCardGroup.add(
      this.detailStartFocusBtn,
      this.detailEditBtn,
      this.detailCompleteBtn,
      this.detailDeleteBtn,
      this.detailCloseBtn,
    );

    this.detailCardGroup.visible = false;
    this.root.add(this.detailCardGroup);
  }

  private createButtonCanvasTexture(text: string, accentColor: string): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 88);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 48);
    return new CanvasTexture(canvas);
  }

  private buildPlanPreview(): void {
    this.planPreviewGroup.name = 'PlanMyDayPreviewGroup';
    for (let i = 0; i < 6; i++) {
      const tileMesh = new Mesh(this.geoBoxUnit, this.matGhostLanding);
      tileMesh.visible = false;
      this.planPreviewGroup.add(tileMesh);
      this.planPreviewTiles.push(tileMesh);
    }

    // Large desk-edge Confirm and Cancel buttons
    const btnGeo = new BoxGeometry(0.12, 0.024, 0.042);
    this.confirmPlanBtn = new Mesh(
      btnGeo,
      new MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.8,
        roughness: 0.3,
      }),
    );
    this.confirmPlanBtn.name = 'ConfirmPlanButton';
    this.confirmPlanBtn.position.set(-0.08, 0.022, 0.06);

    const confirmTex = this.createButtonCanvasTexture('CONFIRM PLAN', '#10b981');
    const confirmLabel = new Mesh(new PlaneGeometry(0.11, 0.034), new MeshBasicMaterial({ map: confirmTex }));
    confirmLabel.geometry.rotateX(-Math.PI / 2);
    confirmLabel.position.set(0, 0.013, 0);
    this.confirmPlanBtn.add(confirmLabel);

    this.cancelPlanBtn = new Mesh(
      btnGeo,
      new MeshStandardMaterial({
        color: 0x64748b,
        emissive: 0x475569,
        emissiveIntensity: 0.6,
        roughness: 0.3,
      }),
    );
    this.cancelPlanBtn.name = 'CancelPlanButton';
    this.cancelPlanBtn.position.set(0.08, 0.022, 0.06);

    const cancelTex = this.createButtonCanvasTexture('CANCEL', '#64748b');
    const cancelLabel = new Mesh(new PlaneGeometry(0.11, 0.034), new MeshBasicMaterial({ map: cancelTex }));
    cancelLabel.geometry.rotateX(-Math.PI / 2);
    cancelLabel.position.set(0, 0.013, 0);
    this.cancelPlanBtn.add(cancelLabel);

    this.planPreviewGroup.add(this.confirmPlanBtn, this.cancelPlanBtn);
    this.planPreviewGroup.visible = false;
    this.root.add(this.planPreviewGroup);
  }

  public showPlanPreview(assignments: Array<{ taskId: string; startMinute: number; duration: number }>): void {
    this.isPlanPreviewActive = true;
    this.planPreviewGroup.visible = true;
    this.planPreviewTiles.forEach((t) => (t.visible = false));

    assignments.forEach((assignment, idx) => {
      if (idx >= this.planPreviewTiles.length) return;
      const mesh = this.planPreviewTiles[idx];
      const widthInfo = getTileVisualWidth(assignment.duration, this.scalePerHour, MIN_TILE_WIDTH_METERS);
      const x = minuteToRulerX(assignment.startMinute, 0, this.scalePerHour) + widthInfo.visualWidth / 2;
      mesh.scale.set(widthInfo.visualWidth, 0.018, 0.044);
      mesh.position.set(x, 0.018, 0);
      mesh.visible = true;
    });
  }

  public hidePlanPreview(): void {
    this.isPlanPreviewActive = false;
    this.planPreviewGroup.visible = false;
    this.planPreviewTiles.forEach((t) => (t.visible = false));
  }

  private setupEventListeners(): void {
    // Tile clicks
    for (const tile of this.tilePool) {
      tile.baseMesh.addEventListener('click', () => {
        if (!tile.taskId) return;
        this.onTileSelect?.(tile.taskId);
      });
      tile.resizeHandleMesh.addEventListener('click', () => {
        if (!tile.taskId) return;
        this.onTileResize?.(tile.taskId, tile.durationMinutes);
      });
    }

    // Free slots clicks
    this.freeSlotMeshes.forEach((slotMesh) => {
      slotMesh.addEventListener('click', () => {
        const localX = slotMesh.position.x;
        const approxMin = rulerXToMinute(localX, 0, this.scalePerHour);
        const snapped = snapTo15Minutes(approxMin);
        this.onFreeSlotClick?.(snapped);
      });
    });

    // Overflow "Fix it" button
    this.overflowFixItButton.addEventListener('click', () => {
      this.onFixItClick?.();
    });

    // Detail card action buttons
    this.detailStartFocusBtn.addEventListener('click', () => {
      if (this.detailCardTaskId) this.onDetailAction?.('startFocus', this.detailCardTaskId);
    });
    this.detailEditBtn.addEventListener('click', () => {
      if (this.detailCardTaskId) this.onDetailAction?.('edit', this.detailCardTaskId);
    });
    this.detailCompleteBtn.addEventListener('click', () => {
      if (this.detailCardTaskId) this.onDetailAction?.('complete', this.detailCardTaskId);
    });
    this.detailDeleteBtn.addEventListener('click', () => {
      if (this.detailCardTaskId) this.onDetailAction?.('delete', this.detailCardTaskId);
    });
    this.detailCloseBtn.addEventListener('click', () => {
      this.hideDetailCard();
    });

    // Plan My Day confirm & cancel
    this.confirmPlanBtn.addEventListener('click', () => {
      this.onConfirmPlan?.();
      this.hidePlanPreview();
    });
    this.cancelPlanBtn.addEventListener('click', () => {
      this.onCancelPlan?.();
      this.hidePlanPreview();
    });
  }

  /**
   * Updates all 3D tiles, trays, and free slots based on partitioned schedule data.
   */
  public updateSchedule(
    partition: SchedulePartitionResult<ScheduledTileInput>,
    activeSprintTaskId: string | null = null,
    conflictTaskId: string | null = null,
  ): void {
    // 1. Hide all tiles initially
    this.tilePool.forEach((t) => {
      t.group.visible = false;
    });

    let poolIdx = 0;

    // 2. Render Ruler Tasks
    for (const task of partition.rulerTasks) {
      if (poolIdx >= this.tilePool.length) break;
      const tile = this.tilePool[poolIdx];
      poolIdx++;

      const startMin = task.scheduledStartMinute ?? 480;
      const durationMin = task.estimatedMinutes;
      const widthInfo = getTileVisualWidth(durationMin, this.scalePerHour, MIN_TILE_WIDTH_METERS);

      tile.taskId = task.id;
      tile.startMinute = startMin;
      tile.durationMinutes = durationMin;
      tile.visualWidth = widthInfo.visualWidth;
      tile.trueWidth = widthInfo.trueWidth;
      tile.isPadded = widthInfo.isMinWidthPadded;

      const x = minuteToRulerX(startMin, 0, this.scalePerHour) + widthInfo.visualWidth / 2;
      const isFocused = task.id === activeSprintTaskId;

      // Position tile on ruler surface (lift slightly if grabbed)
      const lift = tile.isGrabbed ? 0.012 : (tile.isHovered ? 0.004 : 0);
      tile.group.position.set(x, 0.006 + 0.008 + lift, 0);

      // Scale base mesh to visual width
      tile.baseMesh.scale.set(widthInfo.visualWidth, 0.016, 0.042);

      // Select material based on priority & focus
      tile.baseMesh.material = this.getTileMaterial(task.priority, task.status, isFocused);

      // Notches (2nd cue for priority)
      const notchCount = task.priority === 'high' ? 3 : (task.priority === 'medium' ? 2 : 1);
      tile.notchesGroup.children.forEach((n, idx) => {
        n.visible = idx < notchCount;
        n.position.set(-widthInfo.visualWidth / 2 + 0.004, 0.008, (idx - (notchCount - 1) / 2) * 0.011);
      });

      // Duration indicator line on tile top surface for short padded tasks
      tile.indicatorMesh.visible = widthInfo.isMinWidthPadded;
      if (widthInfo.isMinWidthPadded) {
        tile.indicatorMesh.position.set(-widthInfo.visualWidth / 2 + widthInfo.trueWidth, 0.009, 0);
      }

      // Resize handle on right edge
      tile.resizeHandleMesh.position.set(widthInfo.visualWidth / 2 - 0.003, 0.008, 0);
      tile.resizeHandleMesh.material = tile.isResizing ? this.matResizeHandleActive : this.matResizeHandle;

      // Label plane sizing & texture
      tile.labelMesh.scale.set(widthInfo.visualWidth - 0.006, 0.036, 1);
      this.drawTileCanvas(tile.canvas, task.title || 'Task', durationMin, task.priority, task.status);
      tile.texture.needsUpdate = true;

      tile.group.visible = true;
    }

    // 3. Render Tray Tasks (Unscheduled, stacked in Left Tray)
    partition.trayTasks.forEach((task, idx) => {
      if (poolIdx >= this.tilePool.length) return;
      const tile = this.tilePool[poolIdx];
      poolIdx++;

      const durationMin = task.estimatedMinutes;
      const widthInfo = getTileVisualWidth(durationMin, this.scalePerHour, MIN_TILE_WIDTH_METERS);

      tile.taskId = task.id;
      tile.startMinute = -1;
      tile.durationMinutes = durationMin;
      tile.visualWidth = widthInfo.visualWidth;
      tile.trueWidth = widthInfo.trueWidth;
      tile.isPadded = widthInfo.isMinWidthPadded;

      const lift = tile.isGrabbed ? 0.012 : 0;
      // Stack along Z in left tray
      tile.group.position.set(-0.41, 0.008 + idx * 0.018 + lift, -0.03 + idx * 0.02);
      tile.baseMesh.scale.set(widthInfo.visualWidth, 0.016, 0.038);
      tile.baseMesh.material = this.getTileMaterial(task.priority, task.status, false);

      tile.resizeHandleMesh.visible = false;
      tile.indicatorMesh.visible = false;
      tile.notchesGroup.visible = true;

      tile.labelMesh.scale.set(widthInfo.visualWidth - 0.004, 0.032, 1);
      this.drawTileCanvas(tile.canvas, task.title || 'Task', durationMin, task.priority, task.status);
      tile.texture.needsUpdate = true;
      tile.group.visible = true;
    });

    // 4. Render Overflow Tasks (Right Tray)
    partition.overflowTasks.forEach((task, idx) => {
      if (poolIdx >= this.tilePool.length) return;
      const tile = this.tilePool[poolIdx];
      poolIdx++;

      const durationMin = task.estimatedMinutes;
      const widthInfo = getTileVisualWidth(durationMin, this.scalePerHour, MIN_TILE_WIDTH_METERS);

      tile.taskId = task.id;
      tile.startMinute = -2;
      tile.durationMinutes = durationMin;
      tile.visualWidth = widthInfo.visualWidth;

      const lift = tile.isGrabbed ? 0.012 : 0;
      tile.group.position.set(0.41, 0.008 + idx * 0.018 + lift, -0.03 + idx * 0.02);
      tile.baseMesh.scale.set(widthInfo.visualWidth, 0.016, 0.038);
      tile.baseMesh.material = this.matCoralHigh; // Reddish overflow indicator

      tile.resizeHandleMesh.visible = false;
      tile.indicatorMesh.visible = false;

      tile.labelMesh.scale.set(widthInfo.visualWidth - 0.004, 0.032, 1);
      this.drawTileCanvas(tile.canvas, task.title || 'Task', durationMin, task.priority, 'overflow');
      tile.texture.needsUpdate = true;
      tile.group.visible = true;
    });

    // 5. Update Overflow "Fix it" button
    const hasOverflow = partition.exceedsCapacity || partition.hasWorkdayOverflow;
    this.updateFixItButtonVisual(hasOverflow);
    this.fixItTexture.needsUpdate = true;
    (this.overflowFixItButton.material as MeshStandardMaterial).emissiveIntensity = hasOverflow ? 1.0 : 0.2;

    // 6. Update Summary Capsule text
    const conflictCount = conflictTaskId ? 1 : 0;
    const summaryText = formatSummaryCapsule(partition.totalScheduledMinutes, 480, conflictCount);
    this.updateSummaryCapsuleText(summaryText);

    // 7. Render Free Slots between ruler tasks
    this.updateFreeSlots(partition.rulerTasks);
  }

  private getTileMaterial(priority?: string, status?: string, isFocused?: boolean): MeshStandardMaterial {
    if (status === 'completed') return this.matCompleted;
    if (isFocused) {
      if (priority === 'high') return this.matCoralFocus;
      if (priority === 'low') return this.matPurpleFocus;
      return this.matTealFocus;
    }
    if (priority === 'high') return this.matCoralHigh;
    if (priority === 'low') return this.matPurpleLow;
    return this.matTealMedium;
  }

  private drawTileCanvas(
    canvas: HTMLCanvasElement,
    title: string,
    durationMinutes: number,
    priority?: string,
    status?: string,
  ): void {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark readable background with subtle pill border
    ctx.fillStyle = status === 'completed' ? '#1e293b' : '#09131a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = status === 'completed' ? '#64748b' : (priority === 'high' ? '#f87171' : (priority === 'low' ? '#c084fc' : '#2dd4bf'));
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    // Task Title (bold, crisp >= 14px equivalent, 28px in canvas)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const shortTitle = title.length > 15 ? `${title.slice(0, 14)}…` : title;
    ctx.fillText(shortTitle, 16, 12);

    // Duration & Priority Tag
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 22px sans-serif';
    const durText = durationMinutes >= 60 ? `${(durationMinutes / 60).toFixed(1).replace('.0', '')}h` : `${durationMinutes}m`;
    const priText = (priority || 'MED').toUpperCase();
    ctx.fillText(`${durText} · ${priText}`, 16, 52);

    if (status === 'completed') {
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('✓ DONE', 145, 52);
    }
  }

  private updateFreeSlots(rulerTasks: ScheduledTileInput[]): void {
    this.freeSlotMeshes.forEach((m) => {
      m.visible = false;
    });

    const scheduled = rulerTasks
      .filter((t) => typeof t.scheduledStartMinute === 'number')
      .map((t) => ({ startMinute: t.scheduledStartMinute!, duration: t.estimatedMinutes }))
      .sort((a, b) => a.startMinute - b.startMinute);

    let cursor = WORKDAY_START_MINUTE;
    let slotIdx = 0;

    for (const task of scheduled) {
      if (task.startMinute > cursor && slotIdx < this.freeSlotMeshes.length) {
        const gapMin = task.startMinute - cursor;
        const mesh = this.freeSlotMeshes[slotIdx];
        slotIdx++;

        const width = (gapMin / 60) * this.scalePerHour;
        const x = minuteToRulerX(cursor, 0, this.scalePerHour) + width / 2;

        mesh.position.set(x, 0.007, 0);
        mesh.scale.set(width - 0.002, 1, 1);
        mesh.visible = true;
      }
      cursor = Math.max(cursor, task.startMinute + task.duration);
    }

    if (cursor < WORKDAY_END_MINUTE && slotIdx < this.freeSlotMeshes.length) {
      const gapMin = WORKDAY_END_MINUTE - cursor;
      const mesh = this.freeSlotMeshes[slotIdx];
      const width = (gapMin / 60) * this.scalePerHour;
      const x = minuteToRulerX(cursor, 0, this.scalePerHour) + width / 2;

      mesh.position.set(x, 0.007, 0);
      mesh.scale.set(width - 0.002, 1, 1);
      mesh.visible = true;
    }
  }

  /**
   * Updates real-time Sun Now Marker position and past-time dimming.
   */
  public updateNowMarker(currentMinute: number, delta: number): void {
    const pos = getNowMarkerPosition(currentMinute, 0, this.scalePerHour);
    this.sunOrbMesh.position.x = pos.clampedX;
    this.sunLightPoolMesh.position.x = pos.clampedX;

    // Pulse the sun orb glow gently
    const timeSec = performance.now() * 0.002;
    const pulse = 1.2 + Math.sin(timeSec) * 0.25;
    (this.sunOrbMesh.material as MeshStandardMaterial).emissiveIntensity = pulse;

    // Past-time dimming overlay
    if (pos.isWithinWorkday) {
      const pastWidth = pos.clampedX - minuteToRulerX(WORKDAY_START_MINUTE, 0, this.scalePerHour);
      if (pastWidth > 0.01) {
        this.pastDimOverlayMesh.visible = true;
        this.pastDimOverlayMesh.scale.x = pastWidth / 0.60;
        this.pastDimOverlayMesh.position.x = minuteToRulerX(WORKDAY_START_MINUTE, 0, this.scalePerHour) + pastWidth / 2;
      } else {
        this.pastDimOverlayMesh.visible = false;
      }
    } else if (pos.isPastWorkday) {
      this.pastDimOverlayMesh.visible = true;
      this.pastDimOverlayMesh.scale.x = 1.0;
      this.pastDimOverlayMesh.position.x = 0;
    } else {
      this.pastDimOverlayMesh.visible = false;
    }
  }

  /**
   * Shows translucent ghost outline at snap landing position during pinch drag.
   */
  public showGhostLanding(minute: number, durationMinutes: number): void {
    const snapped = snapTo15Minutes(minute);
    const widthInfo = getTileVisualWidth(durationMinutes, this.scalePerHour, MIN_TILE_WIDTH_METERS);
    const x = minuteToRulerX(snapped, 0, this.scalePerHour) + widthInfo.visualWidth / 2;

    this.ghostLandingMesh.scale.set(widthInfo.visualWidth, 1, 1);
    this.ghostLandingMesh.position.set(x, 0.015, 0);
    this.ghostLandingMesh.visible = true;
  }

  public hideGhostLanding(): void {
    this.ghostLandingMesh.visible = false;
  }

  /**
   * Shows red outline and shake warning on conflict.
   */
  public showConflictOutline(minute: number, durationMinutes: number): void {
    const widthInfo = getTileVisualWidth(durationMinutes, this.scalePerHour, MIN_TILE_WIDTH_METERS);
    const x = minuteToRulerX(minute, 0, this.scalePerHour) + widthInfo.visualWidth / 2;

    this.conflictOutlineMesh.scale.set(widthInfo.visualWidth + 0.004, 1, 1);
    this.conflictOutlineMesh.position.set(x, 0.016, 0);
    this.conflictOutlineMesh.visible = true;
  }

  public hideConflictOutline(): void {
    this.conflictOutlineMesh.visible = false;
  }

  /**
   * Displays the interactive detail card for a poked task tile.
   */
  public showDetailCard(task: ScheduledTileInput): void {
    this.detailCardTaskId = task.id;
    this.detailCardVisible = true;
    this.detailCardGroup.visible = true;

    const ctx = this.detailCardCanvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 320);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 312);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(task.title || 'Task Details', 24, 48);

    // Time & Priority
    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px sans-serif';
    const timeText = task.scheduledStartMinute !== null && task.scheduledStartMinute >= 0
      ? `Scheduled: ${String(Math.floor(task.scheduledStartMinute / 60)).padStart(2, '0')}:${String(task.scheduledStartMinute % 60).padStart(2, '0')}`
      : 'Unscheduled';
    ctx.fillText(`${timeText} · ${task.estimatedMinutes}m · ${(task.priority || 'med').toUpperCase()}`, 24, 90);

    // Description
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '22px sans-serif';
    ctx.fillText(task.status === 'completed' ? 'Status: Completed' : 'Status: In Queue / Ready', 24, 140);

    // Button Labels
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText('[START FOCUS]', 30, 260);

    ctx.fillStyle = '#38bdf8';
    ctx.fillText('[EDIT]', 180, 260);

    ctx.fillStyle = '#22c55e';
    ctx.fillText('[DONE]', 280, 260);

    ctx.fillStyle = '#ef4444';
    ctx.fillText('[DELETE]', 380, 260);

    this.detailCardTexture.needsUpdate = true;
  }

  public hideDetailCard(): void {
    this.detailCardVisible = false;
    this.detailCardTaskId = null;
    this.detailCardGroup.visible = false;
  }

  /**
   * Raycast test for hands or ray interaction against tiles and controls.
   */
  public hitTest(rayOrigin: Vector3, rayDirection: Vector3): TileClickEvent | null {
    this.raycaster.set(rayOrigin, rayDirection);

    // 1. Check Detail Card action buttons first if visible
    if (this.detailCardVisible) {
      const detailHits = this.raycaster.intersectObjects([
        this.detailStartFocusBtn,
        this.detailEditBtn,
        this.detailCompleteBtn,
        this.detailDeleteBtn,
        this.detailCloseBtn,
      ]);
      if (detailHits.length > 0) {
        const hitName = detailHits[0].object.name;
        return {
          taskId: this.detailCardTaskId || '',
          slotIndex: -1,
          isEndHandle: false,
          isFreeSlot: false,
          isFixItButton: hitName === 'DetailBtn_Close' ? false : undefined,
        };
      }
    }

    // 2. Check "Fix it" button
    const fixItHits = this.raycaster.intersectObject(this.overflowFixItButton);
    if (fixItHits.length > 0) {
      return {
        taskId: '',
        slotIndex: -1,
        isEndHandle: false,
        isFreeSlot: false,
        isFixItButton: true,
      };
    }

    // 3. Check active tiles
    for (const tile of this.tilePool) {
      if (!tile.group.visible) continue;

      // Check resize handle first
      const handleHits = this.raycaster.intersectObject(tile.resizeHandleMesh);
      if (handleHits.length > 0) {
        return {
          taskId: tile.taskId,
          slotIndex: tile.slotIndex,
          isEndHandle: true,
          isFreeSlot: false,
        };
      }

      // Check tile base
      const baseHits = this.raycaster.intersectObject(tile.baseMesh);
      if (baseHits.length > 0) {
        return {
          taskId: tile.taskId,
          slotIndex: tile.slotIndex,
          isEndHandle: false,
          isFreeSlot: false,
        };
      }
    }

    // 4. Check free slots
    for (let i = 0; i < this.freeSlotMeshes.length; i++) {
      const slot = this.freeSlotMeshes[i];
      if (!slot.visible) continue;
      const slotHits = this.raycaster.intersectObject(slot);
      if (slotHits.length > 0) {
        const localX = slot.position.x;
        const approxMin = rulerXToMinute(localX, 0, this.scalePerHour);
        return {
          taskId: '',
          slotIndex: i,
          isEndHandle: false,
          isFreeSlot: true,
          freeSlotMinutes: snapTo15Minutes(approxMin),
        };
      }
    }

    return null;
  }

  public setTileHover(taskId: string, isHovered: boolean): void {
    const tile = this.tilePool.find((t) => t.taskId === taskId);
    if (tile) {
      tile.isHovered = isHovered;
    }
  }

  public setTileGrabbed(taskId: string, isGrabbed: boolean): void {
    const tile = this.tilePool.find((t) => t.taskId === taskId);
    if (tile) {
      tile.isGrabbed = isGrabbed;
    }
  }

  public setTileResizing(taskId: string, isResizing: boolean): void {
    const tile = this.tilePool.find((t) => t.taskId === taskId);
    if (tile) {
      tile.isResizing = isResizing;
    }
  }
}
