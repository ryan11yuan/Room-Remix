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

const plain = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
const isFiniteBox = (box: THREE.Box3): boolean =>
  [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);

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
    this.group.add(this.spark);
  }

  /**
   * Parse a scan file kept on this device. Rejects if Spark can't read the file or it has no splats, or if a newer
   * load() or dispose() came first; in every case the current scan, if any, stays and nothing is left behind.
   */
  async load(bytes: ArrayBuffer, fileName: string): Promise<{ count: number; min: Vec3; max: Vec3 }> {
    const id = ++this.loadId;
    const mesh = new SplatMesh({ fileBytes: bytes, fileName, raycastable: true });
    mesh.matrixAutoUpdate = false; // the alignment matrix is set directly
    let count: number;
    let box: THREE.Box3;
    try {
      await mesh.initialized;
      if (this.disposed || id !== this.loadId) throw new Error('Scan load superseded');
      count = mesh.packedSplats?.numSplats ?? 0;
      box = mesh.getBoundingBox(true);
      if (count === 0 || !isFiniteBox(box)) throw new Error('Scan has no splats'); // an empty box is ±Infinity
    } catch (error) {
      mesh.dispose();
      throw error;
    }
    this.removeMesh(); // swap only now that the new scan is good
    this.mesh = mesh;
    this.applyAlignment();
    this.group.add(mesh);
    return { count, min: plain(box.min), max: plain(box.max) };
  }

  get targets(): THREE.Object3D[] {
    return this.mesh ? [this.mesh] : [];
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
