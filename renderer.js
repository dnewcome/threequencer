// renderer.js — Three.js voxel cube renderer
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { SIZE } from './grid.js';

const VOXEL_SIZE      = 0.70;
const SPACING         = 1.1;   // center-to-center distance (1.0 = touching gaps)
const GRID_OFFSET     = -(SIZE - 1) / 2 * SPACING;
const NEAR_CULL_DIST  = 10;    // units from camera; cubes closer than this disappear entirely
const NEAR_FADE_ZONE  = 6;     // units beyond cull plane over which active cubes fade out

const COLOR_ON   = new THREE.Color(0x89b4fa);
const COLOR_TRIG = new THREE.Color(0xffffff);
const COLOR_BG   = new THREE.Color(0x13131f); // scene background — fade target

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
    const fillGeo = new RoundedBoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE, 2, 0.08);

    // Active-voxel mesh — only renders as many instances as there are active voxels.
    // mesh.count is updated each frame to match the active count.
    const fillMat = new THREE.MeshBasicMaterial();
    this.mesh = new THREE.InstancedMesh(fillGeo, fillMat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.scene.add(this.mesh);

    // Ghost grid — all cubes at very low opacity so you can see the grid structure
    // and click any position. Transparent so active cubes show through clearly.
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x3a3a5a,
      transparent: true,
      opacity: 0.03,
      depthWrite: false,
    });
    this.ghostMesh = new THREE.InstancedMesh(fillGeo, ghostMat, count);
    this.ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.ghostMesh);

    // Ghost outline — slightly larger cube, back-faces only, so the edges peek
    // around the fill and draw a visible border on each unlit cube.
    const outlineGeo = new RoundedBoxGeometry(VOXEL_SIZE * 1.18, VOXEL_SIZE * 1.18, VOXEL_SIZE * 1.18, 2, 0.10);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x5a5a8a,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.outlineMesh = new THREE.InstancedMesh(outlineGeo, outlineMat, count);
    this.outlineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.outlineMesh);

    // Center dots — one point per grid position, never accumulate fog.
    const dotPositions = new Float32Array(count * 3);
    let di = 0;
    for (let z = 0; z < SIZE; z++)
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          dotPositions[di++] = x * SPACING + GRID_OFFSET;
          dotPositions[di++] = y * SPACING + GRID_OFFSET;
          dotPositions[di++] = z * SPACING + GRID_OFFSET;
        }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));
    const dotMat = new THREE.PointsMaterial({ color: 0x000000, size: 2, sizeAttenuation: false });
    this.scene.add(new THREE.Points(dotGeo, dotMat));

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

    // Scratch objects for near-plane center culling (pre-allocated, no per-frame GC)
    this._nearPlane  = new THREE.Plane();
    this._camDir     = new THREE.Vector3();
    this._cubeCenter = new THREE.Vector3();

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
          this._dummy.position.set(x * SPACING + GRID_OFFSET, y * SPACING + GRID_OFFSET, z * SPACING + GRID_OFFSET);
          this._dummy.scale.setScalar(1);
          this._dummy.updateMatrix();
          this.ghostMesh.setMatrixAt(i, this._dummy.matrix);
          this.outlineMesh.setMatrixAt(i, this._dummy.matrix);
        }
      }
    }
    this.ghostMesh.instanceMatrix.needsUpdate = true;
    this.outlineMesh.instanceMatrix.needsUpdate = true;

    // Prime the instanceColor buffer so needsUpdate works in updateColors
    this.mesh.setColorAt(0, COLOR_ON);
    this.mesh.instanceColor.needsUpdate = true;
  }

  updateColors(grid, currentStep) {
    const FLASH_FRAMES = 18;
    const _c = new THREE.Color();
    let activeCount = 0;

    // Recompute the near clip plane each frame from current camera state.
    // Active cubes whose center is behind this plane are culled entirely.
    this.camera.getWorldDirection(this._camDir);
    this._nearPlane.setFromNormalAndCoplanarPoint(
      this._camDir,
      this._cubeCenter.copy(this.camera.position).addScaledVector(this._camDir, NEAR_CULL_DIST),
    );

    for (let z = 0; z < SIZE; z++) {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = this._voxelIndex(x, y, z);
          const cx = x * SPACING + GRID_OFFSET;
          const cy = y * SPACING + GRID_OFFSET;
          const cz = z * SPACING + GRID_OFFSET;

          // Three visibility zones based on signed distance from the cull plane:
          //   dist <  0              → fully culled (ghost/outline hidden, no fill)
          //   0 <= dist < FADE_ZONE  → fading: ghost/outline visible, fill color lerps to background
          //   dist >= FADE_ZONE      → fully visible
          const dist = this._nearPlane.distanceToPoint(this._cubeCenter.set(cx, cy, cz));
          const culled = dist < 0;
          const scale = culled ? 0.0001 : 1;

          this._dummy.position.set(cx, cy, cz);
          this._dummy.scale.setScalar(scale);
          this._dummy.updateMatrix();
          this.ghostMesh.setMatrixAt(i, this._dummy.matrix);
          this.outlineMesh.setMatrixAt(i, this._dummy.matrix);

          if (culled) continue;

          let color = null;
          if (this._trigFlash[i] > 0) {
            const t = this._trigFlash[i] / FLASH_FRAMES;
            _c.lerpColors(COLOR_ON, COLOR_TRIG, t);
            color = _c;
            this._trigFlash[i]--;
          } else if (grid.get(x, y, z)) {
            color = COLOR_ON;
          }

          if (color) {
            // In the fade zone, lerp fill color toward background so cubes dissolve before culling
            if (dist < NEAR_FADE_ZONE) {
              const fade = dist / NEAR_FADE_ZONE; // 0 at cull edge → 1 at fade start
              _c.lerpColors(COLOR_BG, color, fade);
              color = _c;
            }
            this.mesh.setMatrixAt(activeCount, this._dummy.matrix);
            this.mesh.setColorAt(activeCount, color);
            activeCount++;
          }
        }
      }
    }

    this.mesh.count = activeCount;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.ghostMesh.instanceMatrix.needsUpdate = true;
    this.outlineMesh.instanceMatrix.needsUpdate = true;

    if (currentStep !== null) {
      this.slab.visible = true;
      this.slab.position.x = currentStep * SPACING + GRID_OFFSET;
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
    const hits = this.raycaster.intersectObject(this.ghostMesh);
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
