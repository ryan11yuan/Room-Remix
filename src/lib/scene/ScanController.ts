import type { Dims, RoomState, Vec3 } from '@/lib/room/types';
import { AlignError, alignTap, nudgeAlignment, startAlign, type Alignment, type AlignState } from './alignment';
import type { RoomScene } from './RoomScene';
import { deleteScan, loadScan, saveScan, updateScanAlignment, type StoredScan } from './scanStore';
import type { SplatLayer } from './SplatLayer';

export type ScanStatus =
  | { kind: 'none' }
  | { kind: 'loading'; fileName: string }
  | {
      kind: 'ready';
      fileName: string;
      count: number;
      aligned: boolean;
      stored: boolean; // the scan itself is kept on this device
      alignmentKept: boolean; // its alignment is kept too (false when only the alignment couldn't be written)
      visible: boolean;
    }
  | { kind: 'error'; message: string };
export type ScanUiStep = 'floor' | 'corners' | 'nudge' | null;
type Report = { status(s: ScanStatus): void; step(step: ScanUiStep, taps: number, hint: string | null): void };

/** Spec §8: scans above this many splats get a "may be slow on your phone" warning. */
export const SPLAT_WARN_COUNT = 1_500_000;

const UNREADABLE = "Couldn't read this scan. Use a .ply, .spz, .splat or .ksplat export.";
const SAVED_UNREADABLE = "Couldn't read your saved scan. Load it again or remove it."; // the scan kept on this device, not a file just picked
const INTERRUPTED = "Your saved scan didn't open last time. Load it again or remove it.";
const SIZE_FIRST = "Enter the room's size first.";
/** Holds the key of the room whose stored scan is being opened. Still there at the next start means the tab died (or was closed) mid-open. */
const RESTORING_KEY = 'room-remix:restoring';
const SUPERSEDED = 'Scan load superseded'; // SplatLayer.load's rejection when a newer load or dispose() overtook it
const centre = (dims: Dims): Vec3 => ({ x: dims.length / 2, y: 0, z: dims.width / 2 });
const isSize = (d: number) => Number.isFinite(d) && d > 0;
/** A room size that is mid-edit (empty, zero, NaN) must never reach the alignment maths. */
const validDims = (dims: Dims) => isSize(dims.length) && isSize(dims.width) && isSize(dims.height);
const isFiniteAlignment = (a: Alignment) =>
  [...a.level, a.scale, a.yaw, a.offset.x, a.offset.y, a.offset.z].every(Number.isFinite);
const isFiniteVec = (v: Vec3) => [v.x, v.y, v.z].every(Number.isFinite);

// localStorage can be missing or throw (blocked, full, private windows), and then restoring works as it did without the marker.
function setRestoreMarker(key: string): void {
  try {
    localStorage.setItem(RESTORING_KEY, key);
  } catch {
    // no marker: a crash loop can't be detected here
  }
}
function clearRestoreMarker(): void {
  try {
    localStorage.removeItem(RESTORING_KEY);
  } catch {
    // nothing to clear
  }
}
/**
 * Whether the last restore of this room's scan never finished. Clears the marker, so the start after this one tries
 * again. A marker left by another room stays for that room.
 */
function takeRestoreMarker(key: string): boolean {
  try {
    if (localStorage.getItem(RESTORING_KEY) !== key) return false;
    localStorage.removeItem(RESTORING_KEY);
    return true;
  } catch {
    return false;
  }
}

/** The scan status line: `text`, and a `warning` to show after it (in the warning colour) when something isn't being kept. */
export function scanStatusParts(status: ScanStatus): { text: string; warning: string | null } {
  switch (status.kind) {
    case 'none':
      return { text: '', warning: null };
    case 'loading':
      return { text: `Loading ${status.fileName}…`, warning: null };
    case 'ready': {
      const text = `${status.fileName}: ${status.count.toLocaleString()} splats${status.aligned ? '' : ' · not aligned yet'}`;
      // The scan itself is the bigger loss, so it takes the line; the alignment is only mentioned while the scan is kept.
      if (!status.stored) return { text, warning: ' · only kept until you leave this page' };
      if (!status.alignmentKept) return { text, warning: ' · alignment only kept until you leave this page' };
      return { text, warning: null };
    }
    case 'error':
      return { text: status.message, warning: null };
  }
}

/** Loads, aligns and keeps the room scan. Browser only; Spark is loaded the first time a scan is opened. */
export class ScanController {
  private layer: SplatLayer | null = null;
  private alignment: Alignment | null = null;
  private align: AlignState | null = null;
  private status: ScanStatus = { kind: 'none' };
  private bounds: { min: Vec3; max: Vec3; centre: Vec3 } | null = null;
  private latestDims: Dims | null = null; // from setRoom(): a scan that finishes loading crops to the room as it is now
  private cropKey: string | null = null; // the crop on the layer: null for none, else "LxWxH"
  private scanId = 0; // changes whenever the shown scan does, so a save that finishes late can tell it has been replaced
  /**
   * What the app means to keep in storage. Bumped by remove() and by every newly shown scan (opened or restored), never by
   * dispose(): leaving the page mid-save lets the save finish. A save, a load or a delete that began under an older value
   * must not touch storage or the screen any more.
   */
  private storeGen = 0;
  /** `savedAt` of the stored record that holds the shown scan; null while the shown scan isn't in storage (yet, or at all). */
  private storedAt: number | null = null;
  private disposed = false;

  constructor(
    private readonly scene: RoomScene,
    private readonly report: Report,
    private key: string, // the open room's id: its scan is stored under it
  ) {}

  /** The room whose scan this controller shows and stores. */
  get roomKey(): string {
    return this.key;
  }

  async restore(room: RoomState): Promise<void> {
    const key = this.key;
    const interrupted = takeRestoreMarker(key);
    const gen = this.storeGen;
    let stored: StoredScan | null;
    try {
      // The await (even of null) keeps every report after this call returns, so a view can start it from an effect.
      stored = await (interrupted ? null : loadScan(key));
    } catch {
      return; // nothing usable stored: start without a scan
    }
    // Only fill an empty view: a file the user opened while this was reading (open() sets 'loading' first) wins.
    if (this.disposed || this.status.kind !== 'none' || gen !== this.storeGen) return;
    if (interrupted) {
      // The last open of the stored scan never finished (the tab crashed or was closed): don't walk into the same crash.
      this.setStatus({ kind: 'error', message: INTERRUPTED });
      return;
    }
    if (!stored) return;
    setRestoreMarker(key);
    try {
      await this.show(stored.bytes, stored.fileName, stored.alignment, stored.savedAt, room.dims);
    } finally {
      clearRestoreMarker(); // ready, failed, or abandoned: the open is over
    }
  }

  async open(file: File, room: RoomState): Promise<void> {
    // One load at a time: two overlapping layer loads could leave two meshes in the layer.
    if (this.status.kind === 'loading' || this.align) return;
    const key = this.key;
    const gen = this.storeGen;
    this.setStatus({ kind: 'loading', fileName: file.name });
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch (error) {
      if (!this.disposed && gen === this.storeGen) this.failLoad(error, UNREADABLE); // same as a scan Spark can't read: the old scan goes, the box view stays
      return;
    }
    if (this.disposed || gen !== this.storeGen) return; // removed while the file was being read
    if (!(await this.show(bytes, file.name, null, null, room.dims))) return;
    const id = this.scanId;
    const keepGen = this.storeGen;
    const savedAt = Date.now();
    // Shown as kept until the save says otherwise, so a slow save doesn't flash a "not kept" warning.
    const stored = await this.keep(keepGen, key, { fileName: file.name, bytes, alignment: null, savedAt });
    if (id !== this.scanId || keepGen !== this.storeGen) return; // another scan, or none, is on screen by now
    this.storedAt = stored ? savedAt : null;
    this.reportStored(stored);
    // Aligned while the save was still running: the stored copy doesn't have that alignment yet.
    if (stored && this.alignment) {
      const ok = await this.writeAlignment(this.alignment, savedAt, key);
      if (id === this.scanId) this.reportAlignmentKept(ok);
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
    // The mean of the splat centres is a point off the floor on the room's side; it decides which way is up. (Which side of the
    // right wall is in is judged from the floor taps instead: a scan's splats can reach well outside the room.)
    try {
      this.align = alignTap(this.align, point, this.bounds.centre, room.dims);
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
    // Only the stored scan gets the alignment: while a scan that couldn't be saved is on screen, storage holds none for it.
    if (this.storedAt === null) return;
    const id = this.scanId;
    const ok = await this.writeAlignment(alignment, this.storedAt, this.key);
    if (id === this.scanId) this.reportAlignmentKept(ok);
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
    this.storeGen++; // a save still retrying stops, and a load still running is abandoned
    this.clearScreen();
    try {
      await deleteScan(this.key);
    } catch {
      // the scan stays in storage and comes back the next time the page loads
    }
  }

  /**
   * Another room was opened: take this room's scan off the screen (it stays stored) and show the other room's, if it has
   * one. An alignment in progress ends. A load or save still running for the room being left no longer touches the screen.
   */
  async switchRoom(key: string, room: RoomState): Promise<void> {
    if (key === this.key) return;
    this.key = key;
    this.storeGen++;
    this.latestDims = room.dims;
    this.clearScreen();
    await this.restore(room);
  }

  /** No scan on screen: the plain room, with nothing being aligned. Storage is not touched. */
  private clearScreen(): void {
    this.align = null;
    this.alignment = null;
    this.bounds = null;
    this.disposeLayer();
    this.scene.setTapMode('none');
    this.scene.setRoomItemsVisible(true);
    this.setStatus({ kind: 'none' });
    this.applyShell();
    this.reportStep(null);
  }

  dispose(): void {
    this.disposed = true;
    this.disposeLayer();
  }

  /**
   * Show bytes as the scan. `storedAt` is the `savedAt` of the stored record they came from, or null for a file just opened.
   * False if Spark can't read them (with an error status), or a newer load, remove() or dispose() took over (silently).
   */
  private async show(bytes: ArrayBuffer, fileName: string, alignment: Alignment | null, storedAt: number | null, dims: Dims): Promise<boolean> {
    const gen = this.storeGen; // remove() while this runs bumps it: the scan must not appear after it
    this.setStatus({ kind: 'loading', fileName });
    try {
      if (!this.layer) {
        const { SplatLayer } = await import('./SplatLayer');
        if (this.disposed || gen !== this.storeGen) return false;
        this.layer = new SplatLayer(this.scene.renderer);
        this.cropKey = null;
        this.scene.addLayer(this.layer.group);
      }
      const layer = this.layer;
      const { count, min, max, centre } = await layer.load(bytes, fileName);
      if (this.disposed || gen !== this.storeGen || this.layer !== layer) return false;
      // An empty scan has infinite bounds, which would make the framing and the inside point NaN.
      if (count === 0 || ![min, max, centre].every(isFiniteVec)) throw new Error('Scan has no splats');
      this.bounds = { min, max, centre };
      this.alignment = alignment;
      this.scanId++;
      this.storedAt = storedAt; // a file just opened is stored only once keep() says so
      layer.setAlignment(alignment);
      this.applyCrop(alignment ? (this.latestDims ?? dims) : null);
      layer.setVisible(true);
      this.setStatus({ kind: 'ready', fileName, count, aligned: alignment !== null, stored: true, alignmentKept: true, visible: true });
      this.applyShell();
      this.storeGen++; // a new scan is on screen: saves and loads meant for an earlier one stop (last, so the catch above can't mistake it)
      return true;
    } catch (error) {
      // A newer load owns the layer now, or remove() / dispose() ended this one.
      if (this.disposed || gen !== this.storeGen || (error instanceof Error && error.message === SUPERSEDED)) return false;
      this.failLoad(error, storedAt === null ? UNREADABLE : SAVED_UNREADABLE);
      return false;
    }
  }

  /** A scan that can't be read: say so, drop the layer (the box view stays) and leave whatever is in storage alone. */
  private failLoad(error: unknown, message: string): void {
    if (this.disposed) return;
    console.warn('Could not read the room scan', error);
    this.disposeLayer();
    this.setStatus({ kind: 'error', message });
    this.applyShell();
  }

  /**
   * Keep the scan in storage. If saving fails, drop whatever was stored before (storage must never hold a scan other than
   * the one on screen; it may also free the room the save needed) and try once more. `gen` is the `storeGen` the scan was
   * shown under: once remove() or another scan has moved it on, this stops quietly instead of touching storage again.
   */
  private async keep(gen: number, key: string, scan: StoredScan): Promise<boolean> {
    try {
      await saveScan(scan, key);
      return true;
    } catch {
      // fall through to the retry
    }
    if (gen !== this.storeGen) return false;
    try {
      await deleteScan(key);
    } catch {
      // nothing to drop, or it can't be dropped
    }
    if (gen !== this.storeGen) return false;
    try {
      await saveScan(scan, key);
      return true;
    } catch {
      return false;
    }
  }

  /** Write the alignment onto the stored record saved at `savedAt`. False when it fails or that record isn't what is in storage. */
  private async writeAlignment(alignment: Alignment, savedAt: number, key: string): Promise<boolean> {
    try {
      return await updateScanAlignment(alignment, savedAt, key);
    } catch {
      return false; // the alignment still applies for this session
    }
  }

  /** Show whether the scan on screen is in storage (" · only kept until you leave this page" when it isn't). */
  private reportStored(stored: boolean): void {
    if (this.status.kind === 'ready' && this.status.stored !== stored) this.setStatus({ ...this.status, stored });
  }

  /** Show whether the alignment is in storage (" · alignment only kept until you leave this page" when it isn't). */
  private reportAlignmentKept(kept: boolean): void {
    if (this.status.kind === 'ready' && this.status.alignmentKept !== kept) this.setStatus({ ...this.status, alignmentKept: kept });
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
    this.storedAt = null; // no scan is shown
  }
}
