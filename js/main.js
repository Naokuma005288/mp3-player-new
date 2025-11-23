import { createVisualizer } from './modules/visualizer.js';
import { createPlaylist } from './modules/playlist.js';
import {
  showToast
} from './modules/utils.js';
import {
  loadSettings,
  saveSettings,
  applyTheme,
  cycleTheme,
  updateThemeIcons
} from './modules/settings.js';
import { createPlayerCore } from './modules/playerCore.js';

const $ = (id) => document.getElementById(id);

const audio = $('audio-player');

const ui = {
  // main
  dropZone: $('drop-zone'),
  fileInput: $('file-input'),
  fileSelectUI: $('file-select-ui'),
  albumArt: $('album-art'),
  visualizerCanvas: $('visualizer-canvas'),
  songTitle: $('song-title'),
  songArtist: $('song-artist'),
  playerContainer: $('player-container'),

  // progress
  progressBar: $('progress-bar'),
  currentTimeDisplay: $('current-time-display'),
  durationDisplay: $('duration-display'),
  seekTooltip: $('seek-tooltip'),
  seekTooltipText: $('seek-tooltip-text'),

  // buttons
  playPauseBtn: $('play-pause-btn'),
  playIcon: $('play-icon'),
  pauseIcon: $('pause-icon'),
  prevBtn: $('prev-btn'),
  nextBtn: $('next-btn'),
  shuffleBtn: $('shuffle-btn'),
  repeatBtn: $('repeat-btn'),
  repeatNoneIcon: $('repeat-none-icon'),
  repeatAllIcon: $('repeat-all-icon'),
  repeatOneIcon: $('repeat-one-icon'),
  seekFwdBtn: $('seek-forward-btn'),
  seekBackBtn: $('seek-backward-btn'),
  playlistToggleBtn: $('playlist-toggle-btn'),
  playlistCloseBtn: $('playlist-close-btn'),
  playbackRateBtn: $('playback-rate-btn'),
  abRepeatBtn: $('ab-repeat-btn'),

  // volume
  volumeControl: $('volume-control'),
  volumeHighIcon: $('volume-high-icon'),
  volumeMuteIcon: $('volume-mute-icon'),
  volumeMuteToggle: $('volume-mute-toggle'),

  // playlist panel
  playlistPanel: $('playlist-panel'),
  playlistUl: $('playlist-ul'),
  playlistSearch: $('playlist-search'),
  clearPlaylistBtn: $('clear-playlist-btn'),

  // settings buttons
  themeToggleBtn: $('theme-toggle-btn'),
  themeNormalIcon: $('theme-normal-icon'),
  themeSunIcon: $('theme-sun-icon'),
  themeMoonIcon: $('theme-moon-icon'),
  vizStyleBtn: $('viz-style-btn'),
  vizLineIcon: $('viz-line-icon'),
  vizBarsIcon: $('viz-bars-icon'),
  sleepTimerBtn: $('sleep-timer-btn'),

  // toast
  toast: $('toast'),
  toastMessage: $('toast-message'),

  // minimal
  minimalOverlay: $('minimal-play-btn-overlay'),
  minimalPlayIcon: $('minimal-play-icon'),
  minimalPauseIcon: $('minimal-pause-icon'),
};

let isMinimalMode = false;
let visualizerStyle = 'line';
let theme = 'normal';

const toastApi = { toastEl: ui.toast, toastMsgEl: ui.toastMessage };

// Visualizer
const visualizer = createVisualizer(audio, ui.visualizerCanvas, { style: visualizerStyle });

// Playlist
const playlist = createPlaylist(
  { ul: ui.playlistUl, searchInput: ui.playlistSearch },
  {
    onSelect: (i) => player.loadTrack(i),
    onPlaylistChanged: () => {
      player.enableControls();
      player.updateNavButtons();
      updateFileUIState();
    },
    onRemovedPlaying: (index, newLen) => {
      if (newLen === 0) {
        player.revokeURL();
        audio.pause();
        audio.src = '';
        playlist.clearAll();
        resetPlayerUI();
      } else {
        player.loadTrack(Math.min(index, newLen - 1));
      }
    },
    onEmpty: () => resetPlayerUI(),
    getLastState: () => player.getLastState()
  }
);

// Player core
const player = createPlayerCore(
  audio,
  {
    ...ui,
    isMinimalMode: () => isMinimalMode,
    getVisualizerStyle: () => visualizerStyle,
    getTheme: () => theme
  },
  playlist,
  visualizer,
  toastApi
);

// --- UI Helpers ---
function updateFileUIState() {
  if (playlist.playlist.length > 0) ui.fileSelectUI.classList.add('file-select-hidden');
  else ui.fileSelectUI.classList.remove('file-select-hidden');
}

function resetPlayerUI() {
  ui.songTitle.textContent = '再生する曲はありません';
  ui.songArtist.textContent = 'ファイルをロードしてください';
  ui.albumArt.src = 'https://placehold.co/512x512/312e81/ffffff?text=MP3';
  ui.albumArt.classList.add('opacity-20');
  ui.durationDisplay.textContent = '0:00';
  ui.currentTimeDisplay.textContent = '0:00';
  ui.progressBar.value = 0;
  player.enableControls();
  updateFileUIState();
}

function togglePlaylistPanel() {
  ui.playlistPanel.classList.toggle('open');
}

// --- Theme + Visualizer style ---
function updateVizIcons() {
  const isLine = visualizerStyle === 'line';
  ui.vizLineIcon.classList.toggle('hidden', !isLine);
  ui.vizBarsIcon.classList.toggle('hidden', isLine);
}

function toggleVisualizerStyle() {
  visualizerStyle = visualizerStyle === 'line' ? 'bars' : 'line';
  visualizer.setStyle(visualizerStyle);
  updateVizIcons();
  player.getLastState(); // keep consistent
  saveSettings(player.getLastState());
}

function toggleTheme() {
  theme = cycleTheme(theme);
  applyTheme(theme);
  updateThemeIcons(theme, {
    normalIcon: ui.themeNormalIcon,
    sunIcon: ui.themeSunIcon,
    moonIcon: ui.themeMoonIcon
  });
  saveSettings(player.getLastState());
}

// --- Minimal mode ---
function toggleMinimalMode() {
  if (playlist.playlist.length === 0) return;
  isMinimalMode = !isMinimalMode;
  ui.playerContainer.classList.toggle('minimal', isMinimalMode);
}

// --- File handling ---
async function handleFiles(files) {
  const beforeEmpty = playlist.playlist.length === 0;
  await playlist.addFiles(files);

  showToast(ui.toast, ui.toastMessage, `${files.length} 曲が追加されました`);
  player.enableControls();
  updateFileUIState();

  if (beforeEmpty && playlist.playlist.length > 0) {
    player.prepareTrack(0);
  }
}

// input
ui.fileInput.addEventListener('change', (e) => {
  const files = e.target.files;
  if (files?.length) handleFiles(files);
});

// drag drop
ui.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  ui.dropZone.classList.add('bg-white/10', 'scale-105');
});
ui.dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  ui.dropZone.classList.remove('bg-white/10', 'scale-105');
});
ui.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  ui.dropZone.classList.remove('bg-white/10', 'scale-105');
  const files = e.dataTransfer.files;
  if (!files?.length) return;

  const mp3Files = Array.from(files).filter(f => f.type === 'audio/mpeg');
  if (!mp3Files.length) {
    showToast(ui.toast, ui.toastMessage, "MP3ファイルのみ対応しています", true);
    return;
  }
  handleFiles(mp3Files);
});

// dblclick minimal
ui.dropZone.addEventListener('dblclick', toggleMinimalMode);

// minimal click play/pause
ui.dropZone.addEventListener('click', (e) => {
  if (!isMinimalMode) return;
  e.stopPropagation();
  if (playlist.playlist.length === 0) return;

  if (playlist.currentTrackIndex === -1) player.loadTrack(0);
  else player.togglePlayPause();
});

// --- Buttons wiring ---
ui.playPauseBtn.addEventListener('click', () => player.togglePlayPause());
ui.prevBtn.addEventListener('click', () => player.playPrev());
ui.nextBtn.addEventListener('click', () => player.playNext());
ui.shuffleBtn.addEventListener('click', () => player.toggleShuffle());
ui.repeatBtn.addEventListener('click', () => player.toggleRepeat());

ui.seekFwdBtn.addEventListener('click', () => player.seek(10));
ui.seekBackBtn.addEventListener('click', () => player.seek(-10));

ui.playlistToggleBtn.addEventListener('click', togglePlaylistPanel);
ui.playlistCloseBtn.addEventListener('click', togglePlaylistPanel);

ui.playbackRateBtn.addEventListener('click', () => player.changePlaybackRate());
ui.abRepeatBtn.addEventListener('click', () => player.toggleABRepeat());

ui.volumeControl.addEventListener('input', (e) => {
  player.onVolumeInput(parseFloat(e.target.value));
});
ui.volumeMuteToggle.addEventListener('click', () => player.toggleMute());

ui.themeToggleBtn.addEventListener('click', toggleTheme);
ui.vizStyleBtn.addEventListener('click', toggleVisualizerStyle);
ui.sleepTimerBtn.addEventListener('click', () => player.cycleSleepTimer());

ui.clearPlaylistBtn.addEventListener('click', () => {
  audio.pause();
  audio.src = '';
  playlist.clearAll();
  resetPlayerUI();
  togglePlaylistPanel();
  showToast(ui.toast, ui.toastMessage, "プレイリストをクリアしました");
});

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target === ui.playlistSearch) return;
  if (playlist.playlist.length === 0) return;

  if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    player.togglePlayPause();
  }
  if (e.code === 'ArrowRight') {
    e.preventDefault();
    if (e.shiftKey) player.playNext();
    else player.seek(10);
  }
  if (e.code === 'ArrowLeft') {
    e.preventDefault();
    if (e.shiftKey) player.playPrev();
    else player.seek(-10);
  }
});

// --- Restore from storage ---
(function init() {
  // restore playlist first
  const lastStateFromPlaylist = playlist.restoreFromStorage();

  // restore settings/state
  const saved = loadSettings();
  const state = saved || lastStateFromPlaylist;

  if (state?.visualizerStyle) {
    visualizerStyle = state.visualizerStyle;
    visualizer.setStyle(visualizerStyle);
    updateVizIcons();
  } else updateVizIcons();

  if (state?.theme) {
    theme = state.theme;
    applyTheme(theme);
    updateThemeIcons(theme, {
      normalIcon: ui.themeNormalIcon,
      sunIcon: ui.themeSunIcon,
      moonIcon: ui.themeMoonIcon
    });
  } else {
    updateThemeIcons(theme, {
      normalIcon: ui.themeNormalIcon,
      sunIcon: ui.themeSunIcon,
      moonIcon: ui.themeMoonIcon
    });
  }

  player.restoreLastState(state);

  // if playlist exists, set UI but don't autoplay
  if (playlist.playlist.length > 0) {
    const idx = state?.currentTrackIndex ?? 0;
    player.prepareTrack(Math.min(idx, playlist.playlist.length - 1));
    audio.currentTime = state?.currentTime ?? 0;
    player.enableControls();
    player.updateNavButtons();
  } else {
    resetPlayerUI();
  }

  updateFileUIState();
})();
