export function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

export function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function debounce(fn, ms = 100) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// iOSで type が空のことがあるので二段構え
export function isMp3File(file) {
  if (!file) return false;
  const nameOk = /\.mp3$/i.test(file.name || "");
  const typeOk = (file.type || "").includes("mpeg");
  return nameOk || typeOk;
}

export function readFileAsArrayBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}

export function extractPictureAsDataURL(picture) {
  if (!picture) return null;
  const { data, format } = picture;
  let base64 = "";
  for (let i = 0; i < data.length; i++) {
    base64 += String.fromCharCode(data[i]);
  }
  return `data:${format};base64,${btoa(base64)}`;
}
