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

const plain = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** A phone scan of the room drawn by Spark inside the three.js scene. Browser only. */
export class SplatLayer {
  readonly group = new THREE.Group();
  private readonly spark: SparkRenderer;
  private mesh: SplatMesh | null = null;
  private crop: SplatEdit | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.spark = new SparkRenderer({ renderer });
    this.group.name = 'splat-layer';
    this.group.add(this.spark);
  }

  /** Parse a scan file kept on this device. Rejects if Spark can't read it; nothing is left behind on failure. */
  async load(bytes: ArrayBuffer, fileName: string): Promise<{ count: number; min: Vec3; max: Vec3 }> {
    this.removeMesh();
    const mesh = new SplatMesh({ fileBytes: bytes, fileName, raycastable: true });
    mesh.matrixAutoUpdate = false; // the alignment matrix is set directly
    try {
      await mesh.initialized;
    } catch (error) {
      mesh.dispose();
      throw error;
    }
    this.mesh = mesh;
    this.group.add(mesh);
    const box = mesh.getBoundingBox(true);
    return { count: mesh.packedSplats?.numSplats ?? 0, min: plain(box.min), max: plain(box.max) };
  }

  get targets(): THREE.Object3D[] {
    return this.mesh ? [this.mesh] : [];
  }

  setAlignment(alignment: Alignment | null): void {
    if (!this.mesh) return;
    this.mesh.matrix.copy(alignment ? alignmentMatrix(alignment) : new THREE.Matrix4());
    this.mesh.matrixWorldNeedsUpdate = true;
  }

  /** Hide splats outside the room box plus a margin: outdoor views through windows, stray floaters. */
  setCrop(dims: Dims | null): void {
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
    this.removeMesh();
    this.setCrop(null);
    this.spark.dispose();
    this.group.removeFromParent();
  }

  private removeMesh(): void {
    if (!this.mesh) return;
    this.group.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
  }
}
