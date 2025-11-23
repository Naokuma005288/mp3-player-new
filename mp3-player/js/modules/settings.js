const SETTINGS_KEY = "mp3PlayerSettings_v3_1_2";

export function saveSettings(els, state) {
  const settings = {
    volume: els.audioPlayer.volume,
    lastVolume: state.lastVolume ?? els.audioPlayer.volume,
    repeatMode: state.repeatMode ?? "none",
    isShuffle: state.isShuffle ?? false,
    playbackRateIndex: state.currentRateIndex ?? 0,
    theme: document.documentElement.classList.contains("light-mode") ? "light" : "dark",
    visualizerStyle: state.visualizerStyle ?? "line",
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("設定の保存に失敗:", e);
  }
}

export function loadSettings(els, core, vizUI) {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return;

    const settings = JSON.parse(saved);

    // volume
    els.audioPlayer.volume = settings.volume ?? 1;
    els.volumeControl.value = settings.volume ?? 1;
    core.getState().lastVolume = settings.lastVolume ?? 1;
    core.updateVolumeIcon(els.audioPlayer.volume);

    // repeat
    const targetRepeat = settings.repeatMode ?? "none";
    if (targetRepeat !== "none") {
      core.toggleRepeat(); // none -> all
      if (targetRepeat === "one") core.toggleRepeat(); // all -> one
    }

    // shuffle
    if (settings.isShuffle) {
      core.toggleShuffle();
    }

    // rate
    const idx = settings.playbackRateIndex ?? 0;
    core.getState().currentRateIndex = idx;
    els.audioPlayer.playbackRate = core.getState().playbackRates[idx];
    els.playbackRateBtn.textContent = `${core.getState().playbackRates[idx]}x`;

    // theme
    if (settings.theme === "light") {
      document.documentElement.classList.add("light-mode");
    } else {
      document.documentElement.classList.remove("light-mode");
    }
    core.updateThemeIcons();

    // viz style
    vizUI.setVisualizerStyle(settings.visualizerStyle ?? "line");

  } catch (e) {
    console.error("設定の読み込みに失敗:", e);
  }
}
