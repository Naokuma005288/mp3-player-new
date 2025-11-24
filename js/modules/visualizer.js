// js/modules/visualizer.js
export class Visualizer {
  constructor(canvas, settings, audioFx){
    this.canvas = canvas;
    this.ctx2d = canvas.getContext("2d");
    this.settings = settings;
    this.audioFx = audioFx;

    this.analyser = null;
    this.data = null;
    this.FFT = 512;
    this.ready = false;
  }

  _ensureAnalyser(){
    if (this.ready) return;

    const ctx = this.audioFx.ensureContext();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = this.FFT;
    this.analyser.smoothingTimeConstant = 0.85;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);

    // mix both bundles → visual analyser
    this.audioFx.getBundles().forEach(b => {
      try{ b.gain.connect(this.analyser); }catch{}
    });

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this.ready = true;
  }

  _resize(){
    const dpr = window.devicePixelRatio || 1;
    const { offsetWidth, offsetHeight } = this.canvas.parentElement;
    this.canvas.width = offsetWidth * dpr;
    this.canvas.height = offsetHeight * dpr;
    this.ctx2d.setTransform(dpr,0,0,dpr,0,0);
  }

  start(){
    this._ensureAnalyser();
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.ready) return;

      const { width, height } = this.canvas.getBoundingClientRect();
      this.ctx2d.clearRect(0,0,width,height);

      this.analyser.getByteFrequencyData(this.data);
      const style = this.settings.get("visualizerStyle") || "line";

      const css = getComputedStyle(document.documentElement);
      const c1 = css.getPropertyValue("--viz-grad-1").trim();
      const c2 = css.getPropertyValue("--viz-grad-2").trim();
      const c3 = css.getPropertyValue("--viz-grad-3").trim();
      const gradHeight = height * 0.4;

      const grad = this.ctx2d.createLinearGradient(0,gradHeight,0,0);
      grad.addColorStop(0,c1);
      grad.addColorStop(0.5,c2);
      grad.addColorStop(1,c3);

      this.ctx2d.fillStyle = grad;
      this.ctx2d.strokeStyle = grad;
      this.ctx2d.lineCap = "round";

      if (style==="bars") this._drawBars(width,height);
      else if (style==="dots") this._drawDots(width,height);
      else this._drawLine(width,height,gradHeight);
    };
    loop();
  }

  _drawLine(width,height,gradHeight){
    const bufLen=this.data.length;
    const active=Math.floor(bufLen/2);
    const sliceW=(width/2)/active;

    this.ctx2d.lineWidth=3;
    this.ctx2d.beginPath();

    for (let i=active-1;i>=0;i--){
      const v=this.data[i]/255;
      const h=Math.pow(v,1.5)*gradHeight*0.9;
      const x=(width/2)-((active-i)*sliceW);
      this.ctx2d.lineTo(x,height-h);
    }
    for (let i=0;i<active;i++){
      const v=this.data[i]/255;
      const h=Math.pow(v,1.5)*gradHeight*0.9;
      const x=(width/2)+(i*sliceW);
      this.ctx2d.lineTo(x,height-h);
    }
    this.ctx2d.stroke();
  }

  _drawBars(width,height){
    const bufLen=this.data.length;
    const barW=(width/bufLen)*1.5;
    const active=Math.floor(bufLen/1.5);
    let x=0;

    for (let i=0;i<active;i++){
      const h=(this.data[i]/255)*height*0.4;
      this.ctx2d.fillRect(x,height-h,barW,h);
      x+=barW+1;
    }
  }

  _drawDots(width,height){
    const bufLen=this.data.length;
    const active=Math.floor(bufLen/2);
    const step=width/active;

    for (let i=0;i<active;i++){
      const v=this.data[i]/255;
      const y=height - v*height*0.4;
      const x=i*step;
      const r=1+v*3;
      this.ctx2d.beginPath();
      this.ctx2d.arc(x,y,r,0,Math.PI*2);
      this.ctx2d.fill();
    }
  }
}
