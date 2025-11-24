// js/modules/playerCore.js
import { clamp, easeInOutCos } from "./utils.js";

export class PlayerCore {
  constructor(ui, playlist, settings, audioFx){
    this.ui = ui;
    this.playlist = playlist;
    this.settings = settings;
    this.audioFx = audioFx;

    this.events = new Map();

    this.active = "a";
    this.audioA = ui.audioA;
    this.audioB = ui.audioB;

    try{
      this.bundleA = audioFx.attach(this.audioA);
      this.bundleB = audioFx.attach(this.audioB);
    }catch(e){
      console.warn("[AudioFx.attach] failed, fallback to plain audio", e);
      this.bundleA = { gain:null };
      this.bundleB = { gain:null };
    }

    this.playbackRates = [1, 1.25, 1.5, 2, 0.75];
    this.currentRateIndex = settings.get("playbackRateIndex") || 0;

    this.lastVolume = settings.get("lastVolume") ?? 1;
    this.setVolume(settings.get("volume") ?? 1);

    this._bindAudioEvents(this.audioA);
    this._bindAudioEvents(this.audioB);
  }

  on(name, fn){
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(fn);
  }
  emit(name, payload){
    (this.events.get(name) || []).forEach(fn => fn(payload));
  }

  _bindAudioEvents(audio){
    audio.addEventListener("play", ()=> this.emit("playstate", false));
    audio.addEventListener("pause", ()=> this.emit("playstate", true));

    audio.addEventListener("timeupdate", ()=>{
      if (!this.isActive(audio)) return;
      this.emit("time", {
        currentTime: audio.currentTime || 0,
        duration: audio.duration || 0,
      });
    });

    audio.addEventListener("ended", ()=>{
      if (!this.isActive(audio)) return;
      if (this.playlist.repeatMode === "one"){
        audio.currentTime = 0;
        this._safePlay(audio);
      } else {
        this.playNext();
      }
    });

    const onErr = (msg="再生エラー"){
      if (!this.isActive(audio)) return;
      this.emit("toast", { msg, isErr:true });
      this.playNext(true);
    };
    audio.addEventListener("error", ()=>onErr("この曲を再生できません"));
    audio.addEventListener("stalled", ()=>onErr("読み込みが止まりました"));
  }

  isActive(audio){
    return (this.active==="a" && audio===this.audioA) ||
           (this.active==="b" && audio===this.audioB);
  }
  getActiveAudio(){ return this.active==="a" ? this.audioA : this.audioB; }
  getInactiveAudio(){ return this.active==="a" ? this.audioB : this.audioA; }

  getCurrentBundle(){
    return this.active==="a" ? this.bundleA : this.bundleB;
  }
  getInactiveBundle(){
    return this.active==="a" ? this.bundleB : this.bundleA;
  }

  updateControls(){
    const playable = this.playlist.tracks.some(t => t.file);
    const disabled = !playable;

    const controls = [
      this.ui.playPauseBtn, this.ui.progressBar,
      this.ui.prevBtn, this.ui.nextBtn,
      this.ui.shuffleBtn, this.ui.repeatBtn,
      this.ui.seekForwardBtn, this.ui.seekBackwardBtn,
      this.ui.playlistToggleBtn, this.ui.playbackRateBtn
    ];
    controls.forEach(el => { if (el) el.disabled = disabled; });

    if (this.ui.fileSelectUI){
      this.ui.fileSelectUI.classList.toggle("file-select-hidden", playable);
    }
  }

  _resolvePlayableIndex(index, dir=1){
    const t = this.playlist.tracks[index];
    if (t && t.file) return index;
    return this.playlist.getFirstPlayableIndex(index, dir);
  }

  prepareTrack(index){
    const playable = this._resolvePlayableIndex(index, 1);
    if (playable === -1) return;

    const track = this.playlist.tracks[playable];
    this.playlist.currentTrackIndex = playable;

    this._setSource(this.getActiveAudio(), track);
    this._applyTrackFx(track, this.getCurrentBundle());

    this.emit("trackchange", playable);
  }

  loadTrack(index, autoplay=true){
    const playable = this._resolvePlayableIndex(index, 1);
    if (playable === -1) return;

    this.audioFx?.ensureContext?.();
    this.audioFx?.resumeContext?.();

    const track = this.playlist.tracks[playable];

    const mode = this.settings.get("transitionMode") || "none";
    const sec  = this.settings.get("crossfadeSec") ?? 2;

    if (mode==="crossfade" && this.playlist.currentTrackIndex!==-1 && autoplay){
      this._crossfadeTo(track, sec);
    }else if (mode==="gapless" && this.playlist.currentTrackIndex!==-1 && autoplay){
      this._gaplessTo(track);
    }else{
      this._switchTo(track, autoplay);
    }
  }

  _revokeOldUrl(audio){
    if (audio.__objectUrl){
      try{ URL.revokeObjectURL(audio.__objectUrl); }catch{}
      audio.__objectUrl = null;
    }
  }

  _setSource(audio, track){
    this._revokeOldUrl(audio);

    if (!track.file){
      audio.src = "";
      return;
    }
    const url = URL.createObjectURL(track.file);
    audio.__objectUrl = url;
    audio.src = url;
    audio.preload = "auto";
    audio.playbackRate = this.playbackRates[this.currentRateIndex];

    audio.load(); // ★超重要
  }

  _applyTrackFx(track, bundle){
    const safeGain = (track.gain && track.gain > 0.02) ? track.gain : 1;
    if (bundle?.gain){
      this.audioFx.applyNormalizeToCurrent(bundle.gain, safeGain);
    }
    this.audioFx.applyEqPresetToAll?.();
  }

  _safePlay(audio){
    const p = audio.play();
    if (p) p.catch(()=>{});
  }

  _switchTo(track, autoplay){
    const a = this.getActiveAudio();
    const bundle = this.getCurrentBundle();

    a.pause();
    this._setSource(a, track);
    this._applyTrackFx(track, bundle);

    this.playlist.currentTrackIndex = this.playlist.tracks.indexOf(track);
    this.emit("trackchange", this.playlist.currentTrackIndex);

    if (autoplay){
      if (a.readyState >= 2) this._safePlay(a);
      else a.addEventListener("canplay", ()=>this._safePlay(a), { once:true });
    }
  }

  _gaplessTo(track){
    const curA = this.getActiveAudio();
    const nextA = this.getInactiveAudio();
    const nextBundle = this.getInactiveBundle();

    this._setSource(nextA, track);
    this._applyTrackFx(track, nextBundle);
    nextA.currentTime = 0;

    const go = () => {
      this._safePlay(nextA);
      curA.pause();
      curA.currentTime = 0;

      this.active = this.active==="a" ? "b" : "a";
      this.playlist.currentTrackIndex = this.playlist.tracks.indexOf(track);
      this.emit("trackchange", this.playlist.currentTrackIndex);
    };

    if (nextA.readyState >= 2) queueMicrotask(go);
    else nextA.addEventListener("canplay", go, { once:true });
  }

  _crossfadeTo(track, sec=2){
    const curA = this.getActiveAudio();
    const nextA = this.getInactiveAudio();

    const curBundle = this.getCurrentBundle();
    const nextBundle = this.getInactiveBundle();

    this._setSource(nextA, track);
    this._applyTrackFx(track, nextBundle);
    nextA.currentTime = 0;

    if (nextBundle?.gain) nextBundle.gain.gain.value = 0;
    if (curBundle?.gain) curBundle.gain.gain.value = 1;

    this.playlist.currentTrackIndex = this.playlist.tracks.indexOf(track);
    this.emit("trackchange", this.playlist.currentTrackIndex);

    const startFade = () => {
      this._safePlay(nextA);

      const start = performance.now();
      const durMs = Math.max(0.05, sec) * 1000;

      const fade = (now) => {
        const t = clamp((now - start) / durMs, 0, 1);
        const e = easeInOutCos(t);
        if (curBundle?.gain) curBundle.gain.gain.value = 1 - e;
        if (nextBundle?.gain) nextBundle.gain.gain.value = e;

        if (t < 1) requestAnimationFrame(fade);
        else {
          curA.pause();
          curA.currentTime = 0;
          if (curBundle?.gain) curBundle.gain.gain.value = 1;

          this.active = this.active==="a" ? "b" : "a";
        }
      };
      requestAnimationFrame(fade);
    };

    if (nextA.readyState >= 2) startFade();
    else nextA.addEventListener("canplay", startFade, { once:true });
  }

  togglePlayPause(){
    this.audioFx?.ensureContext?.();
    this.audioFx?.resumeContext?.();

    const a = this.getActiveAudio();
    if (a.paused) this._safePlay(a);
    else a.pause();
  }

  stop(){
    this.audioA.pause(); this.audioB.pause();
    this._revokeOldUrl(this.audioA);
    this._revokeOldUrl(this.audioB);
    this.audioA.src=""; this.audioB.src="";
    this.playlist.currentTrackIndex=-1;
    this.emit("trackchange", -1);
  }

  _pickRandomPlayable(){
    const playable = this.playlist.tracks
      .map((t,i)=>({t,i}))
      .filter(x=>x.t.file)
      .map(x=>x.i);
    if (!playable.length) return -1;

    let pick = playable[Math.floor(Math.random()*playable.length)];
    if (playable.length>1 && pick===this.playlist.currentTrackIndex){
      pick = playable[(playable.indexOf(pick)+1)%playable.length];
    }
    return pick;
  }

  playNext(fromError=false){
    const len = this.playlist.tracks.length;
    if (!len) return;

    if (this.playlist.shuffle && !fromError){
      const r = this._pickRandomPlayable();
      if (r!==-1) this.loadTrack(r,true);
      return;
    }

    let idx = this.playlist.currentTrackIndex;
    if (idx===-1) idx=0;
    idx++;

    if (idx>=len){
      if (this.playlist.repeatMode==="all") idx=0;
      else return;
    }

    const playable = this._resolvePlayableIndex(idx, 1);
    if (playable===-1) return;
    this.loadTrack(playable,true);
  }

  playPrev(){
    const len = this.playlist.tracks.length;
    if (!len) return;

    const a = this.getActiveAudio();
    if (a.currentTime > 5){
      a.currentTime = 0;
      return;
    }

    if (this.playlist.shuffle){
      const r = this._pickRandomPlayable();
      if (r!==-1) this.loadTrack(r,true);
      return;
    }

    let idx = this.playlist.currentTrackIndex;
    if (idx===-1) idx=0;
    idx--;

    if (idx<0){
      if (this.playlist.repeatMode==="all") idx=len-1;
      else { a.currentTime=0; return; }
    }

    const playable = this._resolvePlayableIndex(idx, -1);
    if (playable===-1) return;
    this.loadTrack(playable,true);
  }

  seek(sec){
    const a = this.getActiveAudio();
    if (a.readyState >= 2){
      a.currentTime = clamp(a.currentTime + sec, 0, a.duration || 0);
    }
  }

  commitSeek(percent){
    const a = this.getActiveAudio();
    if (!a.duration) return;
    a.currentTime = a.duration * (percent/100);
  }

  changePlaybackRate(){
    this.currentRateIndex = (this.currentRateIndex+1) % this.playbackRates.length;
    const rate = this.playbackRates[this.currentRateIndex];
    this.settings.set("playbackRateIndex", this.currentRateIndex);
    this.audioA.playbackRate = rate;
    this.audioB.playbackRate = rate;
    return rate;
  }

  setVolume(v){
    const vol = clamp(v,0,1);
    this.audioA.volume = vol;
    this.audioB.volume = vol;

    if (vol>0){
      this.lastVolume = vol;
      this.settings.set("lastVolume", vol);
    }
    this.settings.set("volume", vol);
  }

  toggleMute(){
    const cur = this.getVolume();
    if (cur>0) this.setVolume(0);
    else this.setVolume(this.lastVolume || 1);
    return this.getVolume();
  }

  getVolume(){
    return this.audioA.volume;
  }
}
