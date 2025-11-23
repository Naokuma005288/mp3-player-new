import { clamp, formatTime } from "./utils.js";
import { saveSettings } from "./settings.js";

export function createPlayerCore({
  audioPlayer,
  playlistManager,
  ui,
  settings,
  showToast
}) {
  let {
    isShuffle=false,
    repeatMode="none",
    playbackRateIndex=0,
    playbackRates=[1,1.25,1.5,2,0.75],
    volume=1,
    lastVolume=1
  } = settings;

  // A-B repeat
  let abState = "off"; // off | a | ab
  let pointA = null;
  let pointB = null;

  // sleep timer
  let sleepMinutes = 0;
  let sleepTimeout = null;

  // fade
  const FADE_MS = 250;

  function prepare(index) {
    const list = playlistManager.getPlaylist();
    if (!list[index]) return false;

    playlistManager.setCurrentIndex(index);
    const track = list[index];

    if (!track.file) {
      showToast("この曲のファイルがまだ再リンクされてません", true);
      return false;
    }

    const url = URL.createObjectURL(track.file);
    audioPlayer.src = url;
    audioPlayer.playbackRate = playbackRates[playbackRateIndex];

    ui.updateMainUI(index);
    ui.updateNavButtons();
    ui.highlight();
    return true;
  }

  async function load(index, autoplay=true) {
    const ok = prepare(index);
    if (!ok) return;

    if (autoplay) {
      await audioPlayer.play().catch(()=>{});
    }
  }

  function togglePlayPause() {
    if (audioPlayer.paused) audioPlayer.play();
    else audioPlayer.pause();
  }

  function seek(delta) {
    if (!audioPlayer.duration) return;
    audioPlayer.currentTime = clamp(audioPlayer.currentTime + delta, 0, audioPlayer.duration);
  }

  function playNext() {
    const list = playlistManager.getPlaylist();
    if (!list.length) return;

    let nextIndex;
    const cur = playlistManager.getCurrentIndex();

    if (isShuffle) {
      const shuf = playlistManager.getShuffled();
      const sIdx = shuf.indexOf(cur);
      const nIdx = sIdx + 1;

      if (nIdx >= shuf.length) {
        if (repeatMode === "all") {
          playlistManager.createShuffled();
          nextIndex = playlistManager.getShuffled()[0];
        } else {
          audioPlayer.pause();
          playlistManager.setCurrentIndex(-1);
          return;
        }
      } else {
        nextIndex = shuf[nIdx];
      }
    } else {
      nextIndex = cur + 1;
      if (nextIndex >= list.length) {
        if (repeatMode === "all") nextIndex = 0;
        else {
          audioPlayer.pause();
          playlistManager.setCurrentIndex(-1);
          return;
        }
      }
    }

    loadWithFade(nextIndex);
  }

  function playPrev() {
    const list = playlistManager.getPlaylist();
    if (!list.length) return;

    const cur = playlistManager.getCurrentIndex();
    if (audioPlayer.currentTime > 5) {
      audioPlayer.currentTime = 0;
      return;
    }

    let prevIndex;
    if (isShuffle) {
      const shuf = playlistManager.getShuffled();
      const sIdx = shuf.indexOf(cur);
      const pIdx = sIdx - 1;
      prevIndex = (pIdx < 0) ? shuf[shuf.length-1] : shuf[pIdx];
    } else {
      prevIndex = cur - 1;
      if (prevIndex < 0) prevIndex = (repeatMode === "all") ? list.length-1 : 0;
    }

    loadWithFade(prevIndex);
  }

  async function loadWithFade(index) {
    const startVol = audioPlayer.volume;
    const step = startVol / (FADE_MS/16);

    // fade out
    let v = startVol;
    const outTimer = setInterval(()=>{
      v = Math.max(0, v - step);
      audioPlayer.volume = v;
    }, 16);

    setTimeout(async ()=>{
      clearInterval(outTimer);
      await load(index, true);

      // fade in
      let v2 = 0;
      audioPlayer.volume = 0;
      const inStep = startVol / (FADE_MS/16);
      const inTimer = setInterval(()=>{
        v2 = Math.min(startVol, v2 + inStep);
        audioPlayer.volume = v2;
        if (v2 >= startVol) clearInterval(inTimer);
      }, 16);
    }, FADE_MS);
  }

  function toggleShuffle() {
    isShuffle = !isShuffle;
    if (isShuffle) playlistManager.createShuffled();
    ui.setShuffle(isShuffle);
    persist();
  }

  function toggleRepeat() {
    repeatMode = repeatMode === "none" ? "all" : (repeatMode === "all" ? "one" : "none");
    ui.setRepeat(repeatMode);
    ui.updateNavButtons();
    persist();
  }

  function changeRate() {
    playbackRateIndex = (playbackRateIndex + 1) % playbackRates.length;
    audioPlayer.playbackRate = playbackRates[playbackRateIndex];
    ui.setRate(playbackRates[playbackRateIndex]);
    persist();
  }

  function setVolume(v) {
    audioPlayer.volume = v;
    if (v > 0) lastVolume = v;
    ui.setVolumeIcon(v);
    persist();
  }

  function toggleMute() {
    if (audioPlayer.volume > 0) setVolume(0);
    else setVolume(lastVolume || 1);
    ui.setVolumeSlider(audioPlayer.volume);
  }

  // A-B Repeat toggle
  function toggleAB() {
    if (abState === "off") {
      abState = "a";
      pointA = audioPlayer.currentTime;
      showToast(`A点セット: ${formatTime(pointA)}`);
    } else if (abState === "a") {
      abState = "ab";
      pointB = audioPlayer.currentTime;
      if (pointB <= pointA + 0.2) pointB = pointA + 1;
      showToast(`B点セット: ${formatTime(pointB)}`);
    } else {
      abState = "off";
      pointA = pointB = null;
      showToast("A–BリピートOFF");
    }
    ui.setABState(abState);
  }

  function onTimeUpdate() {
    if (abState === "ab" && pointA != null && pointB != null) {
      if (audioPlayer.currentTime >= pointB) {
        audioPlayer.currentTime = pointA;
      }
    }
  }

  // Sleep timer
  function cycleSleepTimer() {
    const values = [0,15,30,60,90];
    const idx = values.indexOf(sleepMinutes);
    sleepMinutes = values[(idx+1)%values.length];

    if (sleepTimeout) clearTimeout(sleepTimeout);
    if (sleepMinutes > 0) {
      sleepTimeout = setTimeout(()=>{
        audioPlayer.pause();
        showToast("スリープタイマーで停止しました");
        sleepMinutes = 0;
        ui.setSleepLabel(sleepMinutes);
        persist();
      }, sleepMinutes*60*1000);
    }
    ui.setSleepLabel(sleepMinutes);
    persist();
  }

  function persist() {
    saveSettings({
      ...settings,
      isShuffle,
      repeatMode,
      playbackRateIndex,
      volume: audioPlayer.volume,
      lastVolume,
      sleepMinutes
    });
  }

  function restore() {
    setVolume(volume ?? 1);
    playbackRateIndex = playbackRateIndex ?? 0;
    audioPlayer.playbackRate = playbackRates[playbackRateIndex];

    ui.setRate(playbackRates[playbackRateIndex]);
    ui.setShuffle(isShuffle);
    ui.setRepeat(repeatMode);
    ui.setSleepLabel(sleepMinutes);
  }

  function onEnded() {
    if (repeatMode === "one") {
      audioPlayer.currentTime = 0;
      audioPlayer.play();
    } else {
      playNext();
    }
  }

  restore();

  return {
    load, togglePlayPause, seek, playNext, playPrev,
    toggleShuffle, toggleRepeat, changeRate,
    setVolume, toggleMute,
    toggleAB, onTimeUpdate, onEnded,
    cycleSleepTimer,
    get repeatMode(){ return repeatMode; },
    get isShuffle(){ return isShuffle; },
    get playbackRates(){ return playbackRates; },
    get playbackRateIndex(){ return playbackRateIndex; }
  };
}
