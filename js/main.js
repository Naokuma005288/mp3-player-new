// js/main.js  v3.9.1 hotfix2 full
import { Settings } from "./modules/settings.js";
import { Visualizer } from "./modules/visualizer.js";
import { Playlist } from "./modules/playlist.js";
import { PlayerCore } from "./modules/playerCore.js";
import { AudioFx } from "./modules/audioFx.js";
import { PlaylistPersist } from "./modules/playlistPersist.js";
import { clamp, formatTime, isMp3File } from "./modules/utils.js";

// ===============================
// UI取得（null安全）
// ===============================
const ui = {
  // audio
  audioA: document.getElementById("audio-a") || document.getElementById("audio-player"),
  audioB: document.getElementById("audio-b") || null,

  // main
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
  playerContainer: document.getElementById("player-container"),
  fileSelectUI: document.getElementById("file-select-ui"),

  // minimal
  minimalPlayBtnOverlay: document.getElementById("minimal-play-btn-overlay"),
  minimalPlayIcon: document.getElementById("minimal-play-icon"),
  minimalPauseIcon: document.getElementById("minimal-pause-icon"),

  // nav
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  seekForwardBtn: document.getElementById("seek-forward-btn"),
  seekBackwardBtn: document.getElementById("seek-backward-btn"),

  // shuffle / repeat / rate
  shuffleBtn: document.getElementById("shuffle-btn"),
  repeatBtn: document.getElementById("repeat-btn"),
  repeatNoneIcon: document.getElementById("repeat-none-icon"),
  repeatAllIcon: document.getElementById("repeat-all-icon"),
  repeatOneIcon: document.getElementById("repeat-one-icon"),
  playbackRateBtn: document.getElementById("playback-rate-btn"),

  // volume
  volumeControl: document.getElementById("volume-control"),
  volumeMuteToggle: document.getElementById("volume-mute-toggle"),
  volumeHighIcon: document.getElementById("volume-high-icon"),
  volumeMuteIcon: document.getElementById("volume-mute-icon"),

  // playlist panel
  playlistToggleBtn: document.getElementById("playlist-toggle-btn"),
  playlistCloseBtn: document.getElementById("playlist-close-btn"),
  playlistPanel: document.getElementById("playlist-panel"),
  playlistUl: document.getElementById("playlist-ul"),
  playlistSearch: document.getElementById("playlist-search"),
  clearPlaylistBtn: document.getElementById("clear-playlist-btn"),

  // settings buttons
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  themeSunIcon: document.getElementById("theme-sun-icon"),
  themeMoonIcon: document.getElementById("theme-moon-icon"),
  vizStyleBtn: document.getElementById("viz-style-btn"),
  vizLineIcon: document.getElementById("viz-line-icon"),
  vizBarsIcon: document.getElementById("viz-bars-icon"),

  // optional advanced buttons
  eqBtn: document.getElementById("eq-btn") || document.getElementById("eq-toggle-btn"),
  normalizeBtn: document.getElementById("normalize-btn") || document.getElementById("normalize-toggle-btn"),
  waveBtn: document.getElementById("wave-btn") || document.getElementById("wave-toggle-btn"),
  transitionBtn: document.getElementById("transition-btn") || document.getElementById("transition-toggle-btn"),
  sortBtn: document.getElementById("sort-btn"),
  selectBtn: document.getElementById("select-btn"),
  removeSelectedBtn: document.getElementById("remove-selected-btn"),

  // import/export
  importBtn: document.getElementById("import-btn"),
  exportBtn: document.getElementById("export-btn"),

  // visualizer
  visualizerCanvas: document.getElementById("visualizer-canvas"),

  // toast
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toast-message"),
};

// audioBが無ければ作成（保険）
if (!ui.audioB) {
  ui.audioB = document.createElement("audio");
  ui.audioB.style.display = "none";
  document.body.appendChild(ui.audioB);
}

// ===============================
// Toast
// ===============================
let toastTimer = null;
function showToast(message, isError = false) {
  if (!ui.toast || !ui.toastMessage) {
    console.log("[toast]", message);
    return;
  }
  if (toastTimer) clearTimeout(toastTimer);

  ui.toastMessage.textContent = message;
  ui.toast.style.backgroundColor = isError
    ? "var(--thumb-color)"
    : "var(--toast-bg)";

  ui.toast.classList.add("show");
  toastTimer = setTimeout(() => {
    ui.toast.classList.remove("show");
  }, 3000);
}

// ===============================
// Modules init
// ===============================
const settings = new Settings("mp3PlayerSettings_v3");
const persist = new PlaylistPersist("mp3PlayerPlaylist_v3");
const audioFx = new AudioFx(settings);
const playlist = new Playlist(settings, persist);
const player = new PlayerCore(ui, playlist, settings, audioFx);
const visualizer = ui.visualizerCanvas ? new Visualizer(ui.visualizerCanvas, player, settings) : null;

// ゴースト復元（再生不能曲が含まれても落ちない）
playlist.reloadFromPersist();

// ===============================
// 初期UI
// ===============================
updateThemeIcons();
updateVizIcons();
renderPlaylist();
player.updateControls();
updateFileUIState();
updateRepeatIcons();
updateShuffleUi();
updatePlaybackRateUi();

// ===============================
// Events from PlayerCore
// ===============================
player.on("playstate", (isPaused) => {
  updatePlayPauseIcon(isPaused);
  updateMinimalOverlay(isPaused);
  highlightCurrentTrack();
});

player.on("trackchange", (index) => {
  updateMainUI(index);
  highlightCurrentTrack();
  setDuration();
});

player.on("time", ({ currentTime, duration }) => {
  updateProgress(currentTime, duration);
});

// ===============================
// File input
// ===============================
ui.fileInput?.addEventListener("change", async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  await handleFiles(files);
  ui.fileInput.value = "";
});

// Drag & Drop
ui.dropZone?.addEventListener("dragover", (e) => {
  e.preventDefault();
  ui.dropZone.classList.add("bg-white/10", "scale-105");
});
ui.dropZone?.addEventListener("dragleave", (e) => {
  e.preventDefault();
  ui.dropZone.classList.remove("bg-white/10", "scale-105");
});
ui.dropZone?.addEventListener("drop", async (e) => {
  e.preventDefault();
  ui.dropZone.classList.remove("bg-white/10", "scale-105");

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const mp3s = Array.from(files).filter(isMp3File);
  if (mp3s.length === 0) {
    showToast("MP3ファイルのみ対応しています", true);
    return;
  }
  await handleFiles(mp3s);
});

// ===============================
// Minimal mode
// ===============================
ui.dropZone?.addEventListener("dblclick", toggleMinimalMode);

// minimal click play/pause (hotfix)
ui.dropZone?.addEventListener("click", () => {
  if (!ui.playerContainer?.classList.contains("minimal")) return;
  if (playlist.tracks.length === 0) return;

  audioFx.ensureContext?.();
  audioFx.resumeContext?.();

  if (playlist.currentTrackIndex === -1) {
    const first = playlist.getFirstPlayableIndex(0, 1);
    if (first !== -1) player.loadTrack(first, true);
    return;
  }
  player.togglePlayPause();
});

// ===============================
// Play / Pause (hotfix)
// ===============================
ui.playPauseBtn?.addEventListener("click", () => {
  if (playlist.tracks.length === 0) return;

  audioFx.ensureContext?.();
  audioFx.resumeContext?.();

  if (playlist.currentTrackIndex === -1) {
    const first = playlist.getFirstPlayableIndex(0, 1);
    if (first !== -1) player.loadTrack(first, true);
    return;
  }
  player.togglePlayPause();
});

// Prev / Next
ui.prevBtn?.addEventListener("click", () => player.playPrev());
ui.nextBtn?.addEventListener("click", () => player.playNext());

// Seek ±10
ui.seekForwardBtn?.addEventListener("click", () => player.seek(10));
ui.seekBackwardBtn?.addEventListener("click", () => player.seek(-10));

// Shuffle / Repeat
ui.shuffleBtn?.addEventListener("click", () => {
  playlist.toggleShuffle();
  updateShuffleUi();
  showToast(playlist.shuffle ? "シャッフルON" : "シャッフルOFF");
});
ui.repeatBtn?.addEventListener("click", () => {
  playlist.toggleRepeat();
  updateRepeatIcons();
  showToast(`リピート: ${playlist.repeatMode}`);
});

// Playback rate
ui.playbackRateBtn?.addEventListener("click", () => {
  const rate = player.changePlaybackRate();
  updatePlaybackRateUi();
  showToast(`再生速度 ${rate}x`);
});

// Progress bar preview / commit
ui.progressBar?.addEventListener("input", (e) => {
  const v = parseFloat(e.target.value || "0");
  const newTime = player.previewSeek(v);
  if (ui.currentTimeDisplay) ui.currentTimeDisplay.textContent = formatTime(newTime);
});
ui.progressBar?.addEventListener("change", (e) => {
  const v = parseFloat(e.target.value || "0");
  player.commitSeek(v);
});

// Volume slider
ui.volumeControl?.addEventListener("input", (e) => {
  const v = parseFloat(e.target.value || "1");
  player.setVolume(v);
  updateVolumeIcon(v);
});

// Mute toggle
ui.volumeMuteToggle?.addEventListener("click", () => {
  const v = player.toggleMute();
  if (ui.volumeControl) ui.volumeControl.value = v;
  updateVolumeIcon(v);
});

// Playlist panel open/close
ui.playlistToggleBtn?.addEventListener("click", togglePlaylist);
ui.playlistCloseBtn?.addEventListener("click", togglePlaylist);

// Playlist search
ui.playlistSearch?.addEventListener("input", (e) => {
  playlist.setFilter(e.target.value);
  renderPlaylist();
});

// Clear playlist
ui.clearPlaylistBtn?.addEventListener("click", () => {
  player.stop();
  playlist.clearAll();
  renderPlaylist();
  resetPlayerUI();
  player.updateControls();
  togglePlaylist(false);
  showToast("プレイリストをクリアしました");
});

// Theme toggle
ui.themeToggleBtn?.addEventListener("click", () => {
  const mode = settings.toggleTheme();
  updateThemeIcons();
  showToast(mode === "light" ? "ライトモード" : "ダークモード");
});

// Visualizer style toggle
ui.vizStyleBtn?.addEventListener("click", () => {
  const style = settings.toggleVisualizerStyle();
  updateVizIcons();
  visualizer?.setStyle?.(style);
  showToast(`ビジュアライザー: ${style}`);
});

// Optional advanced toggles
ui.eqBtn?.addEventListener("click", () => {
  const enabled = settings.toggleEq?.() ?? false;
  ui.eqBtn.classList.toggle("btn-active", enabled);
  audioFx.setEqEnabled?.(enabled);
  showToast(enabled ? "EQ ON" : "EQ OFF");
});

ui.normalizeBtn?.addEventListener("click", () => {
  const enabled = settings.toggleNormalize?.() ?? false;
  ui.normalizeBtn.classList.toggle("btn-active", enabled);
  audioFx.setNormalizeEnabled?.(enabled);
  showToast(enabled ? "音量正規化 ON" : "音量正規化 OFF");
});

ui.waveBtn?.addEventListener("click", () => {
  const enabled = settings.toggleWaveform?.() ?? false;
  ui.waveBtn.classList.toggle("btn-active", enabled);
  showToast(enabled ? "波形表示 ON" : "波形表示 OFF");
  renderPlaylist();
});

ui.transitionBtn?.addEventListener("click", () => {
  const mode = settings.cycleTransitionMode?.() ?? "none";
  ui.transitionBtn.classList.toggle("btn-active", mode !== "none");
  showToast(`曲間遷移: ${mode}`);
});

// Sort / Select / Remove selected
ui.sortBtn?.addEventListener("click", () => {
  playlist.cycleSortMode();
  renderPlaylist();
  showToast(`ソート: ${playlist.sortMode}`);
});

ui.selectBtn?.addEventListener("click", () => {
  playlist.toggleSelectMode();
  ui.selectBtn.classList.toggle("btn-active", playlist.selectMode);
  renderPlaylist();
  showToast(playlist.selectMode ? "選択モード ON" : "選択モード OFF");
});

ui.removeSelectedBtn?.addEventListener("click", () => {
  const n = playlist.removeSelected();
  if (n > 0) {
    renderPlaylist();
    showToast(`${n}曲削除しました`);
    if (playlist.tracks.length === 0) resetPlayerUI();
  } else {
    showToast("選択されていません", true);
  }
});

// ===============================
// Import / Export （メタデータのみ）
// ===============================
ui.exportBtn?.addEventListener("click", () => exportPlaylistJSON());
ui.importBtn?.addEventListener("click", () => importPlaylistJSON());

function exportPlaylistJSON() {
  if (playlist.tracks.length === 0) {
    showToast("プレイリストが空です", true);
    return;
  }

  const data = playlist.tracks.map(t => ({
    title: t.title || "",
    artist: t.artist || "",
    duration: t.duration || 0,
    gain: t.gain || 1,
    isGhost: !t.file,
    fileName: t.file?.name || null
  }));

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "mp3-player-playlist.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showToast("プレイリストを書き出しました");
}

function importPlaylistJSON() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const arr = JSON.parse(text);

      if (!Array.isArray(arr)) throw new Error("Invalid JSON");

      player.stop();
      playlist.clearAll();

      playlist.tracks = arr.map(p => ({
        file: null,
        title: p.title || "Imported Track",
        artist: p.artist || "Unknown",
        duration: p.duration || 0,
        artwork: null,
        wavePeaks: null,
        gain: (p.gain && p.gain > 0.02) ? p.gain : 1,
        isGhost: true
      }));

      persist.save(playlist.tracks);
      playlist.currentTrackIndex = -1;

      renderPlaylist();
      resetPlayerUI();
      player.updateControls();

      showToast("プレイリストを読み込みました（曲データは未ロード）");
    } catch (e) {
      console.error(e);
      showToast("読み込みに失敗しました", true);
    }
  };

  input.click();
}

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.target === ui.playlistSearch) return;
  if (playlist.tracks.length === 0) return;

  if (e.code === "Space" && e.target.tagName !== "INPUT") {
    e.preventDefault();
    ui.playPauseBtn?.click();
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
});

// ===============================
// Core functions
// ===============================
async function handleFiles(files) {
  const list = Array.from(files);
  const mp3s = list.filter(isMp3File);
  if (mp3s.length === 0) {
    showToast("MP3ファイルのみ対応しています", true);
    return;
  }

  await playlist.addFiles(mp3s, audioFx);
  player.updateControls();
  updateFileUIState();

  // hotfix: 最初の再生可能曲へ（ghostスキップ）
  const firstPlayable = playlist.getFirstPlayableIndex(0, 1);
  if (playlist.currentTrackIndex === -1 && firstPlayable !== -1) {
    player.prepareTrack(firstPlayable);
    updateMainUI(firstPlayable);
  }

  renderPlaylist();
  showToast(`${mp3s.length} 曲を追加しました`);
}

function toggleMinimalMode() {
  if (playlist.tracks.length === 0 || !ui.playerContainer) return;
  ui.playerContainer.classList.toggle("minimal");
  updateMinimalOverlay(player.getActiveAudio().paused);
}

function togglePlaylist(force) {
  if (!ui.playlistPanel) return;
  if (typeof force === "boolean") {
    ui.playlistPanel.classList.toggle("open", force);
  } else {
    ui.playlistPanel.classList.toggle("open");
  }
}

function updateFileUIState() {
  if (!ui.fileSelectUI) return;
  ui.fileSelectUI.classList.toggle("file-select-hidden", playlist.tracks.length > 0);
}

function updatePlayPauseIcon(isPaused) {
  ui.playIcon?.classList.toggle("hidden", !isPaused);
  ui.pauseIcon?.classList.toggle("hidden", isPaused);
  ui.minimalPlayIcon?.classList.toggle("hidden", !isPaused);
  ui.minimalPauseIcon?.classList.toggle("hidden", isPaused);
}

function updateMinimalOverlay(isPaused) {
  if (!ui.playerContainer?.classList.contains("minimal")) {
    ui.minimalPlayBtnOverlay?.classList.add("opacity-0", "pointer-events-none");
    return;
  }
  if (isPaused) {
    ui.minimalPlayBtnOverlay?.classList.remove("opacity-0", "pointer-events-none");
  } else {
    ui.minimalPlayBtnOverlay?.classList.add("opacity-0", "pointer-events-none");
  }
}

function updateMainUI(index) {
  if (!ui.songTitle || !ui.songArtist) return;

  if (index < 0 || !playlist.tracks[index]) {
    ui.songTitle.textContent = "再生する曲はありません";
    ui.songArtist.textContent = "ファイルをロードしてください";
    resetAlbumArt();
    return;
  }

  const track = playlist.tracks[index];
  ui.songTitle.textContent = track.title || "Unknown Title";
  ui.songArtist.textContent = track.artist || "Unknown Artist";

  if (track.artwork && ui.albumArt) {
    ui.albumArt.src = track.artwork;
    ui.albumArt.classList.remove("opacity-20");
  } else {
    resetAlbumArt();
  }
}

function resetAlbumArt() {
  if (!ui.albumArt) return;
  ui.albumArt.src = "https://placehold.co/512x512/312e81/ffffff?text=MP3";
  ui.albumArt.classList.add("opacity-20");
}

function resetPlayerUI() {
  updateMainUI(-1);
  if (ui.currentTimeDisplay) ui.currentTimeDisplay.textContent = "0:00";
  if (ui.durationDisplay) ui.durationDisplay.textContent = "0:00";
  if (ui.progressBar) ui.progressBar.value = 0;
  updatePlayPauseIcon(true);
}

function updateProgress(currentTime, duration) {
  if (!ui.progressBar) return;

  const pct = duration ? (currentTime / duration) * 100 : 0;
  ui.progressBar.value = pct;

  if (ui.currentTimeDisplay) ui.currentTimeDisplay.textContent = formatTime(currentTime);
  if (ui.durationDisplay && duration) ui.durationDisplay.textContent = formatTime(duration);
}

function setDuration() {
  const a = player.getActiveAudio();
  if (ui.durationDisplay && a?.duration) {
    ui.durationDisplay.textContent = formatTime(a.duration);
  }
}

function highlightCurrentTrack() {
  if (!ui.playlistUl) return;
  ui.playlistUl.querySelectorAll("li.playlist-item").forEach(li => li.classList.remove("active"));
  const cur = ui.playlistUl.querySelector(`li.playlist-item[data-index="${playlist.currentTrackIndex}"]`);
  cur?.classList.add("active");
}

function updateRepeatIcons() {
  const mode = playlist.repeatMode;
  ui.repeatNoneIcon?.classList.add("hidden");
  ui.repeatAllIcon?.classList.add("hidden");
  ui.repeatOneIcon?.classList.add("hidden");

  if (mode === "none") ui.repeatNoneIcon?.classList.remove("hidden");
  if (mode === "all") ui.repeatAllIcon?.classList.remove("hidden");
  if (mode === "one") ui.repeatOneIcon?.classList.remove("hidden");
}

function updateShuffleUi() {
  ui.shuffleBtn?.classList.toggle("btn-active", playlist.shuffle);
}

function updatePlaybackRateUi() {
  const rate = player.playbackRates?.[player.currentRateIndex] ?? 1;
  if (ui.playbackRateBtn) ui.playbackRateBtn.textContent = `${rate}x`;
}

function updateVolumeIcon(volume) {
  if (volume === 0) {
    ui.volumeHighIcon?.classList.add("hidden");
    ui.volumeMuteIcon?.classList.remove("hidden");
  } else {
    ui.volumeHighIcon?.classList.remove("hidden");
    ui.volumeMuteIcon?.classList.add("hidden");
  }
}

function updateThemeIcons() {
  const isLight = settings.get("theme") === "light";
  ui.themeSunIcon?.classList.toggle("hidden", !isLight);
  ui.themeMoonIcon?.classList.toggle("hidden", isLight);
}

function updateVizIcons() {
  const style = settings.get("visualizerStyle") || "line";
  ui.vizLineIcon?.classList.toggle("hidden", style !== "line");
  ui.vizBarsIcon?.classList.toggle("hidden", style !== "bars");
}

function renderPlaylist() {
  if (!ui.playlistUl) return;

  ui.playlistUl.innerHTML = "";
  if (playlist.tracks.length === 0) {
    ui.playlistUl.innerHTML = `<li class="placeholder text-center pt-10">曲をドロップしてください</li>`;
    return;
  }

  const visibleIndices = playlist.getVisibleIndices(playlist.currentFilter);

  visibleIndices.forEach((index) => {
    const track = playlist.tracks[index];
    const li = document.createElement("li");
    li.className =
      "playlist-item group flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors relative";
    li.dataset.index = index;

    // ghostは薄く
    if (!track.file) li.style.opacity = "0.6";

    if (playlist.selectMode) {
      li.classList.add("ring-1", "ring-white/20");
      if (playlist.selected.has(index)) li.classList.add("btn-active");
    }

    // artwork
    const img = document.createElement("img");
    img.src = track.artwork || "https://placehold.co/50x50/312e81/ffffff?text=MP3";
    img.className = "w-10 h-10 object-cover rounded-md";
    li.appendChild(img);

    // title/artist
    const infoDiv = document.createElement("div");
    infoDiv.className = "flex-grow min-w-0";
    if (track.artist === "ロード中...") {
      infoDiv.innerHTML = `
        <p class="text-sm font-medium truncate">${track.title}</p>
        <p class="text-xs truncate w-24 h-4 rounded bg-gray-500/30 animate-pulse"></p>
      `;
    } else {
      infoDiv.innerHTML = `
        <p class="text-sm font-medium truncate">${track.title}</p>
        <p class="text-xs truncate playlist-artist" style="color: var(--text-secondary);">${track.artist}</p>
      `;
    }
    li.appendChild(infoDiv);

    // duration
    const dur = document.createElement("span");
    dur.className = "text-xs font-mono px-2 playlist-duration";
    dur.textContent = formatTime(track.duration);
    if (!track.duration) {
      dur.className += " w-8 h-4 rounded bg-gray-500/30 animate-pulse";
    }
    li.appendChild(dur);

    // delete btn
    const del = document.createElement("button");
    del.className =
      "control-btn p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100";
    del.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    `;
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      playlist.removeTrack(index);
      renderPlaylist();
      player.updateControls();
      if (playlist.tracks.length === 0) resetPlayerUI();
    });
    li.appendChild(del);

    // click item
    li.addEventListener("click", () => {
      if (playlist.selectMode) {
        playlist.toggleSelect(index);
        renderPlaylist();
        return;
      }
      player.loadTrack(index, true);
    });

    ui.playlistUl.appendChild(li);
  });

  highlightCurrentTrack();
}
