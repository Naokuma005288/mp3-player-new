export function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

export function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function signatureForFile(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export function showToast(toastEl, toastMsgEl, message, isError = false) {
  if (!toastEl || !toastMsgEl) return;
  toastMsgEl.textContent = message;
  toastEl.style.backgroundColor = isError ? 'var(--thumb-color)' : 'var(--toast-bg)';
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

export function readID3(file) {
  const jsmediatags = window.jsmediatags;
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: (tag) => resolve(tag.tags),
      onError: () => resolve(null)
    });
  });
}

export function getDurationOfFile(file) {
  return new Promise((resolve) => {
    const tempAudio = new Audio();
    const url = URL.createObjectURL(file);
    tempAudio.src = url;
    tempAudio.addEventListener('loadedmetadata', () => {
      const d = tempAudio.duration || null;
      URL.revokeObjectURL(url);
      resolve(d);
    });
    tempAudio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      resolve(null);
    });
  });
}

export function debounce(fn, ms = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
