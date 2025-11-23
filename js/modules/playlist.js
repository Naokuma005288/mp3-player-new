import { readFileAsArrayBuffer, extractPictureAsDataURL } from "./utils.js";

export class Playlist {
  constructor(settings, persist) {
    this.settings = settings;
    this.persist = persist;

    this.tracks = [];
    this.currentTrackIndex = -1;

    this.shuffle = settings.get("shuffle");
    this.repeatMode = settings.get("repeatMode");

    this.sortMode = "add"; // add/title/artist
    this.currentFilter = "";

    this.selectMode = false;
    this.selected = new Set();
  }

  reloadFromPersist() {
    const ghosts = this.persist.load();
    this.tracks = ghosts.map(g => ({
      file: null,
      title: g.title || "Ghost Track",
      artist: g.artist || "Unknown",
      duration: g.duration || 0,
      artwork: null,
      wavePeaks: null,
      gain: 1,
    }));
    this.currentTrackIndex = -1;
  }

  async addFiles(files, audioFx) {
    for (const file of files) {
      const track = {
        file,
        title: file.name,
        artist: "ロード中...",
        duration: 0,
        artwork: null,
        wavePeaks: null,
        gain: 1,
      };
      this.tracks.push(track);
      const index = this.tracks.length - 1;

      await this._readMetadata(file, index);
      await this._readDuration(file, index);
      track.gain = await audioFx.analyzeAndGetGain(file);
      track.wavePeaks = await audioFx.extractWavePeaks(file);
    }

    this._applySortAndPersist();
  }

  async _readMetadata(file, index) {
    const jsmediatags = window.jsmediatags;
    if (!jsmediatags) return;

    await new Promise((resolve) => {
      jsmediatags.read(file, {
        onSuccess: (tag) => {
          const t = tag.tags;
          const picUrl = extractPictureAsDataURL(t.picture);
          this.tracks[index].title = t.title || file.name;
          this.tracks[index].artist = t.artist || "不明なアーティスト";
          this.tracks[index].artwork = picUrl;
          resolve();
        },
        onError: () => {
          this.tracks[index].artist = "メタデータなし";
          resolve();
        }
      });
    });
  }

  async _readDuration(file, index) {
    await new Promise((resolve) => {
      const temp = new Audio();
      const url = URL.createObjectURL(file);
      temp.src = url;
      temp.addEventListener("loadedmetadata", () => {
        this.tracks[index].duration = temp.duration || 0;
        URL.revokeObjectURL(url);
        resolve();
      });
      temp.addEventListener("error", () => {
        URL.revokeObjectURL(url);
        resolve();
      });
    });
  }

  getVisibleIndices(filter = "") {
    const q = (filter || "").toLowerCase().trim();
    let indices = this.tracks.map((_, i) => i);

    if (q) {
      indices = indices.filter(i => {
        const t = this.tracks[i];
        return (t.title || "").toLowerCase().includes(q) ||
               (t.artist || "").toLowerCase().includes(q);
      });
    }

    if (this.sortMode === "title") {
      indices.sort((a,b)=> (this.tracks[a].title||"").localeCompare(this.tracks[b].title||""));
    }
    if (this.sortMode === "artist") {
      indices.sort((a,b)=> (this.tracks[a].artist||"").localeCompare(this.tracks[b].artist||""));
    }
    return indices;
  }

  setFilter(text) { this.currentFilter = text || ""; }

  cycleSortMode() {
    const list = ["add", "title", "artist"];
    this.sortMode = list[(list.indexOf(this.sortMode)+1)%list.length];
    this._applySortAndPersist();
  }

  _applySortAndPersist() {
    // add モードでは並び変えない
    if (this.sortMode === "title") {
      this.tracks.sort((a,b)=> (a.title||"").localeCompare(b.title||""));
    }
    if (this.sortMode === "artist") {
      this.tracks.sort((a,b)=> (a.artist||"").localeCompare(b.artist||""));
    }
    this.persist.save(this.tracks);
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    this.settings.set("shuffle", this.shuffle);
  }

  toggleRepeat() {
    const list = ["none","all","one"];
    const idx = (list.indexOf(this.repeatMode)+1)%list.length;
    this.repeatMode = list[idx];
    this.settings.set("repeatMode", this.repeatMode);
  }

  removeTrack(index) {
    if (index<0||index>=this.tracks.length) return;

    this.tracks.splice(index,1);
    if (index === this.currentTrackIndex) {
      this.currentTrackIndex = -1;
    } else if (index < this.currentTrackIndex) {
      this.currentTrackIndex--;
    }
    this.selected.delete(index);
    this.persist.save(this.tracks);
  }

  clearAll() {
    this.tracks = [];
    this.currentTrackIndex = -1;
    this.selected.clear();
    this.persist.save([]);
  }

  toggleSelectMode() {
    this.selectMode = !this.selectMode;
    if (!this.selectMode) this.selected.clear();
  }

  toggleSelect(index) {
    if (this.selected.has(index)) this.selected.delete(index);
    else this.selected.add(index);
  }

  removeSelected() {
    const arr = Array.from(this.selected).sort((a,b)=>b-a);
    arr.forEach(i => this.removeTrack(i));
    const n = arr.length;
    this.selected.clear();
    return n;
  }
}
