/* =====================================================================
   Unktok — Living interface
   - Artificial-life canvas (boids-ish flocking + emergent network)
   - Headline mask reveal
   - Magnetic CTA buttons
   - Glass popups
   ===================================================================== */

(() => {
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initLifeCanvas();
    initHeadline();
    initMagneticButtons();
    initPopups();
  }

  /* ----------------------------------------------------------------- */
  /*  Artificial-life canvas                                           */
  /* ----------------------------------------------------------------- */

  function initLifeCanvas() {
    const canvas = document.getElementById('life-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    // Population scales with viewport
    const agents = [];
    let population = 0;

    const PALETTE = [
      [127, 255, 225],   // bio-cyan
      [184, 157, 255],   // bio-violet
      [246, 200, 122],   // bio-amber
      [255, 158, 199],   // bio-rose
    ];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      // Cephalopod colony — sparser than the previous swarm so each entity has room to breathe
      const target = Math.max(28, Math.min(70, Math.floor((W * H) / 26000)));
      population = target;
      agents.length = 0;
      for (let i = 0; i < target; i++) {
        agents.push(makeAgent());
      }
    }

    const TENTACLES_PER_AGENT = 6;
    const SEGMENTS_PER_TENTACLE = 8;

    // Tentacles fan in a narrow arc behind the body — squid/octopus tail vibe
    const TENTACLE_ARC = Math.PI * 0.85;

    function makeAgent() {
      const tint = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.14 + Math.random() * 0.28;
      const x = Math.random() * W;
      const y = Math.random() * H;
      const size = 4.2 + Math.random() * 2.4;          // larger mantle so body reads clearly

      const tentacles = [];
      for (let i = 0; i < TENTACLES_PER_AGENT; i++) {
        // Stronger curl so tentacles visibly arc instead of looking like petals
        const curlSign = Math.random() < 0.5 ? -1 : 1;
        tentacles.push({
          idx: i,
          phase: Math.random() * Math.PI * 2,
          curl: curlSign * (0.05 + Math.random() * 0.12),
          wobble: 0.10 + Math.random() * 0.07,
          waveSpeed: 0.04 + Math.random() * 0.02,
          waveStep: 0.65 + Math.random() * 0.25,
          segLen: 5.5 + Math.random() * 3.5,             // varied length per tentacle
          segments: new Array(SEGMENTS_PER_TENTACLE),
        });
      }

      const agent = {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        tint,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.004 + Math.random() * 0.008,
        heading: angle,
        tentacles,
      };

      // Seed each segment along its tentacle's rest curve so we don't
      // get a whip-streak from (0,0) on the first frame.
      const back = agent.heading + Math.PI;
      const baseX = x + Math.cos(back) * size * 1.15;
      const baseY = y + Math.sin(back) * size * 1.15;
      for (let i = 0; i < tentacles.length; i++) {
        const t = tentacles[i];
        const fanOffset = ((t.idx + 0.5) / tentacles.length - 0.5) * TENTACLE_ARC;
        let restAngle = back + fanOffset;
        let pX = baseX, pY = baseY;
        for (let j = 0; j < SEGMENTS_PER_TENTACLE; j++) {
          restAngle += t.curl;
          const len = t.segLen * (1 - j * 0.06);
          pX += Math.cos(restAngle) * len;
          pY += Math.sin(restAngle) * len;
          t.segments[j] = { x: pX, y: pY };
        }
      }

      return agent;
    }

    // Flocking parameters
    const NEIGHBOR_R = 130;
    const SEPARATE_R = 56;       // octopuses keep more distance — tentacles need space
    const MAX_SPEED  = 0.65;
    const MAX_FORCE  = 0.010;

    let frame = 0;

    function step() {
      frame++;

      // Soft trail fade — the ink-cloud feel. High enough to clear motion streaks,
      // low enough to leave a faint luminous afterimage.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // ---- Physics (boids-style flocking) ----
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        let alignX = 0, alignY = 0;
        let cohX = 0, cohY = 0;
        let sepX = 0, sepY = 0;
        let nCount = 0, sCount = 0;

        for (let j = 0; j < agents.length; j++) {
          if (i === j) continue;
          const b = agents[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < NEIGHBOR_R * NEIGHBOR_R) {
            const d = Math.sqrt(d2) || 0.0001;
            alignX += b.vx; alignY += b.vy;
            cohX   += b.x;  cohY   += b.y;
            nCount++;
            if (d < SEPARATE_R) {
              sepX -= dx / d; sepY -= dy / d;
              sCount++;
            }
          }
        }

        if (nCount > 0) {
          alignX /= nCount; alignY /= nCount;
          a.vx += clamp((alignX - a.vx) * 0.04, -MAX_FORCE, MAX_FORCE);
          a.vy += clamp((alignY - a.vy) * 0.04, -MAX_FORCE, MAX_FORCE);

          cohX = cohX / nCount - a.x;
          cohY = cohY / nCount - a.y;
          a.vx += clamp(cohX * 0.0005, -MAX_FORCE, MAX_FORCE);
          a.vy += clamp(cohY * 0.0005, -MAX_FORCE, MAX_FORCE);
        }
        if (sCount > 0) {
          a.vx += clamp(sepX * 0.05, -MAX_FORCE * 5, MAX_FORCE * 5);
          a.vy += clamp(sepY * 0.05, -MAX_FORCE * 5, MAX_FORCE * 5);
        }

        // Pointer — gentle inquisitive approach, halo repulsion if very close
        if (pointer.active) {
          const px = pointer.x - a.x;
          const py = pointer.y - a.y;
          const pd2 = px * px + py * py;
          const pd = Math.sqrt(pd2) || 0.0001;
          if (pd < 240) {
            const f = (1 - pd / 240);
            const sign = pd < 70 ? -1 : 0.55;
            a.vx += (px / pd) * f * sign * 0.035;
            a.vy += (py / pd) * f * sign * 0.035;
          }
        }

        // Drift toward center
        a.vx += ((W * 0.5 - a.x) / W) * 0.0007;
        a.vy += ((H * 0.5 - a.y) / H) * 0.0007;

        const sp = Math.hypot(a.vx, a.vy);
        if (sp > MAX_SPEED) {
          a.vx = (a.vx / sp) * MAX_SPEED;
          a.vy = (a.vy / sp) * MAX_SPEED;
        }

        a.x += a.vx;
        a.y += a.vy;

        // Wrap edges. When wrapping, snap tentacle segments to their rest
        // curve so we don't paint a streak from the old position to the new.
        let wrapped = false;
        if (a.x < -20)     { a.x = W + 20; wrapped = true; }
        if (a.x > W + 20)  { a.x = -20;    wrapped = true; }
        if (a.y < -20)     { a.y = H + 20; wrapped = true; }
        if (a.y > H + 20)  { a.y = -20;    wrapped = true; }
        if (wrapped) snapTentaclesToRest(a);

        a.pulse += a.pulseSpeed;

        // Smooth heading toward velocity (avoids nervous flipping at low speeds)
        const targetHeading = Math.atan2(a.vy, a.vx);
        let dh = targetHeading - a.heading;
        while (dh >  Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        a.heading += dh * 0.08;

        updateTentacles(a, frame);
      }

      // ---- Render: halos -> tentacles -> mantles ----
      for (let i = 0; i < agents.length; i++) {
        drawHalo(agents[i]);
      }
      for (let i = 0; i < agents.length; i++) {
        drawTentacles(agents[i]);
      }
      // Mantles drawn in normal compositing so they read as defined silhouettes
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < agents.length; i++) {
        drawMantle(agents[i]);
      }

      if (!reduceMotion) {
        rafId = requestAnimationFrame(step);
      }
    }

    function snapTentaclesToRest(a) {
      const back = a.heading + Math.PI;
      const baseX = a.x + Math.cos(back) * a.size * 1.15;
      const baseY = a.y + Math.sin(back) * a.size * 1.15;
      for (let i = 0; i < a.tentacles.length; i++) {
        const t = a.tentacles[i];
        const fanOffset = ((t.idx + 0.5) / a.tentacles.length - 0.5) * TENTACLE_ARC;
        let restAngle = back + fanOffset;
        let pX = baseX, pY = baseY;
        for (let j = 0; j < t.segments.length; j++) {
          restAngle += t.curl;
          const len = t.segLen * (1 - j * 0.06);
          pX += Math.cos(restAngle) * len;
          pY += Math.sin(restAngle) * len;
          t.segments[j].x = pX;
          t.segments[j].y = pY;
        }
      }
    }

    function updateTentacles(a, frame) {
      const back = a.heading + Math.PI;
      const baseX = a.x + Math.cos(back) * a.size * 1.15;
      const baseY = a.y + Math.sin(back) * a.size * 1.15;

      for (let i = 0; i < a.tentacles.length; i++) {
        const t = a.tentacles[i];
        const fanOffset = ((t.idx + 0.5) / a.tentacles.length - 0.5) * TENTACLE_ARC;

        let parentX = baseX;
        let parentY = baseY;
        let restAngle = back + fanOffset;

        for (let j = 0; j < t.segments.length; j++) {
          restAngle += t.curl;
          const wave = Math.sin(frame * t.waveSpeed + t.phase - j * t.waveStep) * t.wobble;
          const segDir = restAngle + wave;
          const len = t.segLen * (1 - j * 0.06);
          const tx = parentX + Math.cos(segDir) * len;
          const ty = parentY + Math.sin(segDir) * len;

          const seg = t.segments[j];
          seg.x += (tx - seg.x) * 0.28;
          seg.y += (ty - seg.y) * 0.28;
          parentX = seg.x;
          parentY = seg.y;
        }
      }
    }

    function drawHalo(a) {
      const t = a.tint;
      const pulse = 0.55 + Math.sin(a.pulse) * 0.35;
      const haloR = a.size * 7 * pulse;
      const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, haloR);
      grad.addColorStop(0,    `rgba(${t[0]},${t[1]},${t[2]},0.34)`);
      grad.addColorStop(0.35, `rgba(${t[0]},${t[1]},${t[2]},0.10)`);
      grad.addColorStop(1,    `rgba(${t[0]},${t[1]},${t[2]},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(a.x, a.y, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawTentacles(a) {
      const t = a.tint;
      const pulse = 0.55 + Math.sin(a.pulse) * 0.35;

      const back = a.heading + Math.PI;
      const baseX = a.x + Math.cos(back) * a.size * 1.15;
      const baseY = a.y + Math.sin(back) * a.size * 1.15;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = 0; i < a.tentacles.length; i++) {
        const tent = a.tentacles[i];
        const segs = tent.segments;
        const N = segs.length;

        // Per-segment tapered ribbon: each pair (j -> j+1) drawn with width
        // and opacity that fade toward the tip. Yields a real tentacle taper
        // rather than a uniform stick that looks like a flower petal.
        for (let j = 0; j < N; j++) {
          const fromX = j === 0 ? baseX : segs[j - 1].x;
          const fromY = j === 0 ? baseY : segs[j - 1].y;
          const toX = segs[j].x;
          const toY = segs[j].y;

          // Position along tentacle (0 at base, ~1 at tip)
          const u = j / (N - 1);
          // Width: thick at base, hairline at tip
          const w = 2.4 * (1 - u) + 0.35;
          // Opacity: fade out toward tip
          const alphaCore  = (0.55 - 0.45 * u) * pulse + 0.06;
          const alphaUnder = (0.16 - 0.13 * u) * pulse + 0.03;

          // Underglow
          ctx.strokeStyle = `rgba(${t[0]},${t[1]},${t[2]},${alphaUnder})`;
          ctx.lineWidth = w * 2.6;
          ctx.beginPath();
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(toX, toY);
          ctx.stroke();

          // Core
          ctx.strokeStyle = `rgba(${t[0]},${t[1]},${t[2]},${alphaCore})`;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(toX, toY);
          ctx.stroke();
        }
      }
    }

    function drawMantle(a) {
      const t = a.tint;
      const pulse = 0.65 + Math.sin(a.pulse) * 0.35;
      const R = a.size * 1.55;

      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.heading);

      // Round mantle bulb — bigger, perfectly spherical silhouette
      ctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${0.80 * pulse + 0.18})`;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();

      // Soft sheen on the leading-front quadrant — gives a wet, luminous orb
      // feel without reading as a literal "face" or eyes.
      const grad = ctx.createRadialGradient(R * 0.42, -R * 0.42, 0, R * 0.42, -R * 0.42, R * 0.95);
      grad.addColorStop(0,    `rgba(255, 255, 255, ${0.42 * pulse})`);
      grad.addColorStop(0.45, `rgba(255, 255, 255, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    let rafId = 0;

    function start() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(step);
    }

    // Throttled resize
    let resizeT;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(resize, 120);
    });

    // Pointer
    window.addEventListener('pointermove', (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    });
    window.addEventListener('pointerleave', () => { pointer.active = false; });
    window.addEventListener('blur', () => { pointer.active = false; });

    // Pause when tab hidden to save cycles
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else if (!reduceMotion) {
        start();
      }
    });

    resize();

    if (reduceMotion) {
      // Render a single still frame
      step();
    } else {
      start();
    }

    // Reveal canvas after first frame so there's no flash
    requestAnimationFrame(() => canvas.classList.add('ready'));
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  /* ----------------------------------------------------------------- */
  /*  Headline mask reveal                                             */
  /* ----------------------------------------------------------------- */

  function initHeadline() {
    const h = document.getElementById('headline');
    if (!h) return;
    // Trigger on next frame to ensure font load doesn't cause jump
    requestAnimationFrame(() => {
      requestAnimationFrame(() => h.classList.add('revealed'));
    });
  }

  /* ----------------------------------------------------------------- */
  /*  Magnetic buttons                                                  */
  /* ----------------------------------------------------------------- */

  function initMagneticButtons() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const btns = document.querySelectorAll('.btn, .nav-link.contact');
    btns.forEach((btn) => {
      const strength = 8;
      btn.addEventListener('pointermove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - (rect.left + rect.width / 2);
        const y = e.clientY - (rect.top + rect.height / 2);
        btn.style.transform = `translate(${(x / rect.width) * strength}px, ${(y / rect.height) * strength}px)`;
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.transform = '';
      });
    });
  }

  /* ----------------------------------------------------------------- */
  /*  Popups                                                            */
  /* ----------------------------------------------------------------- */

  function initPopups() {
    const aboutPopup = document.getElementById('about-popup');
    const contactPopup = document.getElementById('contact-popup');

    const openers = [
      ['#about-link',  aboutPopup],
      ['#about-cta',   aboutPopup],
      ['#contact-link', contactPopup],
      ['#contact-cta', contactPopup],
    ];

    openers.forEach(([sel, popup]) => {
      const el = document.querySelector(sel);
      if (el && popup) {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          openPopup(popup);
        });
      }
    });

    document.querySelectorAll('.close').forEach((btn) => {
      btn.addEventListener('click', () => {
        const popup = btn.closest('.popup');
        if (popup) closePopup(popup);
      });
    });

    [aboutPopup, contactPopup].forEach((popup) => {
      if (!popup) return;
      popup.addEventListener('click', (e) => {
        if (e.target === popup) closePopup(popup);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.popup.show').forEach((p) => closePopup(p));
      }
    });
  }

  function openPopup(popup) {
    popup.classList.add('visible');
    requestAnimationFrame(() => popup.classList.add('show'));
    document.body.style.overflow = 'hidden';
  }

  function closePopup(popup) {
    popup.classList.remove('show');
    setTimeout(() => {
      popup.classList.remove('visible');
      document.body.style.overflow = '';
    }, 500);
  }
})();
