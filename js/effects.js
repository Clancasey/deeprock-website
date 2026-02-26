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

  const MAX_SHIFT = 14;
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

  function mkComet() {
    const angle   = Math.random() * Math.PI * 2;
    const speed   = Math.random() * 27 + 18;
    const vx      = Math.cos(angle) * speed;
    const vy      = Math.sin(angle) * speed;
    const tailLen = (Math.random() * 0.06 + 0.04) * Math.min(W, H);
    const pad     = tailLen + 20;

    let x, y;
    if (Math.abs(vx) >= Math.abs(vy)) {
      x = vx > 0 ? -pad : W + pad;
      y = Math.random() * H;
    } else {
      x = Math.random() * W;
      y = vy > 0 ? -pad : H + pad;
    }

    return { x, y, vx, vy, tailLen, life: 0, maxLife: Math.random() * 12 + 10 };
  }

  function spawnComets(n) {
    comets = Array.from({ length: n }, () => {
      const c = mkComet();
      c.life  = Math.random() * c.maxLife;
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

    comets.forEach((c, i) => {
      c.life += dt;
      c.x    += c.vx * dt;
      c.y    += c.vy * dt;

      const prog = c.life / c.maxLife;
      const op   = prog < 0.08 ? prog / 0.08
                 : prog > 0.90 ? (1 - prog) / 0.10
                 : 1;

      const spd = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
      const nx  = c.vx / spd;
      const ny  = c.vy / spd;
      const tx  = c.x - nx * c.tailLen;
      const ty  = c.y - ny * c.tailLen;

      const grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
      grad.addColorStop(0,    `rgba(255,230,160,${(op * 0.80).toFixed(3)})`);
      grad.addColorStop(0.35, `rgba(232,160,32,${(op * 0.35).toFixed(3)})`);
      grad.addColorStop(1,    `rgba(180,100,10,0)`);

      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = grad;
      ctx.lineWidth   = 1.2;
      ctx.stroke();

      const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 3.5);
      glow.addColorStop(0, `rgba(255,240,180,${op.toFixed(3)})`);
      glow.addColorStop(1, `rgba(232,160,32,0)`);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      const pad = c.tailLen + 30;
      if (c.life >= c.maxLife || c.x < -pad || c.x > W + pad || c.y < -pad || c.y > H + pad) {
        comets[i] = mkComet();
      }
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
