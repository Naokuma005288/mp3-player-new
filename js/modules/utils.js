export const jsmediatags = window.jsmediatags;

export function formatTime(seconds) {
  if (isNaN(seconds) || seconds == null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function getFileSignature(file) {
  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified
  };
}

export function signatureToKey(sig) {
  return `${sig.name}__${sig.size}__${sig.lastModified}`;
}

export function readID3(file) {
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: (tag) => resolve(tag.tags),
      onError: () => resolve({})
    });
  });
}

export function extractArtworkUrl(tags) {
  if (!tags?.picture) return null;
  const { data, format } = tags.picture;
  let base64 = "";
  for (let i = 0; i < data.length; i++) base64 += String.fromCharCode(data[i]);
  return `data:${format};base64,${btoa(base64)}`;
}

export function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
