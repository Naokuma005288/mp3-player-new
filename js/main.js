import { qs, on, showToast } from "./modules/utils.js";
import { Settings } from "./modules/settings.js";
import { Playlist } from "./modules/playlist.js";
import { PlayerCore } from "./modules/playerCore.js";
import { Visualizer } from "./modules/visualizer.js";
import { PlaylistPersist } from "./modules/playlistPersist.js";
import { AudioFX } from "./modules/audioFx.js";

const dom = {
  fileInput: qs("#file-input"),
  dropZone: qs("#drop-zone"),
  albumArt: qs("#album-art"),
  progressBar: qs("#progress-bar"),
  seekTooltip: qs("#seek-tooltip"),
  currentTime: qs("#current-time-display"),
  duration: qs("#duration-display"),
  songTitle: qs("#song-title"),
  songArtist: qs("#song-artist"),
  playerContainer: qs("#player-container"),
  fileSelectUI: qs("#file-select-ui"),

  playPauseBtn: qs("#play-pause-btn"),
  playIcon: qs("#play-icon"),
  pauseIcon: qs("#pause-icon"),

  prevBtn: qs("#prev-btn"),
  nextBtn: qs("#next-btn"),
  seekForwardBtn: qs("#seek-forward-btn"),
  seekBackwardBtn: qs("#seek-backward-btn"),

  shuffleBtn: qs("#shuffle-btn"),
  repeatBtn: qs("#repeat-btn"),
  repeatNoneIcon: qs("#repeat-none-icon"),
  repeatAllIcon: qs("#repeat-all-icon"),
  repeatOneIcon: qs("#repeat-one-icon"),

  volumeControl: qs("#volume-control"),
  volumeMuteToggle: qs("#volume-mute-toggle"),
  volumeHighIcon: qs("#volume-high-icon"),
  volumeMuteIcon: qs("#volume-mute-icon"),

  playlistToggleBtn: qs("#playlist-toggle-btn"),
  playlistCloseBtn: qs("#playlist-close-btn"),
  playlistPanel: qs("#playlist-panel"),
  playlistUl: qs("#playlist-ul"),
  playlistSearch: qs("#playlist-search"),

  themeToggleBtn: qs("#theme-toggle-btn"),
  themeSunIcon: qs("#theme-sun-icon"),
  themeMoonIcon: qs("#theme-moon-icon"),

  vizStyleBtn: qs("#viz-style-btn"),
  vizLineIcon: qs("#viz-line-icon"),
  vizBarsIcon: qs("#viz-bars-icon"),

  clearPlaylistBtn: qs("#clear-playlist-btn"),
  playlistSort: qs("#playlist-sort"),
  selectModeBtn: qs("#select-mode-btn"),
  deleteSelectedBtn: qs("#delete-selected-btn"),
  exportPlaylistBtn: qs("#export-playlist-btn"),
  importPlaylistInput: qs("#import-playlist-input"),

  transitionModeBtn: qs("#transition-mode-btn"),
  crossfadeDurationBtn: qs("#crossfade-duration-btn"),
  eqPresetBtn: qs("#eq-preset-btn"),
  waveformToggleBtn: qs("#waveform-toggle-btn"),

  minimalOverlay: qs("#minimal-play-btn-overlay"),
  minimalPlayIcon: qs("#minimal-play-icon"),
  minimalPauseIcon: qs("#minimal-pause-icon"),

  vizCanvas: qs("#visualizer-canvas"),
  waveformCanvas: qs("#waveform-canvas"),
};

const settings = new Settings(dom);
const playlist = new Playlist(dom, settings);
const audioFx = new AudioFX(settings); // EQ/normalize/waveform解析
const player = new PlayerCore(dom, settings, playlist, audioFx);
const visualizer = new Visualizer(dom, settings, player);
const persist = new PlaylistPersist(settings, playlist, player);

// 初期化
settings.load();
playlist.loadGhostIfAny();
persist.restoreSessionOnBoot(); // 前回セッション復元準備
playlist.render();
player.updateControls();
visualizer.init();

// -------------------------
// イベント：ファイル追加
// -------------------------
on(dom.fileInput, "change", (e) => {
  const files = e.target.files;
  if (files?.length) playlist.handleFiles(files);
  dom.fileInput.value = "";
});

on(dom.dropZone, "dragover", (e) => {
  e.preventDefault();
  dom.dropZone.classList.add("bg-white/10", "scale-105");
});
on(dom.dropZone, "dragleave", (e) => {
  e.preventDefault();
  dom.dropZone.classList.remove("bg-white/10", "scale-105");
});
on(dom.dropZone, "drop", (e) => {
  e.preventDefault();
  dom.dropZone.classList.remove("bg-white/10", "scale-105");
  const files = e.dataTransfer.files;
  if (files?.length) playlist.handleFiles(files);
});

// ミニマル切替
on(dom.dropZone, "dblclick", () => player.toggleMinimalMode());

// ミニマル中クリックで再生
on(dom.dropZone, "click", (e) => {
  if (!player.isMinimalMode) return;
  e.stopPropagation();
  player.onMinimalClick();
});

// 再生/停止
on(dom.playPauseBtn, "click", () => player.playPause());

// prev/next/seek
on(dom.prevBtn, "click", () => player.playPrev());
on(dom.nextBtn, "click", () => player.playNext());
on(dom.seekForwardBtn, "click", () => player.seek(10));
on(dom.seekBackwardBtn, "click", () => player.seek(-10));

// shuffle/repeat
on(dom.shuffleBtn, "click", () => player.toggleShuffle());
on(dom.repeatBtn, "click", () => player.toggleRepeat());

// volume
on(dom.volumeControl, "input", (e) => player.setVolume(parseFloat(e.target.value)));
on(dom.volumeMuteToggle, "click", () => player.toggleMute());

// playlist panel
on(dom.playlistToggleBtn, "click", () => dom.playlistPanel.classList.toggle("open"));
on(dom.playlistCloseBtn, "click", () => dom.playlistPanel.classList.toggle("open"));

// search / sort / select mode
on(dom.playlistSearch, "input", (e) => playlist.filter(e.target.value));
on(dom.playlistSort, "change", (e) => playlist.sortBy(e.target.value));
on(dom.selectModeBtn, "click", () => playlist.toggleSelectMode());
on(dom.deleteSelectedBtn, "click", () => playlist.deleteSelected());

// export / import
on(dom.exportPlaylistBtn, "click", () => playlist.exportJSON());
on(dom.importPlaylistInput, "change", (e) => playlist.importJSON(e.target.files?.[0]));

// clear playlist
on(dom.clearPlaylistBtn, "click", () => playlist.clearAll());

// theme / viz
on(dom.themeToggleBtn, "click", () => settings.toggleTheme());
on(dom.vizStyleBtn, "click", () => settings.toggleVizStyle());

// transition / xf / eq / waveform
on(dom.transitionModeBtn, "click", () => settings.cycleTransitionMode());
on(dom.crossfadeDurationBtn, "click", () => settings.cycleCrossfadeSeconds());
on(dom.eqPresetBtn, "click", () => settings.cycleEqPreset());
on(dom.waveformToggleBtn, "click", () => settings.toggleWaveform());

// プログレスシーク
on(dom.progressBar, "input", (e) => player.previewSeek(e.target.value));
on(dom.progressBar, "change", (e) => player.commitSeek(e.target.value));

// シークホバー時間プレビュー
on(dom.progressBar, "mousemove", (e) => player.showSeekTooltip(e));
on(dom.progressBar, "mouseleave", () => player.hideSeekTooltip());

// キーボードショトカ
on(document, "keydown", (e) => player.handleKeydown(e));
