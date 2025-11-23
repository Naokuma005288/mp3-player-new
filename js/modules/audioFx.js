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
    return this.ctx; // Visualizer側が使うので返す
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

  // ============================
  // ★互換用：Playlistが呼ぶやつ
  // ============================
  // いまは「正規化しない=1」を返す簡易版。
  async analyzeAndGetGain(file){
    return 1;
  }

  // ============================
  // PlayerCore互換（存在しなくても落ちない）
  // ============================
  applyEqPresetToAll(){ /* 今は何もしない */ }

  applyNormalizeToCurrent(gainNode, gainValue){
    if (!gainNode) return;
    gainNode.gain.value = gainValue ?? 1;
  }

  setEqEnabled(){ /* 今は何もしない */ }
  setNormalizeEnabled(){ /* 今は何もしない */ }
}
