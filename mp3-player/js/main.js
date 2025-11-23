import { initPlayerCore } from "./modules/playerCore.js";
import { initPlaylistUI } from "./modules/playlist.js";
import { initVisualizerUI } from "./modules/visualizer.js";
import { loadSettings } from "./modules/settings.js";

const els = {
  audioPlayer: document.getElementById("audio-player"),
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
  minimalPlayBtnOverlay: document.getElementById("minimal-play-btn-overlay"),
  minimalPlayIcon: document.getElementById("minimal-play-icon"),
  minimalPauseIcon: document.getElementById("minimal-pause-icon"),

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
  playlistCloseBtn: document.getElementById("playlist-close-btn"),
  playlistPanel: document.getElementById("playlist-panel"),
  playlistUl: document.getElementById("playlist-ul"),
  playbackRateBtn: document.getElementById("playback-rate-btn"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  themeSunIcon: document.getElementById("theme-sun-icon"),
  themeMoonIcon: document.getElementById("theme-moon-icon"),
  vizStyleBtn: document.getElementById("viz-style-btn"),
  vizLineIcon: document.getElementById("viz-line-icon"),
  vizBarsIcon: document.getElementById("viz-bars-icon"),
  playlistSearch: document.getElementById("playlist-search"),
  clearPlaylistBtn: document.getElementById("clear-playlist-btn"),

  volumeControl: document.getElementById("volume-control"),
  volumeHighIcon: document.getElementById("volume-high-icon"),
  volumeMuteIcon: document.getElementById("volume-mute-icon"),
  volumeMuteToggle: document.getElementById("volume-mute-toggle"),

  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toast-message"),

  visualizerCanvas: document.getElementById("visualizer-canvas")
};

// コア初期化
const core = initPlayerCore(els);
const playlistUI = initPlaylistUI(els, core);
const vizUI = initVisualizerUI(els, core);

// 設定の復元
loadSettings(els, core, vizUI);

// 初期描画
playlistUI.renderPlaylist();
core.updateFileUIState();
core.enableControls();

// --- イベント wiring ---

// ファイル選択
els.fileInput.addEventListener("change", (e) => {
  const files = e.target.files;
  if (files?.length) core.handleFiles(files);
});

// Drag & Drop
els.dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.dropZone.classList.add("bg-white/10", "scale-105");
});
els.dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  els.dropZone.classList.remove("bg-white/10", "scale-105");
});
els.dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropZone.classList.remove("bg-white/10", "scale-105");
  const files = e.dataTransfer.files;
  if (!files?.length) return;
  const mp3Files = Array.from(files).filter(f => f.type === "audio/mpeg");
  if (mp3Files.length) core.handleFiles(mp3Files);
  else core.showToast("MP3ファイルのみ対応しています", true);
});

// ミニマル切り替え
els.dropZone.addEventListener("dblclick", core.toggleMinimalMode);

// ミニマル中クリック再生
els.dropZone.addEventListener("click", (e) => {
  if (!core.getState().isMinimalMode) return;
  e.stopPropagation();
  if (core.getState().playlist.length === 0) return;

  vizUI.ensureAudioContext();
  if (core.getState().currentTrackIndex === -1) core.loadTrack(0);
  else core.togglePlayPause();
});

// 再生/一時停止
els.playPauseBtn.addEventListener("click", () => {
  vizUI.ensureAudioContext();
  if (core.getState().playlist.length === 0) return;
  if (core.getState().currentTrackIndex === -1) return core.loadTrack(0);
  core.togglePlayPause();
});

// オーディオイベント
els.audioPlayer.addEventListener("play", () => {
  core.updatePlayPauseIcon();
  core.updateMinimalOverlay();
  playlistUI.highlightCurrentTrack();
});
els.audioPlayer.addEventListener("pause", () => {
  core.updatePlayPauseIcon();
  core.updateMinimalOverlay();
});
els.audioPlayer.addEventListener("ended", () => {
  const { repeatMode } = core.getState();
  if (repeatMode === "one") {
    els.audioPlayer.currentTime = 0;
    els.audioPlayer.play();
  } else {
    core.playNext();
  }
});
els.audioPlayer.addEventListener("timeupdate", core.updateProgress);
els.audioPlayer.addEventListener("loadedmetadata", core.setDuration);

// シークバー
els.progressBar.addEventListener("input", core.previewSeekTime);
els.progressBar.addEventListener("change", core.seekByBar);

// 10秒スキップ
els.seekForwardBtn.addEventListener("click", () => core.seek(10));
els.seekBackwardBtn.addEventListener("click", () => core.seek(-10));

// prev/next
els.prevBtn.addEventListener("click", core.playPrev);
els.nextBtn.addEventListener("click", core.playNext);

// shuffle/repeat
els.shuffleBtn.addEventListener("click", core.toggleShuffle);
els.repeatBtn.addEventListener("click", core.toggleRepeat);

// 速度
els.playbackRateBtn.addEventListener("click", core.changePlaybackRate);

// テーマ
els.themeToggleBtn.addEventListener("click", core.toggleTheme);

// ビジュアライザー
els.vizStyleBtn.addEventListener("click", vizUI.toggleVisualizerStyle);

// 検索
els.playlistSearch.addEventListener("input", playlistUI.filterPlaylist);

// 全消去
els.clearPlaylistBtn.addEventListener("click", core.clearPlaylist);

// volume
els.volumeControl.addEventListener("input", core.onVolumeInput);
els.volumeMuteToggle.addEventListener("click", core.toggleMute);

// パネル
els.playlistToggleBtn.addEventListener("click", core.togglePlaylist);
els.playlistCloseBtn.addEventListener("click", core.togglePlaylist);

// キーボード
document.addEventListener("keydown", (e) => {
  if (e.target === els.playlistSearch) return;
  if (core.getState().playlist.length === 0) return;

  if (e.code === "Space" && e.target.tagName !== "INPUT") {
    e.preventDefault();
    els.playPauseBtn.click();
  }
  if (e.code === "ArrowRight") {
    e.preventDefault();
    if (e.shiftKey) core.playNext();
    else core.seek(10);
  }
  if (e.code === "ArrowLeft") {
    e.preventDefault();
    if (e.shiftKey) core.playPrev();
    else core.seek(-10);
  }
});

// リサイズ時canvas再設定
window.addEventListener("resize", vizUI.onResize);
