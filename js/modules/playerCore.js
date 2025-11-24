// js/modules/playerCore.js
import { clamp } from "./utils.js";

export class PlayerCore {
  constructor(ui, playlist, settings, audioFx) {
    this.ui = ui;
    this.playlist = playlist;
    this.settings = settings;
    this.audioFx = audioFx;

    this.events = new Map();

    this.active = "a";
    this.audioA = ui.audioA;
    this.audioB = ui.audioB;

    try {
      this.bundleA = audioFx.attach(this.audioA);
      this.bundleB = audioFx.attach(this.audioB);
    } catch (e) {
      console.warn("[AudioFx.attach] failed, fallback to plain audio", e);
      this.bundleA = { gain: null };
      this.bundleB = { gain: null };
    }

    this.playbackRates = [1, 1.25, 1.5, 2, 0.75];
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

  _safePlay(audio, tag="play"){
    try{
      const p = audio.play();
      if (p && typeof p.catch === "function"){
        p.catch(err => this.emit("playerror", { error: err, tag }));
      }
      return p;
    }catch(err){
      this.emit("playerror", { error: err, tag });
      return null;
    }
  }

  _bindAudioEvents(audio) {
    audio.addEventListener("play", () => this.emit("playstate", false));
    audio.addEventListener("pause", () => this.emit("playstate", true));

    audio.addEventListener("timeupdate", () => {
      if (!this.isActive(audio)) return;
      this.emit("time", {
        currentTime: audio.currentTime || 0,
        duration: audio.duration || 0,
      });
    });

    audio.addEventListener("ended", () => {
      if (!this.isActive(audio)) return;
      if (this.playlist.repeatMode === "one") {
        audio.currentTime = 0;
        this._safePlay(audio, "repeat-one");
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
    const b = this.active === "a" ? this.bundleA : this.bundleB;
    return b?.gain || null;
  }

  updateControls() {
    const disabled = this.playlist.tracks.length === 0;
    const controls = [
      this.ui.playPauseBtn, this.ui.progressBar,
      this.ui.prevBtn, this.ui.nextBtn,
      this.ui.shuffleBtn, this.ui.repeatBtn,
      this.ui.seekForwardBtn, this.ui.seekBackwardBtn,
      this.ui.playlistToggleBtn, this.ui.playbackRateBtn
    ];
    controls.forEach(el => { if (el) el.disabled = disabled; });

    if (this.ui.fileSelectUI) {
      this.ui.fileSelectUI.classList.toggle("file-select-hidden", !disabled);
    }
  }

  _resolvePlayableIndex(index, dir = 1) {
    const t = this.playlist.tracks[index];
    if (t && t.file) return index;
    return this.playlist.getFirstPlayableIndex(index, dir);
  }

  prepareTrack(index) {
    const playable = this._resolvePlayableIndex(index, 1);
    if (playable === -1) return;

    const track = this.playlist.tracks[playable];
    this.playlist.currentTrackIndex = playable;

    this._setSource(this.getActiveAudio(), track);
    this._applyTrackFx(track);

    this.emit("trackchange", playable);
  }

  loadTrack(index, autoplay = true) {
    const playable = this._resolvePlayableIndex(index, 1);
    if (playable === -1) return;

    this.audioFx?.ensureContext?.();
    this.audioFx?.resumeContext?.();

    const track = this.playlist.tracks[playable];
    const mode = this.settings.get("transitionMode");
    const sec = this.settings.get("crossfadeSec");

    if (mode === "crossfade" && this.playlist.currentTrackIndex !== -1) {
      this._crossfadeTo(track, sec, autoplay);
    } else {
      this._switchTo(track, autoplay);
    }
  }

  _setSource(audio, track) {
    if (audio.__objectUrl){
      try{ URL.revokeObjectURL(audio.__objectUrl); }catch{}
      audio.__objectUrl = null;
    }

    if (!track.file) {
      audio.src = "";
      return;
    }
    const url = URL.createObjectURL(track.file);
    audio.__objectUrl = url;
    audio.src = url;
    audio.playbackRate = this.playbackRates[this.currentRateIndex];
  }

  _applyTrackFx(track) {
    const safeGain = (track.gain && track.gain > 0.02) ? track.gain : 1;
    const gainNode = this.getCurrentGainNode();
    if (gainNode) {
      this.audioFx.applyNormalizeToCurrent?.(gainNode, safeGain);
    }
    this.audioFx.applyEqPresetToAll?.();
  }

  reapplyFx(){
    const idx = this.playlist.currentTrackIndex;
    const t = this.playlist.tracks[idx];
    if (!t) return;
    this._applyTrackFx(t);
  }

  _switchTo(track, autoplay) {
    const a = this.getActiveAudio();
    a.pause();

    this._setSource(a, track);
    this._applyTrackFx(track);

    this.playlist.currentTrackIndex = this.playlist.tracks.indexOf(track);
    this.emit("trackchange", this.playlist.currentTrackIndex);

    if (autoplay) this._safePlay(a, "switch");
  }

  _crossfadeTo(track, sec = 2, autoplay = true) {
    const curA = this.getActiveAudio();
    const nextA = this.getInactiveAudio();

    const curBundle = this.active==="a" ? this.bundleA : this.bundleB;
    const nextBundle = this.active==="a" ? this.bundleB : this.bundleA;

    this._setSource(nextA, track);
    nextA.currentTime = 0;

    if (nextBundle?.gain) nextBundle.gain.gain.value = 0;

    this.playlist.currentTrackIndex = this.playlist.tracks.indexOf(track);
    this.emit("trackchange", this.playlist.currentTrackIndex);

    if (!autoplay) {
      this.active = this.active==="a"?"b":"a";
      return;
    }

    this._safePlay(nextA, "crossfade-next");

    const start = performance.now();
    const durMs = Math.max(0.05, sec) * 1000;

    const fade = (now) => {
      const t = clamp((now - start) / durMs, 0, 1);
      if (curBundle?.gain) curBundle.gain.gain.value = 1 - t;
      if (nextBundle?.gain) nextBundle.gain.gain.value = t;

      if (t < 1) requestAnimationFrame(fade);
      else {
        curA.pause();
        curA.currentTime = 0;
        if (curBundle?.gain) curBundle.gain.gain.value = 1;

        this.active = this.active==="a"?"b":"a";
        this._applyTrackFx(track);
      }
    };
    requestAnimationFrame(fade);
  }

  togglePlayPause() {
    this.audioFx?.ensureContext?.();
    this.audioFx?.resumeContext?.();

    const a = this.getActiveAudio();
    if (a.paused) this._safePlay(a, "toggle");
    else a.pause();
  }

  stop() {
    [this.audioA, this.audioB].forEach(a=>{
      a.pause();
      if (a.__objectUrl){
        try{ URL.revokeObjectURL(a.__objectUrl); }catch{}
        a.__objectUrl=null;
      }
      a.src="";
    });
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
      else return;
    }

    const playable = this._resolvePlayableIndex(idx, 1);
    if (playable === -1) return;
    this.loadTrack(playable, true);
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

    const playable = this._resolvePlayableIndex(idx, -1);
    if (playable === -1) return;
    this.loadTrack(playable, true);
  }

  seek(sec) {
    const a = this.getActiveAudio();
    if (a.readyState >= 2) {
      a.currentTime = clamp(a.currentTime + sec, 0, a.duration || 0);
    }
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
