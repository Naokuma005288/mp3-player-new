import { clamp } from "./utils.js";

/**
 * v3.9.0: EQプリセット / 簡易ノーマライズ / 波形抽出
 */
export class AudioFX {
  constructor(settings) {
    this.settings = settings;
    this.audioContext = null;

    this.filters = null;
    this.output = null;
  }

  ensureContext() {
    if (this.audioContext) return this.audioContext;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    return this.audioContext;
  }

  buildEQChain() {
    const ac = this.ensureContext();

    const low = ac.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 120;

    const mid = ac.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1500;
    mid.Q.value = 1;

    const high = ac.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 6000;

    low.connect(mid);
    mid.connect(high);

    this.filters = { low, mid, high };
    this.output = high;
    this.applyPreset(this.settings.eqPreset);
  }

  getInputNode() {
    if (!this.filters) this.buildEQChain();
    return this.filters.low;
  }

  getOutputNode() {
    if (!this.filters) this.buildEQChain();
    return this.output;
  }

  applyPreset(name) {
    if (!this.filters) this.buildEQChain();
    const { low, mid, high } = this.filters;

    // 初期化
    low.gain.value = 0;
    mid.gain.value = 0;
    high.gain.value = 0;

    if (name === "bass") {
      low.gain.value = 6;
      mid.gain.value = -1;
    }
    if (name === "vocal") {
      mid.gain.value = 4;
      low.gain.value = -1;
    }
    if (name === "treble") {
      high.gain.value = 6;
      mid.gain.value = -1;
    }
  }

  async analyzeGainAndWaveform(file) {
    try {
      const ac = this.ensureContext();
      const buf = await file.arrayBuffer();
      const audioBuf = await ac.decodeAudioData(buf);

      const ch = audioBuf.getChannelData(0);
      const len = ch.length;

      // ---- RMS（簡易ノーマライズ）
      let sumSq = 0;
      const step = Math.max(1, Math.floor(len / 40000));
      for (let i = 0; i < len; i += step) {
        const v = ch[i];
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / (len / step));
      const target = 0.12; // ざっくり目標
      const gain = clamp(target / (rms || 0.0001), 0.6, 1.8);

      // ---- 波形ピーク抽出（軽量）
      const samples = 200;
      const block = Math.floor(len / samples);
      const peaks = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        let max = 0;
        const start = i * block;
        const end = Math.min(start + block, len);
        for (let j = start; j < end; j++) {
          const a = Math.abs(ch[j]);
          if (a > max) max = a;
        }
        peaks[i] = max;
      }

      return { gain, peaks };
    } catch {
      return { gain: 1, peaks: null };
    }
  }
}
