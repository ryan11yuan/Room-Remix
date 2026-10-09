import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { RoomObject } from '@/lib/room/types';
import { roomToWorldMatrix } from '@/lib/sound/roomFit';
import type { RoomFit } from '@/lib/sound/types';
import { nameInfo } from '@/lib/explore/names';

function chipClass(highlight: boolean): string {
  return `rounded-full border bg-walnut/80 px-2.5 py-1 text-micro whitespace-nowrap ${highlight ? 'border-[#5fd4c4] text-[#5fd4c4]' : 'border-cream/60 text-cream'}`;
}

/** One floating label per object (spec 2026-10-08 §9). Labels are placed in room metres; `root` maps them to world. */
export class LabelsOverlay {
  readonly root = new THREE.Group();
  private labels: CSS2DObject[] = [];

  constructor(fit: RoomFit) {
    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(roomToWorldMatrix(fit));
  }

  setObjects(objects: RoomObject[]): void {
    for (const l of this.labels) this.root.remove(l);
    this.labels = objects.map((o) => {
      const el = document.createElement('div');
      el.className = chipClass(false);
      el.textContent = nameInfo(o.label).title;
      const label = new CSS2DObject(el);
      label.position.set((o.min.x + o.max.x) / 2, o.max.y + 0.15, (o.min.z + o.max.z) / 2);
      this.root.add(label);
      return label;
    });
  }

  /** One chip in teal: the row the helper points at, or the explorer's target (spec §9). */
  setHighlight(index: number | null): void {
    this.labels.forEach((label, i) => {
      label.element.className = chipClass(i === index);
    });
  }

  dispose(): void {
    for (const l of this.labels) this.root.remove(l); // CSS2DObject removes its element when removed
    this.labels = [];
    this.root.removeFromParent();
  }
}
