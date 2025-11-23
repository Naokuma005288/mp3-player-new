import { createVisualizer } from "./modules/visualizer.js";
import { createPlaylistManager } from "./modules/playlist.js";
import { createPlayerCore } from "./modules/playerCore.js";
import { loadSettings, saveSettings } from "./modules/settings.js";
import { formatTime, clamp } from "./modules/utils.js";

const jsmediatags = window.jsmediatags;

// DOM
const audioA = document.getElementById("audio-a");
const audioB = document.getElementById("audio-b");
const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");
const albumArt = document.getElementById("album-art");
const progressBar = document.getElementById("progress-bar");
const progressWrap = document.getElementById("progress-wrap");
const seekTooltip = document.getElementById("seek-tooltip");

const playPauseBtn = document.getElementById("play-pause-btn");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");
const minimalPlayIcon = document.getElementById("minimal-play-icon");
const minimalPauseIcon = document.getElementById("minimal-pause-icon");
const minimalOverlay = document.getElementById("minimal-play-btn-overlay");

const currentTimeDisplay = document.getElementById("current-time-display");
const durationDisplay = document.getElementById("duration-display");
const songTitle = document.getElementById("song-title");
const songArtist = document.getElementById("song-artist");
const fileSelectUI = document.getElementById("file-select-ui");
const playerContainer = document.getElementById("player-container");

const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const repeatBtn = document.getElementById("repeat-btn");
const repeatNoneIcon = document.getElementById("repeat-none-icon");
const repeatAllIcon = document.getElementById("repeat-all-icon");
const repeatOneIcon = document.getElementById("repeat-one-icon");

const volumeControl = document.getElementById("volume-control");
const volumeHighIcon = document.getElementById("volume-high-icon");
const volumeMuteIcon = document.getElementById("volume-mute-icon");
const volumeMuteToggle = document.getElementById("volume-mute-toggle");
let lastVolume = 1;

const seekForwardBtn = document.getElementById("seek-forward-btn");
const seekBackwardBtn = document.getElementById("seek-backward-btn");
const playbackRateBtn = document.getElementById("playback-rate-btn");

const playlistToggleBtn = document.getElementById("playlist-toggle-btn");
const playlistCloseBtn = document.getElementById("playlist-close-btn");
const playlistPanel = document.getElementById("playlist-panel");
const playlistUl = document.getElementById("playlist-ul");
const playlistSearch = document.getElementById("playlist-search");
const clearPlaylistBtn = document.getElementById("clear-playlist-btn");

const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeSunIcon = document.getElementById("theme-sun-icon");
const themeMoonIcon = document.getElementById("theme-moon-icon");

const vizStyleBtn = document.getElementById("viz-style-btn");
const vizLineIcon = document.getElementById("viz-line-icon");
const vizBarsIcon = document.getElementById("viz-bars-icon");
const vizRadialIcon = document.getElementById("viz-radial-icon");

const crossfadeToggleBtn = document.getElementById("crossfade-toggle-btn");
const crossfadeSecBtn = document.getElementById("crossfade-sec-btn");

const abABtn = document.getElementById("ab-a-btn");
const abBBtn = document.getElementById("ab-b-btn");
const abClearBtn = document.getElementById("ab-clear-btn");

const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toast-message");

// state
let playlist = [];
let currentTrackIndex = -1;
let visualizerStyle = "line";
let isMinimalMode = false;

// toast
let toastTimeout;
function showToast(message, isError=false){
  if(toastTimeout) clearTimeout(toastTimeout);
  toastMessage.textContent = message;
  toast.style.backgroundColor = isError ? "var(--thumb-color)" : "var(--toast-bg)";
  toast.classList.add("show");
  toastTimeout = setTimeout(()=>toast.classList.remove("show"), 2500);
}

// player core
const player = createPlayerCore({
  audioA, audioB,
  onPlayState: (playing)=> {
    updatePlayPauseIcon();
    updateMinimalOverlay();
    highlightCurrentTrack();
  },
  onTimeUpdate: (cur, dur)=> {
    if(dur){
      progressBar.value = (cur/dur)*100;
      currentTimeDisplay.textContent = formatTime(cur);
      durationDisplay.textContent = formatTime(dur);
    }
  },
  onDuration: (dur)=> {
    durationDisplay.textContent = formatTime(dur);
  },
  onTrackChange: (index)=> {
    currentTrackIndex = index;
    updateMainUI(index);
    highlightCurrentTrack();
    updateNavButtons();
    saveAllSettings();
  },
  onToast: (msg)=> showToast(msg),
});

// visualizer
const visualizerCanvas = document.getElementById("visualizer-canvas");
const visualizer = createVisualizer({
  canvas: visualizerCanvas,
  getAudioContext: player.getAudioContext,
  getAnalyser: player.getAnalyser,
  getStyle: ()=> visualizerStyle,
});
visualizer.start();

// playlist manager (drag reorder v3.6.0)
const playlistManager = createPlaylistManager({
  playlistUl,
  playlistSearch,
  onSelectTrack: (i)=> player.loadTrack(i, true),
  onRemoveTrack: (i)=> removeTrack(i),
  onReorder: (from, to)=> reorderTracks(from, to),
});

// --- UI helpers ---
function updatePlayPauseIcon(){
  const a = player.getActiveAudio();
  const paused = a.paused || a.ended;
  playIcon.classList.toggle("hidden", !paused);
  pauseIcon.classList.toggle("hidden", paused);
  minimalPlayIcon.classList.toggle("hidden", !paused);
  minimalPauseIcon.classList.toggle("hidden", paused);
}
function updateMinimalOverlay(){
  const a = player.getActiveAudio();
  if(isMinimalMode){
    if(a.paused || a.ended){
      minimalOverlay.classList.remove("opacity-0","pointer-events-none");
      minimalOverlay.classList.add("pointer-events-auto");
    }else{
      minimalOverlay.classList.add("opacity-0","pointer-events-none");
      minimalOverlay.classList.remove("pointer-events-auto");
    }
  }else{
    minimalOverlay.classList.add("opacity-0","pointer-events-none");
    minimalOverlay.classList.remove("pointer-events-auto");
  }
}
function resetAlbumArt(){
  albumArt.src = "https://placehold.co/512x512/312e81/ffffff?text=MP3";
  albumArt.classList.add("opacity-20");
}
function updateMainUI(index){
  if(index<0 || !playlist[index]){
    songTitle.textContent="再生する曲はありません";
    songArtist.textContent="ファイルをロードしてください";
    resetAlbumArt();
    return;
  }
  const t = playlist[index];
  songTitle.textContent=t.title;
  songArtist.textContent=t.artist;
  if(t.artwork){
    albumArt.src=t.artwork;
    albumArt.classList.remove("opacity-20");
  }else resetAlbumArt();
}
function updateVolumeIcon(volume){
  if(volume===0){
    volumeHighIcon.classList.add("hidden");
    volumeMuteIcon.classList.remove("hidden");
  }else{
    volumeHighIcon.classList.remove("hidden");
    volumeMuteIcon.classList.add("hidden");
  }
}

// controls enable/disable
function enableControls(){
  const dis=playlist.length===0;
  [playPauseBtn,progressBar,prevBtn,nextBtn,shuffleBtn,repeatBtn,
   seekForwardBtn,seekBackwardBtn,playlistToggleBtn,playbackRateBtn,
   abABtn,abBBtn,abClearBtn].forEach(b=>b.disabled=dis);
}
function updateNavButtons(){
  if(playlist.length<=1){
    prevBtn.disabled=true;
    nextBtn.disabled=true;
  }else{
    prevBtn.disabled=false;
    nextBtn.disabled=false;
  }
}
function updateFileUIState(){
  if(playlist.length>0) fileSelectUI.classList.add("file-select-hidden");
  else fileSelectUI.classList.remove("file-select-hidden");
}

function highlightCurrentTrack(){
  playlistManager.setCurrentIndex(currentTrackIndex);
  playlistManager.highlight();
}

// --- playlist operations ---
function renderPlaylist(){
  playlistManager.setPlaylist(playlist);
  playlistManager.render();
}

function removeTrack(index){
  if(index<0 || index>=playlist.length) return;
  const wasPlaying = index===currentTrackIndex;
  playlist.splice(index,1);

  if(wasPlaying){
    if(playlist.length===0){
      clearPlaylist();
      return;
    }else{
      const ni = clamp(index,0,playlist.length-1);
      player.setPlaylist(playlist);
      player.loadTrack(ni,true);
    }
  }else if(index<currentTrackIndex){
    currentTrackIndex--;
  }

  player.setPlaylist(playlist);
  renderPlaylist();
  updateMainUI(currentTrackIndex);
  enableControls();
  updateFileUIState();
  updateNavButtons();
  saveAllSettings();
}

function reorderTracks(from, to){
  const moved = playlist.splice(from,1)[0];
  playlist.splice(to,0,moved);

  // current index adjust
  if(currentTrackIndex===from) currentTrackIndex=to;
  else if(from<currentTrackIndex && to>=currentTrackIndex) currentTrackIndex--;
  else if(from>currentTrackIndex && to<=currentTrackIndex) currentTrackIndex++;

  player.setPlaylist(playlist);
  renderPlaylist();
  highlightCurrentTrack();
  saveAllSettings();
}

function clearPlaylist(){
  player.getActiveAudio().pause();
  playlist=[];
  currentTrackIndex=-1;
  player.setPlaylist(playlist);
  renderPlaylist();
  updateMainUI(-1);
  enableControls();
  updateFileUIState();
  updateNavButtons();
  showToast("プレイリストをクリアしました");
  if(playlistPanel.classList.contains("open")) togglePlaylist();
  saveAllSettings();
}

// --- file handling ---
function handleFiles(files){
  const newFiles = Array.from(files).filter(f=>f.type.startsWith("audio/"));
  const wasEmpty = playlist.length===0;

  for(const file of newFiles){
    playlist.push({
      file,
      title:file.name,
      artist:"ロード中...",
      artwork:null,
      duration:null,
    });
    const idx=playlist.length-1;
    readMetadata(file,idx);
    getDuration(file,idx);
  }

  player.setPlaylist(playlist);
  renderPlaylist();
  enableControls();
  updateFileUIState();
  showToast(`${newFiles.length} 曲が追加されました`);

  // v3.6.0 restore if match
  const saved = loadSettings();
  const names = playlist.map(t=>t.file.name);
  const restore = player.restoreIfMatch(saved, names);
  if(restore && wasEmpty){
    player.loadTrack(restore.index, restore.wasPlaying);
    player.getActiveAudio().currentTime = restore.time;
    showToast("前回の再生状態を復元しました");
  }else if(wasEmpty && playlist.length>0){
    player.loadTrack(0,false);
  }

  saveAllSettings();
}

function readMetadata(file,index){
  jsmediatags.read(file,{
    onSuccess:(tag)=>{
      const tags=tag.tags;
      let artworkUrl=null;
      if(tags.picture){
        const {data,format}=tags.picture;
        let b="";
        for(let i=0;i<data.length;i++) b+=String.fromCharCode(data[i]);
        artworkUrl=`data:${format};base64,${btoa(b)}`;
      }
      playlist[index].title = tags.title || file.name;
      playlist[index].artist = tags.artist || "不明なアーティスト";
      playlist[index].artwork = artworkUrl;
      if(index===currentTrackIndex) updateMainUI(index);
      renderPlaylist();
    },
    onError:()=>{
      playlist[index].artist="メタデータがありません";
      renderPlaylist();
    }
  });
}

function getDuration(file,index){
  const temp = new Audio();
  const url = URL.createObjectURL(file);
  temp.src=url;
  temp.addEventListener("loadedmetadata",()=>{
    if(playlist[index]) playlist[index].duration=temp.duration;
    URL.revokeObjectURL(url);
    renderPlaylist();
  });
  temp.addEventListener("error",()=>{
    URL.revokeObjectURL(url);
  });
}

// --- settings save/load ---
function saveAllSettings(){
  const state=player.getStateForSave();
  saveSettings({
    ...state,
    lastVolume,
    theme: document.documentElement.classList.contains("light-mode")?"light":"dark",
    visualizerStyle,
    lastPlaylistNames: playlist.map(t=>t.file.name),
  });
}

function applySavedSettings(){
  const saved=loadSettings();
  if(!saved) return;

  // volume
  const v = saved.volume ?? 1;
  player.setVolume(v);
  volumeControl.value=v;
  lastVolume = saved.lastVolume ?? v;
  updateVolumeIcon(v);

  // theme
  if(saved.theme==="light") document.documentElement.classList.add("light-mode");
  else document.documentElement.classList.remove("light-mode");
  updateThemeIcons();

  // visualizer
  visualizerStyle = saved.visualizerStyle || "line";
  updateVizIcons();

  // core basics
  player.applySavedBasics(saved);

  // rate button text
  playbackRateBtn.textContent = `${[1,1.25,1.5,2,0.75][player.getRateIndex()]}x`;

  // repeat icon
  updateRepeatIcons();

  // shuffle btn
  shuffleBtn.classList.toggle("btn-active", player.isShuffle());

  // crossfade ui
  crossfadeToggleBtn.classList.toggle("btn-active", player.isCrossfadeEnabled());
  crossfadeSecBtn.textContent = `${player.getCrossfadeSec()}s`;

  // AB ui
  updateABButtons(player.getABState());
}

function updateThemeIcons(){
  const isLight=document.documentElement.classList.contains("light-mode");
  themeSunIcon.classList.toggle("hidden", !isLight);
  themeMoonIcon.classList.toggle("hidden", isLight);
}
function updateVizIcons(){
  vizLineIcon.classList.add("hidden");
  vizBarsIcon.classList.add("hidden");
  vizRadialIcon.classList.add("hidden");
  if(visualizerStyle==="line") vizLineIcon.classList.remove("hidden");
  else if(visualizerStyle==="bars") vizBarsIcon.classList.remove("hidden");
  else vizRadialIcon.classList.remove("hidden");
}
function updateRepeatIcons(){
  repeatNoneIcon.classList.add("hidden");
  repeatAllIcon.classList.add("hidden");
  repeatOneIcon.classList.add("hidden");
  const m=player.getRepeatMode();
  if(m==="none") repeatNoneIcon.classList.remove("hidden");
  else if(m==="all") repeatAllIcon.classList.remove("hidden");
  else repeatOneIcon.classList.remove("hidden");
}
function updateABButtons({abA,abB,abEnabled}){
  abABtn.classList.toggle("active", abA!=null);
  abBBtn.classList.toggle("active", abB!=null);
  abClearBtn.classList.toggle("active", abEnabled);
}

// --- events ---
fileInput.addEventListener("change",(e)=>{
  if(e.target.files?.length) handleFiles(e.target.files);
});

dropZone.addEventListener("dragover",(e)=>{
  e.preventDefault();
  dropZone.classList.add("bg-white/10","scale-105");
});
dropZone.addEventListener("dragleave",(e)=>{
  e.preventDefault();
  dropZone.classList.remove("bg-white/10","scale-105");
});
dropZone.addEventListener("drop",(e)=>{
  e.preventDefault();
  dropZone.classList.remove("bg-white/10","scale-105");
  const files=e.dataTransfer.files;
  if(files?.length) handleFiles(files);
});

// minimal mode
dropZone.addEventListener("dblclick",()=>{
  if(playlist.length===0) return;
  isMinimalMode=!isMinimalMode;
  playerContainer.classList.toggle("minimal", isMinimalMode);
  updateMinimalOverlay();
});
dropZone.addEventListener("click",(e)=>{
  if(!isMinimalMode) return;
  e.stopPropagation();
  if(playlist.length===0) return;
  player.togglePlayPause();
});

// play/pause
playPauseBtn.addEventListener("click",()=>player.togglePlayPause());

// seek
seekForwardBtn.addEventListener("click",()=>player.seekBy(10));
seekBackwardBtn.addEventListener("click",()=>player.seekBy(-10));

// prev/next
prevBtn.addEventListener("click",()=>player.playPrev());
nextBtn.addEventListener("click",()=>player.playNext());

// shuffle/repeat
shuffleBtn.addEventListener("click",()=>{
  player.toggleShuffle();
  shuffleBtn.classList.toggle("btn-active", player.isShuffle());
  saveAllSettings();
});
repeatBtn.addEventListener("click",()=>{
  player.cycleRepeat();
  updateRepeatIcons();
  saveAllSettings();
});

// playback rate
playbackRateBtn.addEventListener("click",()=>{
  const r=player.cycleRate();
  playbackRateBtn.textContent=`${r}x`;
  saveAllSettings();
});

// volume
volumeControl.addEventListener("input",(e)=>{
  const v=parseFloat(e.target.value);
  player.setVolume(v);
  if(v>0) lastVolume=v;
  updateVolumeIcon(v);
  saveAllSettings();
});
volumeMuteToggle.addEventListener("click",()=>{
  const a=player.getActiveAudio();
  if(a.volume>0) player.setVolume(0);
  else player.setVolume(lastVolume);
  volumeControl.value=player.getActiveAudio().volume;
  updateVolumeIcon(player.getActiveAudio().volume);
  saveAllSettings();
});

// progress bar seek + hover preview
progressBar.addEventListener("input",(e)=>{
  const a=player.getActiveAudio();
  if(!a.duration) return;
  const t=a.duration*(e.target.value/100);
  currentTimeDisplay.textContent=formatTime(t);
});
progressBar.addEventListener("change",(e)=>{
  const a=player.getActiveAudio();
  if(!a.duration) return;
  const t=a.duration*(e.target.value/100);
  a.currentTime=t;
});

progressWrap.addEventListener("mousemove",(e)=>{
  const a=player.getActiveAudio();
  if(!a.duration) return;
  const rect=progressBar.getBoundingClientRect();
  const x=clamp(e.clientX-rect.left,0,rect.width);
  const pct=x/rect.width;
  const t=a.duration*pct;
  seekTooltip.textContent=formatTime(t);
  seekTooltip.style.left=`${x}px`;
  seekTooltip.classList.remove("hidden");
});
progressWrap.addEventListener("mouseleave",()=>{
  seekTooltip.classList.add("hidden");
});

// playlist toggle
function togglePlaylist(){ playlistPanel.classList.toggle("open"); }
playlistToggleBtn.addEventListener("click",togglePlaylist);
playlistCloseBtn.addEventListener("click",togglePlaylist);

// clear playlist
clearPlaylistBtn.addEventListener("click",clearPlaylist);

// theme
themeToggleBtn.addEventListener("click",()=>{
  document.documentElement.classList.toggle("light-mode");
  updateThemeIcons();
  saveAllSettings();
});

// visualizer style (3)
vizStyleBtn.addEventListener("click",()=>{
  if(visualizerStyle==="line") visualizerStyle="bars";
  else if(visualizerStyle==="bars") visualizerStyle="radial";
  else visualizerStyle="line";
  updateVizIcons();
  saveAllSettings();
});

// crossfade controls
crossfadeToggleBtn.addEventListener("click",()=>{
  player.toggleCrossfade();
  crossfadeToggleBtn.classList.toggle("btn-active", player.isCrossfadeEnabled());
  saveAllSettings();
});
crossfadeSecBtn.addEventListener("click",()=>{
  const sec=player.cycleCrossfadeSec();
  crossfadeSecBtn.textContent=`${sec}s`;
  saveAllSettings();
});

// AB repeat
abABtn.addEventListener("click",()=>{
  const t=player.setA();
  if(t!=null) showToast(`A点設定: ${formatTime(t)}`);
  updateABButtons(player.getABState());
  saveAllSettings();
});
abBBtn.addEventListener("click",()=>{
  const t=player.setB();
  if(t!=null) showToast(`B点設定: ${formatTime(t)}`);
  updateABButtons(player.getABState());
  saveAllSettings();
});
abClearBtn.addEventListener("click",()=>{
  player.clearAB();
  showToast("A-B解除");
  updateABButtons(player.getABState());
  saveAllSettings();
});

// keyboard shortcuts
document.addEventListener("keydown",(e)=>{
  if(e.target===playlistSearch) return;
  if(playlist.length===0) return;
  if(e.code==="Space" && e.target.tagName!=="INPUT"){
    e.preventDefault();
    player.togglePlayPause();
  }
  if(e.code==="ArrowRight"){
    e.preventDefault();
    if(e.shiftKey) player.playNext();
    else player.seekBy(10);
  }
  if(e.code==="ArrowLeft"){
    e.preventDefault();
    if(e.shiftKey) player.playPrev();
    else player.seekBy(-10);
  }
});

// --- init ---
applySavedSettings();
renderPlaylist();
enableControls();
updateFileUIState();
updateNavButtons();
updatePlayPauseIcon();
