// renderer.js — Three.js voxel cube renderer
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { SIZE } from './grid.js';

const VOXEL_SIZE    = 0.70;   // smaller = more gap between cubes
const OUTLINE_SIZE  = 0.84;   // slightly larger shell rendered backface-only for edge glow
const GRID_OFFSET   = -(SIZE - 1) / 2;

const COLOR_OFF      = new THREE.Color(0x555577);
const COLOR_ON       = new THREE.Color(0x89b4fa);
const COLOR_TRIG = new THREE.Color(0xffffff);  // white flash, lerps back to COLOR_ON

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x13131f);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.camera.position.set(22, 18, 28);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    const count = SIZE * SIZE * SIZE;

    // Fill mesh — rounded box, vertex colors driven by instanceColor
    const fillGeo = new RoundedBoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE, 2, 0.08);
    const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(fillGeo, fillMat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);

    // Outline mesh — same geometry scaled up, back-faces only, flat dark color
    // Back faces peek around the fill mesh edges creating an outline
    const outlineGeo = new RoundedBoxGeometry(OUTLINE_SIZE, OUTLINE_SIZE, OUTLINE_SIZE, 2, 0.10);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x22223a,
      side: THREE.BackSide,
    });
    this.outlineMesh = new THREE.InstancedMesh(outlineGeo, outlineMat, count);
    this.outlineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.outlineMesh);

    // Step-plane slab
    const slabGeo = new THREE.BoxGeometry(0.12, SIZE + 0.5, SIZE + 0.5);
    const slabMat = new THREE.MeshBasicMaterial({
      color: 0x89b4fa,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    this.slab = new THREE.Mesh(slabGeo, slabMat);
    this.slab.visible = false;
    this.scene.add(this.slab);

    this._dummy = new THREE.Object3D();
    this._trigFlash = new Float32Array(count);

    this._initInstances();

    this._doResize();
    const ro = new ResizeObserver(() => requestAnimationFrame(() => this._doResize()));
    ro.observe(canvas.parentElement);

    this.raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
  }

  _voxelIndex(x, y, z) {
    return x + y * SIZE + z * SIZE * SIZE;
  }

  _initInstances() {
    for (let z = 0; z < SIZE; z++) {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = this._voxelIndex(x, y, z);
          this._dummy.position.set(
            x + GRID_OFFSET,
            y + GRID_OFFSET,
            z + GRID_OFFSET,
          );
          this._dummy.updateMatrix();
          this.mesh.setMatrixAt(i, this._dummy.matrix);
          this.outlineMesh.setMatrixAt(i, this._dummy.matrix);
          this.mesh.setColorAt(i, COLOR_OFF);
        }
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.outlineMesh.instanceMatrix.needsUpdate = true;
  }

  updateColors(grid, currentStep) {
    const FLASH_FRAMES = 18;
    const _c = new THREE.Color();

    for (let z = 0; z < SIZE; z++) {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = this._voxelIndex(x, y, z);
          let color;
          if (this._trigFlash[i] > 0) {
            // Lerp: white → COLOR_ON over FLASH_FRAMES
            const t = this._trigFlash[i] / FLASH_FRAMES;
            _c.lerpColors(COLOR_ON, COLOR_TRIG, t);
            color = _c;
            this._trigFlash[i]--;
          } else if (grid.get(x, y, z)) {
            color = COLOR_ON;
          } else {
            color = COLOR_OFF;
          }
          this.mesh.setColorAt(i, color);
        }
      }
    }
    this.mesh.instanceColor.needsUpdate = true;

    if (currentStep !== null) {
      this.slab.visible = true;
      this.slab.position.x = currentStep + GRID_OFFSET;
    }
  }

  flashTriggers(hits, step, frames = 18) {
    for (const { y, z } of hits) {
      this._trigFlash[this._voxelIndex(step, y, z)] = frames;
    }
  }

  pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this._pointer.set(
      ((event.clientX - rect.left) / rect.width)  * 2 - 1,
      -((event.clientY - rect.top)  / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.mesh);
    if (!hits.length) return null;
    const id = hits[0].instanceId;
    return {
      x: id % SIZE,
      y: Math.floor(id / SIZE) % SIZE,
      z: Math.floor(id / (SIZE * SIZE)),
    };
  }

  _doResize() {
    const container = this.canvas.parentElement;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
