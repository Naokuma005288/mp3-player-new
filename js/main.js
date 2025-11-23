import { formatTime, isMp3File, debounce } from "./modules/utils.js";
import { Settings } from "./modules/settings.js";
import { Visualizer } from "./modules/visualizer.js";
import { Playlist } from "./modules/playlist.js";
import { PlayerCore } from "./modules/playerCore.js";
import { AudioFX } from "./modules/audioFx.js";
import { PlaylistPersist } from "./modules/playlistPersist.js";

window.addEventListener("DOMContentLoaded", () => {
  // --- DOM ---
  const ui = {
    // audio
    audioA: document.getElementById("audio-a"),
    audioB: document.getElementById("audio-b"),

    // main UI
    fileInput: document.getElementById("file-input"),
    dropZone: document.getElementById("drop-zone"),
    albumArt: document.getElementById("album-art"),
    progressBar: document.getElementById("progress-bar"),
    playPauseBtn: document.getElementById("play-pause-btn"),
    playIcon: document.getElementById("play-icon"),
    pauseIcon: document.getElementById("pause-icon"),
    currentTimeDisplay: document.getElementById("current-time-display"),
    durationDisplay: document.getElementById("duration-display"),
    songTitle: document.getElementById("song-title"),
    songArtist: document.getElementById("song-artist"),
    dropMessage: document.getElementById("drop-message"),
    playerContainer: document.getElementById("player-container"),
    fileSelectUI: document.getElementById("file-select-ui"),

    // minimal
    minimalOverlay: document.getElementById("minimal-play-btn-overlay"),
    minimalPlayIcon: document.getElementById("minimal-play-icon"),
    minimalPauseIcon: document.getElementById("minimal-pause-icon"),

    // controls
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    shuffleBtn: document.getElementById("shuffle-btn"),
    repeatBtn: document.getElementById("repeat-btn"),
    repeatNoneIcon: document.getElementById("repeat-none-icon"),
    repeatAllIcon: document.getElementById("repeat-all-icon"),
    repeatOneIcon: document.getElementById("repeat-one-icon"),
    seekForwardBtn: document.getElementById("seek-forward-btn"),
    seekBackwardBtn: document.getElementById("seek-backward-btn"),
    playlistToggleBtn: document.getElementById("playlist-toggle-btn"),
    playbackRateBtn: document.getElementById("playback-rate-btn"),
    transitionBtn: document.getElementById("transition-btn"),
    eqBtn: document.getElementById("eq-btn"),
    normalizeBtn: document.getElementById("normalize-btn"),
    waveBtn: document.getElementById("wave-btn"),

    // volume
    volumeControl: document.getElementById("volume-control"),
    volumeHighIcon: document.getElementById("volume-high-icon"),
    volumeMuteIcon: document.getElementById("volume-mute-icon"),
    volumeMuteToggle: document.getElementById("volume-mute-toggle"),

    // playlist panel
    playlistPanel: document.getElementById("playlist-panel"),
    playlistCloseBtn: document.getElementById("playlist-close-btn"),
    playlistUl: document.getElementById("playlist-ul"),
    playlistSearch: document.getElementById("playlist-search"),
    clearPlaylistBtn: document.getElementById("clear-playlist-btn"),
    themeToggleBtn: document.getElementById("theme-toggle-btn"),
    themeSunIcon: document.getElementById("theme-sun-icon"),
    themeMoonIcon: document.getElementById("theme-moon-icon"),
    vizStyleBtn: document.getElementById("viz-style-btn"),
    vizLineIcon: document.getElementById("viz-line-icon"),
    vizBarsIcon: document.getElementById("viz-bars-icon"),
    vizDotsIcon: document.getElementById("viz-dots-icon"),
    sortBtn: document.getElementById("sort-btn"),
    selectModeBtn: document.getElementById("select-mode-btn"),
    exportBtn: document.getElementById("export-btn"),
    importBtn: document.getElementById("import-btn"),

    // toast
    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toast-message"),

    // canvas
    vizCanvas: document.getElementById("visualizer-canvas"),
    waveCanvas: document.getElementById("waveform-canvas"),
  };

  // --- core instances ---
  const settings = new Settings();
  const persist = new PlaylistPersist(settings);
  const playlist = new Playlist(settings, persist);
  const audioFx = new AudioFX(settings);
  const player = new PlayerCore(ui, playlist, settings, audioFx);
  const visualizer = new Visualizer(ui.vizCanvas, settings, audioFx);
  visualizer.start(); // まだ音源なくても待機描画OK

  // --- toast ---
  const showToast = (msg, isError = false) => {
    if (!ui.toast || !ui.toastMessage) return;
    ui.toastMessage.textContent = msg;
    ui.toast.style.backgroundColor = isError ? "var(--thumb-color)" : "var(--toast-bg)";
    ui.toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => ui.toast.classList.remove("show"), 2500);
  };

  // --- UI sync helpers ---
  function updateMainUI(index) {
    const t = playlist.tracks[index];
    if (!t) {
      ui.songTitle.textContent = "再生する曲はありません";
      ui.songArtist.textContent = "ファイルをロードしてください";
      ui.durationDisplay.textContent = "0:00";
      ui.currentTimeDisplay.textContent = "0:00";
      ui.progressBar.value = 0;
      ui.albumArt.src = "https://placehold.co/512x512/312e81/ffffff?text=MP3";
      ui.albumArt.classList.add("opacity-20");
      return;
    }
    ui.songTitle.textContent = t.title;
    ui.songArtist.textContent = t.artist;
    ui.durationDisplay.textContent = formatTime(t.duration || 0);

    if (t.artwork) {
      ui.albumArt.src = t.artwork;
      ui.albumArt.classList.remove("opacity-20");
    } else {
      ui.albumArt.src = "https://placehold.co/512x512/312e81/ffffff?text=MP3";
      ui.albumArt.classList.add("opacity-20");
    }

    // waveform
    audioFx.drawWaveform(ui.waveCanvas, t.wavePeaks, settings.get("waveformEnabled"));
  }

  function updatePlayIcons(isPaused) {
    ui.playIcon.classList.toggle("hidden", !isPaused);
    ui.pauseIcon.classList.toggle("hidden", isPaused);
    ui.minimalPlayIcon.classList.toggle("hidden", !isPaused);
    ui.minimalPauseIcon.classList.toggle("hidden", isPaused);
  }

  function updateVolumeIcon(vol) {
    const isMute = vol === 0;
    ui.volumeHighIcon.classList.toggle("hidden", isMute);
    ui.volumeMuteIcon.classList.toggle("hidden", !isMute);
  }

  function updateRepeatIcons(mode) {
    ui.repeatNoneIcon.classList.add("hidden");
    ui.repeatAllIcon.classList.add("hidden");
    ui.repeatOneIcon.classList.add("hidden");
    if (mode === "none") ui.repeatNoneIcon.classList.remove("hidden");
    if (mode === "all") ui.repeatAllIcon.classList.remove("hidden");
    if (mode === "one") ui.repeatOneIcon.classList.remove("hidden");
  }

  function updateThemeIcons() {
    const isLight = document.documentElement.classList.contains("light-mode");
    ui.themeSunIcon.classList.toggle("hidden", !isLight);
    ui.themeMoonIcon.classList.toggle("hidden", isLight);
  }

  function updateVizIcons() {
    const s = settings.get("visualizerStyle");
    ui.vizLineIcon.classList.toggle("hidden", s !== "line");
    ui.vizBarsIcon.classList.toggle("hidden", s !== "bars");
    ui.vizDotsIcon.classList.toggle("hidden", s !== "dots");
  }

  function updateTransitionBtn() {
    const t = settings.get("transitionMode");
    const sec = settings.get("crossfadeSec");
    if (t === "crossfade") ui.transitionBtn.textContent = `XF ${sec}s`;
    else ui.transitionBtn.textContent = t.toUpperCase();
  }

  function updateEqBtn() {
    ui.eqBtn.textContent = `EQ: ${settings.get("eqPreset").toUpperCase()}`;
  }
  function updateNormBtn() {
    ui.normalizeBtn.textContent = `NORM: ${settings.get("normalizeEnabled") ? "ON" : "OFF"}`;
  }
  function updateWaveBtn() {
    ui.waveBtn.textContent = `WAVE: ${settings.get("waveformEnabled") ? "ON" : "OFF"}`;
  }

  function enableSubButtons(enabled) {
    ui.eqBtn.disabled = !enabled;
    ui.normalizeBtn.disabled = !enabled;
    ui.waveBtn.disabled = !enabled;
    ui.transitionBtn.disabled = !enabled;
  }

  // --- playlist render ---
  function renderPlaylist() {
    const ul = ui.playlistUl;
    ul.innerHTML = "";

    if (playlist.tracks.length === 0) {
      ul.innerHTML = `<li class="placeholder text-center pt-10">曲をドロップしてください</li>`;
      return;
    }

    const filter = playlist.currentFilter;
    const indices = playlist.getVisibleIndices(filter);

    indices.forEach((index) => {
      const track = playlist.tracks[index];
      const li = document.createElement("li");
      li.className = "playlist-item flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors relative group";
      li.dataset.index = index;
      li.id = `track-${index}`;

      const img = document.createElement("img");
      img.src = track.artwork || "https://placehold.co/50x50/312e81/ffffff?text=MP3";
      img.className = "w-10 h-10 object-cover rounded-md";
      li.appendChild(img);

      const infoDiv = document.createElement("div");
      infoDiv.className = "flex-grow min-w-0";
      infoDiv.innerHTML = `
        <p class="text-sm font-medium truncate">${track.title}</p>
        <p class="text-xs truncate" style="color: var(--text-secondary);">${track.artist}</p>
      `;
      li.appendChild(infoDiv);

      const durSpan = document.createElement("span");
      durSpan.className = "text-xs font-mono px-2 playlist-duration";
      durSpan.textContent = formatTime(track.duration || 0);
      li.appendChild(durSpan);

      const delBtn = document.createElement("button");
      delBtn.className = "control-btn p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100";
      delBtn.style.color = "var(--text-secondary)";
      delBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none"
          viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>`;
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        playlist.removeTrack(index);
      });
      li.appendChild(delBtn);

      li.addEventListener("click", () => {
        if (playlist.selectMode) {
          playlist.toggleSelect(index);
          renderPlaylist();
          return;
        }
        player.loadTrack(index, true);
      });

      if (index === playlist.currentTrackIndex) li.classList.add("active");
      if (playlist.selected.has(index)) li.classList.add("selected");

      ul.appendChild(li);
    });
  }

  // --- files ---
  async function handleFiles(files) {
    const list = Array.from(files);
    const mp3s = list.filter(isMp3File);
    if (mp3s.length === 0) {
      showToast("MP3ファイルのみ対応しています", true);
      return;
    }

    await playlist.addFiles(mp3s, audioFx);
    player.updateControls();

    if (playlist.currentTrackIndex === -1) {
      player.prepareTrack(0); // 最初の曲だけ準備
      updateMainUI(0);
    }

    renderPlaylist();
    showToast(`${mp3s.length} 曲を追加しました`);
  }

  // input
  ui.fileInput.addEventListener("change", (e) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    e.target.value = "";
  });

  // drag drop
  ui.dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    ui.dropZone.classList.add("bg-white/10", "scale-105");
  });
  ui.dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    ui.dropZone.classList.remove("bg-white/10", "scale-105");
  });
  ui.dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    ui.dropZone.classList.remove("bg-white/10", "scale-105");
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  });

  // minimal dblclick
  ui.dropZone.addEventListener("dblclick", () => {
    if (playlist.tracks.length === 0) return;
    ui.playerContainer.classList.toggle("minimal");
    const isMin = ui.playerContainer.classList.contains("minimal");
    if (isMin) {
      ui.minimalOverlay.classList.remove("opacity-0", "pointer-events-none");
    } else {
      ui.minimalOverlay.classList.add("opacity-0", "pointer-events-none");
    }
  });

  // minimal click play/pause
  ui.dropZone.addEventListener("click", () => {
    if (!ui.playerContainer.classList.contains("minimal")) return;
    if (playlist.tracks.length === 0) return;
    if (playlist.currentTrackIndex === -1) player.loadTrack(0, true);
    else player.togglePlayPause();
  });

  // --- buttons ---
  ui.playPauseBtn.addEventListener("click", () => {
    if (playlist.tracks.length === 0) return;
    if (playlist.currentTrackIndex === -1) {
      player.loadTrack(0, true);
      return;
    }
    player.togglePlayPause();
  });

  ui.prevBtn.addEventListener("click", () => player.playPrev());
  ui.nextBtn.addEventListener("click", () => player.playNext());
  ui.seekForwardBtn.addEventListener("click", () => player.seek(10));
  ui.seekBackwardBtn.addEventListener("click", () => player.seek(-10));

  ui.shuffleBtn.addEventListener("click", () => {
    playlist.toggleShuffle();
    ui.shuffleBtn.classList.toggle("btn-active", playlist.shuffle);
  });

  ui.repeatBtn.addEventListener("click", () => {
    playlist.toggleRepeat();
    updateRepeatIcons(playlist.repeatMode);
  });

  ui.playbackRateBtn.addEventListener("click", () => {
    const rate = player.changePlaybackRate();
    ui.playbackRateBtn.textContent = `${rate}x`;
  });

  ui.transitionBtn.addEventListener("click", () => {
    settings.cycleTransitionMode();
    updateTransitionBtn();
  });

  ui.eqBtn.addEventListener("click", () => {
    settings.cycleEqPreset();
    audioFx.applyEqPresetToAll();
    updateEqBtn();
  });

  ui.normalizeBtn.addEventListener("click", () => {
    settings.toggleNormalize();
    audioFx.applyNormalizeToCurrent(player.getCurrentGainNode());
    updateNormBtn();
  });

  ui.waveBtn.addEventListener("click", () => {
    settings.toggleWaveform();
    updateWaveBtn();
    // 現在曲の再描画
    updateMainUI(playlist.currentTrackIndex);
  });

  // volume
  ui.volumeControl.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    player.setVolume(v);
    updateVolumeIcon(v);
  });

  ui.volumeMuteToggle.addEventListener("click", () => {
    const v = player.toggleMute();
    ui.volumeControl.value = v;
    updateVolumeIcon(v);
  });

  // progress seek
  ui.progressBar.addEventListener("input", (e) => {
    const newTime = player.previewSeek(e.target.value);
    ui.currentTimeDisplay.textContent = formatTime(newTime);
  });
  ui.progressBar.addEventListener("change", (e) => {
    player.commitSeek(e.target.value);
  });

  // playlist panel
  const togglePlaylistPanel = () => ui.playlistPanel.classList.toggle("open");
  ui.playlistToggleBtn.addEventListener("click", togglePlaylistPanel);
  ui.playlistCloseBtn.addEventListener("click", togglePlaylistPanel);

  ui.playlistSearch.addEventListener("input",
    debounce((e) => {
      playlist.setFilter(e.target.value);
      renderPlaylist();
    }, 60)
  );

  ui.clearPlaylistBtn.addEventListener("click", () => {
    player.stop();
    playlist.clearAll();
    renderPlaylist();
    updateMainUI(-1);
    player.updateControls();
    togglePlaylistPanel();
    showToast("プレイリストをクリアしました");
  });

  // theme
  ui.themeToggleBtn.addEventListener("click", () => {
    settings.toggleTheme();
    updateThemeIcons();
  });

  // viz style
  ui.vizStyleBtn.addEventListener("click", () => {
    settings.cycleVisualizerStyle();
    updateVizIcons();
  });

  // sort
  ui.sortBtn.addEventListener("click", () => {
    playlist.cycleSortMode();
    ui.sortBtn.textContent = `SORT: ${playlist.sortMode.toUpperCase()}`;
    renderPlaylist();
  });

  // select mode
  ui.selectModeBtn.addEventListener("click", () => {
    playlist.toggleSelectMode();
    ui.selectModeBtn.classList.toggle("btn-active", playlist.selectMode);
    renderPlaylist();
  });

  // export/import
  ui.exportBtn.addEventListener("click", async () => {
    const json = persist.exportJson();
    await navigator.clipboard.writeText(json);
    showToast("プレイリストJSONをコピーしました");
  });

  ui.importBtn.addEventListener("click", async () => {
    const json = prompt("貼り付けてIMPORT:");
    if (!json) return;
    try {
      persist.importJson(json);
      playlist.reloadFromPersist();
      renderPlaylist();
      showToast("IMPORT完了");
    } catch {
      showToast("IMPORTに失敗しました", true);
    }
  });

  // keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target === ui.playlistSearch) return;
    if (playlist.tracks.length === 0) return;

    if (e.code === "Space" && e.target.tagName !== "INPUT") {
      e.preventDefault();
      ui.playPauseBtn.click();
    }
    if (e.code === "ArrowRight") {
      e.preventDefault();
      if (e.shiftKey) player.playNext();
      else player.seek(10);
    }
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      if (e.shiftKey) player.playPrev();
      else player.seek(-10);
    }
    if (playlist.selectMode && e.code === "Delete") {
      const removed = playlist.removeSelected();
      if (removed > 0) {
        renderPlaylist();
        showToast(`${removed} 曲を削除`);
      }
    }
  });

  // --- Player events ---
  player.on("trackchange", (idx) => {
    updateMainUI(idx);
    renderPlaylist();
    enableSubButtons(true);
  });

  player.on("time", ({ currentTime, duration }) => {
    ui.progressBar.value = duration ? (currentTime / duration) * 100 : 0;
    ui.currentTimeDisplay.textContent = formatTime(currentTime);
    ui.durationDisplay.textContent = formatTime(duration);
  });

  player.on("playstate", (paused) => updatePlayIcons(paused));

  // --- init from settings ---
  if (settings.get("theme") === "light") {
    document.documentElement.classList.add("light-mode");
  }
  updateThemeIcons();
  updateVizIcons();
  updateTransitionBtn();
  updateEqBtn();
  updateNormBtn();
  updateWaveBtn();

  // restore playlist
  playlist.reloadFromPersist();
  renderPlaylist();
  player.updateControls();
  updateVolumeIcon(player.getVolume());
});
