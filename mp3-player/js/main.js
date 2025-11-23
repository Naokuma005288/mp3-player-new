import { formatTime, createToast } from "./modules/utils.js";
import { saveSettings, loadSettings } from "./modules/settings.js";
import { Visualizer } from "./modules/visualizer.js";
import { PlaylistManager } from "./modules/playlist.js";
import { PlayerCore } from "./modules/playerCore.js";

// DOM取得
const dom = {
    audioPlayer: document.getElementById('audio-player'),
    fileInput: document.getElementById('file-input'),
    dropZone: document.getElementById('drop-zone'),
    albumArt: document.getElementById('album-art'),
    progressBar: document.getElementById('progress-bar'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    playIcon: document.getElementById('play-icon'),
    pauseIcon: document.getElementById('pause-icon'),
    currentTimeDisplay: document.getElementById('current-time-display'),
    durationDisplay: document.getElementById('duration-display'),
    songTitle: document.getElementById('song-title'),
    songArtist: document.getElementById('song-artist'),
    playerContainer: document.getElementById('player-container'),
    fileSelectUI: document.getElementById('file-select-ui'),

    minimalPlayBtnOverlay: document.getElementById('minimal-play-btn-overlay'),
    minimalPlayIcon: document.getElementById('minimal-play-icon'),
    minimalPauseIcon: document.getElementById('minimal-pause-icon'),

    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    shuffleBtn: document.getElementById('shuffle-btn'),
    repeatBtn: document.getElementById('repeat-btn'),
    repeatNoneIcon: document.getElementById('repeat-none-icon'),
    repeatAllIcon: document.getElementById('repeat-all-icon'),
    repeatOneIcon: document.getElementById('repeat-one-icon'),

    volumeControl: document.getElementById('volume-control'),
    volumeHighIcon: document.getElementById('volume-high-icon'),
    volumeMuteIcon: document.getElementById('volume-mute-icon'),
    volumeMuteToggle: document.getElementById('volume-mute-toggle'),

    seekForwardBtn: document.getElementById('seek-forward-btn'),
    seekBackwardBtn: document.getElementById('seek-backward-btn'),

    playlistToggleBtn: document.getElementById('playlist-toggle-btn'),
    playlistCloseBtn: document.getElementById('playlist-close-btn'),
    playlistPanel: document.getElementById('playlist-panel'),
    playlistUl: document.getElementById('playlist-ul'),

    playbackRateBtn: document.getElementById('playback-rate-btn'),

    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    themeSunIcon: document.getElementById('theme-sun-icon'),
    themeMoonIcon: document.getElementById('theme-moon-icon'),

    vizStyleBtn: document.getElementById('viz-style-btn'),
    vizLineIcon: document.getElementById('viz-line-icon'),
    vizBarsIcon: document.getElementById('viz-bars-icon'),

    playlistSearch: document.getElementById('playlist-search'),
    clearPlaylistBtn: document.getElementById('clear-playlist-btn'),

    visualizerCanvas: document.getElementById('visualizer-canvas'),

    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
};

// Toast
const showToast = createToast(dom.toast, dom.toastMessage);

// State
const state = {
    playlist: [],
    currentTrackIndex: -1,
    isShuffle: false,
    repeatMode: 'none',
    shuffledPlaylist: [],
    playbackRates: [1, 1.25, 1.5, 2, 0.75],
    currentRateIndex: 0,
    lastVolume: 1,
    visualizerStyle: 'line',
    isMinimalMode: false,
};

// Visualizer
const visualizer = new Visualizer(dom.audioPlayer, dom.visualizerCanvas);

// Core
const core = new PlayerCore(state, dom, visualizer, {
    formatTime,
    showToast,
    saveSettings,
});
core.init();

// Playlist
const playlistManager = new PlaylistManager(
    state,
    dom,
    { formatTime, showToast },
    {
        onSelect: (i) => core.loadTrack(i),
        onRemove: removeTrack,
        onCurrentMetadataUpdate: (i) => core.updateMainUI(i),
    }
);

// --- Drag & Drop / File input ---
dom.fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) onFilesAdded(files);
});

dom.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropZone.classList.add('bg-white/10', 'scale-105');
});
dom.dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('bg-white/10', 'scale-105');
});
dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('bg-white/10', 'scale-105');
    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const mp3Files = Array.from(files).filter(f => f.type === 'audio/mpeg');
    if (mp3Files.length === 0) {
        showToast("MP3ファイルのみ対応しています", true);
        return;
    }
    onFilesAdded(mp3Files);
});

function onFilesAdded(files) {
    const { addedCount, wasEmpty } = playlistManager.handleFiles(files);
    if (addedCount === 0) return;

    core.enableControls();
    core.updateFileUIState();

    if (wasEmpty && state.playlist.length > 0) {
        core.prepareTrack(0);
    }

    if (state.isShuffle) core.createShuffledPlaylist();
}

// --- Playlist panel toggle ---
dom.playlistToggleBtn.addEventListener('click', togglePlaylist);
dom.playlistCloseBtn.addEventListener('click', togglePlaylist);
function togglePlaylist() {
    dom.playlistPanel.classList.toggle('open');
}

// --- Playlist search ---
dom.playlistSearch.addEventListener('input', (e) => {
    playlistManager.filter(e.target.value);
});

// --- Clear playlist ---
dom.clearPlaylistBtn.addEventListener('click', clearPlaylist);
function clearPlaylist() {
    dom.audioPlayer.pause();
    dom.audioPlayer.src = '';
    state.playlist = [];
    state.currentTrackIndex = -1;
    playlistManager.render();
    core.resetPlayerUI();
    togglePlaylist();
    showToast("プレイリストをクリアしました");
}

// --- Remove single track ---
function removeTrack(index) {
    if (index < 0 || index >= state.playlist.length) return;

    const wasPlaying = index === state.currentTrackIndex;

    state.playlist.splice(index, 1);

    if (wasPlaying) {
        dom.audioPlayer.pause();
        if (state.playlist.length === 0) {
            clearPlaylist();
            return;
        } else {
            core.loadTrack(Math.min(index, state.playlist.length - 1));
        }
    } else if (index < state.currentTrackIndex) {
        state.currentTrackIndex--;
    }

    if (state.isShuffle) core.createShuffledPlaylist();

    playlistManager.render();
    core.updateNavButtons();

    if (state.playlist.length === 0) {
        dom.songTitle.textContent = '再生する曲はありません';
        dom.songArtist.textContent = 'ファイルをロードしてください';
    }
}

// --- Theme toggle ---
dom.themeToggleBtn.addEventListener('click', toggleTheme);
function toggleTheme() {
    document.documentElement.classList.toggle('light-mode');
    updateThemeIcons();
    core.persist();
}
function updateThemeIcons() {
    const isLight = document.documentElement.classList.contains('light-mode');
    dom.themeSunIcon.classList.toggle('hidden', !isLight);
    dom.themeMoonIcon.classList.toggle('hidden', isLight);
}

// --- Visualizer style toggle ---
dom.vizStyleBtn.addEventListener('click', toggleVisualizerStyle);
function toggleVisualizerStyle() {
    state.visualizerStyle = (state.visualizerStyle === 'line') ? 'bars' : 'line';
    visualizer.setStyle(state.visualizerStyle);
    updateVizIcons();
    core.persist();
}
function updateVizIcons() {
    const isLine = state.visualizerStyle === 'line';
    dom.vizLineIcon.classList.toggle('hidden', !isLine);
    dom.vizBarsIcon.classList.toggle('hidden', isLine);
}

// --- Settings load & apply ---
(function init() {
    const settings = loadSettings();
    if (settings) {
        // volume
        dom.audioPlayer.volume = settings.volume ?? 1;
        dom.volumeControl.value = dom.audioPlayer.volume;
        state.lastVolume = settings.lastVolume ?? 1;
        core.updateVolumeIcon(dom.audioPlayer.volume);

        // repeat
        state.repeatMode = settings.repeatMode || 'none';
        // icons reflect
        dom.repeatNoneIcon.classList.toggle('hidden', state.repeatMode !== 'none');
        dom.repeatAllIcon.classList.toggle('hidden', state.repeatMode !== 'all');
        dom.repeatOneIcon.classList.toggle('hidden', state.repeatMode !== 'one');

        // shuffle
        state.isShuffle = settings.isShuffle || false;
        dom.shuffleBtn.classList.toggle('btn-active', state.isShuffle);

        // playback rate
        state.currentRateIndex = settings.playbackRateIndex || 0;
        dom.audioPlayer.playbackRate = state.playbackRates[state.currentRateIndex];
        dom.playbackRateBtn.textContent = `${state.playbackRates[state.currentRateIndex]}x`;

        // theme
        if (settings.theme === 'light') document.documentElement.classList.add('light-mode');
        else document.documentElement.classList.remove('light-mode');
        updateThemeIcons();

        // visualizer style
        state.visualizerStyle = settings.visualizerStyle || 'line';
        visualizer.setStyle(state.visualizerStyle);
        updateVizIcons();
    } else {
        updateThemeIcons();
        updateVizIcons();
    }

    playlistManager.render();
    core.resetPlayerUI();
    core.updateFileUIState();
})();
