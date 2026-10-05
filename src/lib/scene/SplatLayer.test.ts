import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alignmentMatrix, type Alignment } from './alignment';
import { SplatLayer } from './SplatLayer';

// Spark needs WebGL and workers, so it is replaced by a recorder. Two things are modelled:
// - SparkRenderer.sorting is true from the start of a sort (GPU read-back and sort worker awaits) until it ends (dispose()).
// - SplatMesh has a controllable `initialized` and a `packedSplats` that visits the given splat centres (load()). The next
//   mesh to be constructed takes its script from `h.next`.
type FakeMesh = THREE.Object3D & {
  dispose: ReturnType<typeof vi.fn>;
  packedSplats: { numSplats: number; forEachSplat: (visit: (index: number, centre: THREE.Vector3) => void) => void } | undefined;
};
type MeshScript = { initialized: Promise<unknown>; centres: Array<[number, number, number]> };
const h = vi.hoisted(() => ({
  sparks: [] as Array<{ sorting: boolean; dispose: () => void }>,
  meshes: [] as unknown[],
  next: { initialized: Promise.resolve(), centres: [] } as MeshScript,
  edits: [] as unknown[],
}));
vi.mock('@sparkjsdev/spark', async () => {
  const three = await import('three');
  class SparkRenderer extends three.Object3D {
    sorting = false;
    dispose = vi.fn();
    constructor() {
      super();
      h.sparks.push(this);
    }
  }
  class SplatMesh extends three.Object3D {
    initialized: Promise<unknown>;
    dispose = vi.fn();
    packedSplats: FakeMesh['packedSplats'];
    constructor() {
      super();
      const { initialized, centres } = h.next; // this mesh's own script, whatever is scripted for the next one
      this.initialized = initialized;
      this.packedSplats = {
        numSplats: centres.length,
        forEachSplat: (visit) => centres.forEach(([x, y, z], i) => visit(i, new three.Vector3(x, y, z))),
      };
      h.meshes.push(this);
    }
  }
  class SplatEdit extends three.Object3D {
    constructor() {
      super();
      h.edits.push(this);
    }
  }
  class Plain extends three.Object3D {}
  return {
    SparkRenderer,
    SplatMesh,
    SplatEdit,
    SplatEditSdf: Plain,
    SplatEditRgbaBlendMode: { MULTIPLY: 0 },
    SplatEditSdfType: { BOX: 0 },
  };
});

const newLayer = () => new SplatLayer({} as THREE.WebGLRenderer);
const spark = () => h.sparks[h.sparks.length - 1];
const meshes = () => h.meshes as FakeMesh[];
const room: Array<[number, number, number]> = [[0, 0, 0], [4, 2, 2], [2, 1, 1]];
/** Script the next mesh to be built: how it initialises and which splat centres it holds. */
function script(next: Partial<MeshScript> = {}) {
  h.next = { initialized: Promise.resolve(), centres: room, ...next };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const bytes = new ArrayBuffer(8);
const reason = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as Error | null)?.message;

describe('SplatLayer.dispose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.sparks.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('detaches the layer at once and disposes Spark at once when it is not sorting', () => {
    const layer = newLayer();
    const scene = new THREE.Scene();
    scene.add(layer.group);
    layer.dispose();
    expect(layer.group.parent).toBeNull();
    expect(spark().dispose).toHaveBeenCalledTimes(1);
  });

  it('waits for a sort in progress before disposing Spark, but detaches the layer at once', () => {
    const layer = newLayer();
    const scene = new THREE.Scene();
    scene.add(layer.group);
    spark().sorting = true;
    layer.dispose();
    expect(layer.group.parent).toBeNull();
    expect(spark().dispose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500); // still sorting: keeps waiting
    expect(spark().dispose).not.toHaveBeenCalled();

    spark().sorting = false; // the sort ended
    vi.advanceTimersByTime(50);
    expect(spark().dispose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(spark().dispose).toHaveBeenCalledTimes(1);
  });

  it('polls every 50 ms', () => {
    const layer = newLayer();
    spark().sorting = true;
    layer.dispose();
    vi.advanceTimersByTime(40);
    spark().sorting = false;
    vi.advanceTimersByTime(9);
    expect(spark().dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spark().dispose).toHaveBeenCalledTimes(1);
  });

  it('gives up after 5 seconds and disposes anyway (a sort that threw leaves sorting stuck on)', () => {
    const layer = newLayer();
    spark().sorting = true;
    layer.dispose();
    vi.advanceTimersByTime(4900);
    expect(spark().dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(spark().dispose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(spark().dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes Spark only once when dispose() is called twice', () => {
    const layer = newLayer();
    spark().sorting = true;
    layer.dispose();
    layer.dispose();
    spark().sorting = false;
    vi.advanceTimersByTime(100);
    expect(spark().dispose).toHaveBeenCalledTimes(1);
  });
});

describe('SplatLayer', () => {
  beforeEach(() => {
    h.sparks.length = 0;
    h.meshes.length = 0;
    h.edits.length = 0;
    script();
  });

  it('draws before the rays: its group sorts ahead of everything with the default order', () => {
    // Spark's transparent mesh is sorted by depth from the world origin; a negative group order puts the whole scan first.
    expect(newLayer().group.renderOrder).toBeLessThan(0);
  });

  describe('load', () => {
    it('reports the count, the box and the mean of the splat centres', async () => {
      // Three splats at the origin and one far out: the mean sits near the origin cluster, not in the middle of the box.
      script({ centres: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [4, 2, 2]] });
      const layer = newLayer();
      expect(await layer.load(bytes, 'room.spz')).toEqual({
        count: 4,
        min: { x: 0, y: 0, z: 0 },
        max: { x: 4, y: 2, z: 2 },
        centre: { x: 1, y: 0.5, z: 0.5 },
      });
    });

    it('measures negative coordinates too', async () => {
      script({ centres: [[-3, 1, -2], [1, -5, 4]] });
      expect(await newLayer().load(bytes, 'room.spz')).toEqual({
        count: 2,
        min: { x: -3, y: -5, z: -2 },
        max: { x: 1, y: 1, z: 4 },
        centre: { x: -1, y: -2, z: 1 },
      });
    });

    it('adds the mesh to the group, as the raycast target', async () => {
      const layer = newLayer();
      await layer.load(bytes, 'room.spz');
      expect(layer.group.children).toContain(meshes()[0]);
      expect(layer.targets).toEqual([meshes()[0]]);
    });

    it('rejects an empty scan, disposes its mesh and adds nothing', async () => {
      script({ centres: [] });
      const layer = newLayer();
      expect(await reason(layer.load(bytes, 'empty.ply'))).toBe('Scan has no splats');
      expect(meshes()[0].dispose).toHaveBeenCalledTimes(1);
      expect(layer.group.children).not.toContain(meshes()[0]);
      expect(layer.targets).toEqual([]);
    });

    it.each([
      ['a NaN', [[0, 0, 0], [NaN, 1, 1]]],
      ['an infinite', [[0, 0, 0], [1, Infinity, 1]]],
      ['a minus-infinite', [[0, -Infinity, 0], [1, 1, 1]]],
    ] as const)('treats a scan with %s splat centre as having no splats', async (_name, centres) => {
      script({ centres: centres.map((c) => [...c] as [number, number, number]) });
      const layer = newLayer();
      expect(await reason(layer.load(bytes, 'bad.ply'))).toBe('Scan has no splats');
      expect(meshes()[0].dispose).toHaveBeenCalledTimes(1);
      expect(layer.targets).toEqual([]);
    });

    it('rejects, and disposes its mesh, when Spark cannot read the file', async () => {
      script({ initialized: Promise.reject(new Error('Unable to determine file type')) });
      const layer = newLayer();
      expect(await reason(layer.load(bytes, 'notes.txt'))).toBe('Unable to determine file type');
      expect(meshes()[0].dispose).toHaveBeenCalledTimes(1);
    });

    it('applies the alignment given before the load to the new mesh', async () => {
      const alignment: Alignment = { level: [0, 0, 0, 1], scale: 2, yaw: 0.5, offset: { x: 1, y: 0, z: -1 } };
      const layer = newLayer();
      layer.setAlignment(alignment);
      await layer.load(bytes, 'room.spz');
      const mesh = meshes()[0];
      expect(mesh.matrix.equals(alignmentMatrix(alignment))).toBe(true);
      expect(mesh.matrixWorldNeedsUpdate).toBe(true);
    });

    it('gives a mesh loaded with no alignment the identity matrix', async () => {
      const layer = newLayer();
      await layer.load(bytes, 'room.spz');
      expect(meshes()[0].matrix.equals(new THREE.Matrix4())).toBe(true);
    });

    it('turns a mesh into the aligned one when the alignment is set afterwards, and back when it is cleared', async () => {
      const alignment: Alignment = { level: [0, 0, 0, 1], scale: 2, yaw: 0, offset: { x: 1, y: 0, z: 0 } };
      const layer = newLayer();
      await layer.load(bytes, 'room.spz');
      layer.setAlignment(alignment);
      expect(meshes()[0].matrix.equals(alignmentMatrix(alignment))).toBe(true);
      layer.setAlignment(null);
      expect(meshes()[0].matrix.equals(new THREE.Matrix4())).toBe(true);
    });
  });

  describe('load guards', () => {
    it('lets a newer load win: the stale one disposes its own mesh and rejects as superseded', async () => {
      const first = deferred<void>();
      script({ initialized: first.promise, centres: [[0, 0, 0]] });
      const layer = newLayer();
      const stale = layer.load(bytes, 'a.spz');
      script();
      await layer.load(bytes, 'b.spz'); // started second, finishes first
      first.resolve();
      expect(await reason(stale)).toBe('Scan load superseded');
      const [a, b] = meshes();
      expect(a.dispose).toHaveBeenCalledTimes(1);
      expect(b.dispose).not.toHaveBeenCalled();
      expect(layer.group.children).not.toContain(a);
      expect(layer.group.children).toContain(b);
      expect(layer.targets).toEqual([b]);
    });

    it('supersedes a load that is still waiting when another one starts, even if the newer one then fails', async () => {
      const first = deferred<void>();
      script({ initialized: first.promise });
      const layer = newLayer();
      const stale = layer.load(bytes, 'a.spz');
      script({ centres: [] });
      expect(await reason(layer.load(bytes, 'b.spz'))).toBe('Scan has no splats');
      first.resolve();
      expect(await reason(stale)).toBe('Scan load superseded'); // the id moved on when b started, whatever happened to b
      expect(layer.targets).toEqual([]);
    });

    it('does the same for a load that finishes after dispose()', async () => {
      const gate = deferred<void>();
      script({ initialized: gate.promise });
      const layer = newLayer();
      const scene = new THREE.Scene();
      scene.add(layer.group);
      const loading = layer.load(bytes, 'a.spz');
      layer.dispose();
      gate.resolve();
      expect(await reason(loading)).toBe('Scan load superseded');
      expect(meshes()[0].dispose).toHaveBeenCalledTimes(1);
      expect(layer.group.children).not.toContain(meshes()[0]);
      expect(layer.targets).toEqual([]);
    });

    it('keeps the current scan when a second load fails (swap on success)', async () => {
      const layer = newLayer();
      await layer.load(bytes, 'a.spz');
      script({ centres: [] });
      expect(await reason(layer.load(bytes, 'b.spz'))).toBe('Scan has no splats');
      const [a, b] = meshes();
      expect(layer.group.children).toContain(a);
      expect(a.dispose).not.toHaveBeenCalled();
      expect(b.dispose).toHaveBeenCalledTimes(1);
      expect(layer.targets).toEqual([a]);
    });

    it('keeps the current scan when Spark cannot read a second file', async () => {
      const layer = newLayer();
      await layer.load(bytes, 'a.spz');
      script({ initialized: Promise.reject(new Error('Unable to determine file type')) });
      await reason(layer.load(bytes, 'notes.txt'));
      expect(layer.targets).toEqual([meshes()[0]]);
      expect(meshes()[0].dispose).not.toHaveBeenCalled();
    });

    it('replaces the current scan only once the second one is good', async () => {
      const layer = newLayer();
      await layer.load(bytes, 'a.spz');
      const second = deferred<void>();
      script({ initialized: second.promise });
      const loading = layer.load(bytes, 'b.spz');
      expect(layer.targets).toEqual([meshes()[0]]); // still showing a while b parses
      second.resolve();
      await loading;
      const [a, b] = meshes();
      expect(a.dispose).toHaveBeenCalledTimes(1);
      expect(layer.group.children).not.toContain(a);
      expect(layer.targets).toEqual([b]);
    });
  });

  describe('setCrop', () => {
    const dims = { length: 4, width: 3.5, height: 2.6 };
    const edits = () => h.edits as THREE.Object3D[];

    it('adds one crop to the group and removes it again', () => {
      const layer = newLayer();
      layer.setCrop(dims);
      expect(edits()).toHaveLength(1);
      expect(layer.group.children).toContain(edits()[0]);
      layer.setCrop(null);
      expect(layer.group.children).not.toContain(edits()[0]);
    });

    it.each([
      ['NaN length', { ...dims, length: NaN }],
      ['NaN width', { ...dims, width: NaN }],
      ['zero height', { ...dims, height: 0 }],
      ['zero length', { ...dims, length: 0 }],
      ['negative width', { ...dims, width: -1 }],
      ['infinite height', { ...dims, height: Infinity }],
    ])('ignores a room size with %s and keeps the current crop', (_name, bad) => {
      const layer = newLayer();
      layer.setCrop(dims);
      const kept = edits()[0];
      layer.setCrop(bad);
      expect(edits()).toHaveLength(1); // no new crop was built
      expect(layer.group.children).toContain(kept);
    });

    it('replaces the crop with one for the new size', () => {
      const layer = newLayer();
      layer.setCrop(dims);
      layer.setCrop({ ...dims, length: 5 });
      expect(edits()).toHaveLength(2);
      expect(layer.group.children).not.toContain(edits()[0]);
      expect(layer.group.children).toContain(edits()[1]);
    });
  });
});
