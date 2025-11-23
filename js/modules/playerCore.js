import { clamp } from "./utils.js";

export class PlayerCore {
  constructor(ui, playlist, settings, audioFx) {
    this.ui = ui;
    this.playlist = playlist;
    this.settings = settings;
    this.audioFx = audioFx;

    this.events = new Map();

    this.active = "a"; // a/b
    this.audioA = ui.audioA;
    this.audioB = ui.audioB;

    this.bundleA = audioFx.attach(this.audioA);
    this.bundleB = audioFx.attach(this.audioB);

    this.playbackRates = [1,1.25,1.5,2,0.75];
    this.currentRateIndex = settings.get("playbackRateIndex") || 0;

    this.lastVolume = settings.get("lastVolume") || 1;
    this.setVolume(settings.get("volume") ?? 1);

    this._bindAudioEvents(this.audioA);
    this._bindAudioEvents(this.audioB);
  }

  on(name, fn) {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(fn);
  }
  emit(name, payload) {
    (this.events.get(name) || []).forEach(fn => fn(payload));
  }

  _bindAudioEvents(audio) {
    audio.addEventListener("play", () => this.emit("playstate", false));
    audio.addEventListener("pause", () => this.emit("playstate", true));
    audio.addEventListener("timeupdate", () => {
      const cur = audio.currentTime || 0;
      const dur = audio.duration || 0;
      if (this.isActive(audio)) this.emit("time", { currentTime: cur, duration: dur });
    });
    audio.addEventListener("ended", () => {
      if (!this.isActive(audio)) return;
      if (this.playlist.repeatMode === "one") {
        audio.currentTime = 0;
        audio.play();
      } else {
        this.playNext();
      }
    });
  }

  isActive(audio) {
    return (this.active === "a" && audio === this.audioA) ||
           (this.active === "b" && audio === this.audioB);
  }

  getActiveAudio() {
    return this.active === "a" ? this.audioA : this.audioB;
  }
  getInactiveAudio() {
    return this.active === "a" ? this.audioB : this.audioA;
  }
  getCurrentGainNode() {
    return this.active === "a" ? this.bundleA.gain : this.bundleB.gain;
  }

  updateControls() {
    const disabled = this.playlist.tracks.length === 0;
    const controls = [
      this.ui.playPauseBtn, this.ui.progressBar,
      this.ui.prevBtn, this.ui.nextBtn,
      this.ui.shuffleBtn, this.ui.repeatBtn,
      this.ui.seekForwardBtn, this.ui.seekBackwardBtn,
      this.ui.playlistToggleBtn, this.ui.playbackRateBtn,
      this.ui.eqBtn, this.ui.normalizeBtn, this.ui.waveBtn, this.ui.transitionBtn
    ];
    controls.forEach(el => { if (el) el.disabled = disabled; }); // v3.9.1 fix
    if (this.ui.fileSelectUI) {
      this.ui.fileSelectUI.classList.toggle("file-select-hidden", !disabled);
    }
  }

  prepareTrack(index) {
    const track = this.playlist.tracks[index];
    if (!track) return;

    this.playlist.currentTrackIndex = index;
    this._setSource(this.getActiveAudio(), track);
    this._applyTrackFx(track);

    this.emit("trackchange", index);
  }

  loadTrack(index, autoplay=true) {
    const track = this.playlist.tracks[index];
    if (!track) return;

    const mode = this.settings.get("transitionMode");
    const sec = this.settings.get("crossfadeSec");

    if (mode === "crossfade" && this.playlist.currentTrackIndex !== -1) {
      this._crossfadeTo(track, sec, autoplay);
    } else {
      // gapless or none
      this._switchTo(track, autoplay);
    }
  }

  _setSource(audio, track) {
    if (!track.file) {
      audio.src = ""; // ghost
      return;
    }
    const url = URL.createObjectURL(track.file);
    audio.src = url;
    audio.playbackRate = this.playbackRates[this.currentRateIndex];
  }

  _applyTrackFx(track) {
    const gainNode = this.getCurrentGainNode();
    this.audioFx.applyNormalizeToCurrent(gainNode, track.gain || 1);
    this.audioFx.applyEqPresetToAll();
  }

  _switchTo(track, autoplay) {
    const a = this.getActiveAudio();
    a.pause();
    this._setSource(a, track);
    this._applyTrackFx(track);
    this.playlist.currentTrackIndex = this.playlist.tracks.indexOf(track);
    this.emit("trackchange", this.playlist.currentTrackIndex);
    if (autoplay) a.play().catch(()=>{});
  }

  _crossfadeTo(track, sec=2, autoplay=true) {
    const curA = this.getActiveAudio();
    const nextA = this.getInactiveAudio();

    const curBundle = this.active==="a"?this.bundleA:this.bundleB;
    const nextBundle = this.active==="a"?this.bundleB:this.bundleA;

    this._setSource(nextA, track);
    nextA.currentTime = 0;
    nextA.volume = 1; // audio element volumeは最終ミックスの前段
    nextBundle.gain.gain.value = 0;

    this.playlist.currentTrackIndex = this.playlist.tracks.indexOf(track);
    this.emit("trackchange", this.playlist.currentTrackIndex);

    if (!autoplay) {
      // active切替だけ
      this.active = this.active==="a"?"b":"a";
      return;
    }

    nextA.play().catch(()=>{});

    const start = performance.now();
    const durMs = Math.max(0.05, sec) * 1000;

    const fade = (now) => {
      const t = clamp((now - start) / durMs, 0, 1);
      curBundle.gain.gain.value = 1 - t;
      nextBundle.gain.gain.value = t;

      if (t < 1) requestAnimationFrame(fade);
      else {
        curA.pause();
        curA.currentTime = 0;
        curBundle.gain.gain.value = 1;

        this.active = this.active==="a"?"b":"a";
        // 次の曲のgain再適用
        this._applyTrackFx(track);
      }
    };
    requestAnimationFrame(fade);
  }

  togglePlayPause() {
    const a = this.getActiveAudio();
    if (a.paused) a.play().catch(()=>{});
    else a.pause();
  }

  stop() {
    this.audioA.pause(); this.audioB.pause();
    this.audioA.src=""; this.audioB.src="";
    this.playlist.currentTrackIndex = -1;
    this.emit("trackchange", -1);
  }

  playNext() {
    const len = this.playlist.tracks.length;
    if (len === 0) return;
    let idx = this.playlist.currentTrackIndex;
    if (idx === -1) idx = 0;

    idx++;
    if (idx >= len) {
      if (this.playlist.repeatMode === "all") idx = 0;
      else { this.prepareTrack(0); return; }
    }
    this.loadTrack(idx, true);
  }

  playPrev() {
    const len = this.playlist.tracks.length;
    if (len === 0) return;
    const a = this.getActiveAudio();
    if (a.currentTime > 5) { a.currentTime = 0; return; }

    let idx = this.playlist.currentTrackIndex;
    if (idx === -1) idx = 0;
    idx--;
    if (idx < 0) {
      if (this.playlist.repeatMode === "all") idx = len-1;
      else { a.currentTime = 0; return; }
    }
    this.loadTrack(idx, true);
  }

  seek(sec) {
    const a = this.getActiveAudio();
    if (a.readyState >= 2) {
      a.currentTime = clamp(a.currentTime + sec, 0, a.duration || 0);
    }
  }

  previewSeek(percent) {
    const a = this.getActiveAudio();
    if (!a.duration) return 0;
    return a.duration * (percent / 100);
  }

  commitSeek(percent) {
    const a = this.getActiveAudio();
    if (!a.duration) return;
    a.currentTime = a.duration * (percent / 100);
  }

  changePlaybackRate() {
    this.currentRateIndex = (this.currentRateIndex + 1) % this.playbackRates.length;
    const rate = this.playbackRates[this.currentRateIndex];
    this.settings.set("playbackRateIndex", this.currentRateIndex);
    this.audioA.playbackRate = rate;
    this.audioB.playbackRate = rate;
    return rate;
  }

  setVolume(v) {
    const vol = clamp(v, 0, 1);
    this.audioA.volume = vol;
    this.audioB.volume = vol;
    if (vol > 0) {
      this.lastVolume = vol;
      this.settings.set("lastVolume", vol);
    }
    this.settings.set("volume", vol);
  }

  toggleMute() {
    const cur = this.getVolume();
    if (cur > 0) this.setVolume(0);
    else this.setVolume(this.lastVolume || 1);
    return this.getVolume();
  }

  getVolume() { return this.audioA.volume; }
}
