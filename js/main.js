// js/main.js  v3.9.2 hotfix-artwork full
import { Settings } from "./modules/settings.js";
import { Visualizer } from "./modules/visualizer.js";
import { Playlist } from "./modules/playlist.js";
import { PlayerCore } from "./modules/playerCore.js";
import AudioFx from "./modules/audioFx.js";
import { PlaylistPersist } from "./modules/playlistPersist.js";
import { formatTime, isMp3File } from "./modules/utils.js";

// ===============================
// UI
// ===============================
const ui = {
  audioA: document.getElementById("audio-a") || document.getElementById("audio-player"),
  audioB: document.getElementById("audio-b") || null,

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

  minimalPlayBtnOverlay: document.getElementById("minimal-play-btn-overlay"),
  minimalPlayIcon: document.getElementById("minimal-play-icon"),
  minimalPauseIcon: document.getElementById("minimal-pause-icon"),

  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  seekForwardBtn: document.getElementById("seek-forward-btn"),
  seekBackwardBtn: document.getElementById("seek-backward-btn"),

  shuffleBtn: document.getElementById("shuffle-btn"),
  repeatBtn: document.getElementById("repeat-btn"),
  repeatNoneIcon: document.getElementById("repeat-none-icon"),
  repeatAllIcon: document.getElementById("repeat-all-icon"),
  repeatOneIcon: document.getElementById("repeat-one-icon"),
  playbackRateBtn: document.getElementById("playback-rate-btn"),

  volumeControl: document.getElementById("volume-control"),
  volumeMuteToggle: document.getElementById("volume-mute-toggle"),
  volumeHighIcon: document.getElementById("volume-high-icon"),
  volumeMuteIcon: document.getElementById("volume-mute-icon"),

  playlistToggleBtn: document.getElementById("playlist-toggle-btn"),
  playlistCloseBtn: document.getElementById("playlist-close-btn"),
  playlistPanel: document.getElementById("playlist-panel"),
  playlistUl: document.getElementById("playlist-ul"),
  playlistSearch: document.getElementById("playlist-search"),
  clearPlaylistBtn: document.getElementById("clear-playlist-btn"),

  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  themeSunIcon: document.getElementById("theme-sun-icon"),
  themeMoonIcon: document.getElementById("theme-moon-icon"),

  vizStyleBtn: document.getElementById("viz-style-btn"),
  vizLineIcon: document.getElementById("viz-line-icon"),
  vizBarsIcon: document.getElementById("viz-bars-icon"),

  visualizerCanvas: document.getElementById("visualizer-canvas"),

  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toast-message"),
};

// audioBが無ければ作る（クロスフェード用）
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
  if (!ui.toast || !ui.toastMessage) return;
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
// Modules
// ===============================
const settings = new Settings("mp3PlayerSettings_v3");
const persist = new PlaylistPersist("mp3PlayerPlaylist_v3");
const audioFx = new AudioFx(settings);

// ★根本保険：どんなAudioFxが来てもPlaylistが落ちない
if (typeof audioFx.analyzeAndGetGain !== "function") {
  audioFx.analyzeAndGetGain = async () => 1;
}
if (typeof audioFx.extractWavePeaks !== "function") {
  audioFx.extractWavePeaks = async () => null;
}

const playlist = new Playlist(settings, persist);
const player = new PlayerCore(ui, playlist, settings, audioFx);

const visualizer = ui.visualizerCanvas
  ? new Visualizer(ui.visualizerCanvas, settings, audioFx)
  : null;
visualizer?.start?.();

// ✅ メタデータ/アートワーク更新イベントを受けてUI再描画
window.addEventListener("playlist:metadata", (e) => {
  const idx = e.detail?.index;
  renderPlaylist(); // プレイリスト側サムネ更新

  if (idx === playlist.currentTrackIndex) {
    updateMainUI(idx); // メイン側アルバムアート更新
  }
});

playlist.reloadFromPersist?.();
renderPlaylist();
player.updateControls?.();
updateFileUIState();
updateThemeIcons();
updateVizIcons();
updateRepeatIcons();
updateShuffleUi();
updatePlaybackRateUi();

// ===============================
// PlayerCore events
// ===============================
player.on?.("playstate", (isPaused) => {
  updatePlayPauseIcon(isPaused);
  updateMinimalOverlay(isPaused);
  highlightCurrentTrack();
});

player.on?.("trackchange", (index) => {
  updateMainUI(index);
  highlightCurrentTrack();
  setDuration();
});

player.on?.("time", ({ currentTime, duration }) => {
  updateProgress(currentTime, duration);
});

// ===============================
// File handlers
// ===============================
ui.fileInput?.addEventListener("change", async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  await handleFiles(files);
  ui.fileInput.value = "";
});

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

async function handleFiles(files) {
  const mp3s = Array.from(files).filter(isMp3File);
  if (mp3s.length === 0) return;

  await playlist.addFiles(mp3s, audioFx);

  player.updateControls?.();
  updateFileUIState();
  renderPlaylist();

  if (playlist.currentTrackIndex === -1) {
    const first = playlist.getFirstPlayableIndex?.(0, 1) ?? 0;
    if (first !== -1) {
      playlist.currentTrackIndex = first;
      player.prepareTrack?.(first);
      updateMainUI(first);
      highlightCurrentTrack();
    }
  }

  showToast(`${mp3s.length} 曲を追加しました`);
}

// ===============================
// Controls
// ===============================
ui.playPauseBtn?.addEventListener("click", () => {
  if (playlist.tracks.length === 0) return;

  audioFx.ensureContext?.();
  audioFx.resumeContext?.();

  if (playlist.currentTrackIndex === -1) {
    const first = playlist.getFirstPlayableIndex?.(0, 1) ?? 0;
    if (first !== -1) {
      playlist.currentTrackIndex = first;
      player.loadTrack?.(first, true);
    }
    return;
  }

  player.togglePlayPause?.();
});

ui.prevBtn?.addEventListener("click", () => player.playPrev?.());
ui.nextBtn?.addEventListener("click", () => player.playNext?.());

ui.seekForwardBtn?.addEventListener("click", () => player.seek?.(10));
ui.seekBackwardBtn?.addEventListener("click", () => player.seek?.(-10));

ui.shuffleBtn?.addEventListener("click", () => {
  playlist.toggleShuffle?.();
  updateShuffleUi();
});

ui.repeatBtn?.addEventListener("click", () => {
  playlist.toggleRepeat?.();
  updateRepeatIcons();
});

ui.playbackRateBtn?.addEventListener("click", () => {
  const rate = player.changePlaybackRate?.() ?? 1;
  updatePlaybackRateUi();
  showToast(`再生速度 ${rate}x`);
});

ui.progressBar?.addEventListener("input", (e) => {
  const a = player.getActiveAudio?.() ?? ui.audioA;
  if (!a?.duration) return;
  const p = parseFloat(e.target.value || "0");
  const t = a.duration * (p / 100);
  ui.currentTimeDisplay.textContent = formatTime(t);
});

ui.progressBar?.addEventListener("change", (e) => {
  const a = player.getActiveAudio?.() ?? ui.audioA;
  if (!a?.duration) return;
  const p = parseFloat(e.target.value || "0");
  a.currentTime = a.duration * (p / 100);
});

ui.volumeControl?.addEventListener("input", (e) => {
  const v = parseFloat(e.target.value || "1");
  player.setVolume?.(v);
  updateVolumeIcon(v);
});

ui.volumeMuteToggle?.addEventListener("click", () => {
  const v = player.toggleMute?.() ?? 0;
  ui.volumeControl.value = v;
  updateVolumeIcon(v);
});

// ===============================
// Playlist panel / search / clear
// ===============================
function togglePlaylist() {
  ui.playlistPanel?.classList.toggle("open");
}
ui.playlistToggleBtn?.addEventListener("click", togglePlaylist);
ui.playlistCloseBtn?.addEventListener("click", togglePlaylist);

ui.playlistSearch?.addEventListener("input", (e) => {
  playlist.setFilter?.(e.target.value);
  renderPlaylist();
});

ui.clearPlaylistBtn?.addEventListener("click", () => {
  player.stop?.();
  playlist.clearAll?.();
  renderPlaylist();
  resetPlayerUI();
  player.updateControls?.();
  togglePlaylist();
  showToast("プレイリストをクリアしました");
});

// ===============================
// Theme / Visualizer
// ===============================
ui.themeToggleBtn?.addEventListener("click", () => {
  document.documentElement.classList.toggle("light-mode");
  settings.set?.("theme", document.documentElement.classList.contains("light-mode") ? "light" : "dark");
  updateThemeIcons();
});

ui.vizStyleBtn?.addEventListener("click", () => {
  const cur = settings.get?.("visualizerStyle") || "line";
  const next = (cur === "line") ? "bars" : "line";
  settings.set?.("visualizerStyle", next);
  updateVizIcons();
});

// ===============================
// Minimal mode
// ===============================
ui.dropZone?.addEventListener("dblclick", () => {
  if (playlist.tracks.length === 0) return;
  ui.playerContainer?.classList.toggle("minimal");
  updateMinimalOverlay((player.getActiveAudio?.() ?? ui.audioA)?.paused ?? true);
});

ui.dropZone?.addEventListener("click", () => {
  if (!ui.playerContainer?.classList.contains("minimal")) return;
  if (playlist.tracks.length === 0) return;
  ui.playPauseBtn?.click();
});

// ===============================
// UI helpers
// ===============================
function updateFileUIState() {
  ui.fileSelectUI?.classList.toggle("file-select-hidden", playlist.tracks.length > 0);
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
  if (index < 0 || !playlist.tracks[index]) {
    ui.songTitle.textContent = "再生する曲はありません";
    ui.songArtist.textContent = "ファイルをロードしてください";
    resetAlbumArt();
    return;
  }

  const t = playlist.tracks[index];
  ui.songTitle.textContent = t.title || "Unknown Title";
  ui.songArtist.textContent = t.artist || "Unknown Artist";

  if (t.artwork) {
    ui.albumArt.src = t.artwork;
    ui.albumArt.classList.remove("opacity-20");
  } else {
    resetAlbumArt();
  }
}

function resetAlbumArt() {
  ui.albumArt.src = "https://placehold.co/512x512/312e81/ffffff?text=MP3";
  ui.albumArt.classList.add("opacity-20");
}

function resetPlayerUI() {
  updateMainUI(-1);
  ui.currentTimeDisplay.textContent = "0:00";
  ui.durationDisplay.textContent = "0:00";
  ui.progressBar.value = 0;
  updatePlayPauseIcon(true);
}

function updateProgress(currentTime, duration) {
  const pct = duration ? (currentTime / duration) * 100 : 0;
  ui.progressBar.value = pct;
  ui.currentTimeDisplay.textContent = formatTime(currentTime);
  if (duration) ui.durationDisplay.textContent = formatTime(duration);
}

function setDuration() {
  const a = player.getActiveAudio?.() ?? ui.audioA;
  if (a?.duration) ui.durationDisplay.textContent = formatTime(a.duration);
}

function highlightCurrentTrack() {
  ui.playlistUl?.querySelectorAll("li.playlist-item").forEach(li => li.classList.remove("active"));
  const cur = ui.playlistUl?.querySelector(`li.playlist-item[data-index="${playlist.currentTrackIndex}"]`);
  cur?.classList.add("active");
}

function updateRepeatIcons() {
  const mode = playlist.repeatMode || "none";
  ui.repeatNoneIcon?.classList.add("hidden");
  ui.repeatAllIcon?.classList.add("hidden");
  ui.repeatOneIcon?.classList.add("hidden");

  if (mode === "none") ui.repeatNoneIcon?.classList.remove("hidden");
  if (mode === "all") ui.repeatAllIcon?.classList.remove("hidden");
  if (mode === "one") ui.repeatOneIcon?.classList.remove("hidden");
}

function updateShuffleUi() {
  ui.shuffleBtn?.classList.toggle("btn-active", !!playlist.shuffle);
}

function updatePlaybackRateUi() {
  const rate = player.playbackRates?.[player.currentRateIndex] ?? 1;
  ui.playbackRateBtn.textContent = `${rate}x`;
}

function updateVolumeIcon(vol) {
  if (vol === 0) {
    ui.volumeHighIcon?.classList.add("hidden");
    ui.volumeMuteIcon?.classList.remove("hidden");
  } else {
    ui.volumeHighIcon?.classList.remove("hidden");
    ui.volumeMuteIcon?.classList.add("hidden");
  }
}

function updateThemeIcons() {
  const isLight = document.documentElement.classList.contains("light-mode");
  ui.themeSunIcon?.classList.toggle("hidden", !isLight);
  ui.themeMoonIcon?.classList.toggle("hidden", isLight);
}

function updateVizIcons() {
  const style = settings.get?.("visualizerStyle") || "line";
  ui.vizLineIcon?.classList.toggle("hidden", style !== "line");
  ui.vizBarsIcon?.classList.toggle("hidden", style !== "bars");
}

// ===============================
// Playlist render
// ===============================
function renderPlaylist() {
  if (!ui.playlistUl) return;

  ui.playlistUl.innerHTML = "";
  if (playlist.tracks.length === 0) {
    ui.playlistUl.innerHTML = `<li class="placeholder text-center pt-10">曲をドロップしてください</li>`;
    return;
  }

  const indices = playlist.getVisibleIndices?.() ?? playlist.tracks.map((_, i) => i);

  indices.forEach((index) => {
    const t = playlist.tracks[index];

    const li = document.createElement("li");
    li.className = "playlist-item group flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors relative";
    li.dataset.index = index;
    li.id = `track-${index}`;

    const img = document.createElement("img");
    img.src = t.artwork || "https://placehold.co/50x50/312e81/ffffff?text=MP3";
    img.className = "w-10 h-10 object-cover rounded-md";
    li.appendChild(img);

    const infoDiv = document.createElement("div");
    infoDiv.className = "flex-grow min-w-0";
    infoDiv.innerHTML = `
      <p class="text-sm font-medium truncate">${t.title}</p>
      <p class="text-xs truncate" style="color: var(--text-secondary);">${t.artist}</p>
    `;
    li.appendChild(infoDiv);

    const dur = document.createElement("span");
    dur.className = "text-xs font-mono px-2 playlist-duration";
    dur.textContent = formatTime(t.duration);
    li.appendChild(dur);

    const del = document.createElement("button");
    del.className = "control-btn p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100";
    del.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none"
        viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0
             01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0
             00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    `;
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      playlist.removeTrack(index);
      renderPlaylist();
      player.updateControls?.();
      if (playlist.tracks.length === 0) resetPlayerUI();
    });
    li.appendChild(del);

    li.addEventListener("click", () => {
      playlist.currentTrackIndex = index;
      player.loadTrack?.(index, true);
      updateMainUI(index);
      highlightCurrentTrack();
    });

    ui.playlistUl.appendChild(li);
  });

  highlightCurrentTrack();
}

// ===============================
// Keyboard shortcuts
// ===============================
document.addEventListener("keydown", (e) => {
  if (e.target === ui.playlistSearch) return;
  if (playlist.tracks.length === 0) return;

  if (e.code === "Space" && e.target.tagName !== "INPUT") {
    e.preventDefault();
    ui.playPauseBtn?.click();
  }
  if (e.code === "ArrowRight") {
    e.preventDefault();
    if (e.shiftKey) player.playNext?.();
    else player.seek?.(10);
  }
  if (e.code === "ArrowLeft") {
    e.preventDefault();
    if (e.shiftKey) player.playPrev?.();
    else player.seek?.(-10);
  }
});
