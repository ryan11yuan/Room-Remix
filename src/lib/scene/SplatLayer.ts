import {
  SparkRenderer,
  SplatEdit,
  SplatEditRgbaBlendMode,
  SplatEditSdf,
  SplatEditSdfType,
  SplatMesh,
} from '@sparkjsdev/spark';
import * as THREE from 'three';
import type { Dims, Vec3 } from '@/lib/room/types';
import { alignmentMatrix, type Alignment } from './alignment';

const CROP_MARGIN = 0.3; // metres of scan kept beyond the room box (walls are rarely captured exactly flat)
const SPARK_IDLE_POLL_MS = 50; // how often dispose() re-checks whether Spark's sort has finished
const SPARK_IDLE_GIVE_UP_MS = 5000; // after this long, dispose Spark anyway (a sort that threw leaves `sorting` stuck on)

/** What load() reports about a scan, in the scan's own coordinates (before any alignment). */
export type SplatInfo = {
  count: number;
  min: Vec3; // the box around all splat centres
  max: Vec3;
  centre: Vec3; // the mean of the splat centres: with mostly room, it sits in or near the room, unlike the box middle that a few far floaters drag out
};

/**
 * One pass over the splat centres for the box and the mean. Null when there are no splats or any centre isn't a finite
 * number (a NaN or infinite centre poisons the box and the mean, and would make the framing and the alignment NaN).
 */
function measure(mesh: SplatMesh): SplatInfo | null {
  const count = mesh.packedSplats?.numSplats ?? 0;
  if (count === 0) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let sumX = 0, sumY = 0, sumZ = 0;
  let visited = 0;
  mesh.packedSplats?.forEachSplat((_index, c) => {
    minX = Math.min(minX, c.x); // Math.min and max carry a NaN through, which the finiteness check below then catches
    minY = Math.min(minY, c.y);
    minZ = Math.min(minZ, c.z);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
    maxZ = Math.max(maxZ, c.z);
    sumX += c.x;
    sumY += c.y;
    sumZ += c.z;
    visited++;
  });
  if (visited === 0) return null;
  const centre = { x: sumX / visited, y: sumY / visited, z: sumZ / visited };
  const min = { x: minX, y: minY, z: minZ };
  const max = { x: maxX, y: maxY, z: maxZ };
  const all = [...Object.values(min), ...Object.values(max), ...Object.values(centre)];
  return all.every(Number.isFinite) ? { count, min, max, centre } : null;
}

/** A phone scan of the room drawn by Spark inside the three.js scene. Browser only. */
export class SplatLayer {
  readonly group = new THREE.Group();
  private readonly spark: SparkRenderer;
  private mesh: SplatMesh | null = null;
  private crop: SplatEdit | null = null;
  private alignment: Alignment | null = null; // remembered so a scan loaded after setAlignment still gets it
  private loadId = 0; // bumped by every load(); a load that finds it changed has been superseded
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.spark = new SparkRenderer({ renderer });
    this.group.name = 'splat-layer';
    // Spark draws every splat with one transparent mesh (the SparkRenderer), and three.js sorts transparent objects back to
    // front by their bounding-sphere depth, which for Spark's is the world origin. Whenever the camera puts that origin
    // behind the rays (they don't write depth), the splats would blend over the rays and hide them. A Group's renderOrder
    // applies to its whole subtree and the transparent list sorts by it first, so the scan always draws before the rays.
    this.group.renderOrder = -1;
    this.group.add(this.spark);
  }

  /**
   * Parse a scan file kept on this device. Rejects if Spark can't read the file or it has no splats, or if a newer
   * load() or dispose() came first; in every case the current scan, if any, stays and nothing is left behind.
   */
  async load(bytes: ArrayBuffer, fileName: string): Promise<SplatInfo> {
    const id = ++this.loadId;
    const mesh = new SplatMesh({ fileBytes: bytes, fileName, raycastable: true });
    mesh.matrixAutoUpdate = false; // the alignment matrix is set directly
    let info: SplatInfo | null;
    try {
      await mesh.initialized;
      if (this.disposed || id !== this.loadId) throw new Error('Scan load superseded');
      info = measure(mesh);
      if (!info) throw new Error('Scan has no splats');
    } catch (error) {
      mesh.dispose();
      throw error;
    }
    this.removeMesh(); // swap only now that the new scan is good
    this.mesh = mesh;
    this.applyAlignment();
    this.group.add(mesh);
    return info;
  }

  get targets(): THREE.Object3D[] {
    return this.mesh ? [this.mesh] : [];
  }

  /** The splat centres in the scan's own frame as xyz triples, every k-th one so there are at most `max`. */
  centres(max = 200_000): Float32Array {
    const packed = this.mesh?.packedSplats;
    const count = packed?.numSplats ?? 0;
    if (!packed || count === 0) return new Float32Array(0);
    const stride = Math.max(1, Math.ceil(count / max));
    const out = new Float32Array(Math.ceil(count / stride) * 3);
    let j = 0;
    packed.forEachSplat((index, c) => {
      if (index % stride !== 0) return;
      out[j++] = c.x;
      out[j++] = c.y;
      out[j++] = c.z;
    });
    return out.subarray(0, j);
  }

  setAlignment(alignment: Alignment | null): void {
    this.alignment = alignment;
    this.applyAlignment();
  }

  /** Hide splats outside the room box plus a margin: outdoor views through windows, stray floaters. */
  setCrop(dims: Dims | null): void {
    if (dims && ![dims.length, dims.width, dims.height].every((d) => Number.isFinite(d) && d > 0)) return; // mid-edit: keep the last good crop
    if (this.crop) {
      this.group.remove(this.crop);
      this.crop = null;
    }
    if (!dims) return;
    // Spark's box SDF is negative inside the box and takes its scale as half-extents. An edit applies its change where the
    // (inverted) distance is < 0, so `invert: true` makes the "opacity 0" change land everywhere *outside* the box.
    const box = new SplatEditSdf({ type: SplatEditSdfType.BOX, opacity: 0 });
    box.position.set(dims.length / 2, dims.height / 2, dims.width / 2);
    box.scale.set(dims.length / 2 + CROP_MARGIN, dims.height / 2 + CROP_MARGIN, dims.width / 2 + CROP_MARGIN);
    const edit = new SplatEdit({ rgbaBlendMode: SplatEditRgbaBlendMode.MULTIPLY, invert: true, sdfs: [box] });
    // `sdfs` already registers the box (Spark doesn't also walk the children then); parenting keeps its world matrix in the group's frame.
    edit.add(box);
    this.crop = edit;
    this.group.add(edit);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeMesh();
    this.setCrop(null);
    this.group.removeFromParent(); // nothing renders or re-sorts from here on
    this.disposeSparkWhenIdle();
  }

  /**
   * Spark's sort loop (SparkRenderer.driveSort) sets `sorting` before it awaits the GPU read-back and the sort worker and
   * clears it only after them, with no guard against disposal. Disposing mid-sort pulls the render target and worker out from
   * under those awaits and surfaces as an unhandled promise rejection, so wait for the sort to finish, then dispose.
   */
  private disposeSparkWhenIdle(): void {
    const started = Date.now();
    const attempt = () => {
      if (this.spark.sorting && Date.now() - started < SPARK_IDLE_GIVE_UP_MS) {
        setTimeout(attempt, SPARK_IDLE_POLL_MS);
        return;
      }
      this.spark.dispose();
    };
    attempt();
  }

  private applyAlignment(): void {
    if (!this.mesh) return;
    this.mesh.matrix.copy(this.alignment ? alignmentMatrix(this.alignment) : new THREE.Matrix4());
    this.mesh.matrixWorldNeedsUpdate = true;
  }

  private removeMesh(): void {
    if (!this.mesh) return;
    this.group.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
  }
}
