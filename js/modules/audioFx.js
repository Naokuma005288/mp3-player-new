// js/modules/audioFx.js
export default class AudioFx {
  constructor(settings){
    this.settings = settings;
    this.ctx = null;

    // A/Bなど複数audio用のノードを保持
    // 形式: { audio, source, gain }
    this.nodes = [];
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

  // audioごとに個別のsource/gainを作って保持する
  attach(audioEl){
    if (!audioEl) return null;

    const ctx = this.ensureContext();

    // すでに接続済みなら再利用
    const existing = this.nodes.find(n => n.audio === audioEl);
    if (existing){
      return { gain: existing.gain };
    }

    // MediaElementSourceは audioEl につき1回だけ
    if (!audioEl.__mediaSource){
      audioEl.__mediaSource = ctx.createMediaElementSource(audioEl);
    }
    const source = audioEl.__mediaSource;

    // gain（クロスフェード用に audioごとに持つ）
    const gain = ctx.createGain();
    gain.gain.value = (this.settings.get?.("volume") ?? 1);

    // 配線：source → gain → speakers
    source.connect(gain);
    gain.connect(ctx.destination);

    const node = { audio: audioEl, source, gain };
    this.nodes.push(node);

    return { gain };
  }

  detach(audioEl){
    const idx = this.nodes.findIndex(n => n.audio === audioEl);
    if (idx === -1) return;

    const n = this.nodes[idx];
    try{
      n.source?.disconnect();
      n.gain?.disconnect();
    }catch{}
    this.nodes.splice(idx, 1);
  }

  getGain(audioEl){
    return this.nodes.find(n => n.audio === audioEl)?.gain ?? null;
  }

  // ===========================================
  // ★互換: Playlist が呼ぶ「音量解析 → gain」
  // ===========================================
  // ちゃんとピークから簡易正規化係数を返す版
  async analyzeAndGetGain(file){
    try{
      if (!file) return 1;

      const ctx = this.ensureContext();
      const buf = await file.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(buf.slice(0));

      const ch = audioBuf.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < ch.length; i++){
        const v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
      if (peak <= 0) return 1;

      // “だいたい音量を揃える”ための係数
      const target = 0.9;
      const gain = target / peak;

      return this._clamp(gain, 0.2, 2.5);
    } catch (e){
      console.warn("[AudioFx.analyzeAndGetGain] failed:", e);
      return 1;
    }
  }

  // ===========================================
  // ★互換: Playlist が呼ぶ「波形ピーク抽出」
  // ===========================================
  async extractWavePeaks(file, count = 200){
    try{
      if (!file) return null;

      const ctx = this.ensureContext();
      const buf = await file.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(buf.slice(0));

      const ch = audioBuf.getChannelData(0);
      const peaks = new Array(count);

      const blockSize = Math.floor(ch.length / count) || 1;

      for (let i = 0; i < count; i++){
        const start = i * blockSize;
        const end = Math.min(start + blockSize, ch.length);

        let max = 0;
        for (let j = start; j < end; j++){
          const v = Math.abs(ch[j]);
          if (v > max) max = v;
        }
        peaks[i] = max;
      }

      return peaks;
    } catch (e){
      console.warn("[AudioFx.extractWavePeaks] failed:", e);
      return null; // 波形なし扱いに落とす
    }
  }

  // ===========================================
  // PlayerCore 互換（落ちないためのダミー）
  // ===========================================
  applyEqPresetToAll(){ /* 今は何もしない */ }
  applyNormalizeToCurrent(gainNode, gainValue){
    if (!gainNode) return;
    gainNode.gain.value = gainValue ?? 1;
  }
  setEqEnabled(){ /* 今は何もしない */ }
  setNormalizeEnabled(){ /* 今は何もしない */ }

  // internal
  _clamp(v, min, max){
    return Math.min(Math.max(v, min), max);
  }
}
