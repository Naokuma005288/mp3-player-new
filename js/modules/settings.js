// js/modules/settings.js
export class Settings {
  constructor(key="mp3PlayerSettings_v4"){
    this.key = key;
    this.defaults = {
      volume: 1,
      lastVolume: 1,
      repeatMode: "none",
      isShuffle: false,
      playbackRateIndex: 0,

      theme: "normal",        // normal / light / dark
      visualizerStyle: "line",// line / bars / dots

      transitionMode: "none", // none / crossfade / gapless
      crossfadeSec: 2.0,

      normalizeOn: false,
      eqPreset: "flat",
      waveformOn: true
    };
  }

  _load(){
    try{
      const raw = localStorage.getItem(this.key);
      if (!raw) return { ...this.defaults };
      const obj = JSON.parse(raw);
      return { ...this.defaults, ...obj };
    }catch{
      return { ...this.defaults };
    }
  }

  _save(obj){
    try{ localStorage.setItem(this.key, JSON.stringify(obj)); }catch{}
  }

  get(name){
    const s = this._load();
    return s[name];
  }

  set(name, value){
    const s = this._load();
    s[name] = value;
    this._save(s);
  }

  toggle(name){
    const v = !!this.get(name);
    this.set(name, !v);
    return !v;
  }
}
