/* Streaklines: a set of particles that a velocity field advects. In
   each frame the module adds one thin segment to the path of each
   particle, while the engine fades the canvas.

   A particle ends when it goes off the canvas, when it goes into the
   body, or when it becomes too slow. Near a stagnation point a particle
   almost stops, and its segments then make a mark with no shape. */

export function createStreaklines(options = {}) {
  const spacing = options.spacing || 9;      // px of width per particle
  const max = options.max || 190;
  const stall = options.stall || 7;          // px/s below which a particle is culled
  const accentEvery = options.accentEvery || 19;
  const gain = options.gain || 1;            // visual speed-up of advection

  let particles = [];
  let width = 0;
  let height = 0;

  function spawn(particle, anywhere) {
    particle.x = anywhere ? Math.random() * width : -10;
    particle.y = Math.random() * height;
    return particle;
  }

  return {
    layout(w, h) {
      width = w;
      height = h;
      const count = Math.min(max, Math.round(w / spacing));
      particles = Array.from({ length: count }, () => spawn({}, true));
    },

    draw(ctx, dt, velocity, ink) {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const v = velocity(p.x, p.y);
        if (!v) { spawn(p, false); continue; }
        if (Math.hypot(v.u, v.v) < stall) { spawn(p, false); continue; }
        const nx = p.x + v.u * dt * gain;
        const ny = p.y + v.v * dt * gain;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        const accent = i % accentEvery === 0;
        ctx.strokeStyle = accent ? ink.accent : ink.line;
        ctx.lineWidth = accent ? 1.2 : 1;
        ctx.stroke();
        p.x = nx;
        p.y = ny;
        if (p.x > width + 10 || p.y < -10 || p.y > height + 10) spawn(p, false);
      }
    },

    // Fixed frame: integrate and draw each full streamline one time.
    still(ctx, velocity, ink, lines = 26) {
      for (let i = 0; i < lines; i++) {
        let x = -5;
        let y = (i + 0.5) * (height / lines);
        const accent = i % 9 === 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let step = 0; step < 900; step++) {
          const v = velocity(x, y);
          if (!v) break;
          const mag = Math.hypot(v.u, v.v) || 1;
          x += (v.u / mag) * 3;
          y += (v.v / mag) * 3;
          if (x > width + 5 || y < -5 || y > height + 5) break;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = accent ? ink.accent : ink.line;
        ctx.lineWidth = accent ? 1.2 : 1;
        ctx.stroke();
      }
    },
  };
}
