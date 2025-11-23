import { createVisualizer } from "./modules/visualizer.js";
import { createPlaylistManager } from "./modules/playlist.js";
import { createPlayerCore } from "./modules/playerCore.js";
import { loadSettings, saveSettings } from "./modules/settings.js";
import { formatTime, debounce } from "./modules/utils.js";

const el = (id) => document.getElementById(id);

// DOM
const audioPlayer = el("audio-player");
const fileInput = el("file-input");
const folderInput = el("folder-input");
const addFolderBtn = el("add-folder-btn");

const dropZone = el("drop-zone");
const albumArt = el("album-art");
const progressBar = el("progress-bar");
const seekTooltip = el("seek-tooltip");

const playPauseBtn = el("play-pause-btn");
const playIcon = el("play-icon");
const pauseIcon = el("pause-icon");

const currentTimeDisplay = el("current-time-display");
const durationDisplay = el("duration-display");
const songTitle = el("song-title");
const songArtist = el("song-artist");
const fileSelectUI = el("file-select-ui");

const prevBtn = el("prev-btn");
const nextBtn = el("next-btn");
const seekForwardBtn = el("seek-forward-btn");
const seekBackwardBtn = el("seek-backward-btn");
const shuffleBtn = el("shuffle-btn");
const repeatBtn = el("repeat-btn");

const repeatNoneIcon = el("repeat-none-icon");
const repeatAllIcon = el("repeat-all-icon");
const repeatOneIcon = el("repeat-one-icon");

const volumeControl = el("volume-control");
const volumeMuteToggle = el("volume-mute-toggle");
const volumeHighIcon = el("volume-high-icon");
const volumeMuteIcon = el("volume-mute-icon");

const playbackRateBtn = el("playback-rate-btn");

const playlistToggleBtn = el("playlist-toggle-btn");
const playlistCloseBtn = el("playlist-close-btn");
const playlistPanel = el("playlist-panel");
const playlistOverlay = el("playlist-overlay");
const playlistUl = el("playlist-ul");
const playlistSearch = el("playlist-search");

const sortSelect = el("sort-select");
const groupToggleBtn = el("group-toggle-btn");

const clearPlaylistBtn = el("clear-playlist-btn");
const themeToggleBtn = el("theme-toggle-btn");
const vizStyleBtn = el("viz-style-btn");

const toast = el("toast");
const toastMessage = el("toast-message");

const playerContainer = el("player-container");
const minimalPlayBtnOverlay = el("minimal-play-btn-overlay");
const minimalPlayIcon = el("minimal-play-icon");
const minimalPauseIcon = el("minimal-pause-icon");
let isMinimalMode = false;

// settings default
const defaultSettings = {
  volume: 1,
  lastVolume: 1,
  isShuffle: false,
  repeatMode: "none",
  playbackRateIndex: 0,
  themeMode: "normal", // normal | light | dark
  visualizerStyle: "line",
  sortMode: "added",
  groupByArtist: false,
  sleepMinutes: 0
};

const saved = loadSettings() || {};
const settings = { ...defaultSettings, ...saved };

// toast
let toastTimeout;
function showToast(msg, isError=false) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastMessage.textContent = msg;
  toast.style.backgroundColor = isError ? "var(--thumb-color)" : "var(--toast-bg)";
  toast.classList.add("show");
  toastTimeout = setTimeout(()=>toast.classList.remove("show"), 3000);
}

// UI helpers
function updatePlayPauseIcon() {
  const paused = audioPlayer.paused || audioPlayer.ended;
  playIcon.classList.toggle("hidden", !paused);
  pauseIcon.classList.toggle("hidden", paused);
  minimalPlayIcon.classList.toggle("hidden", !paused);
  minimalPauseIcon.classList.toggle("hidden", paused);
}

function updateMainUI(index) {
  const list = playlistManager.getPlaylist();
  if (index < 0 || !list[index]) {
    songTitle.textContent = "再生する曲はありません";
    songArtist.textContent = "ファイルをロードしてください";
    resetAlbumArt();
    return;
  }
  const t = list[index];

  songTitle.textContent = t.title;
  songArtist.textContent = t.artist;

  if (t.artwork) {
    albumArt.src = t.artwork;
    albumArt.classList.remove("opacity-20");
  } else resetAlbumArt();
}

function resetAlbumArt() {
  albumArt.src = "https://placehold.co/512x512/312e81/ffffff?text=MP3";
  albumArt.classList.add("opacity-20");
}

function updateProgress() {
  if (!audioPlayer.duration) return;
  const p = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  progressBar.value = p;
  currentTimeDisplay.textContent = formatTime(audioPlayer.currentTime);
}

function setDuration() {
  durationDisplay.textContent = formatTime(audioPlayer.duration);
}

function enableControls() {
  const has = playlistManager.getPlaylist().length > 0;
  playPauseBtn.disabled = !has;
  progressBar.disabled = !has;
  prevBtn.disabled = !has;
  nextBtn.disabled = !has;
  shuffleBtn.disabled = !has;
  repeatBtn.disabled = !has;
  seekForwardBtn.disabled = !has;
  seekBackwardBtn.disabled = !has;
  playlistToggleBtn.disabled = !has; // ✅ 開けない問題の直接修正
  playbackRateBtn.disabled = !has;
}

function updateNavButtons() {
  const len = playlistManager.getPlaylist().length;
  if (len <= 1) {
    prevBtn.disabled = true; nextBtn.disabled = true;
  } else {
    prevBtn.disabled = false; nextBtn.disabled = false;
  }
}

function highlight() {
  playlistManager.render();
}

function setShuffle(v){ shuffleBtn.classList.toggle("btn-active", v); }
function setRepeat(mode){
  repeatNoneIcon.classList.add("hidden");
  repeatAllIcon.classList.add("hidden");
  repeatOneIcon.classList.add("hidden");
  if (mode==="none") repeatNoneIcon.classList.remove("hidden");
  if (mode==="all") repeatAllIcon.classList.remove("hidden");
  if (mode==="one") repeatOneIcon.classList.remove("hidden");
}

function setRate(r){ playbackRateBtn.textContent = `${r}x`; }
function setVolumeIcon(v){
  if (v === 0) {
    volumeHighIcon.classList.add("hidden");
    volumeMuteIcon.classList.remove("hidden");
  } else {
    volumeHighIcon.classList.remove("hidden");
    volumeMuteIcon.classList.add("hidden");
  }
}
function setVolumeSlider(v){ volumeControl.value = v; }

function setABState(state){
  // ここはUI追加したくなったらいつでもやれる。今はトーストのみ。
}
function setSleepLabel(min){
  // 同上（UI変えない方針なのでラベル無し）
}

// theme cycle
function applyTheme(mode) {
  document.documentElement.classList.remove("light-mode","dark-mode");
  if (mode === "light") document.documentElement.classList.add("light-mode");
  if (mode === "dark") document.documentElement.classList.add("dark-mode");
}
applyTheme(settings.themeMode);

// viz vars
function getThemeVars(){
  const st = getComputedStyle(document.documentElement);
  return {
    grad1: st.getPropertyValue("--viz-grad-1").trim(),
    grad2: st.getPropertyValue("--viz-grad-2").trim(),
    grad3: st.getPropertyValue("--viz-grad-3").trim()
  };
}

// modules init
const visualizer = createVisualizer({
  audioPlayer,
  canvas: el("visualizer-canvas"),
  getThemeVars
});

const playlistManager = createPlaylistManager({
  playlistUl,
  searchInput: playlistSearch,
  onSelectTrack: (index, autoplay) => {
    if (index === -1) {
      audioPlayer.pause();
      audioPlayer.src = "";
      updateMainUI(-1);
      enableControls();
      return;
    }
    if (!visualizer.initialized) visualizer.init();
    visualizer.resumeIfNeeded();
    playerCore.load(index, autoplay);
  },
  onPlaylistUpdated: () => {
    enableControls();
    updateNavButtons();
    if (playerCore.isShuffle) playlistManager.createShuffled();
  },
  showToast
});

const playerCore = createPlayerCore({
  audioPlayer,
  playlistManager,
  ui: {
    updateMainUI,
    updateNavButtons,
    highlight,
    setShuffle,
    setRepeat,
    setRate,
    setVolumeIcon,
    setVolumeSlider,
    setABState,
    setSleepLabel
  },
  settings: {
    ...settings,
    playbackRates: [1,1.25,1.5,2,0.75]
  },
  showToast
});

// file UI state
function updateFileUIState() {
  const has = playlistManager.getPlaylist().length > 0;
  fileSelectUI.classList.toggle("file-select-hidden", has);
}
updateFileUIState();
enableControls();
setRepeat(settings.repeatMode);
setShuffle(settings.isShuffle);
setRate(playerCore.playbackRates[playerCore.playbackRateIndex]);
setVolumeSlider(settings.volume);
setVolumeIcon(settings.volume);

// playlist open/close (✅バグ修正：必ず動く仕組み)
function openPlaylist(){
  playlistPanel.classList.add("open");
  playlistOverlay.classList.remove("hidden");
  playlistToggleBtn.setAttribute("aria-expanded","true");
  document.body.style.overflow = "hidden";
}
function closePlaylist(){
  playlistPanel.classList.remove("open");
  playlistOverlay.classList.add("hidden");
  playlistToggleBtn.setAttribute("aria-expanded","false");
  document.body.style.overflow = "";
}
function togglePlaylist(){
  playlistPanel.classList.contains("open") ? closePlaylist() : openPlaylist();
}

playlistToggleBtn.addEventListener("click", togglePlaylist);
playlistCloseBtn.addEventListener("click", closePlaylist);
playlistOverlay.addEventListener("click", closePlaylist);
document.addEventListener("keydown", (e)=> {
  if (e.key === "Escape" && playlistPanel.classList.contains("open")) closePlaylist();
});

// files add
fileInput.addEventListener("change", e => {
  if (e.target.files?.length) playlistManager.handleFiles(e.target.files);
});

// v3.5.0 folder add
addFolderBtn.addEventListener("click", ()=> folderInput.click());
folderInput.addEventListener("change", e => {
  if (e.target.files?.length) playlistManager.handleFiles(e.target.files);
});

// drag-drop add
dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.classList.add("bg-white/10","scale-105");
});
dropZone.addEventListener("dragleave", e => {
  e.preventDefault();
  dropZone.classList.remove("bg-white/10","scale-105");
});
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("bg-white/10","scale-105");
  const files = e.dataTransfer.files;
  if (files?.length) playlistManager.handleFiles(files);
});

// minimal mode
dropZone.addEventListener("dblclick", () => {
  if (playlistManager.getPlaylist().length === 0) return;
  isMinimalMode = !isMinimalMode;
  playerContainer.classList.toggle("minimal", isMinimalMode);
  updateMinimalOverlay();
});
dropZone.addEventListener("click", (e) => {
  if (!isMinimalMode) return;
  e.stopPropagation();
  if (playlistManager.getPlaylist().length > 0) {
    if (!visualizer.initialized) visualizer.init();
    if (playlistManager.getCurrentIndex() === -1) {
      playerCore.load(0, true);
    } else {
      playerCore.togglePlayPause();
    }
  }
});
function updateMinimalOverlay(){
  if (!isMinimalMode) {
    minimalPlayBtnOverlay.classList.add("opacity-0","pointer-events-none");
    return;
  }
  if (audioPlayer.paused||audioPlayer.ended) {
    minimalPlayBtnOverlay.classList.remove("opacity-0","pointer-events-none");
    minimalPlayBtnOverlay.classList.add("pointer-events-auto");
  } else {
    minimalPlayBtnOverlay.classList.add("opacity-0","pointer-events-none");
  }
}

// buttons
playPauseBtn.addEventListener("click", () => {
  if (!visualizer.initialized) visualizer.init();
  visualizer.resumeIfNeeded();

  if (playlistManager.getPlaylist().length === 0) return;

  if (playlistManager.getCurrentIndex() === -1) {
    playerCore.load(0, true);
  } else {
    playerCore.togglePlayPause();
  }
});
prevBtn.addEventListener("click", playerCore.playPrev);
nextBtn.addEventListener("click", playerCore.playNext);
seekForwardBtn.addEventListener("click", ()=>playerCore.seek(10));
seekBackwardBtn.addEventListener("click", ()=>playerCore.seek(-10));
shuffleBtn.addEventListener("click", playerCore.toggleShuffle);
repeatBtn.addEventListener("click", playerCore.toggleRepeat);

playbackRateBtn.addEventListener("click", playerCore.changeRate);

volumeControl.addEventListener("input", e => {
  playerCore.setVolume(parseFloat(e.target.value));
});
volumeMuteToggle.addEventListener("click", playerCore.toggleMute);

// progress seek & tooltip (v3.4.0)
progressBar.addEventListener("input", e => {
  if (!audioPlayer.duration) return;
  const newTime = audioPlayer.duration * (e.target.value/100);
  currentTimeDisplay.textContent = formatTime(newTime);
});

progressBar.addEventListener("change", e => {
  if (!audioPlayer.duration) return;
  audioPlayer.currentTime = audioPlayer.duration * (e.target.value/100);
});

progressBar.addEventListener("mousemove", (e)=>{
  if (!audioPlayer.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const ratio = (e.clientX - rect.left)/rect.width;
  const t = audioPlayer.duration * ratio;
  seekTooltip.textContent = formatTime(t);
  seekTooltip.style.left = `${clamp(ratio*100,0,100)}%`;
  seekTooltip.classList.remove("hidden");
});
progressBar.addEventListener("mouseleave", ()=> seekTooltip.classList.add("hidden"));

// audio events
audioPlayer.addEventListener("play", updatePlayPauseIcon);
audioPlayer.addEventListener("pause", updatePlayPauseIcon);
audioPlayer.addEventListener("timeupdate", ()=>{
  updateProgress();
  playerCore.onTimeUpdate();
});
audioPlayer.addEventListener("loadedmetadata", setDuration);
audioPlayer.addEventListener("ended", playerCore.onEnded);

// search
playlistSearch.addEventListener("input", debounce((e)=>{
  playlistManager.filter(e.target.value);
}, 100));

// v3.5.0 sort
sortSelect.value = settings.sortMode;
playlistManager.applySort(settings.sortMode, false);
sortSelect.addEventListener("change", e => {
  playlistManager.applySort(e.target.value);
  saveSettings({ ...settings, sortMode: e.target.value });
});

// v3.5.0 group
if (settings.groupByArtist) {
  playlistManager.setGroupByArtist(true);
  groupToggleBtn.classList.add("active");
}
groupToggleBtn.addEventListener("click", ()=>{
  const v = playlistManager.toggleGroupByArtist();
  groupToggleBtn.classList.toggle("active", v);
  saveSettings({ ...settings, groupByArtist: v });
});

// clear
clearPlaylistBtn.addEventListener("click", ()=>{
  audioPlayer.pause();
  audioPlayer.src = "";
  playlistManager.clearAll();
  updateMainUI(-1);
  updateFileUIState();
  closePlaylist();
  showToast("プレイリストをクリアしました");
});

// theme toggle 3-cycle
themeToggleBtn.addEventListener("click", ()=>{
  const order = ["normal","light","dark"];
  const idx = order.indexOf(settings.themeMode);
  settings.themeMode = order[(idx+1)%order.length];
  applyTheme(settings.themeMode);
  saveSettings(settings);
});

// viz style
vizStyleBtn.addEventListener("click", ()=>{
  settings.visualizerStyle = (settings.visualizerStyle==="line") ? "bars" : "line";
  visualizer.setStyle(settings.visualizerStyle);
  saveSettings(settings);
});

// fileUI update on playlist change
const originalHandle = playlistManager.handleFiles;
playlistManager.handleFiles = async (...args)=>{
  await originalHandle(...args);
  updateFileUIState();
};

// keyboard shortcuts
document.addEventListener("keydown", (e)=>{
  if (e.target === playlistSearch) return;
  if (playlistManager.getPlaylist().length === 0) return;

  if (e.code==="Space" && e.target.tagName!=="INPUT") {
    e.preventDefault();
    playPauseBtn.click();
  }
  if (e.code==="ArrowRight") {
    e.preventDefault();
    e.shiftKey ? playerCore.playNext() : playerCore.seek(10);
  }
  if (e.code==="ArrowLeft") {
    e.preventDefault();
    e.shiftKey ? playerCore.playPrev() : playerCore.seek(-10);
  }
});

showToast("v3.5.0 読み込み完了！");
