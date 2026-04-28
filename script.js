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
      // Density ~ area / 14000, clamped
      const target = Math.max(60, Math.min(160, Math.floor((W * H) / 14000)));
      population = target;
      agents.length = 0;
      for (let i = 0; i < target; i++) {
        agents.push(makeAgent());
      }
    }

    function makeAgent() {
      const tint = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.25 + Math.random() * 0.55;
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 0.8 + Math.random() * 1.6,
        tint,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.004 + Math.random() * 0.01,
      };
    }

    // Boids-ish parameters
    const NEIGHBOR_R = 110;
    const SEPARATE_R = 28;
    const MAX_SPEED  = 0.85;
    const MAX_FORCE  = 0.012;

    function step() {
      // soft trail fade for bloom feel
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // First pass: physics and connections
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
            // Connection line (only on closer threshold to keep it subtle)
            if (d < 92 && j > i) {
              const alpha = (1 - d / 92) * 0.18;
              const t = a.tint;
              ctx.strokeStyle = `rgba(${t[0]},${t[1]},${t[2]},${alpha})`;
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
            alignX += b.vx; alignY += b.vy;
            cohX   += b.x;  cohY   += b.y;
            nCount++;
            if (d < SEPARATE_R) {
              sepX -= dx / d; sepY -= dy / d;
              sCount++;
            }
          }
        }

        // Steering forces
        if (nCount > 0) {
          alignX /= nCount; alignY /= nCount;
          a.vx += clamp((alignX - a.vx) * 0.05, -MAX_FORCE, MAX_FORCE);
          a.vy += clamp((alignY - a.vy) * 0.05, -MAX_FORCE, MAX_FORCE);

          cohX = cohX / nCount - a.x;
          cohY = cohY / nCount - a.y;
          a.vx += clamp(cohX * 0.0006, -MAX_FORCE, MAX_FORCE);
          a.vy += clamp(cohY * 0.0006, -MAX_FORCE, MAX_FORCE);
        }
        if (sCount > 0) {
          a.vx += clamp(sepX * 0.04, -MAX_FORCE * 4, MAX_FORCE * 4);
          a.vy += clamp(sepY * 0.04, -MAX_FORCE * 4, MAX_FORCE * 4);
        }

        // Pointer interaction — gentle attraction with halo repulsion
        if (pointer.active) {
          const px = pointer.x - a.x;
          const py = pointer.y - a.y;
          const pd2 = px * px + py * py;
          const pd = Math.sqrt(pd2) || 0.0001;
          if (pd < 220) {
            const f = (1 - pd / 220);
            // attract from afar, repel up close
            const sign = pd < 60 ? -1 : 0.6;
            a.vx += (px / pd) * f * sign * 0.04;
            a.vy += (py / pd) * f * sign * 0.04;
          }
        }

        // Slow drift toward center to avoid escaping
        a.vx += ((W * 0.5 - a.x) / W) * 0.0008;
        a.vy += ((H * 0.5 - a.y) / H) * 0.0008;

        // Limit speed
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > MAX_SPEED) {
          a.vx = (a.vx / sp) * MAX_SPEED;
          a.vy = (a.vy / sp) * MAX_SPEED;
        }

        a.x += a.vx;
        a.y += a.vy;

        // Wrap edges
        if (a.x < -10) a.x = W + 10;
        if (a.x > W + 10) a.x = -10;
        if (a.y < -10) a.y = H + 10;
        if (a.y > H + 10) a.y = -10;

        a.phase += a.phaseSpeed;
      }

      // Second pass: glowing cores
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        const pulse = 0.6 + Math.sin(a.phase) * 0.4;
        const t = a.tint;

        // soft halo
        const haloR = a.r * 6 * pulse;
        const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, haloR);
        grad.addColorStop(0,   `rgba(${t[0]},${t[1]},${t[2]},0.42)`);
        grad.addColorStop(0.4, `rgba(${t[0]},${t[1]},${t[2]},0.10)`);
        grad.addColorStop(1,   `rgba(${t[0]},${t[1]},${t[2]},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(a.x, a.y, haloR, 0, Math.PI * 2);
        ctx.fill();

        // bright core
        ctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},0.95)`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';

      if (!reduceMotion) {
        rafId = requestAnimationFrame(step);
      }
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
