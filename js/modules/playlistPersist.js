export class PlaylistPersist {
  constructor(settings) {
    this.KEY = "mp3PlayerPlaylist_v3_9_1";
    this.settings = settings;
  }

  save(tracks) {
    try {
      const lite = tracks.map(t => ({
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        // ゴースト保持のため file は保存しない
      }));
      localStorage.setItem(this.KEY, JSON.stringify(lite));
    } catch {}
  }

  load() {
    try {
      const s = localStorage.getItem(this.KEY);
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  }

  exportJson() {
    const data = this.load();
    return JSON.stringify({ version: "3.9.1", tracks: data }, null, 2);
  }

  importJson(json) {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.tracks)) throw new Error("invalid");
    localStorage.setItem(this.KEY, JSON.stringify(parsed.tracks));
  }
}
