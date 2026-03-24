// clock.js — Tone.js-based step sequencer clock
import * as Tone from 'https://cdn.jsdelivr.net/npm/tone@15/+esm';
import { SIZE } from './grid.js';

export class Clock {
  constructor(onStep) {
    this.onStep = onStep;  // callback(stepIndex: 0..15)
    this.bpm = 120;
    this.currentStep = 0;
    this._seq = null;
  }

  _buildSequencer() {
    if (this._seq) {
      this._seq.dispose();
    }
    const steps = Array.from({ length: SIZE }, (_, i) => i);
    this._seq = new Tone.Sequence(
      (time, step) => {
        this.currentStep = step;
        // Schedule the callback at the right audio time via Tone.Draw
        Tone.getDraw().schedule(() => this.onStep(step), time);
      },
      steps,
      '16n'
    );
  }

  async start() {
    await Tone.start();
    Tone.getTransport().bpm.value = this.bpm;
    this._buildSequencer();
    this._seq.start(0);
    Tone.getTransport().start();
  }

  stop() {
    Tone.getTransport().stop();
    if (this._seq) this._seq.stop();
    this.currentStep = 0;
  }

  setBpm(bpm) {
    this.bpm = bpm;
    Tone.getTransport().bpm.value = bpm;
  }

  isRunning() {
    return Tone.getTransport().state === 'started';
  }
}
