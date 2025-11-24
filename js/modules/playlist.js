// js/modules/playlist.js
import { formatTime, isMp3File } from "./utils.js";

export class Playlist {
  constructor(settings, persist){
    this.settings = settings;
    this.persist = persist;

    this.tracks = [];
    this.currentTrackIndex = -1;

    this.shuffle = !!settings.get("isShuffle");
    this.repeatMode = settings.get("repeatMode") || "none";

    this.currentFilter = "";
  }

  reloadFromPersist(){
    const saved = this.persist.loadActive();
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
    const slim = this.tracks.map(t => ({
      title: t.title,
      artist: t.artist,
      artwork: t.artwork,
      duration: t.duration,
      gain: t.gain,
      wavePeaks: t.wavePeaks,
      isGhost: !t.file
    }));
    this.persist.saveActive(slim);
  }

  setFilter(q){
    this.currentFilter = (q||"").toLowerCase();
  }

  getVisibleIndices(){
    if (!this.currentFilter) return this.tracks.map((_,i)=>i);
    const q = this.currentFilter;
    return this.tracks
      .map((t,i)=>({t,i}))
      .filter(({t}) =>
        (t.title||"").toLowerCase().includes(q) ||
        (t.artist||"").toLowerCase().includes(q)
      )
      .map(({i})=>i);
  }

  getFirstPlayableIndex(start=0, dir=1){
    const len = this.tracks.length;
    if (len===0) return -1;

    let i=start;
    for (let step=0; step<len; step++){
      const t=this.tracks[i];
      if (t && t.file) return i;
      i+=dir;
      if (i>=len) i=0;
      if (i<0) i=len-1;
    }
    return -1;
  }

  toggleShuffle(){
    this.shuffle = !this.shuffle;
    this.settings.set("isShuffle", this.shuffle);
    this.save();
  }

  toggleRepeat(){
    if (this.repeatMode==="none") this.repeatMode="all";
    else if (this.repeatMode==="all") this.repeatMode="one";
    else this.repeatMode="none";
    this.settings.set("repeatMode", this.repeatMode);
    this.save();
  }

  clearAll(){
    this.tracks=[];
    this.currentTrackIndex=-1;
    this.save();
  }

  removeTrack(index){
    if (index<0 || index>=this.tracks.length) return;
    this.tracks.splice(index,1);
    if (index < this.currentTrackIndex) this.currentTrackIndex--;
    if (index === this.currentTrackIndex) this.currentTrackIndex=-1;
    this.save();
  }

  reorder(from, to){
    if (from===to) return;
    if (from<0 || to<0 || from>=this.tracks.length || to>=this.tracks.length) return;
    const [moved] = this.tracks.splice(from,1);
    this.tracks.splice(to,0,moved);

    if (this.currentTrackIndex === from) this.currentTrackIndex = to;
    else {
      if (from < this.currentTrackIndex && to >= this.currentTrackIndex) this.currentTrackIndex--;
      if (from > this.currentTrackIndex && to <= this.currentTrackIndex) this.currentTrackIndex++;
    }
    this.save();
  }

  async addFiles(files, audioFx){
    const mp3s = Array.from(files).filter(isMp3File);

    for (const file of mp3s){
      const track = {
        file,
        title: file.name,
        artist: "ロード中...",
        artwork: null,
        duration: 0,
        gain: 1,
        wavePeaks: null,
        isGhost:false
      };
      this.tracks.push(track);
      const idx = this.tracks.length-1;

      track.gain = await (audioFx?.analyzeAndGetGain?.(file) ?? 1);
      track.wavePeaks = await (audioFx?.extractWavePeaks?.(file) ?? null);

      this._readMetadata(file, idx);
      this._readDuration(file, idx);
    }

    this.save();
  }

  _emitMetadata(index){
    window.dispatchEvent(new CustomEvent("playlist:metadata", { detail:{ index } }));
  }

  async _readMetadata(file, index){
    const jsmediatags = window.jsmediatags;
    if (!jsmediatags){
      this.tracks[index].artist="不明なアーティスト";
      this.save();
      this._emitMetadata(index);
      return;
    }

    let done = false;

    const finish = async (tags=null) => {
      if (done) return;
      done = true;
      if (!this.tracks[index]) return;

      const title = tags?.title || file.name;
      const artist = tags?.artist || "不明なアーティスト";

      let artworkUrl = null;
      if (tags?.picture){
        const { data, format } = tags.picture;
        let base64="";
        for (let i=0;i<data.length;i++) base64 += String.fromCharCode(data[i]);
        artworkUrl = `data:${format};base64,${btoa(base64)}`;
      }

      if (!artworkUrl){
        artworkUrl = await this._extractArtworkFallback(file);
      }

      this.tracks[index].title = title;
      this.tracks[index].artist = artist;
      this.tracks[index].artwork = artworkUrl;

      this.save();
      this._emitMetadata(index);
    };

    jsmediatags.read(file, {
      onSuccess: (tag) => finish(tag.tags || {}),
      onError: () => finish(null)
    });

    setTimeout(() => finish(null), 2500);
  }

  _readDuration(file, index){
    const temp = new Audio();
    const url = URL.createObjectURL(file);
    temp.src = url;

    temp.addEventListener("loadedmetadata", () => {
      if (!this.tracks[index]) return;
      this.tracks[index].duration = temp.duration || 0;
      URL.revokeObjectURL(url);
      this.save();
      this._emitMetadata(index);
    }, { once:true });

    temp.addEventListener("error", () => {
      URL.revokeObjectURL(url);
    }, { once:true });
  }

  // ---- safe base64 helper ----
  _bytesToBase64(bytes){
    let binary = "";
    const chunk = 0x8000;
    for (let i=0; i<bytes.length; i+=chunk){
      binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
    }
    return btoa(binary);
  }

  // ---- APIC/PIC fallback (v2.2/2.3/2.4) ----
  async _extractArtworkFallback(file){
    try{
      const buf = await file.slice(0, 2*1024*1024).arrayBuffer();
      const bytes = new Uint8Array(buf);

      if (bytes[0]!==0x49 || bytes[1]!==0x44 || bytes[2]!==0x33) return null;

      const ver = bytes[3]; // 2,3,4
      let pos = 10;

      const tagSize =
        (bytes[6]&0x7f)<<21 |
        (bytes[7]&0x7f)<<14 |
        (bytes[8]&0x7f)<<7  |
        (bytes[9]&0x7f);

      const end = pos + tagSize;

      while (pos + 10 < end){
        if (bytes[pos]===0 && bytes[pos+1]===0 && bytes[pos+2]===0 && bytes[pos+3]===0) break;

        let id = "";
        let frameSize = 0;
        let headerSize = 10;

        if (ver === 2){
          id = String.fromCharCode(bytes[pos],bytes[pos+1],bytes[pos+2]);
          frameSize = (bytes[pos+3]<<16)|(bytes[pos+4]<<8)|bytes[pos+5];
          headerSize = 6;
        } else {
          id = String.fromCharCode(bytes[pos],bytes[pos+1],bytes[pos+2],bytes[pos+3]);

          if (ver === 4){
            frameSize =
              (bytes[pos+4]&0x7f)<<21 |
              (bytes[pos+5]&0x7f)<<14 |
              (bytes[pos+6]&0x7f)<<7  |
              (bytes[pos+7]&0x7f);
          } else {
            frameSize =
              (bytes[pos+4]<<24)|(bytes[pos+5]<<16)|(bytes[pos+6]<<8)|bytes[pos+7];
          }
        }

        if (!id.trim() || frameSize<=0) break;

        const want = (ver===2 ? "PIC" : "APIC");
        if (id === want){
          const frame = bytes.slice(pos+headerSize, pos+headerSize+frameSize);
          let i=0;

          const encoding = frame[i++];

          let mime = "image/jpeg";
          if (ver===2){
            const fmt = String.fromCharCode(frame[i],frame[i+1],frame[i+2]).toLowerCase();
            i+=3;
            mime = fmt.includes("png") ? "image/png" : "image/jpeg";
          } else {
            mime = "";
            while (frame[i]!==0){ mime += String.fromCharCode(frame[i++]); }
            i++;
          }

          i++; // pictureType

          if (encoding===0 || encoding===3){
            while (frame[i]!==0 && i<frame.length) i++;
            i++;
          } else {
            while (!(frame[i]===0 && frame[i+1]===0) && i<frame.length-1) i++;
            i+=2;
          }

          const imgData = frame.slice(i);
          if (!imgData.length) return null;

          const b64 = this._bytesToBase64(imgData);
          return `data:${mime||"image/jpeg"};base64,${b64}`;
        }

        pos += headerSize + frameSize;
      }

      return null;
    }catch{
      return null;
    }
  }
}
