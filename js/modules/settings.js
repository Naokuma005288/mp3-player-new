export class Settings {
  constructor() {
    this.KEY = "mp3PlayerSettings_v3_9_1";
    this.defaults = {
      volume: 1,
      lastVolume: 1,
      repeatMode: "none",
      shuffle: false,
      playbackRateIndex: 0,

      theme: "dark", // dark default
      visualizerStyle: "line", // line/bars/dots

      transitionMode: "none", // none/gapless/crossfade
      crossfadeSec: 2,

      eqPreset: "flat", // flat/bass/vocal/treble
      normalizeEnabled: true,

      waveformEnabled: true,
    };
    this.state = { ...this.defaults, ...this._load() };
  }

  _load() {
    try {
      const s = localStorage.getItem(this.KEY);
      return s ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  }

  _save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.state));
    } catch {}
  }

  get(k) { return this.state[k]; }
  set(k, v) {
    this.state[k] = v;
    this._save();
  }

  toggleTheme() {
    const isLight = document.documentElement.classList.toggle("light-mode");
    this.set("theme", isLight ? "light" : "dark");
  }

  cycleVisualizerStyle() {
    const list = ["line", "bars", "dots"];
    const cur = this.get("visualizerStyle");
    const idx = (list.indexOf(cur) + 1) % list.length;
    this.set("visualizerStyle", list[idx]);
  }

  cycleTransitionMode() {
    const list = ["none", "gapless", "crossfade"];
    const cur = this.get("transitionMode");
    let idx = (list.indexOf(cur) + 1) % list.length;

    // crossfade の秒数も同時に回す仕様
    if (list[idx] === "crossfade") {
      const secList = [0, 1, 2, 3, 5];
      const sidx = (secList.indexOf(this.get("crossfadeSec")) + 1) % secList.length;
      this.set("crossfadeSec", secList[sidx] || 2);
    }

    this.set("transitionMode", list[idx]);
  }

  cycleEqPreset() {
    const list = ["flat", "bass", "vocal", "treble"];
    const cur = this.get("eqPreset");
    const idx = (list.indexOf(cur) + 1) % list.length;
    this.set("eqPreset", list[idx]);
  }

  toggleNormalize() {
    this.set("normalizeEnabled", !this.get("normalizeEnabled"));
  }

  toggleWaveform() {
    this.set("waveformEnabled", !this.get("waveformEnabled"));
  }
}
