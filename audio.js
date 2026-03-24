// audio.js — Tone.js synth wrapper
// Y axis (0..15) maps to a pentatonic-ish scale across 2 octaves

import * as Tone from 'https://cdn.jsdelivr.net/npm/tone@15/+esm';

// Map Y index 0..15 to MIDI note numbers (two octave pentatonic starting at C3)
const SCALE = (() => {
  const root = 48; // C3
  const intervals = [0, 2, 4, 7, 9]; // pentatonic major
  const notes = [];
  for (let oct = 0; oct < 4; oct++) {
    for (const iv of intervals) {
      notes.push(root + oct * 12 + iv);
    }
  }
  return notes.slice(0, 16);
})();

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function yToFreq(y) {
  return midiToFreq(SCALE[y]);
}

export function yToNote(y) {
  const midi = SCALE[y];
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return names[midi % 12] + Math.floor(midi / 12 - 1);
}

export class AudioEngine {
  constructor() {
    this.synth = null;
    this.synthType = 'synth';
    this._buildSynth();
  }

  _buildSynth() {
    if (this.synth) {
      this.synth.dispose();
    }
    const reverb = new Tone.Reverb({ decay: 1.2, wet: 0.25 }).toDestination();
    switch (this.synthType) {
      case 'fm':
        this.synth = new Tone.PolySynth(Tone.FMSynth).connect(reverb);
        break;
      case 'am':
        this.synth = new Tone.PolySynth(Tone.AMSynth).connect(reverb);
        break;
      case 'membrane':
        this.synth = new Tone.PolySynth(Tone.MembraneSynth).connect(reverb);
        break;
      default:
        this.synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.4 },
        }).connect(reverb);
    }
    this.synth.maxPolyphony = 32;
  }

  setSynthType(type) {
    this.synthType = type;
    this._buildSynth();
  }

  // hits: array of y values to trigger simultaneously
  // mixMode: 'or' | 'and' | 'first'
  trigger(hits, mixMode = 'or') {
    if (hits.length === 0) return;

    let ys;
    if (mixMode === 'or') {
      // Deduplicate y values across all layers
      ys = [...new Set(hits.map(h => h.y))];
    } else if (mixMode === 'and') {
      // Only fire y values that appear in ALL active layers
      const layerMap = new Map();
      const layers = [...new Set(hits.map(h => h.z))];
      for (const h of hits) {
        if (!layerMap.has(h.y)) layerMap.set(h.y, new Set());
        layerMap.get(h.y).add(h.z);
      }
      ys = [];
      for (const [y, zSet] of layerMap) {
        if (zSet.size === layers.length) ys.push(y);
      }
    } else if (mixMode === 'first') {
      // Only fire from the lowest Z layer that has any active cells
      const minZ = Math.min(...hits.map(h => h.z));
      ys = [...new Set(hits.filter(h => h.z === minZ).map(h => h.y))];
    }

    const freqs = ys.map(y => yToFreq(y));
    if (freqs.length > 0) {
      this.synth.triggerAttackRelease(freqs, '16n');
    }
  }

  async start() {
    await Tone.start();
  }
}
