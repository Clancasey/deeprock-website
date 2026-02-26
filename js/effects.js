/**
 * Shared background effects: reactive grid parallax + starfield/comets canvas.
 * Call initEffects() once the DOM is ready.
 */
function initEffects() {
  // ─── REACTIVE GRID PARALLAX ────────────────────
  const gridFine   = document.getElementById('grid-fine');
  const gridCoarse = document.getElementById('grid-coarse');

  let mouseX = 0, mouseY = 0;
  let curFineX = 0, curFineY = 0;
  let curCoarseX = 0, curCoarseY = 0;
  let rafGrid = null;

  const MAX_SHIFT = 60;
  const LERP = 0.06;

  document.addEventListener('mousemove', e => {
    mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    if (!rafGrid) rafGrid = requestAnimationFrame(tickGrid);
  });

  function tickGrid() {
    rafGrid = null;
    curFineX   += (mouseX * MAX_SHIFT        - curFineX)   * LERP;
    curFineY   += (mouseY * MAX_SHIFT        - curFineY)   * LERP;
    curCoarseX += (mouseX * MAX_SHIFT * 0.4  - curCoarseX) * LERP;
    curCoarseY += (mouseY * MAX_SHIFT * 0.4  - curCoarseY) * LERP;

    gridFine.style.transform   = `translate(${curFineX.toFixed(2)}px, ${curFineY.toFixed(2)}px)`;
    gridCoarse.style.transform = `translate(${curCoarseX.toFixed(2)}px, ${curCoarseY.toFixed(2)}px)`;

    const stillMoving =
      Math.abs(mouseX * MAX_SHIFT - curFineX) > 0.05 ||
      Math.abs(mouseY * MAX_SHIFT - curFineY) > 0.05;
    if (stillMoving) rafGrid = requestAnimationFrame(tickGrid);
  }

  // ─── CANVAS: STARS + COMETS ────────────────────
  const canvas = document.getElementById('starfield');
  const ctx    = canvas.getContext('2d');

  let W, H, DPR;
  let stars  = [];
  let comets = [];
  let lastTs = null;

  function resize() {
    DPR = window.devicePixelRatio || 1;
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function mkStars(n) {
    stars = Array.from({ length: n }, () => ({
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     Math.random() * 0.9 + 0.2,
      base:  Math.random() * 0.45 + 0.08,
      freq:  Math.random() * 0.6 + 0.2,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  const FADE_DUR = 2.0;  // seconds to fade in / out

  function mkComet() {
    const minDim = Math.min(W, H);
    // Semi-major axis: 20%–70% of screen so some orbits extend off-edge
    const a     = (Math.random() * 0.50 + 0.20) * minDim;
    // Low eccentricity: 0.0–0.25
    const e     = Math.random() * 0.25;
    const b     = a * Math.sqrt(1 - e * e);
    // Random ellipse rotation
    const rot   = Math.random() * Math.PI * 2;
    // Starting true anomaly
    const theta = Math.random() * Math.PI * 2;
    // Angular speed — slower for larger orbits (Kepler-ish)
    const omega = (Math.random() * 0.06 + 0.01) * (minDim / a);
    // CW or CCW
    const dir   = Math.random() < 0.5 ? 1 : -1;
    const tailLen = (Math.random() * 0.06 + 0.04) * minDim;

    return {
      a, b, e, rot, theta,
      omega: omega * dir,
      tailLen,
      life: 0,
      maxLife: Math.random() * 10 + 5,  // 5–15 s before despawn
      trail: [],                          // ring buffer of {x,y}
      x: 0, y: 0,
    };
  }

  function spawnComets(n) {
    comets = Array.from({ length: n }, () => {
      const c = mkComet();
      // Stagger initial lifetimes so they don't all spawn/die together
      c.life = Math.random() * (c.maxLife - FADE_DUR * 2);
      return c;
    });
  }

  function draw(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs   = ts;
    const t  = ts / 1000;

    ctx.clearRect(0, 0, W, H);

    stars.forEach(s => {
      const alpha = s.base * (0.5 + 0.5 * Math.sin(2 * Math.PI * s.freq * t + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,245,220,${alpha.toFixed(3)})`;
      ctx.fill();
    });

    const cx = W / 2;
    const cy = H / 2;

    comets.forEach((c, i) => {
      c.life += dt;

      // Lifecycle opacity: fade in, hold, fade out
      const remaining = c.maxLife - c.life;
      const op = c.life < FADE_DUR ? c.life / FADE_DUR
               : remaining < FADE_DUR ? remaining / FADE_DUR
               : 1;

      // Respawn when lifetime expires
      if (c.life >= c.maxLife) {
        comets[i] = mkComet();
        return;
      }

      // Advance orbital angle
      c.theta += c.omega * dt;

      // Position on rotated ellipse centered on screen
      const cosR = Math.cos(c.rot);
      const sinR = Math.sin(c.rot);
      const ex   = c.a * Math.cos(c.theta);
      const ey   = c.b * Math.sin(c.theta);
      c.x = cx + ex * cosR - ey * sinR;
      c.y = cy + ex * sinR + ey * cosR;

      // Record trail point
      c.trail.push({ x: c.x, y: c.y });

      // Trim trail to tailLen by walking backwards through accumulated distance
      let dist = 0;
      let keep = c.trail.length - 1;
      for (let j = c.trail.length - 1; j > 0; j--) {
        const dx = c.trail[j].x - c.trail[j - 1].x;
        const dy = c.trail[j].y - c.trail[j - 1].y;
        dist += Math.sqrt(dx * dx + dy * dy);
        if (dist >= c.tailLen) { keep = j; break; }
        keep = j - 1;
      }
      if (keep > 0) c.trail.splice(0, keep);

      // Draw curved tail as segments with tapering opacity and width
      const len = c.trail.length;
      if (len >= 2) {
        for (let j = len - 1; j > 0; j--) {
          const frac  = (len - 1 - j) / (len - 1);   // 0 at head, 1 at tail
          const segOp = op * (1 - frac);
          const width = 1.4 * (1 - frac * 0.7);

          // Color shifts from warm white → gold → amber → transparent
          const r = Math.round(255 - frac * 75);
          const g = Math.round(230 - frac * 130);
          const b = Math.round(160 - frac * 150);

          ctx.beginPath();
          ctx.moveTo(c.trail[j].x, c.trail[j].y);
          ctx.lineTo(c.trail[j - 1].x, c.trail[j - 1].y);
          ctx.strokeStyle = `rgba(${r},${g},${b},${(segOp * 0.8).toFixed(3)})`;
          ctx.lineWidth   = width;
          ctx.stroke();
        }
      }

      // Head glow
      const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 3.5);
      glow.addColorStop(0, `rgba(255,240,180,${op.toFixed(3)})`);
      glow.addColorStop(1, `rgba(232,160,32,0)`);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  resize();
  mkStars(300);
  spawnComets(7);
  requestAnimationFrame(draw);

  window.addEventListener('resize', () => {
    resize();
    mkStars(300);
    spawnComets(7);
  });
}
