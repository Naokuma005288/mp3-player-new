const SETTINGS_KEY = "mp3PlayerSettings_v3_5";
const PLAYLIST_KEY = "mp3PlayerPlaylist_v3_5";

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("設定保存失敗", e);
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("設定読み込み失敗", e);
    return null;
  }
}

export function savePlaylist(playlist) {
  try {
    const serial = playlist.map(t => ({
      title: t.title,
      artist: t.artist,
      artwork: t.artwork,
      duration: t.duration,
      signature: t.signature,
      originalOrder: t.originalOrder ?? 0
    }));
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(serial));
  } catch (e) {
    console.error("プレイリスト保存失敗", e);
  }
}

export function loadPlaylist() {
  try {
    const raw = localStorage.getItem(PLAYLIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("プレイリスト読み込み失敗", e);
    return [];
  }
}
