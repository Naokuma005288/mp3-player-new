import { clamp } from "./utils.js";

export function createVisualizer({ audioPlayer, canvas, getThemeVars }) {
  const ctx = canvas.getContext("2d");
  let audioContext, analyser, source, freqData;
  let bufferLength = 0;
  let initialized = false;
  let style = "line";
  const FFT_SIZE = 512;

  function init() {
    if (initialized) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    source = audioContext.createMediaElementSource(audioPlayer);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.85;
    bufferLength = analyser.frequencyBinCount;
    freqData = new Uint8Array(bufferLength);

    source.connect(analyser);
    analyser.connect(audioContext.destination);

    setupCanvas();
    initialized = true;
    draw();
  }

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { offsetWidth, offsetHeight } = canvas.parentElement;
    canvas.width = offsetWidth * dpr;
    canvas.height = offsetHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setStyle(newStyle) {
    style = newStyle;
  }

  function resumeIfNeeded() {
    if (audioContext && audioContext.state === "suspended") audioContext.resume();
  }

  function draw() {
    requestAnimationFrame(draw);
    if (!initialized || audioPlayer.paused) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      return;
    }

    analyser.getByteFrequencyData(freqData);

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const { grad1, grad2, grad3 } = getThemeVars();
    const gradHeight = height * 0.40;
    const grad = ctx.createLinearGradient(0, gradHeight, 0, 0);
    grad.addColorStop(0, grad1);
    grad.addColorStop(0.5, grad2);
    grad.addColorStop(1, grad3);
    ctx.fillStyle = grad;
    ctx.strokeStyle = grad;
    ctx.lineCap = "round";

    if (style === "line") drawLine(width, height, gradHeight);
    else drawBars(width, height);
  }

  function drawLine(width, height, gradHeight) {
    ctx.lineWidth = 3;
    const active = Math.floor(bufferLength / 2);
    const slice = (width / 2) / active;

    ctx.beginPath();
    for (let i = active - 1; i >= 0; i--) {
      const n = freqData[i] / 255;
      const bh = Math.pow(n, 1.5) * gradHeight * 0.9;
      const x = (width / 2) - ((active - i) * slice);
      ctx.lineTo(x, height - bh);
    }
    for (let i = 0; i < active; i++) {
      const n = freqData[i] / 255;
      const bh = Math.pow(n, 1.5) * gradHeight * 0.9;
      const x = (width / 2) + (i * slice);
      ctx.lineTo(x, height - bh);
    }
    ctx.stroke();
  }

  function drawBars(width, height) {
    const barW = (width / bufferLength) * 1.5;
    let x = 0;
    const active = Math.floor(bufferLength / 1.5);

    for (let i = 0; i < active; i++) {
      const bh = clamp(freqData[i] / 255, 0, 1) * height * 0.4;
      ctx.fillRect(x, height - bh, barW, bh);
      x += barW + 1;
    }
  }

  window.addEventListener("resize", () => initialized && setupCanvas());

  return { init, setStyle, resumeIfNeeded, get initialized(){ return initialized; } };
}
