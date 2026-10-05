import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { SURFACE_IDS, type RoomState } from '@/lib/room/types';
import { MATERIAL_COLORS } from './colors';
import { surfaceQuad } from './layout';
import { buildFixes, buildListener, buildShell, buildSpeaker, placeListener, placeSpeaker } from './objects';

describe('buildShell', () => {
  it('has one tagged, tinted surface per room surface at its centre', () => {
    const room = defaultRoom();
    const shell = buildShell(room);
    for (const surface of SURFACE_IDS) {
      const mesh = shell.getObjectByName(surface) as THREE.Mesh;
      const c = surfaceQuad(room.dims, surface).center;
      expect(mesh.userData.surface).toBe(surface);
      expect(mesh.position.toArray()).toEqual([c.x, c.y, c.z]);
      expect((mesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(MATERIAL_COLORS[room.surfaces[surface]]);
    }
    expect(shell.getObjectByName('edges')).toBeDefined();
    expect(shell.getObjectByName('grid')).toBeDefined();
  });

  it('turns each surface to face into the room and sizes it to the surface', () => {
    const room = defaultRoom();
    const shell = buildShell(room);
    for (const surface of SURFACE_IDS) {
      const mesh = shell.getObjectByName(surface) as THREE.Mesh;
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
      const quad = surfaceQuad(room.dims, surface);
      expect(facing.x).toBeCloseTo(quad.normal.x, 9);
      expect(facing.y).toBeCloseTo(quad.normal.y, 9);
      expect(facing.z).toBeCloseTo(quad.normal.z, 9);
      const { width, height } = (mesh.geometry as THREE.PlaneGeometry).parameters;
      expect([width, height]).toEqual([quad.width, quad.height]);
    }
  });
});

describe('handles', () => {
  it('places the speaker and tags it as draggable', () => {
    const room = defaultRoom();
    const speaker = buildSpeaker();
    placeSpeaker(speaker, room);
    expect(speaker.position.toArray()).toEqual([0.6, 1.0, 1.4]);
    expect(speaker.userData.handle).toEqual({ kind: 'speaker' });
  });

  it('turns the listener to face the speaker', () => {
    const room = defaultRoom();
    const listener = buildListener();
    placeListener(listener, room);
    const facing = new THREE.Vector3(1, 0, 0).applyEuler(listener.rotation);
    const toSpeaker = new THREE.Vector3(room.speaker.x - room.listener.x, 0, room.speaker.z - room.listener.z).normalize();
    expect(facing.x).toBeCloseTo(toSpeaker.x, 9);
    expect(facing.z).toBeCloseTo(toSpeaker.z, 9);
    for (const part of listener.children) expect(part.userData.handle).toEqual({ kind: 'listener' });
  });

  it('tags fixes with their index and fades switched-off ones', () => {
    const room: RoomState = {
      ...defaultRoom(),
      fixes: [
        { kind: 'panel', wall: 'wallZ1', u: 0.5, v: 1.2, on: true },
        { kind: 'rug', size: 'M', x: 2, z: 1.75, on: false },
      ],
    };
    const fixes = buildFixes(room);
    expect(fixes.children.map((m) => m.userData.handle)).toEqual([
      { kind: 'panel', index: 0 },
      { kind: 'rug', index: 1 },
    ]);
    expect(((fixes.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity).toBe(0.9);
    expect(((fixes.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity).toBe(0.25);
  });

  it('keeps a panel box inside the room, on its wall', () => {
    const room: RoomState = { ...defaultRoom(), fixes: [{ kind: 'panel', wall: 'wallZ1', u: 2, v: 1.2, on: true }] };
    const panel = buildFixes(room).children[0];
    panel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(panel);
    expect(box.max.z).toBeLessThanOrEqual(room.dims.width + 1e-9); // doesn't poke through the wall at z = width
    expect(box.max.z).toBeGreaterThan(room.dims.width - 0.1); // still right against it
  });
});
