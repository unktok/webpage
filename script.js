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
    const signals = [];
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
      // Digital octopus colony — quiet enough to keep the typography readable.
      const target = Math.max(10, Math.min(24, Math.floor((W * H) / 60000)));
      population = target;
      agents.length = 0;
      for (let i = 0; i < target; i++) {
        agents.push(makeAgent());
      }

      const signalTarget = Math.max(28, Math.min(80, Math.floor((W * H) / 17000)));
      signals.length = 0;
      for (let i = 0; i < signalTarget; i++) {
        signals.push(makeSignal(true));
      }
    }

    const TENTACLES_PER_AGENT = 8;        // real octopus arm count
    const SEGMENTS_PER_TENTACLE = 9;
    const BIT_GRID = 4;

    function makeAgent() {
      const tint = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.10 + Math.random() * 0.22;
      let x = Math.random() * W;
      let y = Math.random() * H;
      for (let attempt = 0; attempt < 8 && isInReadabilityZone(x, y); attempt++) {
        x = Math.random() * W;
        y = Math.random() * H;
      }
      if (isInReadabilityZone(x, y)) {
        y = Math.random() > 0.5 ? H + 40 : -40;
      }
      const size = 7.0 + Math.random() * 4.5;          // big, dominant glowing mantle
      const glyphSeed = Math.random() * Math.PI * 2;

      const tentacles = [];
      for (let i = 0; i < TENTACLES_PER_AGENT; i++) {
        // Each arm has its own personality: independent curl direction & strength,
        // independent wobble phase/speed, independent length. Real octopus arms
        // each move on their own.
        const curlSign = Math.random() < 0.5 ? -1 : 1;
        // Spread radially with some jitter — not a perfectly even fan
        const radialAngle = ((i + 0.5) / TENTACLES_PER_AGENT) * Math.PI * 2
                          + (Math.random() - 0.5) * 0.35;
        tentacles.push({
          idx: i,
          radialAngle,                               // body-local rest direction
          phase: Math.random() * Math.PI * 2,
          curl: curlSign * (0.08 + Math.random() * 0.18),
          wobble: 0.10 + Math.random() * 0.10,
          waveSpeed: 0.03 + Math.random() * 0.045,    // wide variance prevents arms from syncing
          waveStep: 0.55 + Math.random() * 0.45,
          segLen: 6.5 + Math.random() * 4.5,
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
        glyphSeed,
        packetPhase: Math.random() * 1,
        nodeCount: 7 + Math.floor(Math.random() * 5),
      };

      // Seed each segment along its tentacle's rest curve so the first frame
      // doesn't whip from (0,0).
      for (let i = 0; i < tentacles.length; i++) {
        const t = tentacles[i];
        let restAngle = agent.heading + t.radialAngle;
        let pX = x, pY = y;
        for (let j = 0; j < SEGMENTS_PER_TENTACLE; j++) {
          restAngle += t.curl;
          const len = t.segLen * (1 - j * 0.05);
          pX += Math.cos(restAngle) * len;
          pY += Math.sin(restAngle) * len;
          t.segments[j] = { x: pX, y: pY };
        }
      }

      return agent;
    }

    function makeSignal(randomizeAge = false) {
      const tint = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const horizontal = Math.random() > 0.5;
      const speed = (0.18 + Math.random() * 0.42) * (Math.random() > 0.5 ? 1 : -1);
      const maxLife = 140 + Math.random() * 220;
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: horizontal ? speed : 0,
        vy: horizontal ? 0 : speed,
        tint,
        size: 1 + Math.random() * 2.2,
        age: randomizeAge ? Math.random() * maxLife : 0,
        maxLife,
        horizontal,
      };
    }

    // Flocking parameters — octopuses are mostly solitary; we keep them dispersed
    const NEIGHBOR_R = 200;
    const SEPARATE_R = 150;      // wide personal-space radius matched to bigger bodies
    const MAX_SPEED  = 0.55;
    const MAX_FORCE  = 0.008;

    let frame = 0;

    function step() {
      frame++;

      // Soft trail fade — the ink-cloud feel. High enough to clear motion streaks,
      // low enough to leave a faint luminous afterimage.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      drawSignalField();

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
          a.vx += clamp((alignX - a.vx) * 0.02, -MAX_FORCE, MAX_FORCE);
          a.vy += clamp((alignY - a.vy) * 0.02, -MAX_FORCE, MAX_FORCE);

          // Cohesion is intentionally very weak so they don't clump up
          cohX = cohX / nCount - a.x;
          cohY = cohY / nCount - a.y;
          a.vx += clamp(cohX * 0.00015, -MAX_FORCE, MAX_FORCE);
          a.vy += clamp(cohY * 0.00015, -MAX_FORCE, MAX_FORCE);
        }
        if (sCount > 0) {
          // Strong separation pushes them apart firmly
          a.vx += clamp(sepX * 0.08, -MAX_FORCE * 6, MAX_FORCE * 6);
          a.vy += clamp(sepY * 0.08, -MAX_FORCE * 6, MAX_FORCE * 6);
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

        applyReadabilityAvoidance(a);

        // Very gentle drift toward center — just enough to keep them on screen,
        // not enough to pull them into a clump.
        a.vx += ((W * 0.5 - a.x) / W) * 0.00025;
        a.vy += ((H * 0.5 - a.y) / H) * 0.00025;

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

      // ---- Render: mesh -> halos -> tentacles -> mantles ----
      drawNetworkLinks();
      for (let i = 0; i < agents.length; i++) {
        if (isInReadabilityZone(agents[i].x, agents[i].y)) continue;
        drawHalo(agents[i]);
      }
      for (let i = 0; i < agents.length; i++) {
        if (isInReadabilityZone(agents[i].x, agents[i].y)) continue;
        drawTentacles(agents[i], frame);
      }
      // Mantles drawn in normal compositing so they read as defined silhouettes
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < agents.length; i++) {
        if (isInReadabilityZone(agents[i].x, agents[i].y)) continue;
        drawMantle(agents[i], frame);
      }

      if (!reduceMotion) {
        rafId = requestAnimationFrame(step);
      }
    }

    function applyReadabilityAvoidance(a) {
      const zoneRight = W < 700 ? W + 90 : Math.min(W * 0.72, 900);
      const zoneTop = W < 700 ? H * 0.10 : H * 0.18;
      const zoneBottom = W < 700 ? Math.min(H * 0.98, 840) : Math.min(H * 0.82, 820);

      if (a.x > zoneRight || a.y < zoneTop || a.y > zoneBottom) return;

      const cx = zoneRight * 0.48;
      const cy = (zoneTop + zoneBottom) * 0.5;
      const dx = a.x - cx;
      const dy = a.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const pressure = Math.min(1, (zoneRight - a.x) / zoneRight + 0.25);

      a.vx += (dx / d) * pressure * 0.018 + 0.012;
      a.vy += (dy / d) * pressure * 0.010;
    }

    function isInReadabilityZone(x, y) {
      const zoneRight = W < 700 ? W + 90 : Math.min(W * 0.72, 900);
      const zoneTop = W < 700 ? H * 0.10 : H * 0.18;
      const zoneBottom = W < 700 ? Math.min(H * 0.98, 840) : Math.min(H * 0.82, 820);
      return x <= zoneRight && y >= zoneTop && y <= zoneBottom;
    }

    function drawSignalField() {
      for (let i = 0; i < signals.length; i++) {
        const s = signals[i];
        s.x += s.vx;
        s.y += s.vy;
        s.age++;

        if (s.x < -24 || s.x > W + 24 || s.y < -24 || s.y > H + 24 || s.age > s.maxLife) {
          signals[i] = makeSignal(false);
          if (signals[i].horizontal) {
            signals[i].x = signals[i].vx > 0 ? -18 : W + 18;
            signals[i].y = Math.round(Math.random() * H / 22) * 22;
          } else {
            signals[i].x = Math.round(Math.random() * W / 22) * 22;
            signals[i].y = signals[i].vy > 0 ? -18 : H + 18;
          }
          continue;
        }

        const t = s.tint;
        const fade = Math.sin((s.age / s.maxLife) * Math.PI);
        const alpha = 0.07 + fade * 0.18;
        ctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${alpha})`;
        ctx.strokeStyle = `rgba(${t[0]},${t[1]},${t[2]},${alpha * 0.55})`;
        ctx.lineWidth = 1;

        const len = 14 + s.size * 8;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - Math.sign(s.vx) * len, s.y - Math.sign(s.vy) * len);
        ctx.stroke();

        ctx.fillRect(Math.round(s.x) - s.size, Math.round(s.y) - s.size, s.size * 2, s.size * 2);

        if (frame % 3 === 0) {
          const tailX = s.x - (s.horizontal ? Math.sign(s.vx) : 0) * (10 + s.size * 5);
          const tailY = s.y - (s.horizontal ? 0 : Math.sign(s.vy)) * (10 + s.size * 5);
          drawBitSquare(tailX, tailY, 2 + s.size, `rgba(${t[0]},${t[1]},${t[2]},${alpha * 0.9})`);
        }
      }
    }

    function drawNetworkLinks() {
      const linkR = 245;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1;

      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (isInReadabilityZone(a.x, a.y)) continue;
        for (let j = i + 1; j < agents.length; j++) {
          const b = agents[j];
          if (isInReadabilityZone(b.x, b.y)) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > linkR) continue;

          const alpha = Math.pow(1 - d / linkR, 1.8) * 0.20;
          const pulse = (Math.sin(frame * 0.035 + i * 1.7 + j) + 1) * 0.5;
          const mx = a.x + dx * pulse;
          const my = a.y + dy * pulse;

          ctx.strokeStyle = `rgba(127,255,225,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          ctx.fillStyle = `rgba(246,200,122,${alpha * 1.8})`;
          ctx.fillRect(Math.round(mx) - 1.5, Math.round(my) - 1.5, 3, 3);
        }
      }
      ctx.restore();
    }

    function snapTentaclesToRest(a) {
      for (let i = 0; i < a.tentacles.length; i++) {
        const t = a.tentacles[i];
        let restAngle = a.heading + t.radialAngle;
        let pX = a.x, pY = a.y;
        for (let j = 0; j < t.segments.length; j++) {
          restAngle += t.curl;
          const len = t.segLen * (1 - j * 0.05);
          pX += Math.cos(restAngle) * len;
          pY += Math.sin(restAngle) * len;
          t.segments[j].x = pX;
          t.segments[j].y = pY;
        }
      }
    }

    function updateTentacles(a, frame) {
      // Tentacle bases all anchor at the body center — emerging from beneath
      // the mantle in all radial directions, like a real octopus.
      // Body motion + chain spring-lag naturally streams them backwards.
      const baseX = a.x;
      const baseY = a.y;

      for (let i = 0; i < a.tentacles.length; i++) {
        const t = a.tentacles[i];

        let parentX = baseX;
        let parentY = baseY;
        let restAngle = a.heading + t.radialAngle;

        for (let j = 0; j < t.segments.length; j++) {
          restAngle += t.curl;
          const wave = Math.sin(frame * t.waveSpeed + t.phase - j * t.waveStep) * t.wobble;
          const segDir = restAngle + wave;
          const len = t.segLen * (1 - j * 0.05);
          const tx = parentX + Math.cos(segDir) * len;
          const ty = parentY + Math.sin(segDir) * len;

          const seg = t.segments[j];
          // Lower stiffness on outer segments — tips swing more, base is stable.
          // Looks much more organic and gives each arm its own inertia.
          const stiffness = 0.40 - j * 0.025;
          seg.x += (tx - seg.x) * stiffness;
          seg.y += (ty - seg.y) * stiffness;
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

    function drawTentacles(a, frame) {
      const t = a.tint;
      const pulse = 0.55 + Math.sin(a.pulse) * 0.35;

      const baseX = a.x;
      const baseY = a.y;

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
          // Width: muscular thick base tapering to a hairline tip — non-linear
          // taper so the base reads as a proper tentacle attachment
          const w = 3.6 * Math.pow(1 - u, 1.4) + 0.35;
          // Opacity: fade out toward tip
          const alphaCore  = (0.62 - 0.50 * u) * pulse + 0.06;
          const alphaUnder = (0.20 - 0.16 * u) * pulse + 0.03;

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

          const packet = (frame * 0.035 + a.packetPhase + i * 0.17 + j / N) % 1;
          if (Math.abs(packet - (j / N)) < 0.045) {
            const q = 0.64 + Math.sin(frame * 0.12 + j) * 0.16;
            ctx.fillStyle = `rgba(255,255,255,${0.28 * q})`;
            ctx.fillRect(Math.round(toX) - 1.5, Math.round(toY) - 1.5, 3, 3);
          }

          if ((j + i + frame) % 16 === 0) {
            ctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${0.22 * pulse})`;
            ctx.fillRect(Math.round(toX) - 1, Math.round(toY) - 1, 2, 2);
          }

          const bitCount = j < 4 ? 3 : 2;
          for (let k = 0; k < bitCount; k++) {
            const f = (k + 1) / (bitCount + 1);
            const bx = fromX + (toX - fromX) * f;
            const by = fromY + (toY - fromY) * f;
            const noise = bitNoise(a.glyphSeed, i * 31 + j * 7 + k, frame);
            if (noise < 0.34 + u * 0.24) continue;

            const bitSize = Math.max(2, Math.round((4.8 - u * 2.8) + noise * 2));
            const bitAlpha = (0.18 + noise * 0.26) * (1 - u * 0.45) * pulse;
            drawBitSquare(
              bx + (noise - 0.5) * 5,
              by + Math.sin(frame * 0.06 + k + i) * 2,
              bitSize,
              `rgba(${t[0]},${t[1]},${t[2]},${bitAlpha})`
            );
          }
        }
      }
    }

    function drawMantle(a, frame) {
      const t = a.tint;
      const pulse = 0.65 + Math.sin(a.pulse) * 0.35;
      const R = a.size * 2.3;

      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.heading);

      // Soft luminous gel — radial gradient instead of a hard disc edge.
      // The body fades to transparent at the rim, reading as an organic
      // bioluminescent orb rather than a geometric circle.
      const body = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      body.addColorStop(0,    `rgba(${t[0]},${t[1]},${t[2]},${0.95 * pulse + 0.20})`);
      body.addColorStop(0.55, `rgba(${t[0]},${t[1]},${t[2]},${0.70 * pulse + 0.16})`);
      body.addColorStop(0.85, `rgba(${t[0]},${t[1]},${t[2]},${0.22 * pulse + 0.05})`);
      body.addColorStop(1,    `rgba(${t[0]},${t[1]},${t[2]},0)`);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();

      // Synthetic membrane: angular scan geometry over the soft body.
      ctx.globalCompositeOperation = 'lighter';
      drawBitMembrane(a, R, t, pulse, frame);

      ctx.strokeStyle = `rgba(${t[0]},${t[1]},${t[2]},${0.36 * pulse})`;
      ctx.lineWidth = 1;
      drawPolygon(0, 0, R * 0.86, 7, a.glyphSeed + frame * 0.002);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255,255,255,${0.13 * pulse})`;
      ctx.beginPath();
      ctx.moveTo(-R * 0.62, 0);
      ctx.lineTo(R * 0.62, 0);
      ctx.moveTo(0, -R * 0.62);
      ctx.lineTo(0, R * 0.62);
      ctx.stroke();

      for (let i = 0; i < a.nodeCount; i++) {
        const u = i / a.nodeCount;
        const angle = u * Math.PI * 2 + a.glyphSeed + Math.sin(frame * 0.01 + i) * 0.08;
        const nr = R * (0.52 + 0.22 * Math.sin(frame * 0.017 + i * 1.9));
        const nx = Math.cos(angle) * nr;
        const ny = Math.sin(angle) * nr;
        ctx.fillStyle = `rgba(255,255,255,${0.18 + 0.18 * pulse})`;
        ctx.fillRect(Math.round(nx) - 1.2, Math.round(ny) - 1.2, 2.4, 2.4);
      }

      // Off-axis sheen — small wet highlight, not centered (avoids the
      // perfectly symmetric "CSS dot" feel)
      const sheen = ctx.createRadialGradient(R * 0.38, -R * 0.42, 0, R * 0.38, -R * 0.42, R * 0.85);
      sheen.addColorStop(0,    `rgba(255, 255, 255, ${0.32 * pulse})`);
      sheen.addColorStop(0.45, `rgba(255, 255, 255, 0)`);
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    function drawBitMembrane(a, R, t, pulse, frame) {
      for (let i = 0; i < 28; i++) {
        const noise = bitNoise(a.glyphSeed, i * 13, frame);
        const angle = a.glyphSeed + i * 2.399 + Math.sin(frame * 0.011 + i) * 0.12;
        const radius = R * (0.34 + noise * 0.72);
        const bx = Math.cos(angle) * radius;
        const by = Math.sin(angle) * radius;
        const size = 2 + Math.round(noise * 5);
        const alpha = (0.14 + noise * 0.34) * pulse;
        drawBitSquare(bx, by, size, `rgba(${t[0]},${t[1]},${t[2]},${alpha})`);
      }

      for (let i = 0; i < 18; i++) {
        const angle = a.glyphSeed + frame * 0.003 + (i / 18) * Math.PI * 2;
        const flicker = bitNoise(a.glyphSeed, i * 29 + 100, frame);
        const radius = R * (0.82 + flicker * 0.42);
        const size = 2 + Math.round(flicker * 4);
        drawBitSquare(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          size,
          `rgba(255,255,255,${0.08 + flicker * 0.22})`
        );
      }
    }

    function drawPolygon(x, y, radius, sides, rotation = 0) {
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = rotation + (i / sides) * Math.PI * 2;
        const px = x + Math.cos(a) * radius;
        const py = y + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }

    function drawBitSquare(x, y, size, fillStyle) {
      const s = Math.max(1, Math.round(size));
      const px = Math.round(x / BIT_GRID) * BIT_GRID;
      const py = Math.round(y / BIT_GRID) * BIT_GRID;
      ctx.fillStyle = fillStyle;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }

    function bitNoise(seed, index, frame) {
      const pulseFrame = Math.floor(frame / 7);
      const v = Math.sin(seed * 997 + index * 131.7 + pulseFrame * 0.73) * 43758.5453;
      return v - Math.floor(v);
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
