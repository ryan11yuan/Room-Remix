import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SplatLayer } from './SplatLayer';

// Spark needs WebGL and workers, so it is replaced by a recorder. Only what dispose() depends on is modelled:
// SparkRenderer.sorting is true from the start of a sort (GPU read-back and sort worker awaits) until it ends.
const h = vi.hoisted(() => ({ sparks: [] as Array<{ sorting: boolean; dispose: () => void }> }));
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
  class Plain extends three.Object3D {}
  return {
    SparkRenderer,
    SplatMesh: Plain,
    SplatEdit: Plain,
    SplatEditSdf: Plain,
    SplatEditRgbaBlendMode: { MULTIPLY: 0 },
    SplatEditSdfType: { BOX: 0 },
  };
});

const newLayer = () => new SplatLayer({} as THREE.WebGLRenderer);
const spark = () => h.sparks[h.sparks.length - 1];

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
