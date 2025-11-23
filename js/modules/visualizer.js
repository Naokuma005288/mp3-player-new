import { clamp } from "./utils.js";

export class Visualizer {
  constructor(dom, settings, player) {
    this.dom = dom;
    this.settings = settings;
    this.player = player;

    this.canvas = dom.vizCanvas;
    this.ctx = this.canvas.getContext("2d");

    this.waveCanvas = dom.waveformCanvas;
    this.waveCtx = this.waveCanvas.getContext("2d");

    this.raf = null;
  }

  init() {
    this.setupCanvas();
    window.addEventListener("resize", () => this.setupCanvas());
    this.loop();
    document.addEventListener("player:trackPrepared", (e) => this.drawWaveform(e.detail));
  }

  setupCanvas() {
    const dpr = window.devicePixelRatio || 1;

    const parent = this.canvas.parentElement;
    const w = parent.offsetWidth;
    const h = parent.offsetHeight;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pw = this.dom.progressBar.offsetWidth;
    this.waveCanvas.width = pw * dpr;
    this.waveCanvas.height = 32 * dpr;
    this.waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());

    const data = this.player.getAnalyserData();
    const { width, height } = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);

    if (!data || this.player.audio.paused) return;

    const styles = getComputedStyle(document.documentElement);
    const gradColor1 = styles.getPropertyValue("--viz-grad-1").trim();
    const gradColor2 = styles.getPropertyValue("--viz-grad-2").trim();
    const gradColor3 = styles.getPropertyValue("--viz-grad-3").trim();
    const gradHeight = height * 0.40;

    const gradient = this.ctx.createLinearGradient(0, gradHeight, 0, 0);
    gradient.addColorStop(0, gradColor1);
    gradient.addColorStop(0.5, gradColor2);
    gradient.addColorStop(1, gradColor3);

    this.ctx.fillStyle = gradient;
    this.ctx.strokeStyle = gradient;

    const style = this.settings.vizStyle;
    if (style === "bars") this.drawBars(data, width, height);
    else if (style === "dots") this.drawDots(data, width, height, gradHeight);
    else this.drawLine(data, width, height, gradHeight);
  }

  drawLine(data, width, height, gradHeight) {
    const bufLen = Math.floor(data.length / 2);
    const slice = (width / 2) / bufLen;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();

    for (let i = bufLen - 1; i >= 0; i--) {
      const v = Math.pow(data[i] / 255, 1.5) * gradHeight * 0.9;
      const x = (width / 2) - ((bufLen - i) * slice);
      this.ctx.lineTo(x, height - v);
    }
    for (let i = 0; i < bufLen; i++) {
      const v = Math.pow(data[i] / 255, 1.5) * gradHeight * 0.9;
      const x = (width / 2) + (i * slice);
      this.ctx.lineTo(x, height - v);
    }
    this.ctx.stroke();
  }

  drawBars(data, width, height) {
    const barWidth = (width / data.length) * 1.5;
    let x = 0;
    const active = Math.floor(data.length / 1.5);
    for (let i = 0; i < active; i++) {
      const v = (data[i] / 255) * height * 0.4;
      this.ctx.fillRect(x, height - v, barWidth, v);
      x += barWidth + 1;
    }
  }

  drawDots(data, width, height, gradHeight) {
    const active = Math.floor(data.length / 2);
    const step = width / active;
    for (let i = 0; i < active; i++) {
      const v = Math.pow(data[i] / 255, 1.7) * gradHeight;
      const x = i * step;
      const y = height - v;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawWaveform(track) {
    const ctx = this.waveCtx;
    const { width, height } = this.waveCanvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);

    if (!this.settings.waveformEnabled) return;
    if (!track?.waveform) return;

    const peaks = track.waveform;
    const midY = height / 2;
    const step = width / peaks.length;

    const styles = getComputedStyle(document.documentElement);
    ctx.fillStyle = styles.getPropertyValue("--thumb-color").trim();

    for (let i = 0; i < peaks.length; i++) {
      const p = clamp(peaks[i], 0, 1);
      const h = p * height * 0.9;
      const x = i * step;
      ctx.fillRect(x, midY - h / 2, step * 0.8, h);
    }
  }
}
