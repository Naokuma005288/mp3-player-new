// js/modules/audioFx.js
import { clamp } from "./utils.js";

export default class AudioFx {
  constructor(settings){
    this.settings = settings;

    this.ctx = null;
    this.bundles = new Map(); // audioEl -> bundle

    this.eqPresets = {
      flat:   { low:0, mid:0, high:0 },
      bass:   { low:6, mid:0, high:-2 },
      treble: { low:-2, mid:0, high:6 },
      vocal:  { low:-2, mid:4, high:2 },
    };
  }

  ensureContext(){
    if (!this.ctx){
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.ctx;
  }

  resumeContext(){
    if (this.ctx && this.ctx.state === "suspended"){
      this.ctx.resume().catch(()=>{});
    }
  }

  attach(audioEl){
    if (!audioEl) return null;
    const ctx = this.ensureContext();

    if (this.bundles.has(audioEl)) return this.bundles.get(audioEl);

    if (!audioEl.__mediaSource){
      audioEl.__mediaSource = ctx.createMediaElementSource(audioEl);
    }
    const source = audioEl.__mediaSource;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;

    const low = ctx.createBiquadFilter();
    low.type = "lowshelf"; low.frequency.value = 120;

    const mid = ctx.createBiquadFilter();
    mid.type = "peaking"; mid.frequency.value = 1200; mid.Q.value = 1;

    const high = ctx.createBiquadFilter();
    high.type = "highshelf"; high.frequency.value = 6000;

    const gain = ctx.createGain();
    gain.gain.value = (this.settings.get("volume") ?? 1);

    source.connect(analyser);
    analyser.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(gain);
    gain.connect(ctx.destination);

    const bundle = { audioEl, source, analyser, low, mid, high, gain };
    this.bundles.set(audioEl, bundle);
    this.applyEqPresetToBundle(bundle);
    return bundle;
  }

  detach(audioEl=null){
    if (!audioEl){
      for (const b of this.bundles.values()) this._disconnectBundle(b);
      this.bundles.clear();
      return;
    }
    const b = this.bundles.get(audioEl);
    if (!b) return;
    this._disconnectBundle(b);
    this.bundles.delete(audioEl);
  }

  _disconnectBundle(b){
    try{
      b.source?.disconnect();
      b.analyser?.disconnect();
      b.low?.disconnect();
      b.mid?.disconnect();
      b.high?.disconnect();
      b.gain?.disconnect();
    }catch{}
  }

  getBundles(){
    return [...this.bundles.values()];
  }

  get nodes(){
    return this.getBundles();
  }

  getAnalyserFor(audioEl){
    return this.bundles.get(audioEl)?.analyser || null;
  }

  applyNormalizeToCurrent(gainNode, trackGain=1){
    const on = !!this.settings.get("normalizeOn");
    if (!gainNode) return;
    gainNode.gain.value = on ? clamp(trackGain, 0.25, 4) : 1;
  }

  setEqPreset(presetName){
    this.settings.set("eqPreset", presetName);
    this.applyEqPresetToAll();
  }

  applyEqPresetToAll(){
    for (const b of this.bundles.values()){
      this.applyEqPresetToBundle(b);
    }
  }

  applyEqPresetToBundle(bundle){
    const name = this.settings.get("eqPreset") || "flat";
    const p = this.eqPresets[name] || this.eqPresets.flat;
    bundle.low.gain.value = p.low;
    bundle.mid.gain.value = p.mid;
    bundle.high.gain.value = p.high;
  }

  toggleNormalize(){
    return this.settings.toggle("normalizeOn");
  }

  async analyzeAndGetGain(file){
    try{
      const ctx = this.ensureContext();
      const ab = await file.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(ab.slice(0));
      const ch0 = audioBuf.getChannelData(0);
      let sumSq = 0;
      for (let i=0;i<ch0.length;i++){
        const v = ch0[i];
        sumSq += v*v;
      }
      const rms = Math.sqrt(sumSq / ch0.length) || 0.0001;
      const targetRms = 0.12;
      return clamp(targetRms / rms, 0.25, 4);
    }catch{
      return 1;
    }
  }

  async extractWavePeaks(file, samples=900){
    try{
      const ctx = this.ensureContext();
      const ab = await file.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(ab.slice(0));
      const data = audioBuf.getChannelData(0);
      const len = data.length;
      const step = Math.max(1, Math.floor(len / samples));
      const peaks = new Array(samples).fill(0);

      for (let i=0;i<samples;i++){
        const start = i*step;
        const end = Math.min(start+step, len);
        let peak = 0;
        for (let j=start;j<end;j++){
          const v = Math.abs(data[j]);
          if (v>peak) peak=v;
        }
        peaks[i] = peak;
      }

      const max = Math.max(...peaks, 0.0001);
      return peaks.map(p => p/max);
    }catch{
      return null;
    }
  }
}
