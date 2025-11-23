// js/modules/playlist.js
import { formatTime, isMp3File } from "./utils.js";

export class Playlist {
  constructor(settings, persist){
    this.settings = settings;
    this.persist = persist;

    this.tracks = [];
    this.currentTrackIndex = -1;

    this.shuffle = settings.get?.("isShuffle") || false;
    this.repeatMode = settings.get?.("repeatMode") || "none";

    this.currentFilter = "";
  }

  // 旧データ復元
  reloadFromPersist(){
    const saved = this.persist?.load?.();
    if (Array.isArray(saved)){
      this.tracks = saved.map(t => ({
        file: null,
        title: t.title || "Ghost Track",
        artist: t.artist || "Unknown",
        artwork: t.artwork || null,
        duration: t.duration || 0,
        gain: t.gain || 1,
        wavePeaks: t.wavePeaks || null,
        isGhost: true
      }));
    }
  }

  save(){
    // Fileは保存できないので抜いて保存
    const slim = this.tracks.map(t => ({
      title: t.title,
      artist: t.artist,
      artwork: t.artwork,
      duration: t.duration,
      gain: t.gain,
      wavePeaks: t.wavePeaks,
      isGhost: !t.file
    }));
    this.persist?.save?.(slim);
  }

  setFilter(q){
    this.currentFilter = (q || "").toLowerCase();
  }

  getVisibleIndices(){
    if (!this.currentFilter) return this.tracks.map((_, i) => i);
    const q = this.currentFilter;
    return this.tracks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) =>
        (t.title || "").toLowerCase().includes(q) ||
        (t.artist || "").toLowerCase().includes(q)
      )
      .map(({ i }) => i);
  }

  // 再生可能インデックス探索（ghost回避）
  getFirstPlayableIndex(start = 0, dir = 1){
    const len = this.tracks.length;
    if (len === 0) return -1;

    let i = start;
    for (let step = 0; step < len; step++){
      const t = this.tracks[i];
      if (t && t.file) return i;

      i += dir;
      if (i >= len) i = 0;
      if (i < 0) i = len - 1;
    }
    return -1;
  }

  toggleShuffle(){
    this.shuffle = !this.shuffle;
    this.settings?.set?.("isShuffle", this.shuffle);
    this.save();
  }

  toggleRepeat(){
    if (this.repeatMode === "none") this.repeatMode = "all";
    else if (this.repeatMode === "all") this.repeatMode = "one";
    else this.repeatMode = "none";

    this.settings?.set?.("repeatMode", this.repeatMode);
    this.save();
  }

  clearAll(){
    this.tracks = [];
    this.currentTrackIndex = -1;
    this.save();
  }

  removeTrack(index){
    if (index < 0 || index >= this.tracks.length) return;

    this.tracks.splice(index, 1);

    if (index < this.currentTrackIndex) {
      this.currentTrackIndex--;
    } else if (index === this.currentTrackIndex) {
      this.currentTrackIndex = -1;
    }

    this.save();
  }

  // ============================
  // ★ここが今回の根本修正入り addFiles
  // ============================
  async addFiles(files, audioFx){
    const newFiles = Array.from(files).filter(isMp3File);

    for (const file of newFiles){
      const track = {
        file,
        title: file.name,
        artist: "ロード中...",
        artwork: null,
        duration: 0,
        gain: 1,
        wavePeaks: null,
        isGhost: false
      };
      this.tracks.push(track);
      const index = this.tracks.length - 1;

      // ✅ audioFx が新APIでも旧APIでも、無くても落ちない保険
      track.gain = await (audioFx?.analyzeAndGetGain?.(file) ?? 1);
      track.wavePeaks = await (audioFx?.extractWavePeaks?.(file) ?? null);

      this._readMetadata(file, index);
      this._readDuration(file, index);
    }

    this.save();
  }

  _readMetadata(file, index){
    const jsmediatags = window.jsmediatags;
    if (!jsmediatags) {
      this.tracks[index].artist = "不明なアーティスト";
      this.save();
      return;
    }

    jsmediatags.read(file, {
      onSuccess: (tag) => {
        const tags = tag.tags || {};

        let artworkUrl = null;
        if (tags.picture) {
          const { data, format } = tags.picture;
          let base64String = "";
          for (let i = 0; i < data.length; i++){
            base64String += String.fromCharCode(data[i]);
          }
          artworkUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }

        this.tracks[index].title = tags.title || file.name;
        this.tracks[index].artist = tags.artist || "不明なアーティスト";
        this.tracks[index].artwork = artworkUrl;

        this.save();
      },
      onError: () => {
        this.tracks[index].artist = "メタデータなし";
        this.save();
      }
    });
  }

  _readDuration(file, index){
    const temp = new Audio();
    const url = URL.createObjectURL(file);
    temp.src = url;

    temp.addEventListener("loadedmetadata", () => {
      this.tracks[index].duration = temp.duration || 0;
      URL.revokeObjectURL(url);
      this.save();
    }, { once: true });

    temp.addEventListener("error", () => {
      URL.revokeObjectURL(url);
    }, { once: true });
  }
}
