const SETTINGS_KEY = "mp3PlayerSettings_v37";

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("設定の保存に失敗:", e);
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("設定の読み込みに失敗:", e);
    return null;
  }
}
