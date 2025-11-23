import { qs, showToast } from "./utils.js";

const KEY = "mp3PlayerSettings_v39";

export class Settings {
  constructor(dom) {
    this.dom = dom;

    this.volume = 1;
    this.lastVolume = 1;

    this.repeatMode = "none"; // none/all/one
    this.isShuffle = false;
    this.playbackRates = [1, 1.25, 1.5, 2, 0.75];
    this.rateIndex = 0;

    this.theme = "dark"; // dark/light
    this.vizStyle = "line"; // line/bars/dots

    this.transitionMode = "none"; // none/gapless/crossfade
    this.crossfadeSeconds = 2;
    this.crossfadeOptions = [0, 1, 2, 3, 5];

    this.eqPreset = "flat"; // flat/bass/vocal/treble
    this.eqPresets = ["flat", "bass", "vocal", "treble"];

    this.waveformEnabled = true;
  }

  save() {
    const data = {
      volume: this.volume,
      lastVolume: this.lastVolume,
      repeatMode: this.repeatMode,
      isShuffle: this.isShuffle,
      rateIndex: this.rateIndex,
      theme: this.theme,
      vizStyle: this.vizStyle,
      transitionMode: this.transitionMode,
      crossfadeSeconds: this.crossfadeSeconds,
      eqPreset: this.eqPreset,
      waveformEnabled: this.waveformEnabled,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      this.applyToUI();
      return;
    }
    try {
      const d = JSON.parse(raw);
      Object.assign(this, d);
    } catch {}
    this.applyToUI();
  }

  applyToUI() {
    // volume
    this.dom.volumeControl.value = this.volume;
    // theme
    document.documentElement.classList.toggle("light-mode", this.theme === "light");
    this.updateThemeIcons();

    // viz
    this.updateVizIcons();

    // transition / xf
    this.updateTransitionButton();

    // eq
    this.updateEqButton();

    // waveform
    this.updateWaveButton();
  }

  toggleTheme() {
    this.theme = this.theme === "light" ? "dark" : "light";
    document.documentElement.classList.toggle("light-mode", this.theme === "light");
    this.updateThemeIcons();
    this.save();
  }

  updateThemeIcons() {
    const isLight = this.theme === "light";
    this.dom.themeSunIcon.classList.toggle("hidden", !isLight);
    this.dom.themeMoonIcon.classList.toggle("hidden", isLight);
  }

  toggleVizStyle() {
    const order = ["line", "bars", "dots"];
    const i = (order.indexOf(this.vizStyle) + 1) % order.length;
    this.vizStyle = order[i];
    this.updateVizIcons();
    this.save();
  }

  updateVizIcons() {
    const isLine = this.vizStyle === "line";
    this.dom.vizLineIcon.classList.toggle("hidden", !isLine);
    this.dom.vizBarsIcon.classList.toggle("hidden", isLine);
  }

  cycleTransitionMode() {
    const order = ["none", "gapless", "crossfade"];
    const i = (order.indexOf(this.transitionMode) + 1) % order.length;
    this.transitionMode = order[i];
    this.updateTransitionButton();
    this.save();
    showToast(`つなぎ方: ${this.transitionMode.toUpperCase()}`);
  }

  cycleCrossfadeSeconds() {
    const i = (this.crossfadeOptions.indexOf(this.crossfadeSeconds) + 1) % this.crossfadeOptions.length;
    this.crossfadeSeconds = this.crossfadeOptions[i];
    this.updateTransitionButton();
    this.save();
    showToast(`クロスフェード: ${this.crossfadeSeconds}s`);
  }

  updateTransitionButton() {
    const t = this.transitionMode.toUpperCase();
    this.dom.transitionModeBtn.textContent = t;
    this.dom.crossfadeDurationBtn.textContent = `XF ${this.crossfadeSeconds}s`;
    this.dom.crossfadeDurationBtn.classList.toggle("hidden", this.transitionMode !== "crossfade");
  }

  cycleEqPreset() {
    const i = (this.eqPresets.indexOf(this.eqPreset) + 1) % this.eqPresets.length;
    this.eqPreset = this.eqPresets[i];
    this.updateEqButton();
    this.save();
    showToast(`EQ: ${this.eqPreset.toUpperCase()}`);
  }

  updateEqButton() {
    this.dom.eqPresetBtn.textContent = this.eqPreset.toUpperCase();
  }

  toggleWaveform() {
    this.waveformEnabled = !this.waveformEnabled;
    this.updateWaveButton();
    this.save();
    showToast(`波形: ${this.waveformEnabled ? "ON" : "OFF"}`);
  }

  updateWaveButton() {
    this.dom.waveformToggleBtn.classList.toggle("btn-active", this.waveformEnabled);
  }
}
