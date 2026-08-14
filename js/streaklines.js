/* Streaklines: a pool of particles advected by whatever velocity field it
   is handed, each frame extending its path by one hairline segment while
   the canvas fades slowly underneath. Shared by every scene that draws a
   flow, so the flow scenes differ only in their physics.

   Particles live until they leave the canvas, enter the body, or stall:
   near a stagnation point they barely move, so their segments would land
   on top of each other frame after frame and pool into blobs. */

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

    // Frozen frame: integrate and stroke whole streamlines once, so the
    // shape of the flow still reads without any motion at all.
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
