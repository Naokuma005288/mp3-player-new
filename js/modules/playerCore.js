import { saveSettings } from "./settings.js";

export function initPlayerCore(els) {
  const jsmediatags = window.jsmediatags;

  let playlist = [];
  let currentTrackIndex = -1;

  let isShuffle = false;
  let repeatMode = "none";
  let shuffledPlaylist = [];

  const playbackRates = [1, 1.25, 1.5, 2, 0.75];
  let currentRateIndex = 0;

  let lastVolume = 1;
  let toastTimeout = null;

  let isMinimalMode = false;

  // v3.1.2: 今再生に使ってるObjectURLを保持して必ず解放
  let currentObjectURL = null;

  function getState() {
    return {
      playlist, currentTrackIndex,
      isShuffle, repeatMode, shuffledPlaylist,
      playbackRates, currentRateIndex,
      lastVolume, isMinimalMode,
    };
  }

  // --- UI helpers ---
  function showToast(message, isError = false) {
    if (toastTimeout) clearTimeout(toastTimeout);

    els.toastMessage.textContent = message;
    els.toast.style.backgroundColor = isError ? "var(--thumb-color)" : "var(--toast-bg)";
    els.toast.classList.add("show");

    toastTimeout = setTimeout(() => {
      els.toast.classList.remove("show");
    }, 3000);
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds == null) return "--:--";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  }

  function resetAlbumArt() {
    els.albumArt.src = "https://placehold.co/512x512/312e81/ffffff?text=MP3";
    els.albumArt.classList.add("opacity-20");
  }

  function updateMainUI(index) {
    if (index < 0 || !playlist[index]) {
      els.songTitle.textContent = "再生する曲はありません";
      els.songArtist.textContent = "ファイルをロードしてください";
      return;
    }
    const track = playlist[index];

    els.songTitle.classList.add("opacity-0", "scale-90");
    els.songArtist.classList.add("opacity-0", "scale-90");
    setTimeout(() => {
      els.songTitle.textContent = track.title;
      els.songArtist.textContent = track.artist;
      els.songTitle.classList.remove("opacity-0", "scale-90");
      els.songArtist.classList.remove("opacity-0", "scale-90");
    }, 300);

    if (track.artwork) {
      els.albumArt.src = track.artwork;
      els.albumArt.classList.remove("opacity-20");
    } else {
      resetAlbumArt();
    }
  }

  function updatePlayPauseIcon() {
    const isPaused = els.audioPlayer.paused || els.audioPlayer.ended;
    els.playIcon.classList.toggle("hidden", !isPaused);
    els.pauseIcon.classList.toggle("hidden", isPaused);
    els.minimalPlayIcon.classList.toggle("hidden", !isPaused);
    els.minimalPauseIcon.classList.toggle("hidden", isPaused);
  }

  function updateMinimalOverlay() {
    if (isMinimalMode) {
      if (els.audioPlayer.paused || els.audioPlayer.ended) {
        els.minimalPlayBtnOverlay.classList.remove("opacity-0", "pointer-events-none");
        els.minimalPlayBtnOverlay.classList.add("pointer-events-auto");
      } else {
        els.minimalPlayBtnOverlay.classList.add("opacity-0", "pointer-events-none");
        els.minimalPlayBtnOverlay.classList.remove("pointer-events-auto");
      }
    } else {
      els.minimalPlayBtnOverlay.classList.add("opacity-0", "pointer-events-none");
      els.minimalPlayBtnOverlay.classList.remove("pointer-events-auto");
    }
  }

  function updateFileUIState() {
    if (playlist.length > 0) els.fileSelectUI.classList.add("file-select-hidden");
    else els.fileSelectUI.classList.remove("file-select-hidden");
  }

  function enableControls() {
    const disabled = playlist.length === 0;
    els.playPauseBtn.disabled = disabled;
    els.progressBar.disabled = disabled;
    els.prevBtn.disabled = disabled;
    els.nextBtn.disabled = disabled;
    els.shuffleBtn.disabled = disabled;
    els.repeatBtn.disabled = disabled;
    els.seekForwardBtn.disabled = disabled;
    els.seekBackwardBtn.disabled = disabled;
    els.playlistToggleBtn.disabled = disabled;
    els.playbackRateBtn.disabled = disabled;
  }

  function updateNavButtons() {
    if (playlist.length <= 1) {
      els.prevBtn.disabled = true;
      els.nextBtn.disabled = true;
      return;
    }
    els.prevBtn.disabled = false;
    els.nextBtn.disabled = false;
  }

  // v3.1.2: 安全なURL解放
  function revokeCurrentURL() {
    try {
      if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
      }
    } catch {}
  }

  // --- metadata ---
  function readMetadataAndRender(file, index, onMetaUpdated) {
    jsmediatags.read(file, {
      onSuccess: (tag) => {
        const tags = tag.tags;

        let artworkUrl = null;
        if (tags.picture) {
          const { data, format } = tags.picture;
          let base64String = "";
          for (let i = 0; i < data.length; i++) {
            base64String += String.fromCharCode(data[i]);
          }
          artworkUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }

        playlist[index].title = tags.title || file.name;
        playlist[index].artist = tags.artist || "不明なアーティスト";
        playlist[index].artwork = artworkUrl;

        if (index === currentTrackIndex) updateMainUI(index);
        onMetaUpdated?.();
      },
      onError: () => {
        playlist[index].artist = "メタデータがありません";
        onMetaUpdated?.();
      }
    });
  }

  function getTrackDuration(file, index, onUpdated) {
    const tempAudio = new Audio();
    const url = URL.createObjectURL(file);
    tempAudio.src = url;

    tempAudio.addEventListener("loadedmetadata", () => {
      if (playlist[index]) playlist[index].duration = tempAudio.duration;
      URL.revokeObjectURL(url);
      onUpdated?.();
    });
    tempAudio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      onUpdated?.();
    });
  }

  // --- playlist ops ---
  function handleFiles(files) {
    const newFiles = Array.from(files).filter(f => f.type === "audio/mpeg");
    const wasEmpty = playlist.length === 0;

    for (const file of newFiles) {
      playlist.push({
        file,
        title: file.name,
        artist: "ロード中...",
        artwork: null,
        duration: null,
        objectURL: null, // v3.1.2: trackごとのURLも保存
      });
      const newIndex = playlist.length - 1;

      readMetadataAndRender(file, newIndex, () => {
        // playlistUI側でrenderされるのでここでは何もしない
        document.dispatchEvent(new CustomEvent("playlist:updated"));
      });
      getTrackDuration(file, newIndex, () => {
        document.dispatchEvent(new CustomEvent("playlist:updated"));
      });
    }

    showToast(`${newFiles.length} 曲が追加されました`);
    enableControls();
    updateFileUIState();

    if (wasEmpty && playlist.length > 0) {
      prepareTrack(0);
    }

    if (isShuffle) createShuffledPlaylist();

    document.dispatchEvent(new CustomEvent("playlist:updated"));
  }

  function prepareTrack(index) {
    if (index < 0 || index >= playlist.length) return;

    currentTrackIndex = index;
    const track = playlist[currentTrackIndex];

    // v3.1.2: 前のURL解放
    revokeCurrentURL();

    const fileURL = URL.createObjectURL(track.file);
    currentObjectURL = fileURL;
    track.objectURL = fileURL;

    els.audioPlayer.src = fileURL;
    els.audioPlayer.playbackRate = playbackRates[currentRateIndex];

    updateMainUI(index);
    updateNavButtons();

    document.dispatchEvent(new CustomEvent("playlist:highlight"));
  }

  function loadTrack(index) {
    if (index < 0 || index >= playlist.length) {
      if (repeatMode === "none") {
        els.audioPlayer.pause();
        if (playlist.length > 0) {
          prepareTrack(0);
          updatePlayPauseIcon();
        } else {
          currentTrackIndex = -1;
        }
      }
      return;
    }

    prepareTrack(index);

    const playPromise = els.audioPlayer.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {
        els.audioPlayer.pause();
        updatePlayPauseIcon();
      });
    }
  }

  function togglePlayPause() {
    if (els.audioPlayer.paused) els.audioPlayer.play();
    else els.audioPlayer.pause();
  }

  function playNext() {
    if (playlist.length === 0) return;

    let newIndex;

    if (isShuffle) {
      const currentShuffleIndex = shuffledPlaylist.indexOf(currentTrackIndex);
      let nextShuffleIndex = currentShuffleIndex + 1;

      if (nextShuffleIndex >= shuffledPlaylist.length) {
        if (repeatMode === "all") {
          createShuffledPlaylist();
          newIndex = shuffledPlaylist[0];
        } else {
          els.audioPlayer.pause();
          currentTrackIndex = -1;
          prepareTrack(0);
          return;
        }
      } else {
        newIndex = shuffledPlaylist[nextShuffleIndex];
      }
    } else {
      newIndex = currentTrackIndex + 1;

      if (newIndex >= playlist.length) {
        if (repeatMode === "all") newIndex = 0;
        else {
          els.audioPlayer.pause();
          currentTrackIndex = -1;
          prepareTrack(0);
          return;
        }
      }
    }

    loadTrack(newIndex);
  }

  function playPrev() {
    if (playlist.length === 0) return;

    if (els.audioPlayer.currentTime > 5) {
      els.audioPlayer.currentTime = 0;
      return;
    }

    let newIndex;

    if (isShuffle) {
      const currentShuffleIndex = shuffledPlaylist.indexOf(currentTrackIndex);
      let prevShuffleIndex = currentShuffleIndex - 1;

      if (prevShuffleIndex < 0) {
        newIndex = shuffledPlaylist[shuffledPlaylist.length - 1];
      } else {
        newIndex = shuffledPlaylist[prevShuffleIndex];
      }
    } else {
      newIndex = currentTrackIndex - 1;
      if (newIndex < 0) {
        if (repeatMode === "all") newIndex = playlist.length - 1;
        else {
          newIndex = 0;
          els.audioPlayer.currentTime = 0;
          return;
        }
      }
    }

    loadTrack(newIndex);
  }

  function seek(time) {
    if (els.audioPlayer.readyState >= 2) {
      els.audioPlayer.currentTime = Math.min(
        Math.max(0, els.audioPlayer.currentTime + time),
        els.audioPlayer.duration
      );
    }
  }

  function updateProgress() {
    if (!els.audioPlayer.duration) return;
    const percentage = (els.audioPlayer.currentTime / els.audioPlayer.duration) * 100;
    els.progressBar.value = percentage;

    const newTime = formatTime(els.audioPlayer.currentTime);
    if (els.currentTimeDisplay.textContent !== newTime) {
      els.currentTimeDisplay.classList.add("opacity-0");
      setTimeout(() => {
        els.currentTimeDisplay.textContent = newTime;
        els.currentTimeDisplay.classList.remove("opacity-0");
      }, 100);
    }
  }

  function setDuration() {
    if (els.audioPlayer.duration) {
      els.durationDisplay.textContent = formatTime(els.audioPlayer.duration);
    }
  }

  function previewSeekTime(e) {
    if (!els.audioPlayer.duration) return;
    const newTime = els.audioPlayer.duration * (e.target.value / 100);
    els.currentTimeDisplay.textContent = formatTime(newTime);
  }

  function seekByBar(e) {
    if (!els.audioPlayer.duration) return;
    const newTime = els.audioPlayer.duration * (e.target.value / 100);
    els.audioPlayer.currentTime = newTime;
  }

  // --- shuffle/repeat ---
  function toggleShuffle() {
    isShuffle = !isShuffle;
    els.shuffleBtn.classList.toggle("btn-active", isShuffle);
    if (isShuffle) createShuffledPlaylist();
    saveSettings(els, getState());
  }

  function createShuffledPlaylist() {
    const current = currentTrackIndex !== -1 ? [currentTrackIndex] : [];
    let remaining = playlist.map((_, i) => i).filter(i => i !== currentTrackIndex);

    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    shuffledPlaylist = [...current, ...remaining];
  }

  function toggleRepeat() {
    els.repeatNoneIcon.classList.add("hidden");
    els.repeatAllIcon.classList.add("hidden");
    els.repeatOneIcon.classList.add("hidden");

    if (repeatMode === "none") {
      repeatMode = "all";
      els.repeatAllIcon.classList.remove("hidden");
    } else if (repeatMode === "all") {
      repeatMode = "one";
      els.repeatOneIcon.classList.remove("hidden");
    } else {
      repeatMode = "none";
      els.repeatNoneIcon.classList.remove("hidden");
    }

    updateNavButtons();
    saveSettings(els, getState());
  }

  // --- playback rate ---
  function changePlaybackRate() {
    currentRateIndex = (currentRateIndex + 1) % playbackRates.length;
    const newRate = playbackRates[currentRateIndex];
    els.audioPlayer.playbackRate = newRate;
    els.playbackRateBtn.textContent = `${newRate}x`;
    saveSettings(els, getState());
  }

  // --- theme ---
  function toggleTheme() {
    document.documentElement.classList.toggle("light-mode");
    updateThemeIcons();
    saveSettings(els, getState());
  }

  function updateThemeIcons() {
    const isLight = document.documentElement.classList.contains("light-mode");
    els.themeSunIcon.classList.toggle("hidden", !isLight);
    els.themeMoonIcon.classList.toggle("hidden", isLight);
  }

  // --- playlist panel ---
  function togglePlaylist() {
    els.playlistPanel.classList.toggle("open");
  }

  // --- volume ---
  function updateVolumeIcon(volume) {
    if (volume === 0) {
      els.volumeHighIcon.classList.add("hidden");
      els.volumeMuteIcon.classList.remove("hidden");
    } else {
      els.volumeHighIcon.classList.remove("hidden");
      els.volumeMuteIcon.classList.add("hidden");
    }
  }

  function onVolumeInput(e) {
    const volume = parseFloat(e.target.value);
    els.audioPlayer.volume = volume;
    if (volume > 0) lastVolume = volume;
    updateVolumeIcon(volume);
    saveSettings(els, getState());
  }

  function toggleMute() {
    if (els.audioPlayer.volume > 0) els.audioPlayer.volume = 0;
    else els.audioPlayer.volume = lastVolume;

    els.volumeControl.value = els.audioPlayer.volume;
    updateVolumeIcon(els.audioPlayer.volume);
    saveSettings(els, getState());
  }

  // --- minimal mode ---
  function toggleMinimalMode() {
    if (playlist.length === 0) return;
    isMinimalMode = !isMinimalMode;
    els.playerContainer.classList.toggle("minimal", isMinimalMode);
    updateMinimalOverlay();
  }

  // v3.2.0: 並び替えでplaylist配列を更新
  function reorderPlaylist(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;

    const moved = playlist.splice(fromIndex, 1)[0];
    playlist.splice(toIndex, 0, moved);

    // currentTrackIndexの補正（重要！）
    if (fromIndex === currentTrackIndex) {
      currentTrackIndex = toIndex;
    } else if (fromIndex < currentTrackIndex && toIndex >= currentTrackIndex) {
      currentTrackIndex -= 1;
    } else if (fromIndex > currentTrackIndex && toIndex <= currentTrackIndex) {
      currentTrackIndex += 1;
    }

    if (isShuffle) createShuffledPlaylist();

    document.dispatchEvent(new CustomEvent("playlist:updated"));
    document.dispatchEvent(new CustomEvent("playlist:highlight"));
  }

  // 曲削除
  function removeTrack(index) {
    if (index < 0 || index >= playlist.length) return;

    const wasPlaying = index === currentTrackIndex;
    const track = playlist[index];

    // track単位のURL解放
    try {
      if (track?.objectURL) URL.revokeObjectURL(track.objectURL);
    } catch {}

    playlist.splice(index, 1);

    if (wasPlaying) {
      els.audioPlayer.pause();
      revokeCurrentURL();
      els.audioPlayer.src = "";

      if (playlist.length === 0) {
        clearPlaylist();
        return;
      } else {
        loadTrack(Math.min(index, playlist.length - 1));
      }
    } else if (index < currentTrackIndex) {
      currentTrackIndex--;
    }

    if (isShuffle) createShuffledPlaylist();

    document.dispatchEvent(new CustomEvent("playlist:updated"));
    updateNavButtons();
  }

  // 全消去
  function clearPlaylist() {
    els.audioPlayer.pause();
    revokeCurrentURL();
    els.audioPlayer.src = "";

    // 残ってるURL全部解放
    for (const t of playlist) {
      try { if (t.objectURL) URL.revokeObjectURL(t.objectURL); } catch {}
    }

    playlist = [];
    currentTrackIndex = -1;

    resetPlayerUI();
    togglePlaylist();
    showToast("プレイリストをクリアしました");

    document.dispatchEvent(new CustomEvent("playlist:updated"));
  }

  function resetPlayerUI() {
    updateMainUI(-1);
    resetAlbumArt();
    enableControls();
    updateFileUIState();

    els.durationDisplay.textContent = "0:00";
    els.currentTimeDisplay.textContent = "0:00";
    els.progressBar.value = 0;

    updatePlayPauseIcon();
  }

  return {
    getState,
    showToast,
    formatTime,

    handleFiles,
    prepareTrack,
    loadTrack,
    togglePlayPause,

    playNext,
    playPrev,
    seek,

    updateProgress,
    setDuration,
    previewSeekTime,
    seekByBar,

    toggleShuffle,
    toggleRepeat,
    changePlaybackRate,

    toggleTheme,
    updateThemeIcons,

    togglePlaylist,

    onVolumeInput,
    toggleMute,
    updateVolumeIcon,

    toggleMinimalMode,
    updateMinimalOverlay,
    updatePlayPauseIcon,

    enableControls,
    updateNavButtons,
    updateFileUIState,

    removeTrack,
    clearPlaylist,

    reorderPlaylist,
  };
}
