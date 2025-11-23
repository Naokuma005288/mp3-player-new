import { clamp, readFileAsArrayBuffer } from "./utils.js";

export class AudioFX {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;

    this.nodes = new Map(); // audioEl -> {source,gain,filters}
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  }

  attach(audioEl) {
    const ctx = this.ensureContext();
    if (this.nodes.has(audioEl)) return this.nodes.get(audioEl);

    const source = ctx.createMediaElementSource(audioEl);
    const gain = ctx.createGain();
    const filters = this._createEqFilters(ctx);

    // chain: source -> filters -> gain -> destination
    let node = source;
    filters.forEach(f => { node.connect(f); node = f; });
    node.connect(gain);
    gain.connect(ctx.destination);

    const bundle = { source, gain, filters };
    this.nodes.set(audioEl, bundle);
    this.applyEqPreset(bundle);
    return bundle;
  }

  _createEqFilters(ctx) {
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf"; low.frequency.value = 120; low.gain.value = 0;

    const mid = ctx.createBiquadFilter();
    mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = 0.8; mid.gain.value = 0;

    const high = ctx.createBiquadFilter();
    high.type = "highshelf"; high.frequency.value = 5000; high.gain.value = 0;

    return [low, mid, high];
  }

  applyEqPreset(bundle) {
    const preset = this.settings.get("eqPreset");
    const [low, mid, high] = bundle.filters;

    const setAll = (l,m,h) => {
      low.gain.value = l;
      mid.gain.value = m;
      high.gain.value = h;
    };

    if (preset === "bass") setAll(6, 0, -1);
    else if (preset === "vocal") setAll(-2, 4, 1);
    else if (preset === "treble") setAll(-2, 0, 5);
    else setAll(0,0,0); // flat
  }

  applyEqPresetToAll() {
    this.nodes.forEach(b => this.applyEqPreset(b));
  }

  applyNormalizeToCurrent(gainNode, trackGain=1) {
    if (!gainNode) return;
    const normalize = this.settings.get("normalizeEnabled");
    gainNode.gain.value = normalize ? trackGain : 1;
  }

  // RMS簡易ノーマライズ
  async analyzeAndGetGain(file) {
    try {
      const ctx = this.ensureContext();
      const ab = await readFileAsArrayBuffer(file);
      const buf = await ctx.decodeAudioData(ab.slice(0));
      const ch = buf.getChannelData(0);
      let sum = 0;
      const step = Math.max(1, Math.floor(ch.length / 120000));
      for (let i=0;i<ch.length;i+=step) sum += ch[i]*ch[i];
      const rms = Math.sqrt(sum / (ch.length/step));
      const target = 0.12; // だいたい聞きやすい目標
      const g = clamp(target / (rms||0.0001), 0.4, 2.0);
      return g;
    } catch {
      return 1;
    }
  }

  // 波形ピーク抽出（軽量）
  async extractWavePeaks(file, points=200) {
    try {
      const ctx = this.ensureContext();
      const ab = await readFileAsArrayBuffer(file);
      const buf = await ctx.decodeAudioData(ab.slice(0));
      const ch = buf.getChannelData(0);
      const block = Math.floor(ch.length / points);
      const peaks = [];
      for (let i=0;i<points;i++) {
        let max = 0;
        const start = i*block;
        for (let j=0;j<block;j++) {
          const v = Math.abs(ch[start+j] || 0);
          if (v > max) max = v;
        }
        peaks.push(max);
      }
      return peaks;
    } catch {
      return null;
    }
  }

  drawWaveform(canvas, peaks, enabled=true) {
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio||1;
    canvas.width = width*dpr; canvas.height=height*dpr;
    ctx2d.scale(dpr,dpr);
    ctx2d.clearRect(0,0,width,height);
    if (!enabled || !peaks || peaks.length===0) return;

    ctx2d.globalAlpha = 0.9;
    ctx2d.lineWidth = 2;
    const mid = height*0.6;
    const step = width/peaks.length;

    const styles = getComputedStyle(document.documentElement);
    ctx2d.strokeStyle = styles.getPropertyValue("--viz-grad-2").trim();

    ctx2d.beginPath();
    peaks.forEach((p,i)=>{
      const x = i*step;
      const y = p*height*0.9;
      ctx2d.moveTo(x, mid-y/2);
      ctx2d.lineTo(x, mid+y/2);
    });
    ctx2d.stroke();
  }
}
