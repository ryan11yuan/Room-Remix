import type { Dims, RoomState, Vec3 } from '@/lib/room/types';
import { AlignError, alignTap, nudgeAlignment, startAlign, type Alignment, type AlignState } from './alignment';
import type { RoomScene } from './RoomScene';
import { deleteScan, loadScan, saveScan, updateScanAlignment } from './scanStore';
import type { SplatLayer } from './SplatLayer';

export type ScanStatus =
  | { kind: 'none' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'ready'; fileName: string; count: number; aligned: boolean; stored: boolean; visible: boolean }
  | { kind: 'error'; message: string };
export type ScanUiStep = 'floor' | 'corners' | 'nudge' | null;
type Report = { status(s: ScanStatus): void; step(step: ScanUiStep, taps: number, hint: string | null): void };

/** Spec §8: scans above this many splats get a "may be slow on your phone" warning. */
export const SPLAT_WARN_COUNT = 1_500_000;

const UNREADABLE = "Couldn't read this scan. Use a .ply, .spz, .splat or .ksplat export.";
const SUPERSEDED = 'Scan load superseded'; // SplatLayer.load's rejection when a newer load or dispose() overtook it
const centre = (dims: Dims): Vec3 => ({ x: dims.length / 2, y: 0, z: dims.width / 2 });
const isSize = (d: number) => Number.isFinite(d) && d > 0;

/** Loads, aligns and keeps the room scan. Browser only; Spark is loaded the first time a scan is opened. */
export class ScanController {
  private layer: SplatLayer | null = null;
  private alignment: Alignment | null = null;
  private align: AlignState | null = null;
  private status: ScanStatus = { kind: 'none' };
  private bounds: { min: Vec3; max: Vec3 } | null = null;
  private latestDims: Dims | null = null; // from setRoom(): a scan that finishes loading crops to the room as it is now
  private cropKey: string | null = null; // the crop on the layer: null for none, else "LxWxH"
  private disposed = false;

  constructor(
    private readonly scene: RoomScene,
    private readonly report: Report,
  ) {}

  async restore(room: RoomState): Promise<void> {
    try {
      const stored = await loadScan();
      // Only fill an empty view: a file the user opened while this was reading (open() sets 'loading' first) wins.
      if (stored && !this.disposed && this.status.kind === 'none') {
        await this.show(stored.bytes, stored.fileName, stored.alignment, true, room.dims);
      }
    } catch {
      // nothing usable stored: start without a scan
    }
  }

  async open(file: File, room: RoomState): Promise<void> {
    // One load at a time: two overlapping layer loads could leave two meshes in the layer.
    if (this.status.kind === 'loading' || this.align) return;
    this.setStatus({ kind: 'loading', fileName: file.name });
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      this.setStatus({ kind: 'error', message: UNREADABLE });
      return;
    }
    // Shown as kept until the save says otherwise, so a slow save doesn't flash a "not kept" warning.
    if (!(await this.show(bytes, file.name, null, true, room.dims))) return;
    let stored = true;
    try {
      await saveScan({ fileName: file.name, bytes, alignment: null, savedAt: Date.now() });
    } catch {
      stored = false; // e.g. storage full: keep it for this session only
    }
    if (this.status.kind === 'ready') this.setStatus({ ...this.status, stored });
  }

  startAlignment(): void {
    if (!this.layer || !this.bounds) return;
    this.align = startAlign();
    this.layer.setAlignment(null);
    this.applyCrop(null);
    this.layer.setVisible(true);
    // The scan is on screen now, so the status must say so ("Hide scan" and the shell style follow it after Done or Cancel).
    if (this.status.kind === 'ready' && !this.status.visible) this.setStatus({ ...this.status, visible: true });
    this.scene.setShellStyle('hidden');
    this.scene.setRoomItemsVisible(false);
    this.scene.setScanTargets(this.layer.targets);
    this.scene.setTapMode('scan');
    this.scene.frameBox(this.bounds.min, this.bounds.max);
    this.reportStep(null);
  }

  tap(point: Vec3, room: RoomState): void {
    if (!this.align || this.align.step === 'nudge' || !this.bounds) return;
    // The scan's bounding-box centre is inside the room: it decides which way is up and which side is in.
    const { min, max } = this.bounds;
    const inside = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
    try {
      this.align = alignTap(this.align, point, inside, room.dims);
    } catch (error) {
      if (!(error instanceof AlignError)) throw error;
      if (error.retry) this.align = error.retry; // e.g. wrong wall: start the corner taps again
      return this.reportStep(error.message);
    }
    if (this.align.step === 'nudge') this.enterNudge(room);
    this.reportStep(null);
  }

  nudge(change: { yaw?: number; scale?: number; x?: number; z?: number }, room: RoomState): void {
    if (this.align?.step !== 'nudge') return;
    this.align = { step: 'nudge', alignment: nudgeAlignment(this.align.alignment, change, centre(room.dims)) };
    this.layer?.setAlignment(this.align.alignment);
  }

  async finish(room: RoomState): Promise<void> {
    if (this.align?.step !== 'nudge') return;
    this.alignment = this.align.alignment;
    this.align = null;
    this.endAlignment(room);
    try {
      await updateScanAlignment(this.alignment);
    } catch {
      // the alignment still applies for this session
    }
    if (this.status.kind === 'ready') this.setStatus({ ...this.status, aligned: true });
  }

  cancelAlignment(room: RoomState): void {
    if (!this.align) return;
    this.align = null;
    this.endAlignment(room);
  }

  setVisible(visible: boolean): void {
    if (!this.layer || this.status.kind !== 'ready') return;
    this.layer.setVisible(visible);
    this.setStatus({ ...this.status, visible });
    this.applyShell();
  }

  setRoom(room: RoomState): void {
    this.latestDims = room.dims;
    if (this.layer && this.alignment && !this.align) this.applyCrop(room.dims);
  }

  async remove(): Promise<void> {
    this.align = null;
    this.alignment = null;
    this.bounds = null;
    this.disposeLayer();
    this.scene.setTapMode('none');
    this.scene.setRoomItemsVisible(true);
    this.setStatus({ kind: 'none' });
    this.applyShell();
    this.reportStep(null);
    try {
      await deleteScan();
    } catch {
      // already gone
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disposeLayer();
  }

  /** Show bytes as the scan; false if Spark can't read them (with an error status) or a newer load or dispose() took over (silently). */
  private async show(bytes: ArrayBuffer, fileName: string, alignment: Alignment | null, stored: boolean, dims: Dims): Promise<boolean> {
    this.setStatus({ kind: 'loading', fileName });
    try {
      if (!this.layer) {
        const { SplatLayer } = await import('./SplatLayer');
        if (this.disposed) return false;
        this.layer = new SplatLayer(this.scene.renderer);
        this.cropKey = null;
        this.scene.addLayer(this.layer.group);
      }
      const layer = this.layer;
      const { count, min, max } = await layer.load(bytes, fileName);
      if (this.disposed || this.layer !== layer) return false;
      // An empty scan has infinite bounds, which would make the framing and the inside point NaN.
      if (count === 0 || ![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite)) throw new Error('Scan has no splats');
      this.bounds = { min, max };
      this.alignment = alignment;
      layer.setAlignment(alignment);
      this.applyCrop(alignment ? (this.latestDims ?? dims) : null);
      layer.setVisible(true);
      this.setStatus({ kind: 'ready', fileName, count, aligned: alignment !== null, stored, visible: true });
      this.applyShell();
      return true;
    } catch (error) {
      if (this.disposed || (error instanceof Error && error.message === SUPERSEDED)) return false; // a newer load owns the layer now
      this.disposeLayer();
      this.setStatus({ kind: 'error', message: UNREADABLE });
      this.applyShell();
      return false;
    }
  }

  private enterNudge(room: RoomState): void {
    if (this.align?.step !== 'nudge') return;
    this.layer?.setAlignment(this.align.alignment);
    this.scene.setShellStyle('outline');
    this.scene.setRoomItemsVisible(true);
    this.scene.setTapMode('none');
    this.scene.setCameraPreset(room, 'corner');
  }

  private endAlignment(room: RoomState): void {
    this.layer?.setAlignment(this.alignment);
    this.applyCrop(this.alignment ? room.dims : null);
    this.scene.setTapMode('none');
    this.scene.setRoomItemsVisible(true);
    this.applyShell();
    this.reportStep(null);
  }

  /** Crop the scan to the room. `room` changes on every drag frame, so the layer is only touched when the size really changes. */
  private applyCrop(dims: Dims | null): void {
    if (!this.layer) return;
    if (dims && !(isSize(dims.length) && isSize(dims.width) && isSize(dims.height))) return; // mid-edit: keep the previous crop
    const key = dims ? `${dims.length}x${dims.width}x${dims.height}` : null;
    if (key === this.cropKey) return;
    this.cropKey = key;
    this.layer.setCrop(dims);
  }

  private applyShell(): void {
    const showingAligned = this.status.kind === 'ready' && this.status.visible && this.alignment !== null;
    this.scene.setShellStyle(showingAligned ? 'outline' : 'tinted');
  }

  private reportStep(hint: string | null): void {
    if (this.disposed) return;
    const a = this.align;
    if (!a) return this.report.step(null, 0, hint);
    const taps = a.step === 'floor' ? a.floor.length : a.step === 'corners' ? a.corners.length : 0;
    this.report.step(a.step, taps, hint);
  }

  private setStatus(status: ScanStatus): void {
    this.status = status;
    if (!this.disposed) this.report.status(status); // a disposed controller's late updates mustn't reach the view that replaced it
  }

  private disposeLayer(): void {
    if (!this.layer) return;
    this.scene.removeLayer(this.layer.group);
    this.layer.dispose();
    this.layer = null;
    this.cropKey = null;
  }
}
