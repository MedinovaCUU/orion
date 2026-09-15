import type { Object3D, Mesh } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
export interface BA400Controller {
  ids(): string[];
  get(id: string): Object3D | null;
  partId(object: Object3D): string | null;
  meshes(id: string): Mesh[];
  setExplosion(value: number): void;
  showOnly(ids: string | string[]): void;
  showAll(): void;
  highlight(id: string, color?: number, intensity?: number): boolean;
  clearHighlight(id: string): boolean;
  reset(): void;
  dispose(): void;
}
export function createBA400Controller(gltf: GLTF): BA400Controller;
