// js/modules/utils.js
export function clamp(v, min, max){
  return Math.min(Math.max(v, min), max);
}

export function formatTime(seconds){
  if (isNaN(seconds) || seconds == null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function isMp3File(file){
  if (!file) return false;
  return file.type === "audio/mpeg" || /\.mp3$/i.test(file.name);
}

export function easeInOutCos(t){
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp(t,0,1));
}
