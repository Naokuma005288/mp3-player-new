import { debounce } from './utils.js';

export function createVisualizer(audioEl, canvasEl, opts = {}) {
  const FFT_SIZE = opts.fftSize ?? 512;
  let audioContext = null;
  let analyser = null;
  let source = null;
  let bufferLength = 0;
  let frequencyData = null;
  let initialized = false;
  let style = opts.style ?? 'line';

  const ctx = canvasEl.getContext('2d');

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { offsetWidth, offsetHeight } = canvasEl.parentElement;
    canvasEl.width = offsetWidth * dpr;
    canvasEl.height = offsetHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const onResize = debounce(() => initialized && setupCanvas(), 150);
  window.addEventListener('resize', onResize);

  function init() {
    if (initialized) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    source = audioContext.createMediaElementSource(audioEl);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.85;

    bufferLength = analyser.frequencyBinCount;
    frequencyData = new Uint8Array(bufferLength);

    source.connect(analyser);
    analyser.connect(audioContext.destination);

    setupCanvas();
    initialized = true;
    draw();
  }

  function resumeIfNeeded() {
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
  }

  function setStyle(next) {
    style = next;
  }

  function draw() {
    requestAnimationFrame(draw);

    const { width, height } = canvasEl.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);

    if (!initialized || audioEl.paused) return;

    analyser.getByteFrequencyData(frequencyData);

    const styles = getComputedStyle(document.documentElement);
    const c1 = styles.getPropertyValue('--viz-grad-1').trim();
    const c2 = styles.getPropertyValue('--viz-grad-2').trim();
    const c3 = styles.getPropertyValue('--viz-grad-3').trim();

    const gradHeight = height * 0.40;
    const gradient = ctx.createLinearGradient(0, gradHeight, 0, 0);
    gradient.addColorStop(0, c1);
    gradient.addColorStop(0.5, c2);
    gradient.addColorStop(1, c3);

    ctx.fillStyle = gradient;
    ctx.strokeStyle = gradient;
    ctx.lineCap = 'round';

    if (style === 'bars') drawBars(width, height);
    else drawLine(width, height, gradHeight);
  }

  function drawLine(width, height, gradHeight) {
    ctx.lineWidth = 3;
    const active = Math.floor(bufferLength / 2);
    const sliceW = (width / 2) / active;

    ctx.beginPath();

    for (let i = active - 1; i >= 0; i--) {
      const n = frequencyData[i] / 255;
      const h = Math.pow(n, 1.5) * gradHeight * 0.9;
      const x = (width / 2) - ((active - i) * sliceW);
      ctx.lineTo(x, height - h);
    }
    for (let i = 0; i < active; i++) {
      const n = frequencyData[i] / 255;
      const h = Math.pow(n, 1.5) * gradHeight * 0.9;
      const x = (width / 2) + (i * sliceW);
      ctx.lineTo(x, height - h);
    }
    ctx.stroke();
  }

  function drawBars(width, height) {
    const barW = (width / bufferLength) * 1.5;
    let x = 0;
    const active = Math.floor(bufferLength / 1.5);

    for (let i = 0; i < active; i++) {
      const h = (frequencyData[i] / 255) * height * 0.4;
      ctx.fillRect(x, height - h, barW, h);
      x += barW + 1;
    }
  }

  return {
    init,
    resumeIfNeeded,
    setStyle,
    get initialized() { return initialized; }
  };
}
