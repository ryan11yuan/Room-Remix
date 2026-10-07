import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OBJECT_INFO } from '@/lib/acoustics/objects';
import type { RoomObject, Vec3 } from '@/lib/room/types';
import { heatPixels } from '@/lib/sound/heat';
import { roomToWorldMatrix } from '@/lib/sound/roomFit';
import type { RoomFit, SpotMap } from '@/lib/sound/types';

const CREAM = 0xffedd7;
const BEST = 0x3ddc84;
const ON_TOP = 10; // drawn after the splat, which writes no depth

function chip(text: string, className: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = `rounded-full border bg-walnut/80 px-2.5 py-1 text-micro whitespace-nowrap ${className}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

/** The sound features drawn in the room (spec §5, §6, §8). Children are placed in room metres; `root` maps them to world. */
export class SoundOverlay {
  readonly root = new THREE.Group();
  private readonly speaker = new THREE.Group();
  private readonly body = new THREE.Group(); // the box with its light front, at speaker height
  private readonly stand = new THREE.Group(); // a unit-height pole, scaled to reach the box
  private readonly marker = new THREE.Group();
  private heat: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private labels: CSS2DObject[] = [];

  constructor(fit: RoomFit) {
    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(roomToWorldMatrix(fit));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.3), new THREE.MeshBasicMaterial({ color: CREAM }));
    front.position.z = 0.101; // a light front, just proud of the box's +z face
    this.body.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.2), new THREE.MeshBasicMaterial({ color: 0x2a2420 })), front);
    this.stand.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 12), new THREE.MeshBasicMaterial({ color: CREAM })));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.28, 48),
      new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = ON_TOP;
    ring.position.y = 0.03;
    this.speaker.add(this.stand, this.body, ring);
    this.speaker.visible = false;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4), new THREE.MeshBasicMaterial({ color: BEST, depthTest: false }));
    pin.position.y = 0.7;
    pin.renderOrder = ON_TOP;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 48),
      new THREE.MeshBasicMaterial({ color: BEST, depthTest: false, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.04;
    halo.renderOrder = ON_TOP;
    const label = chip('Best spot', 'border-[#3ddc84] text-[#3ddc84]');
    label.position.y = 1.55;
    this.marker.add(pin, halo, label);
    this.marker.visible = false;
    this.root.add(this.speaker, this.marker);
  }

  setSpeaker(p: Vec3 | null): void {
    this.speaker.visible = p !== null;
    if (!p) return;
    this.speaker.position.set(p.x, 0, p.z);
    this.body.position.y = p.y; // the box sits at speaker height; the ring stays on the floor
    const reach = Math.max(0.01, p.y - 0.175); // the stand runs from the floor to the bottom of the box
    this.stand.scale.y = reach;
    this.stand.position.y = reach / 2;
  }

  setObjects(objects: RoomObject[]): void {
    for (const l of this.labels) this.root.remove(l);
    this.labels = objects.map((o) => {
      const info = OBJECT_INFO[o.label];
      const l = chip(
        `${info.name} · ${info.absorbs ? 'absorbs' : 'reflects'}`,
        info.absorbs ? 'border-[#5fd4c4] text-[#5fd4c4]' : 'border-[#f0a540] text-[#f0a540]',
      );
      l.position.set((o.min.x + o.max.x) / 2, o.max.y + 0.15, (o.min.z + o.max.z) / 2);
      this.root.add(l);
      return l;
    });
  }

  setSpots(map: SpotMap | null): void {
    if (this.heat) {
      this.root.remove(this.heat);
      this.heat.material.map?.dispose();
      this.heat.material.dispose();
      this.heat.geometry.dispose();
      this.heat = null;
    }
    this.marker.visible = !!map?.best;
    if (!map) return;
    const texture = new THREE.DataTexture(heatPixels(map), map.nx, map.nz, THREE.RGBAFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(map.nx * map.step, map.nz * map.step),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    );
    plane.rotation.x = Math.PI / 2; // local +Y → room +Z, so texture row 0 (v = 0) is the z0 row
    plane.position.set(map.x0 + ((map.nx - 1) * map.step) / 2, 0.03, map.z0 + ((map.nz - 1) * map.step) / 2);
    plane.renderOrder = ON_TOP - 1;
    this.heat = plane;
    this.root.add(plane);
    if (map.best) this.marker.position.set(map.best.x, 0, map.best.z);
  }

  dispose(): void {
    this.setSpots(null);
    for (const l of this.labels) this.root.remove(l);
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
