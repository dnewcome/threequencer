// main.js — entry point, wires everything together
import { Grid } from './grid.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { Clock } from './clock.js';

const canvas = document.getElementById('c');
const btnPlay = document.getElementById('btn-play');
const bpmSlider = document.getElementById('bpm');
const bpmVal = document.getElementById('bpm-val');
const stepDisplay = document.getElementById('step-display');
const synthSelect = document.getElementById('synth-type');
const mixSelect = document.getElementById('mix-mode');

const grid = new Grid();
const renderer = new Renderer(canvas);
const audio = new AudioEngine();

// Seed a simple demo pattern so there's something to hear on first play
function seedDemo() {
  // One-bar kick-like pattern on Y=0 Z=0
  [0, 4, 8, 12].forEach(x => grid.set(x, 0, 0, 1));
  // Snare-ish on Y=4 Z=0
  [4, 12].forEach(x => grid.set(x, 4, 0, 1));
  // Hi-hat on Y=8 Z=0 every other step
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(x => grid.set(x, 8, 0, 1));
  // Melody on Z=1
  [[0,12],[2,10],[4,11],[6,9],[8,12],[10,11],[12,10],[14,9]].forEach(([x,y]) => grid.set(x, y, 1, 1));
}
seedDemo();

let currentStep = null;

const clock = new Clock((step) => {
  currentStep = step;
  stepDisplay.textContent = `step ${step.toString().padStart(2, '0')}`;

  const hits = grid.getSlice(step);
  const mixMode = mixSelect.value;
  audio.trigger(hits, mixMode);
  renderer.flashTriggers(hits, step);
});

// Render loop
function animate() {
  requestAnimationFrame(animate);
  renderer.updateColors(grid, currentStep);
  renderer.render();
}
animate();

// Play / stop
btnPlay.addEventListener('click', async () => {
  await audio.start();
  if (clock.isRunning()) {
    clock.stop();
    currentStep = null;
    btnPlay.textContent = '▶ Play';
    btnPlay.classList.remove('active');
    stepDisplay.textContent = 'step —';
  } else {
    await clock.start();
    btnPlay.textContent = '⏹ Stop';
    btnPlay.classList.add('active');
  }
});

// BPM
bpmSlider.addEventListener('input', () => {
  const bpm = Number(bpmSlider.value);
  bpmVal.textContent = bpm;
  clock.setBpm(bpm);
});

// Synth type
synthSelect.addEventListener('change', () => {
  audio.setSynthType(synthSelect.value);
});

// Voxel picking — toggle on click
let isDragging = false;
let pointerDownPos = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  isDragging = false;
});

canvas.addEventListener('pointermove', (e) => {
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  if (Math.sqrt(dx * dx + dy * dy) > 10) isDragging = true;
});

canvas.addEventListener('pointerup', (e) => {
  if (isDragging) return;
  const coords = renderer.pick(e, grid);
  if (coords) {
    grid.toggle(coords.x, coords.y, coords.z);
  }
});
