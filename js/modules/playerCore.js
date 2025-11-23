import { clamp, formatTime, showToast } from "./utils.js";

export class PlayerCore {
  constructor(dom, settings, playlist, audioFx) {
    this.dom = dom;
    this.settings = settings;
    this.playlist = playlist;
    this.audioFx = audioFx;

    // v3.9.0: 2つのaudioで crossfade/gapless
    this.audios = [new Audio(), new Audio()];
    this.active = 0;
    this.nextIndex = null;

    this.audioContext = null;
    this.sources = [];
    this.gains = [];
    this.analyser = null;
    this.frequencyData = null;
    this.bufferLength = 0;
    this.isAudioContextInitialized = false;

    this.isMinimalMode = false;

    this.ab = { enabled: false, A: null, B: null };

    this.bindAudioEvents();
    this.bindPlaylistEvents();
  }

  bindPlaylistEvents() {
    document.addEventListener("playlist:playIndex", (e) => this.loadTrack(e.detail, true));
    document.addEventListener("playlist:currentRemoved", () => {
      if (this.playlist.currentIndex >= 0) this.loadTrack(this.playlist.currentIndex, true);
      else this.stop();
    });
    document.addEventListener("playlist:cleared", () => this.stop());
    document.addEventListener("playlist:filesAdded", async () => {
      await this.postProcessNewTracks();
      this.updateControls();
      if (this.playlist.currentIndex >= 0) {
        this.prepareTrack(this.playlist.currentIndex);
        this.updateMainUI();
      }
    });
  }

  async postProcessNewTracks() {
    // gain/waveform解析
    const tasks = this.playlist.tracks.map(async (t) => {
      if (t.gainDone) return;
      const { gain, peaks } = await this.audioFx.analyzeGainAndWaveform(t.file);
      t.gain = gain;
      t.waveform = peaks;
      t.gainDone = true;
    });
    await Promise.all(tasks);
  }

  bindAudioEvents() {
    this.audios.forEach((a, idx) => {
      a.preload = "auto";
      a.addEventListener("timeupdate", () => this.onTimeUpdate());
      a.addEventListener("ended", () => this.onEnded(idx));
      a.addEventListener("loadedmetadata", () => this.onLoadedMetadata());
      a.addEventListener("play", () => this.updatePlayPauseIcon());
      a.addEventListener("pause", () => this.updatePlayPauseIcon());
    });
  }

  get audio() {
    return this.audios[this.active];
  }

  get inactiveAudio() {
    return this.audios[1 - this.active];
  }

  ensureAudioContext() {
    if (this.isAudioContextInitialized) return;

    this.audioContext = this.audioFx.ensureContext();

    this.sources = this.audios.map(a => this.audioContext.createMediaElementSource(a));
    this.gains = this.audios.map(() => this.audioContext.createGain());

    // EQ chain
    const eqIn = this.audioFx.getInputNode();
    const eqOut = this.audioFx.getOutputNode();

    // analyser
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.85;
    this.bufferLength = this.analyser.frequencyBinCount;
    this.frequencyData = new Uint8Array(this.bufferLength);

    // connect graph:
    // source -> gain -> EQ -> analyser -> destination
    this.sources.forEach((src, i) => {
      src.connect(this.gains[i]);
      this.gains[i].connect(eqIn);
    });
    eqOut.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    this.isAudioContextInitialized = true;
  }

  async resumeContextIfNeeded() {
    this.ensureAudioContext();
    if (this.audioContext.state === "suspended") {
      try { await this.audioContext.resume(); } catch {}
    }
  }

  updateControls() {
    const isDisabled = this.playlist.tracks.length === 0;
    [
      this.dom.playPauseBtn, this.dom.progressBar,
      this.dom.prevBtn, this.dom.nextBtn, this.dom.shuffleBtn,
      this.dom.repeatBtn, this.dom.seekForwardBtn, this.dom.seekBackwardBtn,
      this.dom.playlistToggleBtn, this.dom.playbackRateBtn
    ].forEach(b => b.disabled = isDisabled);

    this.dom.fileSelectUI.classList.toggle("file-select-hidden", !isDisabled);
  }

  updateMainUI() {
    const t = this.playlist.currentTrack;
    if (!t) {
      this.dom.songTitle.textContent = "再生する曲はありません";
      this.dom.songArtist.textContent = "ファイルをロードしてください";
      this.resetAlbumArt();
      return;
    }

    this.dom.songTitle.textContent = t.title;
    this.dom.songArtist.textContent = t.artist;

    if (t.artwork) {
      this.dom.albumArt.src = t.artwork;
      this.dom.albumArt.classList.remove("opacity-20");
    } else {
      this.resetAlbumArt();
    }
  }

  resetAlbumArt() {
    this.dom.albumArt.src = "https://placehold.co/512x512/312e81/ffffff?text=MP3";
    this.dom.albumArt.classList.add("opacity-20");
  }

  prepareTrack(index) {
    if (index < 0 || index >= this.playlist.tracks.length) return;
    this.playlist.currentIndex = index;
    const track = this.playlist.currentTrack;

    // URL cleanup
    if (track.fileUrl) URL.revokeObjectURL(track.fileUrl);
    track.fileUrl = URL.createObjectURL(track.file);

    this.audio.src = track.fileUrl;
    this.audio.playbackRate = this.settings.playbackRates[this.settings.rateIndex];
    this.setGainForActive(track.gain || 1);

    this.updateMainUI();
    this.updatePlayPauseIcon();
    this.dom.duration.textContent = formatTime(track.duration);
    this.dom.progressBar.value = 0;

    document.dispatchEvent(new CustomEvent("player:trackPrepared", { detail: track }));
  }

  async loadTrack(index, autoplay = false) {
    if (index < 0 || index >= this.playlist.tracks.length) return;

    await this.resumeContextIfNeeded();
    this.prepareTrack(index);
    if (autoplay) this.play();
  }

  isPlaying() {
    return !this.audio.paused && !this.audio.ended;
  }

  play() {
    this.audio.play().catch(() => {});
  }

  pause() {
    this.audio.pause();
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.dom.progressBar.value = 0;
    this.dom.currentTime.textContent = "0:00";
    this.updatePlayPauseIcon();
  }

  playPause() {
    this.resumeContextIfNeeded();
    if (!this.playlist.tracks.length) return;

    if (this.playlist.currentIndex === -1) {
      this.loadTrack(0, true);
      return;
    }
    if (this.audio.paused) this.play();
    else this.pause();
  }

  playNext() {
    if (!this.playlist.tracks.length) return;

    let newIndex;
    if (this.settings.isShuffle) {
      newIndex = this.playlist.currentIndex;
      while (newIndex === this.playlist.currentIndex && this.playlist.tracks.length > 1) {
        newIndex = Math.floor(Math.random() * this.playlist.tracks.length);
      }
    } else {
      newIndex = this.playlist.currentIndex + 1;
      if (newIndex >= this.playlist.tracks.length) {
        if (this.settings.repeatMode === "all") newIndex = 0;
        else { this.stop(); return; }
      }
    }
    this.loadTrack(newIndex, true);
  }

  playPrev() {
    if (!this.playlist.tracks.length) return;

    if (this.audio.currentTime > 5) {
      this.audio.currentTime = 0;
      return;
    }
    let newIndex = this.playlist.currentIndex - 1;
    if (newIndex < 0) {
      if (this.settings.repeatMode === "all") newIndex = this.playlist.tracks.length - 1;
      else { this.audio.currentTime = 0; return; }
    }
    this.loadTrack(newIndex, true);
  }

  toggleShuffle() {
    this.settings.isShuffle = !this.settings.isShuffle;
    this.dom.shuffleBtn.classList.toggle("btn-active", this.settings.isShuffle);
    this.settings.save();
  }

  toggleRepeat() {
    this.dom.repeatNoneIcon.classList.add("hidden");
    this.dom.repeatAllIcon.classList.add("hidden");
    this.dom.repeatOneIcon.classList.add("hidden");

    if (this.settings.repeatMode === "none") {
      this.settings.repeatMode = "all";
      this.dom.repeatAllIcon.classList.remove("hidden");
    } else if (this.settings.repeatMode === "all") {
      this.settings.repeatMode = "one";
      this.dom.repeatOneIcon.classList.remove("hidden");
    } else {
      this.settings.repeatMode = "none";
      this.dom.repeatNoneIcon.classList.remove("hidden");
    }
    this.settings.save();
  }

  seek(sec) {
    if (this.audio.readyState < 2) return;
    this.audio.currentTime = clamp(this.audio.currentTime + sec, 0, this.audio.duration || 0);
  }

  previewSeek(value) {
    if (!this.audio.duration) return;
    const t = this.audio.duration * (value / 100);
    this.dom.currentTime.textContent = formatTime(t);
  }

  commitSeek(value) {
    if (!this.audio.duration) return;
    const t = this.audio.duration * (value / 100);
    this.audio.currentTime = t;
  }

  showSeekTooltip(e) {
    if (!this.audio.duration) return;
    const rect = this.dom.progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const p = clamp(x / rect.width, 0, 1);
    const t = this.audio.duration * p;

    this.dom.seekTooltip.textContent = formatTime(t);
    this.dom.seekTooltip.style.left = `${p * 100}%`;
    this.dom.seekTooltip.classList.remove("hidden");
  }

  hideSeekTooltip() {
    this.dom.seekTooltip.classList.add("hidden");
  }

  setVolume(v) {
    this.audio.volume = v;
    this.settings.volume = v;
    if (v > 0) this.settings.lastVolume = v;
    this.updateVolumeIcon(v);
    this.settings.save();
  }

  toggleMute() {
    if (this.audio.volume > 0) this.setVolume(0);
    else this.setVolume(this.settings.lastVolume || 1);
    this.dom.volumeControl.value = this.audio.volume;
  }

  updateVolumeIcon(volume) {
    this.dom.volumeHighIcon.classList.toggle("hidden", volume === 0);
    this.dom.volumeMuteIcon.classList.toggle("hidden", volume !== 0);
  }

  onLoadedMetadata() {
    if (!this.audio.duration) return;
    this.dom.duration.textContent = formatTime(this.audio.duration);
  }

  onTimeUpdate() {
    if (!this.audio.duration) return;

    // AB repeat（v3.7.1強化）
    if (this.ab.enabled && this.ab.A != null && this.ab.B != null) {
      if (this.ab.B <= this.ab.A) {
        this.ab.enabled = false;
        showToast("A-B範囲が不正なので解除しました", true);
      } else if (this.audio.currentTime >= this.ab.B) {
        this.audio.currentTime = this.ab.A;
      }
    }

    const p = (this.audio.currentTime / this.audio.duration) * 100;
    this.dom.progressBar.value = p;

    const newTime = formatTime(this.audio.currentTime);
    if (this.dom.currentTime.textContent !== newTime) {
      this.dom.currentTime.textContent = newTime;
    }

    // v3.7.1: XF境界 / gapless
    this.maybePrepareNext();
  }

  maybePrepareNext() {
    const mode = this.settings.transitionMode;
    if (mode === "none") return;
    if (this.nextIndex != null) return;
    if (!this.audio.duration) return;

    const remain = this.audio.duration - this.audio.currentTime;

    // 次曲候補
    let idx = this.playlist.currentIndex + 1;
    if (idx >= this.playlist.tracks.length) {
      if (this.settings.repeatMode === "all") idx = 0;
      else return;
    }
    this.nextIndex = idx;

    if (mode === "gapless") {
      if (remain <= 0.6) {
        this.loadTrack(idx, true);
        this.nextIndex = null;
      }
      return;
    }

    if (mode === "crossfade") {
      const xf = this.settings.crossfadeSeconds;
      // v3.7.1: 短すぎ/境界対策
      if (remain <= xf + 0.15 && this.audio.duration > xf + 0.5) {
        this.crossfadeTo(idx, xf);
      } else {
        this.nextIndex = null;
      }
    }
  }

  async crossfadeTo(index, seconds) {
    await this.resumeContextIfNeeded();

    const nextTrack = this.playlist.tracks[index];
    if (!nextTrack) return;

    // inactiveに次曲セット
    if (nextTrack.fileUrl) URL.revokeObjectURL(nextTrack.fileUrl);
    nextTrack.fileUrl = URL.createObjectURL(nextTrack.file);

    const inactive = this.inactiveAudio;
    inactive.src = nextTrack.fileUrl;
    inactive.playbackRate = this.audio.playbackRate;

    // gainセット
    this.setGainForInactive(nextTrack.gain || 1);

    try { await inactive.play(); } catch {}

    // フェード
    const gA = this.gains[this.active];
    const gB = this.gains[1 - this.active];
    const ac = this.audioContext;
    const now = ac.currentTime;

    gB.gain.cancelScheduledValues(now);
    gA.gain.cancelScheduledValues(now);

    gB.gain.setValueAtTime(0, now);
    gB.gain.linearRampToValueAtTime(1, now + seconds);

    gA.gain.setValueAtTime(1, now);
    gA.gain.linearRampToValueAtTime(0, now + seconds);

    setTimeout(() => {
      // active切替
      this.audio.pause();
      this.active = 1 - this.active;
      this.nextIndex = null;
      this.playlist.currentIndex = index;
      this.updateMainUI();
      this.updatePlayPauseIcon();
      document.dispatchEvent(new CustomEvent("player:trackPrepared", { detail: this.playlist.currentTrack }));
    }, seconds * 1000);
  }

  setGainForActive(trackGain) {
    if (!this.gains.length) return;
    this.gains[this.active].gain.value = trackGain;
  }
  setGainForInactive(trackGain) {
    if (!this.gains.length) return;
    this.gains[1 - this.active].gain.value = trackGain;
  }

  onEnded(endedIndex) {
    if (endedIndex !== this.active) return; // inactiveのendedは無視

    if (this.settings.repeatMode === "one") {
      this.audio.currentTime = 0;
      this.play();
      return;
    }

    if (this.settings.transitionMode !== "crossfade") {
      this.playNext();
    }
  }

  updatePlayPauseIcon() {
    const paused = this.audio.paused || this.audio.ended;
    this.dom.playIcon.classList.toggle("hidden", !paused);
    this.dom.pauseIcon.classList.toggle("hidden", paused);
    this.dom.minimalPlayIcon.classList.toggle("hidden", !paused);
    this.dom.minimalPauseIcon.classList.toggle("hidden", paused);

    this.updateMinimalOverlay();
  }

  toggleMinimalMode() {
    if (!this.playlist.tracks.length) return;
    this.isMinimalMode = !this.isMinimalMode;
    this.dom.playerContainer.classList.toggle("minimal", this.isMinimalMode);
    this.updateMinimalOverlay();
  }

  updateMinimalOverlay() {
    if (this.isMinimalMode) {
      if (this.audio.paused || this.audio.ended) {
        this.dom.minimalOverlay.classList.remove("opacity-0", "pointer-events-none");
        this.dom.minimalOverlay.classList.add("pointer-events-auto");
      } else {
        this.dom.minimalOverlay.classList.add("opacity-0", "pointer-events-none");
        this.dom.minimalOverlay.classList.remove("pointer-events-auto");
      }
    } else {
      this.dom.minimalOverlay.classList.add("opacity-0", "pointer-events-none");
      this.dom.minimalOverlay.classList.remove("pointer-events-auto");
    }
  }

  onMinimalClick() {
    if (!this.playlist.tracks.length) return;
    if (this.playlist.currentIndex === -1) this.loadTrack(0, true);
    else this.playPause();
  }

  handleKeydown(e) {
    if (e.target === this.dom.playlistSearch) return;
    if (!this.playlist.tracks.length) return;

    if (e.code === "Space" && e.target.tagName !== "INPUT") {
      e.preventDefault();
      this.playPause();
    }
    if (e.code === "ArrowRight") {
      e.preventDefault();
      if (e.shiftKey) this.playNext();
      else this.seek(10);
    }
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      if (e.shiftKey) this.playPrev();
      else this.seek(-10);
    }
  }

  getAnalyserData() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  getCurrentTime() {
    return this.audio.currentTime || 0;
  }

  seekTo(t) {
    this.audio.currentTime = clamp(t, 0, this.audio.duration || t);
  }
}
