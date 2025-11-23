export class Visualizer {
    constructor(audioEl, canvasEl, rootEl = document.documentElement) {
        this.audioEl = audioEl;
        this.canvasEl = canvasEl;
        this.rootEl = rootEl;
        this.ctx = canvasEl.getContext('2d');

        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.frequencyData = null;
        this.bufferLength = 0;

        this.FFT_SIZE = 512;
        this.isInitialized = false;
        this.style = 'line';

        this._boundResize = this.setupCanvas.bind(this);
        window.addEventListener('resize', this._boundResize);
    }

    ensureInit() {
        if (this.isInitialized) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.source = this.audioContext.createMediaElementSource(this.audioEl);
        this.analyser = this.audioContext.createAnalyser();

        this.analyser.fftSize = this.FFT_SIZE;
        this.analyser.smoothingTimeConstant = 0.85;

        this.bufferLength = this.analyser.frequencyBinCount;
        this.frequencyData = new Uint8Array(this.bufferLength);

        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.setupCanvas();
        this.isInitialized = true;

        this.draw();
    }

    resumeIfSuspended() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    setStyle(style) {
        this.style = style;
    }

    setupCanvas() {
        if (!this.isInitialized) return;
        const dpr = window.devicePixelRatio || 1;
        const { offsetWidth, offsetHeight } = this.canvasEl.parentElement;

        this.canvasEl.width = offsetWidth * dpr;
        this.canvasEl.height = offsetHeight * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
        this.ctx.scale(dpr, dpr);
    }

    draw() {
        requestAnimationFrame(() => this.draw());
        if (!this.isInitialized || this.audioEl.paused) {
            const { width, height } = this.canvasEl.getBoundingClientRect();
            this.ctx.clearRect(0, 0, width, height);
            return;
        }

        this.analyser.getByteFrequencyData(this.frequencyData);

        const { width, height } = this.canvasEl.getBoundingClientRect();
        this.ctx.clearRect(0, 0, width, height);

        const styles = getComputedStyle(this.rootEl);
        const gradColor1 = styles.getPropertyValue('--viz-grad-1').trim();
        const gradColor2 = styles.getPropertyValue('--viz-grad-2').trim();
        const gradColor3 = styles.getPropertyValue('--viz-grad-3').trim();

        const gradHeight = height * 0.40;
        const gradient = this.ctx.createLinearGradient(0, gradHeight, 0, 0);
        gradient.addColorStop(0, gradColor1);
        gradient.addColorStop(0.5, gradColor2);
        gradient.addColorStop(1, gradColor3);

        this.ctx.fillStyle = gradient;
        this.ctx.strokeStyle = gradient;
        this.ctx.lineCap = 'round';

        if (this.style === 'line') {
            this.drawLine(width, height, gradHeight);
        } else {
            this.drawBars(width, height);
        }
    }

    drawLine(width, height, gradHeight) {
        this.ctx.lineWidth = 3;
        const activeBufferLength = Math.floor(this.bufferLength / 2);
        const sliceWidth = (width / 2) / activeBufferLength;

        this.ctx.beginPath();

        for (let i = activeBufferLength - 1; i >= 0; i--) {
            const normalizedValue = this.frequencyData[i] / 255;
            const barHeight = Math.pow(normalizedValue, 1.5) * gradHeight * 0.9;
            const x = (width / 2) - ((activeBufferLength - i) * sliceWidth);
            this.ctx.lineTo(x, height - barHeight);
        }

        for (let i = 0; i < activeBufferLength; i++) {
            const normalizedValue = this.frequencyData[i] / 255;
            const barHeight = Math.pow(normalizedValue, 1.5) * gradHeight * 0.9;
            const x = (width / 2) + (i * sliceWidth);
            this.ctx.lineTo(x, height - barHeight);
        }

        this.ctx.stroke();
    }

    drawBars(width, height) {
        const barWidth = (width / this.bufferLength) * 1.5;
        let x = 0;
        const activeBufferLength = Math.floor(this.bufferLength / 1.5);

        for (let i = 0; i < activeBufferLength; i++) {
            const barHeight = (this.frequencyData[i] / 255) * height * 0.4;
            this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }
}
