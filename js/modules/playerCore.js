import { clamp } from "./utils.js";

export function createPlayerCore({
  audioA,
  audioB,
  onPlayState,
  onTimeUpdate,
  onDuration,
  onTrackChange,
  onToast,
}) {
  let playlist = [];
  let currentTrackIndex = -1;

  let isShuffle = false;
  let repeatMode = "none"; // none | all | one
  let shuffled = [];

  let playbackRates = [1, 1.25, 1.5, 2, 0.75];
  let rateIndex = 0;

  // v3.7.0 crossfade
  let crossfadeEnabled = false;
  const crossfadeSecList = [1,2,3,0.5];
  let crossfadeSecIndex = 1; // default 2s
  let isCrossfading = false;

  // v3.7.0 AB loop
  let abA = null;
  let abB = null;
  let abEnabled = false;

  // audio context / nodes
  let audioContext = null;
  let analyser = null;
  let srcA = null, srcB = null;
  let gainA = null, gainB = null;

  let active = "A"; // "A" | "B"
  let urlMap = new Map(); // index -> objectURL
  let lastWasPlaying = false;

  function getActiveAudio() {
    return active === "A" ? audioA : audioB;
  }
  function getInactiveAudio() {
    return active === "A" ? audioB : audioA;
  }
  function getActiveGain() {
    return active === "A" ? gainA : gainB;
  }
  function getInactiveGain() {
    return active === "A" ? gainB : gainA;
  }

  function initAudioContextIfNeeded() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;

    srcA = audioContext.createMediaElementSource(audioA);
    srcB = audioContext.createMediaElementSource(audioB);
    gainA = audioContext.createGain();
    gainB = audioContext.createGain();
    gainA.gain.value = 1;
    gainB.gain.value = 0;

    srcA.connect(gainA);
    srcB.connect(gainB);
    gainA.connect(analyser);
    gainB.connect(analyser);
    analyser.connect(audioContext.destination);
  }

  function setPlaylist(list) {
    playlist = list;
    if (isShuffle) createShuffled();
  }

  function createShuffled() {
    const current = currentTrackIndex !== -1 ? [currentTrackIndex] : [];
    let remaining = playlist.map((_, i) => i).filter(i => i !== currentTrackIndex);
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    shuffled = [...current, ...remaining];
  }

  function getNextIndex() {
    if (playlist.length === 0) return -1;

    if (repeatMode === "one") return currentTrackIndex;

    if (isShuffle) {
      const curPos = shuffled.indexOf(currentTrackIndex);
      const nextPos = curPos + 1;
      if (nextPos >= shuffled.length) {
        if (repeatMode === "all") {
          createShuffled();
          return shuffled[0];
        }
        return -1;
      }
      return shuffled[nextPos];
    }

    let i = currentTrackIndex + 1;
    if (i >= playlist.length) {
      if (repeatMode === "all") return 0;
      return -1;
    }
    return i;
  }

  function getPrevIndex() {
    if (playlist.length === 0) return -1;

    if (isShuffle) {
      const curPos = shuffled.indexOf(currentTrackIndex);
      const prevPos = curPos - 1;
      if (prevPos < 0) return shuffled[shuffled.length - 1];
      return shuffled[prevPos];
    }

    let i = currentTrackIndex - 1;
    if (i < 0) {
      if (repeatMode === "all") return playlist.length - 1;
      return 0;
    }
    return i;
  }

  function revokeURL(index) {
    const u = urlMap.get(index);
    if (u) {
      URL.revokeObjectURL(u);
      urlMap.delete(index);
    }
  }

  function setAudioSrc(audioEl, index) {
    const track = playlist[index];
    if (!track) return null;
    const url = URL.createObjectURL(track.file);
    urlMap.set(index, url);
    audioEl.src = url;
    audioEl.playbackRate = playbackRates[rateIndex];
    return url;
  }

  function prepareTrack(index, audioEl) {
    if (index < 0 || index >= playlist.length) return;
    setAudioSrc(audioEl, index);
  }

  function loadTrack(index, autoplay=true) {
    if (index < 0 || index >= playlist.length) return;

    initAudioContextIfNeeded();
    if (audioContext.state === "suspended") audioContext.resume();

    // stop inactive too
    getInactiveAudio().pause();
    getInactiveAudio().currentTime = 0;

    // active audio replace
    const prevIndex = currentTrackIndex;
    if (prevIndex !== -1) revokeURL(prevIndex);

    currentTrackIndex = index;
    const activeAudio = getActiveAudio();
    prepareTrack(index, activeAudio);

    onTrackChange?.(index);

    if (autoplay) {
      activeAudio.play().catch(()=>{});
      lastWasPlaying = true;
    } else {
      lastWasPlaying = false;
      activeAudio.pause();
    }
  }

  function togglePlayPause() {
    const a = getActiveAudio();
    if (!a.src) {
      if (playlist.length > 0) loadTrack(0, true);
      return;
    }
    if (a.paused) {
      initAudioContextIfNeeded();
      if (audioContext.state === "suspended") audioContext.resume();
      a.play().catch(()=>{});
      lastWasPlaying = true;
    } else {
      a.pause();
      lastWasPlaying = false;
    }
  }

  function seekBy(seconds) {
    const a = getActiveAudio();
    if (a.readyState >= 2) {
      a.currentTime = clamp(a.currentTime + seconds, 0, a.duration);
    }
  }

  function playNext() {
    const ni = getNextIndex();
    if (ni === -1) {
      getActiveAudio().pause();
      lastWasPlaying = false;
      return;
    }
    loadTrack(ni, true);
  }

  function playPrev() {
    const a = getActiveAudio();
    if (a.currentTime > 5) {
      a.currentTime = 0;
      return;
    }
    const pi = getPrevIndex();
    if (pi === -1) return;
    loadTrack(pi, true);
  }

  // repeat / shuffle / rate
  function toggleShuffle() {
    isShuffle = !isShuffle;
    if (isShuffle) createShuffled();
  }
  function cycleRepeat() {
    if (repeatMode === "none") repeatMode = "all";
    else if (repeatMode === "all") repeatMode = "one";
    else repeatMode = "none";
  }
  function cycleRate() {
    rateIndex = (rateIndex + 1) % playbackRates.length;
    const r = playbackRates[rateIndex];
    audioA.playbackRate = r;
    audioB.playbackRate = r;
    return r;
  }

  // volume
  function setVolume(v) {
    audioA.volume = v;
    audioB.volume = v;
  }

  // v3.7.0 crossfade
  function toggleCrossfade() {
    crossfadeEnabled = !crossfadeEnabled;
    if (crossfadeEnabled) onToast?.("クロスフェード ON");
    else onToast?.("クロスフェード OFF");
  }
  function cycleCrossfadeSec() {
    crossfadeSecIndex = (crossfadeSecIndex + 1) % crossfadeSecList.length;
    return crossfadeSecList[crossfadeSecIndex];
  }
  function getCrossfadeSec() {
    return crossfadeSecList[crossfadeSecIndex];
  }

  function startCrossfadeIfNeeded() {
    if (!crossfadeEnabled || isCrossfading || abEnabled) return;

    const a = getActiveAudio();
    if (!a.duration || a.duration < getCrossfadeSec() + 0.5) return;

    const remaining = a.duration - a.currentTime;
    if (remaining > getCrossfadeSec()) return;

    const ni = getNextIndex();
    if (ni === -1 || ni === currentTrackIndex) return;

    initAudioContextIfNeeded();
    if (audioContext.state === "suspended") audioContext.resume();

    isCrossfading = true;

    const inactiveAudio = getInactiveAudio();
    const inactiveGain = getInactiveGain();
    const activeGain = getActiveGain();

    // prepare next on inactive
    prepareTrack(ni, inactiveAudio);
    inactiveAudio.currentTime = 0;
    inactiveAudio.playbackRate = a.playbackRate;

    inactiveGain.gain.cancelScheduledValues(audioContext.currentTime);
    activeGain.gain.cancelScheduledValues(audioContext.currentTime);

    inactiveGain.gain.setValueAtTime(0, audioContext.currentTime);
    activeGain.gain.setValueAtTime(1, audioContext.currentTime);

    inactiveAudio.play().catch(()=>{});

    inactiveGain.gain.linearRampToValueAtTime(1, audioContext.currentTime + getCrossfadeSec());
    activeGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + getCrossfadeSec());

    const prevIndex = currentTrackIndex;

    setTimeout(() => {
      // stop old active
      a.pause();
      a.currentTime = 0;
      revokeURL(prevIndex);

      // swap
      active = (active === "A") ? "B" : "A";
      currentTrackIndex = ni;

      // reset gains for next time
      getActiveGain().gain.setValueAtTime(1, audioContext.currentTime);
      getInactiveGain().gain.setValueAtTime(0, audioContext.currentTime);

      isCrossfading = false;
      onTrackChange?.(ni);
      onPlayState?.(true);
    }, getCrossfadeSec() * 1000 + 30);
  }

  // v3.7.0 AB loop
  function setA() {
    const a = getActiveAudio();
    if (!a.duration) return null;
    abA = a.currentTime;
    if (abB != null && abB > abA) abEnabled = true;
    return abA;
  }
  function setB() {
    const a = getActiveAudio();
    if (!a.duration) return null;
    abB = a.currentTime;
    if (abA != null && abB > abA) abEnabled = true;
    return abB;
  }
  function clearAB() {
    abA = null; abB = null; abEnabled = false;
  }

  // events wiring to both audios
  function bindAudioEvents(audioEl) {
    audioEl.addEventListener("play", () => onPlayState?.(true));
    audioEl.addEventListener("pause", () => onPlayState?.(false));
    audioEl.addEventListener("loadedmetadata", () => {
      onDuration?.(audioEl.duration);
    });
    audioEl.addEventListener("timeupdate", () => {
      if (audioEl !== getActiveAudio()) return;

      // AB loop check
      if (abEnabled && abA != null && abB != null && audioEl.currentTime >= abB) {
        audioEl.currentTime = abA;
      }

      onTimeUpdate?.(audioEl.currentTime, audioEl.duration);
      startCrossfadeIfNeeded();
    });
    audioEl.addEventListener("ended", () => {
      if (audioEl !== getActiveAudio()) return;
      if (isCrossfading) return;

      if (repeatMode === "one") {
        audioEl.currentTime = 0;
        audioEl.play().catch(()=>{});
      } else {
        playNext();
      }
    });
  }
  bindAudioEvents(audioA);
  bindAudioEvents(audioB);

  function getStateForSave() {
    const a = getActiveAudio();
    return {
      volume: a.volume,
      repeatMode,
      isShuffle,
      rateIndex,
      crossfadeEnabled,
      crossfadeSecIndex,
      abA, abB, abEnabled,
      lastTrackIndex: currentTrackIndex,
      lastTrackTime: a.currentTime || 0,
      wasPlaying: !a.paused && !a.ended,
    };
  }

  // v3.6.0 restore (ファイル再追加後に一致したら復元)
  function restoreIfMatch(saved, currentNames) {
    if (!saved) return null;
    if (!Array.isArray(saved.lastPlaylistNames)) return null;
    if (saved.lastPlaylistNames.length !== currentNames.length) return null;

    const same = saved.lastPlaylistNames.every((n, i) => n === currentNames[i]);
    if (!same) return null;

    return {
      index: clamp(saved.lastTrackIndex ?? 0, 0, currentNames.length-1),
      time: saved.lastTrackTime ?? 0,
      wasPlaying: !!saved.wasPlaying,
    };
  }

  function applySavedBasics(saved) {
    if (!saved) return;
    repeatMode = saved.repeatMode || "none";
    isShuffle = !!saved.isShuffle;
    rateIndex = saved.rateIndex ?? 0;
    crossfadeEnabled = !!saved.crossfadeEnabled;
    crossfadeSecIndex = saved.crossfadeSecIndex ?? 1;
    abA = saved.abA ?? null;
    abB = saved.abB ?? null;
    abEnabled = !!saved.abEnabled;
    setVolume(saved.volume ?? 1);
    if (isShuffle) createShuffled();
  }

  return {
    // getters for visualizer
    getAudioContext: () => audioContext,
    getAnalyser: () => analyser,

    setPlaylist,
    loadTrack,
    togglePlayPause,
    playNext,
    playPrev,
    seekBy,
    toggleShuffle,
    cycleRepeat,
    cycleRate,
    setVolume,
    toggleCrossfade,
    cycleCrossfadeSec,
    getCrossfadeSec,
    setA, setB, clearAB,
    getABState: () => ({abA, abB, abEnabled}),
    setRepeatMode: (m)=> repeatMode=m,
    setShuffle: (v)=> {isShuffle=v; if(v) createShuffled();},
    setRateIndex: (i)=> {rateIndex=i; const r=playbackRates[rateIndex]; audioA.playbackRate=r; audioB.playbackRate=r;},

    getCurrentIndex: ()=> currentTrackIndex,
    isShuffle: ()=> isShuffle,
    getRepeatMode: ()=> repeatMode,
    getRateIndex: ()=> rateIndex,
    isCrossfadeEnabled: ()=> crossfadeEnabled,
    getCrossfadeSecIndex: ()=> crossfadeSecIndex,

    getActiveAudio,
    getStateForSave,
    applySavedBasics,
    restoreIfMatch,
  };
}
