import { buildFileSignature } from "./utils.js";

const KEY = "mp3PlayerSession_v39";

export class PlaylistPersist {
  constructor(settings, playlist, player) {
    this.settings = settings;
    this.playlist = playlist;
    this.player = player;
  }

  saveSession() {
    const meta = this.playlist.tracks.map(t => ({
      sig: t.sig,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
    }));
    const session = {
      meta,
      currentSig: this.playlist.currentTrack?.sig || null,
      currentTime: this.player.getCurrentTime(),
      wasPlaying: this.player.isPlaying(),
    };
    localStorage.setItem(KEY, JSON.stringify(session));
  }

  restoreSessionOnBoot() {
    // 何もしない（files追加時にマッチングする）
  }

  applyOnFilesAdded() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    let s;
    try { s = JSON.parse(raw); } catch { return; }
    if (!s?.meta?.length) return;

    // 並び復元（sigで再ソート）
    const orderMap = new Map(s.meta.map((m, i) => [m.sig, i]));
    this.playlist.tracks.sort((a, b) =>
      (orderMap.get(a.sig) ?? 9999) - (orderMap.get(b.sig) ?? 9999)
    );

    // 現在曲復元
    const idx = this.playlist.tracks.findIndex(t => t.sig === s.currentSig);
    if (idx >= 0) {
      this.playlist.currentIndex = idx;
      this.player.prepareTrack(idx);
      this.player.seekTo(s.currentTime || 0);
      if (s.wasPlaying) this.player.play();
    }
  }

  attachFileSignatures(files) {
    return Array.from(files).map(f => ({
      file: f,
      sig: buildFileSignature(f),
    }));
  }
}
