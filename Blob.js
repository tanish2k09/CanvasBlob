// Credit for base source to Zevan Rosser
// Codepen source available at the following link:
// https://codepen.io/ZevanRosser/pen/bde8e879b344202cf06379e44f9e80b2
//
// Heavily modified by Tanish Manku - 2020

const canvas = document.getElementById("vector_canvas");
const ctx = canvas.getContext("2d");

const blobStates = {
  EXPANDED: 0,
  EXPANDING: 1,
  REGULAR: 2,
  COLLAPSING: 3
};

const blobEnergyStates = {
  REST: 0,
  INCREASING: 1,
  DECREASING: 2,
  MAXIMUM: 3
};

const scaleDuration = 750; // milliseconds
const fillColor = "#41ffc9";
const reactiveSpeedDuration = 750;
const reactivePollInterval = 16.66;
const widthBreakPoint = 768;
var anchorResizeToken = null;

class Blob {
  constructor(number, sectorAngle, minDeviation) {
    // use this to change the size of the screen estate to cover, in the minimum dimension
    this.screenEstateCoverageV = 0.6;
    this.screenEstateCoverageH = 0.6;

    if (minDeviation > Math.PI * 2) {
      minDeviation = Math.PI * 2;
    }

    // think of this as detail level
    // number of conections in the `bezierSkin`
    this.segments = number;
    this.step = sectorAngle / this.segments;

    // Stores points that are "pinned" and are points where bumps occur
    this.anchors = [];

    // Controls angular deviation
    this.thetaOff = [];

    // Calculate radius
    this.updateValues();

    // Controls radius of buldge
    this.bumpRadius = this.baseRadius / 7;
    this.halfBumpRadius = this.bumpRadius / 2;

    // Just an added value to base radius
    this.radiusOffset = 0;

    // Keeps track of current bump radii
    this.radii = [];

    for (let i = 0; i < this.segments + 2; i++) {
      this.anchors.push(0, 0);
      this.radii.push(Math.random() * this.bumpRadius - this.halfBumpRadius);
      this.thetaOff.push(Math.random() * (Math.PI * 2 - minDeviation) + minDeviation);
    }

    this.theta = 0;
    this.thetaRamp = 0;
    this.thetaRampDest = 12;
    this.rampDamp = 25;
    this.thetaDelta = this.getBaseThetaDelta();

    // Track animation state
    this.state = blobStates.REGULAR;
    this.lastTimeFraction = 0;
    this.currentTimeFraction = 0;
    this.recordedEnergyTime = 0;
    this.lastThetaFraction = 0;
    this.currentThetaFraction = 0;
    this.blobEnergyState = blobEnergyStates.REST;
  }

  shouldRefresh() {
    return this.isAnimating() || (this.thetaRamp < this.thetaRampDest * 0.99);
  }

  isAnimating() {
    return (this.state === blobStates.EXPANDING || this.state === blobStates.COLLAPSING);
  }

  update() {
    if (this.state === blobStates.EXPANDED) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.shouldRefresh()) {
      this.updateValues();
    }

    this.updateAnchors();

    ctx.beginPath();
    ctx.moveTo(0, 0);

    bezierSkin(this.anchors, false);

    ctx.lineTo(canvas.width, 0);
    ctx.fillStyle = fillColor;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "black";
    ctx.fill();
  }

  updateValues() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.baseRadius = this.getDiagonal() * 0.4;
  }

  getBaseThetaDelta() {
    return (this.getDiagonal() / 2500) * 0.02;
  }

  getMaxThetaDelta() {
    return Math.min(this.getBaseThetaDelta() * 6, 0.12);
  }

  updateAnchors() {
    this.thetaRamp += (this.thetaRampDest - this.thetaRamp) / this.rampDamp;
    this.theta += this.thetaDelta;

    // Recreate anchors, initially with first anchor
    this.anchors = [canvas.width, this.baseRadius];

    for (let i = 0; i <= this.segments + 2; i++) {
      const sine = Math.sin(this.thetaOff[i] + this.theta + this.thetaRamp);
      const rad = this.baseRadius + this.radiusOffset + this.radii[i] * sine;
      const x = rad * Math.sin(this.step * i);
      const y = rad * Math.cos(this.step * i);
      this.anchors.push(canvas.width - x, y);
    }
  }

  getDiagonal() {
    return Math.hypot(canvas.width, canvas.height);
  }

  animate() {
    switch (this.state) {
      case blobStates.EXPANDING:
        this.expandRadius();
        break;

      case blobStates.COLLAPSING:
        this.collapseRadius();
        break;

      default:
        return;
    }
  }

  cueExpansion() {
    if (this.state !== blobStates.EXPANDED && this.state !== blobStates.EXPANDING) {
      this.trackTime();
      this.state = blobStates.EXPANDING;
    }
  }

  cueCollapse() {
    if (this.state !== blobStates.REGULAR && this.state !== blobStates.COLLAPSING) {
      this.trackTime();
      this.state = blobStates.COLLAPSING;
    }
  }

  expandRadius() {
    if (this.state === blobStates.EXPANDED) {
      return;
    }

    if (this.isMaximized()) {
      this.state = blobStates.EXPANDED;
      this.radiusOffset = this.getMaxRadius();
      this.currentTimeFraction = 1;
      return;
    }

    this.currentTimeFraction = this.clampTimeFraction(this.getTimeFraction() + this.lastTimeFraction);
    this.radiusOffset = this.getMultiplierToOffset(this.getMultiplierFromInterpolator(this.currentTimeFraction));
  }

  collapseRadius() {
    if (this.state === blobStates.REGULAR) {
      return;
    }

    if (this.currentTimeFraction === 0) {
      this.state = blobStates.REGULAR;
      this.radiusOffset = 0;
    }

    this.currentTimeFraction = this.clampTimeFraction(this.lastTimeFraction - this.getTimeFraction())
    this.radiusOffset = this.getMultiplierToOffset(this.getMultiplierFromInterpolator(this.currentTimeFraction));
  }

  trackTime() {
    this.recordedTime = performance.now();
    this.lastTimeFraction = this.currentTimeFraction;
  }

  getTimeFraction() {
    let difference = performance.now() - this.recordedTime;
    let timeFraction = difference / scaleDuration;

    return this.clampTimeFraction(timeFraction);
  }

  clampTimeFraction(timeFraction) {
    if (timeFraction > 1) {
      return 1;
    } else if (timeFraction < 0) {
      return 0;
    }

    return timeFraction;
  }

  getMultiplierFromInterpolator(tf) {
    return tf < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * tf, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * tf + 2, 2)) + 1) / 2;
  }

  getMultiplierToOffset(multiplier) {
    return (this.getMaxRadius() - this.baseRadius) * multiplier;
  }

  getMultiplierToThetaDelta(multiplier) {
    return (this.getMaxThetaDelta() - this.getBaseThetaDelta()) * multiplier + this.getBaseThetaDelta();
  }

  getMaxRadius() {
    return this.getDiagonal() + this.bumpRadius;
  }

  isMaximized() {
    return this.radiusOffset >= this.getDiagonal();
  }

  trackEnergyTime() {
    this.recordedEnergyTime = performance.now();
    this.lastThetaFraction = this.currentThetaFraction;
  }

  getEnergyThetaFraction() {
    let difference = performance.now() - this.recordedEnergyTime;
    let thetaFraction = difference / reactiveSpeedDuration;

    return this.clampTimeFraction(thetaFraction);
  }

  /* Converts given px acceleration to energy value */
  reactivePx(speed) {
    if (this.blobEnergyState === blobEnergyStates.INCREASING) {
      return;
    }

    // Formula: (+ve Speed pixels / Diagonal pixels) * 100
    // This is at max 1 / reactivePollInterval (0.06 at 60fps) and 0 at min
    // We wanna normalize it to "0.1% screen in 1 interval" as threshold
    let isAboveThreshold = Math.abs(speed) > (this.getDiagonal() * 0.001);

    if (isAboveThreshold) {
      this.trackEnergyTime();
      this.blobEnergyState = blobEnergyStates.INCREASING;
    } else if (this.blobEnergyState !== blobEnergyStates.DECREASING) {
      this.trackEnergyTime();
      this.blobEnergyState = blobEnergyStates.DECREASING;
    }
  }

  energize() {
    switch (this.blobEnergyState) {
      case blobEnergyStates.INCREASING:
        this.increaseEnergy();
        break;

      case blobEnergyStates.DECREASING:
        this.reduceEnergy();
        break;

      default:
        return;
    }
  }

  reduceEnergy() {
    if (this.blobEnergyState === blobEnergyStates.REST) {
      return;
    }

    if (this.thetaDelta === this.getBaseThetaDelta() || this.currentThetaFraction < 0) {
      this.blobEnergyState = blobEnergyStates.REST;
    }

    this.currentThetaFraction = this.clampTimeFraction(this.lastThetaFraction - this.getEnergyThetaFraction());
    this.thetaDelta = this.getMultiplierToThetaDelta(this.getMultiplierFromInterpolator(this.currentThetaFraction));
  }

  increaseEnergy() {
    if (this.blobEnergyState === blobEnergyStates.MAXIMUM) {
      return;
    }

    if (this.currentThetaFraction === 1) {
      this.blobEnergyState = blobEnergyStates.MAXIMUM;
    }


    this.currentThetaFraction = this.clampTimeFraction(this.lastThetaFraction + this.getEnergyThetaFraction());
    this.thetaDelta = this.getMultiplierToThetaDelta(this.getMultiplierFromInterpolator(this.currentThetaFraction));
  }
}

const blob = new Blob(10, Math.PI / 2, Math.PI / 2);

function commitResize() {
  blob.updateValues();
  anchorResizeToken = null;
}

function loop() {
  blob.energize();
  blob.animate();
  blob.update();
  window.requestAnimationFrame(loop);
}

// Repeat the animation frames
loop();

// array of xy coords, closed boolean
function bezierSkin(bez, closed = true) {
  const avg = calcAvgs(bez);
  const leng = bez.length;

  if (closed) {
    ctx.moveTo(avg[0], avg[1]);

    for (let i = 2; i < leng; i += 2) {
      let n = i + 1;
      ctx.quadraticCurveTo(bez[i], bez[n], avg[i], avg[n]);
    }

    ctx.quadraticCurveTo(bez[0], bez[1], avg[0], avg[1]);
  } else {
    ctx.moveTo(bez[0], bez[1]);
    ctx.lineTo(avg[0], avg[1]);

    for (let i = 2; i < leng - 2; i += 2) {
      let n = i + 1;
      ctx.quadraticCurveTo(bez[i], bez[n], avg[i], avg[n]);
    }

    ctx.lineTo(bez[leng - 2], bez[leng - 1]);
  }
}

// create anchor points by averaging the control points
function calcAvgs(p) {
  const avg = [];
  const leng = p.length;
  let prev;

  for (let i = 2; i < leng; i++) {
    prev = i - 2;
    avg.push((p[prev] + p[i]) / 2);
  }

  // close
  avg.push((p[0] + p[leng - 2]) / 2, (p[1] + p[leng - 1]) / 2);
  return avg;
}

export function getBlob() {
  return blob;
}

/* ----------- Attach Listeners ----------- */

window.addEventListener("resize", function (event) {
  if (window.innerWidth < widthBreakPoint) {
    return;
  }

  if (anchorResizeToken != null) {
    clearTimeout(anchorResizeToken);
  }

  anchorResizeToken = setTimeout(commitResize, 200);
}, false);

/* ----------- Attach Mouse Reaction ----------- */
var lastEvent, currentEvent;

document.onmousemove = function (event) {
  currentEvent = event || window.event;
}

// Should be about 60fps
setInterval(motionReactiveHook, reactivePollInterval);

function motionReactiveHook() {
  var speed = 0;

  // If we have information for two intances to diff, proceed.
  if (lastEvent && currentEvent) {
    var movementX = Math.abs(currentEvent.screenX - lastEvent.screenX);
    var movementY = Math.abs(currentEvent.screenY - lastEvent.screenY);
    var movement = Math.hypot(movementX, movementY);

    speed = movement / reactivePollInterval;

    blob.reactivePx(speed);
  }

  lastEvent = currentEvent;
}

