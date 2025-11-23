export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

export const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

export function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function showToast(message, isError = false) {
  const toast = qs("#toast");
  const toastMessage = qs("#toast-message");
  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;
  toast.style.backgroundColor = isError ? "var(--thumb-color)" : "var(--toast-bg)";
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 3000);
}

export function isMp3File(file) {
  if (!file) return false;
  const nameOk = file.name?.toLowerCase().endsWith(".mp3");
  const typeOk = file.type === "audio/mpeg" || file.type === "audio/mp3" || file.type.startsWith("audio/");
  return nameOk || typeOk; // iOS対策で拡張子が最優先
}

export function buildFileSignature(file) {
  return `${file.name}|${file.size}|${file.lastModified || 0}`;
}

export function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
