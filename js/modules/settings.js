const SETTINGS_KEY = 'mp3PlayerSettings_v3_4';

export function saveSettings(state) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('saveSettings failed', e);
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** theme: 'normal' | 'light' | 'dark' */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('light-mode', 'dark-mode');
  if (theme === 'light') root.classList.add('light-mode');
  if (theme === 'dark') root.classList.add('dark-mode');
}

export function cycleTheme(currentTheme) {
  if (currentTheme === 'normal') return 'light';
  if (currentTheme === 'light') return 'dark';
  return 'normal';
}

export function updateThemeIcons(theme, icons) {
  const { normalIcon, sunIcon, moonIcon } = icons;
  normalIcon.classList.toggle('hidden', theme !== 'normal');
  sunIcon.classList.toggle('hidden', theme !== 'light');
  moonIcon.classList.toggle('hidden', theme !== 'dark');
}
