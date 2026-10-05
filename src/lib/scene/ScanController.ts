import type { Dims, RoomState, Vec3 } from '@/lib/room/types';
import { AlignError, alignTap, nudgeAlignment, startAlign, type Alignment, type AlignState } from './alignment';
import type { RoomScene } from './RoomScene';
import { deleteScan, loadScan, saveScan, updateScanAlignment, type StoredScan } from './scanStore';
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
const SIZE_FIRST = "Enter the room's size first.";
const SUPERSEDED = 'Scan load superseded'; // SplatLayer.load's rejection when a newer load or dispose() overtook it
const centre = (dims: Dims): Vec3 => ({ x: dims.length / 2, y: 0, z: dims.width / 2 });
const isSize = (d: number) => Number.isFinite(d) && d > 0;
/** A room size that is mid-edit (empty, zero, NaN) must never reach the alignment maths. */
const validDims = (dims: Dims) => isSize(dims.length) && isSize(dims.width) && isSize(dims.height);
const isFiniteAlignment = (a: Alignment) =>
  [...a.level, a.scale, a.yaw, a.offset.x, a.offset.y, a.offset.z].every(Number.isFinite);

/** Loads, aligns and keeps the room scan. Browser only; Spark is loaded the first time a scan is opened. */
export class ScanController {
  private layer: SplatLayer | null = null;
  private alignment: Alignment | null = null;
  private align: AlignState | null = null;
  private status: ScanStatus = { kind: 'none' };
  private bounds: { min: Vec3; max: Vec3 } | null = null;
  private latestDims: Dims | null = null; // from setRoom(): a scan that finishes loading crops to the room as it is now
  private cropKey: string | null = null; // the crop on the layer: null for none, else "LxWxH"
  private scanId = 0; // changes whenever the shown scan does, so a save that finishes late can tell it has been replaced
  private storedScan = false; // the shown scan is the one in storage (restored from it, or saved and still shown)
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
    } catch (error) {
      this.failLoad(error); // same as a scan Spark can't read: the old scan goes, the box view stays
      return;
    }
    if (!(await this.show(bytes, file.name, null, false, room.dims))) return;
    const id = this.scanId;
    // Shown as kept until the save says otherwise, so a slow save doesn't flash a "not kept" warning.
    const stored = await this.keep({ fileName: file.name, bytes, alignment: null, savedAt: Date.now() });
    if (id !== this.scanId) return; // another scan, or none, is on screen by now
    this.storedScan = stored;
    this.reportStored(stored);
    // Aligned while the save was still running: the stored copy doesn't have that alignment yet.
    if (stored && this.alignment) {
      const ok = await this.writeAlignment(this.alignment);
      if (id === this.scanId) this.reportStored(ok);
    }
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
    if (!validDims(room.dims)) return this.reportStep(SIZE_FIRST);
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
    if (this.align?.step !== 'nudge' || !validDims(room.dims)) return;
    const alignment = nudgeAlignment(this.align.alignment, change, centre(room.dims));
    if (!isFiniteAlignment(alignment)) return;
    this.align = { step: 'nudge', alignment };
    this.layer?.setAlignment(alignment);
  }

  async finish(room: RoomState): Promise<void> {
    if (this.align?.step !== 'nudge' || !validDims(room.dims)) return;
    const alignment = this.align.alignment;
    if (!isFiniteAlignment(alignment)) return this.reportStep("That alignment can't be used. Cancel and start again.");
    this.alignment = alignment;
    this.align = null;
    this.endAlignment(room);
    // Before any await, so " · not aligned yet" goes away together with the outline view.
    if (this.status.kind === 'ready') this.setStatus({ ...this.status, aligned: true });
    // Only the stored scan gets the alignment: while another scan is on screen, 'current' holds a different one.
    if (!this.storedScan) return;
    const id = this.scanId;
    const ok = await this.writeAlignment(alignment);
    if (id === this.scanId) this.reportStored(ok);
  }

  cancelAlignment(room: RoomState): void {
    if (!this.align) return;
    const picking = this.align.step !== 'nudge'; // the nudge step already put the camera on Corner
    this.align = null;
    this.endAlignment(room);
    // Picking points left the camera on the scan, in the scan's own units: bring it back to the room.
    if (picking && validDims(room.dims)) this.scene.setCameraPreset(room, 'corner');
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
      // the scan stays in storage and comes back the next time the page loads
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disposeLayer();
  }

  /** Show bytes as the scan; false if Spark can't read them (with an error status) or a newer load or dispose() took over (silently). */
  private async show(bytes: ArrayBuffer, fileName: string, alignment: Alignment | null, fromStorage: boolean, dims: Dims): Promise<boolean> {
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
      this.scanId++;
      this.storedScan = fromStorage; // a file just opened is stored only once keep() says so
      layer.setAlignment(alignment);
      this.applyCrop(alignment ? (this.latestDims ?? dims) : null);
      layer.setVisible(true);
      this.setStatus({ kind: 'ready', fileName, count, aligned: alignment !== null, stored: true, visible: true });
      this.applyShell();
      return true;
    } catch (error) {
      if (this.disposed || (error instanceof Error && error.message === SUPERSEDED)) return false; // a newer load owns the layer now
      this.failLoad(error);
      return false;
    }
  }

  /** A scan that can't be read: say so, drop the layer (the box view stays) and leave whatever is in storage alone. */
  private failLoad(error: unknown): void {
    if (this.disposed) return;
    console.warn('Could not read the room scan', error);
    this.disposeLayer();
    this.setStatus({ kind: 'error', message: UNREADABLE });
    this.applyShell();
  }

  /**
   * Keep the scan in storage. If saving fails, drop whatever was stored before (storage must never hold a scan other than
   * the one on screen; it may also free the room the save needed) and try once more.
   */
  private async keep(scan: StoredScan): Promise<boolean> {
    try {
      await saveScan(scan);
      return true;
    } catch {
      // fall through to the retry
    }
    try {
      await deleteScan();
    } catch {
      // nothing to drop, or it can't be dropped
    }
    try {
      await saveScan(scan);
      return true;
    } catch {
      return false;
    }
  }

  private async writeAlignment(alignment: Alignment): Promise<boolean> {
    try {
      await updateScanAlignment(alignment);
      return true;
    } catch {
      return false; // the alignment still applies for this session
    }
  }

  /** Show whether the scan on screen is in storage (" · only kept until you leave this page" when it isn't). */
  private reportStored(stored: boolean): void {
    if (this.status.kind === 'ready' && this.status.stored !== stored) this.setStatus({ ...this.status, stored });
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
    this.scene.setScanTargets([]);
    this.scene.setTapMode('none');
    this.scene.setRoomItemsVisible(true);
    this.applyShell();
    this.reportStep(null);
  }

  /** Crop the scan to the room. `room` changes on every drag frame, so the layer is only touched when the size really changes. */
  private applyCrop(dims: Dims | null): void {
    if (!this.layer) return;
    if (dims && !validDims(dims)) return; // mid-edit: keep the previous crop
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
    this.scene.setScanTargets([]);
    this.scene.removeLayer(this.layer.group);
    this.layer.dispose();
    this.layer = null;
    this.cropKey = null;
    this.scanId++;
    this.storedScan = false; // no scan is shown
  }
}
