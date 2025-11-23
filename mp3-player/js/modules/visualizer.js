import { saveSettings } from "./settings.js";

export function initVisualizerUI(els, core) {
  const canvas = els.visualizerCanvas;
  const ctx = canvas.getContext("2d");

  let audioContext = null;
  let analyser = null;
  let source = null;
  let frequencyData = null;
  const FFT_SIZE = 512;
  let bufferLength = 0;
  let isAudioContextInitialized = false;

  let visualizerStyle = "line";

  function ensureAudioContext() {
    if (isAudioContextInitialized) {
      if (audioContext?.state === "suspended") audioContext.resume();
      return;
    }

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    source = audioContext.createMediaElementSource(els.audioPlayer);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.85;

    bufferLength = analyser.frequencyBinCount;
    frequencyData = new Uint8Array(bufferLength);

    source.connect(analyser);
    analyser.connect(audioContext.destination);

    setupCanvas();
    isAudioContextInitialized = true;
    drawVisualizer();
  }

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { offsetWidth, offsetHeight } = canvas.parentElement;

    canvas.width = offsetWidth * dpr;
    canvas.height = offsetHeight * dpr;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
  }

  function onResize() {
    if (isAudioContextInitialized) setupCanvas();
  }

  function toggleVisualizerStyle() {
    visualizerStyle = (visualizerStyle === "line") ? "bars" : "line";
    updateVizIcons();
    saveSettings(els, { ...core.getState(), visualizerStyle });
  }

  function updateVizIcons() {
    const isLine = visualizerStyle === "line";
    els.vizLineIcon.classList.toggle("hidden", !isLine);
    els.vizBarsIcon.classList.toggle("hidden", isLine);
  }

  function setVisualizerStyle(style) {
    visualizerStyle = style || "line";
    updateVizIcons();
  }

  function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);

    if (!isAudioContextInitialized || els.audioPlayer.paused) {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0,0,width,height);
      return;
    }

    analyser.getByteFrequencyData(frequencyData);

    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0,0,width,height);

    const styles = getComputedStyle(document.documentElement);
    const gradColor1 = styles.getPropertyValue("--viz-grad-1").trim();
    const gradColor2 = styles.getPropertyValue("--viz-grad-2").trim();
    const gradColor3 = styles.getPropertyValue("--viz-grad-3").trim();

    const gradHeight = height * 0.40;
    const gradient = ctx.createLinearGradient(0, gradHeight, 0, 0);
    gradient.addColorStop(0, gradColor1);
    gradient.addColorStop(0.5, gradColor2);
    gradient.addColorStop(1, gradColor3);

    ctx.fillStyle = gradient;
    ctx.strokeStyle = gradient;
    ctx.lineCap = "round";

    if (visualizerStyle === "line") drawVizLine(width, height, gradHeight);
    else drawVizBars(width, height);
  }

  function drawVizLine(width, height, gradHeight) {
    ctx.lineWidth = 3;
    const activeBufferLength = Math.floor(bufferLength / 2);
    const sliceWidth = (width / 2) / activeBufferLength;

    ctx.beginPath();

    for (let i = activeBufferLength - 1; i >= 0; i--) {
      const normalizedValue = frequencyData[i] / 255;
      const barHeight = Math.pow(normalizedValue, 1.5) * gradHeight * 0.9;
      const x = (width / 2) - ((activeBufferLength - i) * sliceWidth);
      ctx.lineTo(x, height - barHeight);
    }
    for (let i = 0; i < activeBufferLength; i++) {
      const normalizedValue = frequencyData[i] / 255;
      const barHeight = Math.pow(normalizedValue, 1.5) * gradHeight * 0.9;
      const x = (width / 2) + (i * sliceWidth);
      ctx.lineTo(x, height - barHeight);
    }

    ctx.stroke();
  }

  function drawVizBars(width, height) {
    const barWidth = (width / bufferLength) * 1.5;
    let x = 0;
    const activeBufferLength = Math.floor(bufferLength / 1.5);

    for (let i = 0; i < activeBufferLength; i++) {
      const barHeight = (frequencyData[i] / 255) * height * 0.4;
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  return {
    ensureAudioContext,
    toggleVisualizerStyle,
    updateVizIcons,
    setVisualizerStyle,
    onResize,
    getAudioContextInitialized: () => isAudioContextInitialized
  };
}
