// grid.js — 16×16×16 voxel state
// Axes: X=time(0..15), Y=pitch(0..15), Z=layer(0..15)

export const SIZE = 16;

// Flat array: index = x + y*SIZE + z*SIZE*SIZE
export class Grid {
  constructor() {
    this.data = new Uint8Array(SIZE * SIZE * SIZE);
  }

  idx(x, y, z) {
    return x + y * SIZE + z * SIZE * SIZE;
  }

  get(x, y, z) {
    return this.data[this.idx(x, y, z)];
  }

  set(x, y, z, val) {
    this.data[this.idx(x, y, z)] = val ? 1 : 0;
  }

  toggle(x, y, z) {
    const i = this.idx(x, y, z);
    this.data[i] = this.data[i] ? 0 : 1;
    return this.data[i];
  }

  // Return all active {y, z} pairs for a given x-slice (time step)
  getSlice(x) {
    const hits = [];
    for (let z = 0; z < SIZE; z++) {
      for (let y = 0; y < SIZE; y++) {
        if (this.get(x, y, z)) hits.push({ y, z });
      }
    }
    return hits;
  }
}
