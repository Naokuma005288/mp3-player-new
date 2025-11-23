import { formatTime, clamp, showToast } from './utils.js';
import { saveSettings } from './settings.js';

export function createPlayerCore(audioEl, ui, playlistApi, visualizerApi, toastApi) {
  const {
    progressBar, playPauseBtn, playIcon, pauseIcon,
    minimalPlayIcon, minimalPauseIcon, minimalOverlay,
    currentTimeDisplay, durationDisplay,
    songTitle, songArtist, albumArt,
    prevBtn, nextBtn, shuffleBtn, repeatBtn,
    repeatNoneIcon, repeatAllIcon, repeatOneIcon,
    seekFwdBtn, seekBackBtn,
    playbackRateBtn,
    volumeControl, volumeHighIcon, volumeMuteIcon, volumeMuteToggle,
    abRepeatBtn,
    seekTooltip, seekTooltipText,
    sleepTimerBtn
  } = ui;

  const { toastEl, toastMsgEl } = toastApi;

  let repeatMode = 'none';
  let isShuffle = false;

  const playbackRates = [1, 1.25, 1.5, 2, 0.75];
  let rateIndex = 0;

  let currentObjectURL = null;
  let lastVolume = 1;

  // A-B repeat state
  let abStage = 0; // 0=off,1=A set,2=active
  let abA = null, abB = null;

  // sleep timer
  const sleepSteps = [0, 15, 30, 60, 90];
  let sleepIndex = 0;
  let sleepTimeout = null;

  // fade
  const FADE_MS = 300;
  let fadeTimer = null;
  let baseVolume = audioEl.volume;

  function setFadeGain(gain) {
    audioEl.volume = clamp(baseVolume * gain, 0, 1);
  }

  async function fadeOut() {
    clearInterval(fadeTimer);
    return new Promise((resolve) => {
      const start = performance.now();
      fadeTimer = setInterval(() => {
        const t = (performance.now() - start) / FADE_MS;
        if (t >= 1) {
          setFadeGain(0);
          clearInterval(fadeTimer);
          resolve();
        } else {
          setFadeGain(1 - t);
        }
      }, 16);
    });
  }

  async function fadeIn() {
    clearInterval(fadeTimer);
    const start = performance.now();
    fadeTimer = setInterval(() => {
      const t = (performance.now() - start) / FADE_MS;
      if (t >= 1) {
        setFadeGain(1);
        clearInterval(fadeTimer);
      } else {
        setFadeGain(t);
      }
    }, 16);
  }

  function revokeURL() {
    if (currentObjectURL) {
      URL.revokeObjectURL(currentObjectURL);
      currentObjectURL = null;
    }
  }

  function updateMainUI(index) {
    const list = playlistApi.playlist;
    if (index < 0 || !list[index]) {
      songTitle.textContent = '再生する曲はありません';
      songArtist.textContent = 'ファイルをロードしてください';
      return;
    }

    const track = list[index];
    songTitle.textContent = track.title;
    songArtist.textContent = track.artist;

    if (track.artwork) {
      albumArt.src = track.artwork;
      albumArt.classList.remove('opacity-20');
    } else {
      albumArt.src = 'https://placehold.co/512x512/312e81/ffffff?text=MP3';
      albumArt.classList.add('opacity-20');
    }
  }

  function enableControls() {
    const disabled = playlistApi.playlist.length === 0;
    [
      playPauseBtn, progressBar, prevBtn, nextBtn,
      shuffleBtn, repeatBtn, seekFwdBtn, seekBackBtn,
      playbackRateBtn, abRepeatBtn
    ].forEach(b => b.disabled = disabled);
  }

  function updateNavButtons() {
    const len = playlistApi.playlist.length;
    if (len <= 1) {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }

  function updatePlayPauseIcon() {
    const paused = audioEl.paused || audioEl.ended;
    playIcon.classList.toggle('hidden', !paused);
    pauseIcon.classList.toggle('hidden', paused);
    minimalPlayIcon.classList.toggle('hidden', !paused);
    minimalPauseIcon.classList.toggle('hidden', paused);
  }

  function updateMinimalOverlay() {
    if (!minimalOverlay) return;
    if (ui.isMinimalMode()) {
      if (audioEl.paused || audioEl.ended) {
        minimalOverlay.classList.remove('opacity-0','pointer-events-none');
        minimalOverlay.classList.add('pointer-events-auto');
      } else {
        minimalOverlay.classList.add('opacity-0','pointer-events-none');
        minimalOverlay.classList.remove('pointer-events-auto');
      }
    } else {
      minimalOverlay.classList.add('opacity-0','pointer-events-none');
      minimalOverlay.classList.remove('pointer-events-auto');
    }
  }

  function setDuration() {
    durationDisplay.textContent = formatTime(audioEl.duration);
  }

  function updateProgress() {
    if (!audioEl.duration) return;
    const p = (audioEl.currentTime / audioEl.duration) * 100;
    progressBar.value = p;

    const newTime = formatTime(audioEl.currentTime);
    currentTimeDisplay.textContent = newTime;

    if (abStage === 2 && abB !== null && audioEl.currentTime >= abB) {
      audioEl.currentTime = abA ?? 0;
      audioEl.play();
    }
  }

  function seek(sec) {
    if (audioEl.readyState < 2) return;
    audioEl.currentTime = clamp(audioEl.currentTime + sec, 0, audioEl.duration);
  }

  async function prepareTrack(index) {
    const list = playlistApi.playlist;
    if (index < 0 || index >= list.length) return false;

    const track = list[index];
    if (!track.file) {
      showToast(toastEl, toastMsgEl, "この曲は未ロードです。ファイルを再追加してね", true);
      return false;
    }

    playlistApi.setCurrentIndex(index);

    revokeURL();
    currentObjectURL = URL.createObjectURL(track.file);
    audioEl.src = currentObjectURL;
    audioEl.playbackRate = playbackRates[rateIndex];

    updateMainUI(index);
    updateNavButtons();
    playlistApi.highlight();

    return true;
  }

  async function loadTrack(index, autoplay=true) {
    if (!playlistApi.playlist.length) return;

    // fade-out current
    if (!audioEl.paused && !audioEl.ended) {
      await fadeOut();
      audioEl.pause();
    }

    const ok = await prepareTrack(index);
    if (!ok) return;

    if (!visualizerApi.initialized) visualizerApi.init();
    visualizerApi.resumeIfNeeded();

    if (autoplay) {
      try {
        await audioEl.play();
      } catch {
        updatePlayPauseIcon();
      }
      await fadeIn();
    } else {
      setFadeGain(1);
    }

    saveLastState();
  }

  function togglePlayPause() {
    if (playlistApi.currentTrackIndex === -1) {
      loadTrack(0);
      return;
    }
    if (audioEl.paused) audioEl.play();
    else audioEl.pause();
  }

  function playNext() {
    const idx = playlistApi.getNextIndex(repeatMode);
    if (idx === -1) {
      audioEl.pause();
      playlistApi.setCurrentIndex(-1);
      updatePlayPauseIcon();
      return;
    }
    loadTrack(idx);
  }

  function playPrev() {
    if (audioEl.currentTime > 5) {
      audioEl.currentTime = 0;
      return;
    }
    const idx = playlistApi.getPrevIndex(repeatMode);
    loadTrack(idx);
  }

  function toggleShuffle() {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('btn-active', isShuffle);
    playlistApi.setShuffle(isShuffle);
    if (isShuffle) playlistApi.createShuffled();
    saveLastState();
  }

  function toggleRepeat() {
    repeatNoneIcon.classList.add('hidden');
    repeatAllIcon.classList.add('hidden');
    repeatOneIcon.classList.add('hidden');

    if (repeatMode === 'none') {
      repeatMode = 'all';
      repeatAllIcon.classList.remove('hidden');
    } else if (repeatMode === 'all') {
      repeatMode = 'one';
      repeatOneIcon.classList.remove('hidden');
    } else {
      repeatMode = 'none';
      repeatNoneIcon.classList.remove('hidden');
    }
    updateNavButtons();
    saveLastState();
  }

  function changePlaybackRate() {
    rateIndex = (rateIndex + 1) % playbackRates.length;
    audioEl.playbackRate = playbackRates[rateIndex];
    playbackRateBtn.textContent = `${playbackRates[rateIndex]}x`;
    saveLastState();
  }

  function updateVolumeIcon(v) {
    if (v === 0) {
      volumeHighIcon.classList.add('hidden');
      volumeMuteIcon.classList.remove('hidden');
    } else {
      volumeHighIcon.classList.remove('hidden');
      volumeMuteIcon.classList.add('hidden');
    }
  }

  function onVolumeInput(v) {
    baseVolume = v;
    audioEl.volume = v;
    if (v > 0) lastVolume = v;
    updateVolumeIcon(v);
    saveLastState();
  }

  function toggleMute() {
    if (audioEl.volume > 0) {
      audioEl.volume = 0;
    } else {
      audioEl.volume = lastVolume;
    }
    volumeControl.value = audioEl.volume;
    baseVolume = audioEl.volume;
    updateVolumeIcon(audioEl.volume);
    saveLastState();
  }

  // A-B repeat
  function toggleABRepeat() {
    if (!audioEl.duration) return;
    if (abStage === 0) {
      abA = audioEl.currentTime;
      abB = null;
      abStage = 1;
      abRepeatBtn.classList.add('btn-active');
      showToast(toastEl, toastMsgEl, `A点セット: ${formatTime(abA)}`);
    } else if (abStage === 1) {
      const b = audioEl.currentTime;
      if (b <= abA + 0.5) {
        showToast(toastEl, toastMsgEl, "B点はA点より後にしてね", true);
        return;
      }
      abB = b;
      abStage = 2;
      abRepeatBtn.classList.add('btn-active');
      showToast(toastEl, toastMsgEl, `B点セット: ${formatTime(abB)} / A-B ON`);
    } else {
      abStage = 0;
      abA = null; abB = null;
      abRepeatBtn.classList.remove('btn-active');
      showToast(toastEl, toastMsgEl, "A-B OFF");
    }
    saveLastState();
  }

  // Sleep timer
  function cycleSleepTimer() {
    sleepIndex = (sleepIndex + 1) % sleepSteps.length;
    const mins = sleepSteps[sleepIndex];
    clearTimeout(sleepTimeout);

    if (mins === 0) {
      sleepTimerBtn.textContent = "🌙 OFF";
      showToast(toastEl, toastMsgEl, "スリープタイマー OFF");
    } else {
      sleepTimerBtn.textContent = `🌙 ${mins}m`;
      showToast(toastEl, toastMsgEl, `${mins}分後に停止します`);
      sleepTimeout = setTimeout(() => {
        audioEl.pause();
        showToast(toastEl, toastMsgEl, "スリープタイマーで停止しました");
      }, mins * 60 * 1000);
    }
    saveLastState();
  }

  // Seek tooltip
  function setupSeekTooltip() {
    const bar = progressBar;
    const tip = seekTooltip;
    const tipText = seekTooltipText;
    if (!bar || !tip || !tipText) return;

    function show(e) {
      if (!audioEl.duration) return;
      const rect = bar.getBoundingClientRect();
      const x = clamp((e.clientX ?? e.touches?.[0]?.clientX) - rect.left, 0, rect.width);
      const ratio = x / rect.width;
      const t = audioEl.duration * ratio;

      tipText.textContent = formatTime(t);
      tip.style.left = `${x}px`;
      tip.classList.remove('hidden');
    }
    function hide() {
      tip.classList.add('hidden');
    }

    bar.addEventListener('mousemove', show);
    bar.addEventListener('mouseenter', show);
    bar.addEventListener('mouseleave', hide);

    bar.addEventListener('touchmove', show, { passive: true });
    bar.addEventListener('touchend', hide);
  }

  function saveLastState() {
    const state = getLastState();
    saveSettings(state);
    playlistApi.savePlaylistState(state);
  }

  function getLastState() {
    return {
      volume: baseVolume,
      lastVolume,
      repeatMode,
      isShuffle,
      playbackRateIndex: rateIndex,
      currentTrackIndex: playlistApi.currentTrackIndex,
      currentTime: audioEl.currentTime || 0,
      abStage, abA, abB,
      sleepIndex,
      visualizerStyle: ui.getVisualizerStyle(),
      theme: ui.getTheme()
    };
  }

  function restoreLastState(state) {
    if (!state) return;
    repeatMode = state.repeatMode ?? 'none';
    isShuffle = state.isShuffle ?? false;
    rateIndex = state.playbackRateIndex ?? 0;
    baseVolume = state.volume ?? 1;
    lastVolume = state.lastVolume ?? 1;

    audioEl.volume = baseVolume;
    volumeControl.value = baseVolume;
    updateVolumeIcon(baseVolume);

    playbackRateBtn.textContent = `${playbackRates[rateIndex]}x`;
    shuffleBtn.classList.toggle('btn-active', isShuffle);

    // repeat icon apply by cycling
    repeatNoneIcon.classList.add('hidden');
    repeatAllIcon.classList.add('hidden');
    repeatOneIcon.classList.add('hidden');
    if (repeatMode === 'all') repeatAllIcon.classList.remove('hidden');
    else if (repeatMode === 'one') repeatOneIcon.classList.remove('hidden');
    else repeatNoneIcon.classList.remove('hidden');

    // AB
    abStage = state.abStage ?? 0;
    abA = state.abA ?? null;
    abB = state.abB ?? null;
    abRepeatBtn.classList.toggle('btn-active', abStage !== 0);

    // sleep timer
    sleepIndex = state.sleepIndex ?? 0;
    const mins = sleepSteps[sleepIndex];
    sleepTimerBtn.textContent = mins === 0 ? "🌙 OFF" : `🌙 ${mins}m`;
  }

  // --- audio events ---
  audioEl.addEventListener('play', () => {
    updatePlayPauseIcon();
    updateMinimalOverlay();
    playlistApi.highlight();
  });
  audioEl.addEventListener('pause', () => {
    updatePlayPauseIcon();
    updateMinimalOverlay();
  });
  audioEl.addEventListener('timeupdate', updateProgress);
  audioEl.addEventListener('loadedmetadata', setDuration);
  audioEl.addEventListener('ended', () => {
    if (repeatMode === 'one') {
      audioEl.currentTime = 0;
      audioEl.play();
    } else {
      playNext();
    }
  });

  // progress bar
  progressBar.addEventListener('input', (e) => {
    if (!audioEl.duration) return;
    const newTime = audioEl.duration * (e.target.value / 100);
    currentTimeDisplay.textContent = formatTime(newTime);
  });
  progressBar.addEventListener('change', (e) => {
    if (!audioEl.duration) return;
    audioEl.currentTime = audioEl.duration * (e.target.value / 100);
    saveLastState();
  });

  setupSeekTooltip();

  return {
    loadTrack,
    togglePlayPause,
    playNext,
    playPrev,
    toggleShuffle,
    toggleRepeat,
    changePlaybackRate,
    seek,
    onVolumeInput,
    toggleMute,
    toggleABRepeat,
    cycleSleepTimer,
    enableControls,
    updateNavButtons,
    updateMainUI,
    prepareTrack,
    restoreLastState,
    getLastState,
    revokeURL,
  };
}
