import { clamp } from "./utils.js";

export function createVisualizer({
  canvas,
  getAudioContext,
  getAnalyser,
  getStyle,
}) {
  const ctx = canvas.getContext("2d");
  let bufferLength = 0;
  let dataArray = null;
  let rafId = null;

  function setupCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const { offsetWidth, offsetHeight } = canvas.parentElement;
    canvas.width = offsetWidth * dpr;
    canvas.height = offsetHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getGradient(width, height) {
    const styles = getComputedStyle(document.documentElement);
    const c1 = styles.getPropertyValue("--viz-grad-1").trim();
    const c2 = styles.getPropertyValue("--viz-grad-2").trim();
    const c3 = styles.getPropertyValue("--viz-grad-3").trim();
    const gradHeight = height * 0.4;

    const g = ctx.createLinearGradient(0, gradHeight, 0, 0);
    g.addColorStop(0, c1);
    g.addColorStop(0.5, c2);
    g.addColorStop(1, c3);
    return { g, gradHeight };
  }

  function drawLine(width, height, gradHeight) {
    ctx.lineWidth = 3;
    const activeLen = Math.floor(bufferLength / 2);
    const sliceWidth = (width / 2) / activeLen;

    ctx.beginPath();
    for (let i = activeLen - 1; i >= 0; i--) {
      const n = dataArray[i] / 255;
      const h = Math.pow(n, 1.5) * gradHeight * 0.9;
      const x = (width / 2) - ((activeLen - i) * sliceWidth);
      ctx.lineTo(x, height - h);
    }
    for (let i = 0; i < activeLen; i++) {
      const n = dataArray[i] / 255;
      const h = Math.pow(n, 1.5) * gradHeight * 0.9;
      const x = (width / 2) + (i * sliceWidth);
      ctx.lineTo(x, height - h);
    }
    ctx.stroke();
  }

  function drawBars(width, height) {
    const barWidth = (width / bufferLength) * 1.5;
    let x = 0;
    const activeLen = Math.floor(bufferLength / 1.5);

    for (let i = 0; i < activeLen; i++) {
      const h = (dataArray[i] / 255) * height * 0.4;
      ctx.fillRect(x, height - h, barWidth, h);
      x += barWidth + 1;
    }
  }

  function drawRadial(width, height) {
    const cx = width / 2;
    const cy = height * 0.95;
    const maxR = Math.min(width, height) * 0.42;
    const activeLen = Math.floor(bufferLength / 2);

    for (let i = 0; i < activeLen; i++) {
      const v = dataArray[i] / 255;
      const angle = (i / activeLen) * Math.PI * 2;
      const r = maxR * clamp(Math.pow(v, 1.2), 0, 1);
      const x1 = cx + Math.cos(angle) * (maxR * 0.25);
      const y1 = cy + Math.sin(angle) * (maxR * 0.25);
      const x2 = cx + Math.cos(angle) * (maxR * 0.25 + r);
      const y2 = cy + Math.sin(angle) * (maxR * 0.25 + r);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  function loop() {
    rafId = requestAnimationFrame(loop);

    const analyser = getAnalyser();
    const ac = getAudioContext();
    if (!analyser || !ac) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    if (!dataArray) {
      bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    analyser.getByteFrequencyData(dataArray);

    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);

    const { g, gradHeight } = getGradient(width, height);
    ctx.fillStyle = g;
    ctx.strokeStyle = g;
    ctx.lineCap = "round";

    const style = getStyle();
    if (style === "line") drawLine(width, height, gradHeight);
    else if (style === "bars") drawBars(width, height);
    else drawRadial(width, height);
  }

  function start() {
    setupCanvasSize();
    if (!rafId) loop();
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener("resize", setupCanvasSize);

  return { start, stop, setupCanvasSize };
}
