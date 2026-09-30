import Phaser from 'phaser';

export type ProjectileKind = 'bullet' | 'shell' | 'artillery' | 'bolt';

interface Particle {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
  drag: number;
  spin: number;
}

interface Projectile {
  kind: ProjectileKind;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  duration: number;
  color: number;
  arc: number;
  onImpact: () => void;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  from: number;
  to: number;
  width: number;
  color: number;
  style: 'ring' | 'move' | 'attack';
}

const MAX_PARTICLES = 420;

/** Lightweight particle / projectile layer, drawn entirely from generated textures and Graphics. */
export class FxSystem {
  private readonly scene: Phaser.Scene;
  private readonly particles: Particle[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly rings: Ring[] = [];
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics().setDepth(32);
  }

  destroy() {
    this.particles.forEach((particle) => particle.sprite.destroy());
    this.particles.length = 0;
    this.projectiles.length = 0;
    this.rings.length = 0;
    this.graphics.destroy();
  }

  update(dtMs: number) {
    const dt = Math.min(dtMs, 64);

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      const damping = Math.pow(p.drag, dt / 16);
      p.vx *= damping;
      p.vy *= damping;
      p.sprite.x += (p.vx * dt) / 1000;
      p.sprite.y += (p.vy * dt) / 1000;
      p.sprite.rotation += (p.spin * dt) / 1000;
      p.sprite.setScale(p.s0 + (p.s1 - p.s0) * t);
      p.sprite.setAlpha(p.a0 + (p.a1 - p.a0) * t);
    }

    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.t += dt / projectile.duration;
      if (projectile.t >= 1) {
        this.projectiles.splice(i, 1);
        projectile.onImpact();
        continue;
      }
      if (projectile.kind === 'shell' || projectile.kind === 'artillery') {
        const { x, y } = this.projectilePosition(projectile);
        if (Math.random() < 0.6) {
          this.spawn('fx:smoke', x, y, {
            tint: 0x8a8a8a,
            life: 380,
            s0: 0.1,
            s1: projectile.kind === 'artillery' ? 0.32 : 0.22,
            a0: 0.35,
            a1: 0,
          });
        }
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) {
        this.rings.splice(i, 1);
      }
    }

    this.draw();
  }

  private projectilePosition(projectile: Projectile) {
    const t = projectile.t;
    return {
      x: projectile.fromX + (projectile.toX - projectile.fromX) * t,
      y: projectile.fromY + (projectile.toY - projectile.fromY) * t - projectile.arc * 4 * t * (1 - t),
    };
  }

  private draw() {
    const g = this.graphics;
    g.clear();

    this.projectiles.forEach((projectile) => {
      const { x, y } = this.projectilePosition(projectile);
      const angle = Math.atan2(projectile.toY - projectile.fromY, projectile.toX - projectile.fromX);
      switch (projectile.kind) {
        case 'bullet': {
          g.lineStyle(2.2, 0xfff2b0, 0.95);
          g.lineBetween(x - Math.cos(angle) * 14, y - Math.sin(angle) * 14, x, y);
          g.lineStyle(5, 0xffb84d, 0.25);
          g.lineBetween(x - Math.cos(angle) * 10, y - Math.sin(angle) * 10, x, y);
          break;
        }
        case 'shell': {
          g.lineStyle(3, 0xffa640, 0.5);
          g.lineBetween(x - Math.cos(angle) * 20, y - Math.sin(angle) * 20, x, y);
          g.fillStyle(0xffe08a, 1);
          g.fillCircle(x, y, 3.2);
          g.fillStyle(0xff7a1a, 0.35);
          g.fillCircle(x, y, 7);
          break;
        }
        case 'artillery': {
          // ground shadow tracks the ground position, the shell flies above it
          const gx = projectile.fromX + (projectile.toX - projectile.fromX) * projectile.t;
          const gy = projectile.fromY + (projectile.toY - projectile.fromY) * projectile.t;
          g.fillStyle(0x000000, 0.28);
          g.fillEllipse(gx, gy, 10, 5);
          g.fillStyle(0xffd27a, 1);
          g.fillCircle(x, y, 4);
          g.fillStyle(0xff6a1a, 0.4);
          g.fillCircle(x, y, 9);
          break;
        }
        case 'bolt': {
          g.lineStyle(4, projectile.color, 0.35);
          g.lineBetween(x - Math.cos(angle) * 22, y - Math.sin(angle) * 22, x, y);
          g.lineStyle(2, 0xffffff, 0.95);
          g.lineBetween(x - Math.cos(angle) * 14, y - Math.sin(angle) * 14, x, y);
          g.fillStyle(projectile.color, 0.9);
          g.fillCircle(x, y, 3.4);
          break;
        }
      }
    });

    this.rings.forEach((ring) => {
      const t = 1 - ring.life / ring.maxLife;
      const alpha = 1 - t;
      const radius = ring.from + (ring.to - ring.from) * t;
      g.lineStyle(ring.width, ring.color, alpha * 0.9);
      g.strokeCircle(ring.x, ring.y, radius);
      if (ring.style === 'move') {
        g.lineStyle(2, ring.color, alpha * 0.9);
        g.strokeCircle(ring.x, ring.y, radius * 0.45);
        g.fillStyle(ring.color, alpha * 0.9);
        g.fillCircle(ring.x, ring.y, 2.4);
      } else if (ring.style === 'attack') {
        const arm = radius * 1.15;
        g.lineStyle(2.4, ring.color, alpha);
        g.lineBetween(ring.x - arm, ring.y, ring.x - radius * 0.45, ring.y);
        g.lineBetween(ring.x + arm, ring.y, ring.x + radius * 0.45, ring.y);
        g.lineBetween(ring.x, ring.y - arm, ring.x, ring.y - radius * 0.45);
        g.lineBetween(ring.x, ring.y + arm, ring.x, ring.y + radius * 0.45);
      }
    });
  }

  private spawn(
    texture: string,
    x: number,
    y: number,
    options: {
      tint?: number;
      additive?: boolean;
      vx?: number;
      vy?: number;
      life: number;
      s0: number;
      s1: number;
      a0: number;
      a1: number;
      drag?: number;
      spin?: number;
    },
  ) {
    if (this.particles.length >= MAX_PARTICLES) {
      const oldest = this.particles.shift();
      oldest?.sprite.destroy();
    }
    const sprite = this.scene.add.image(x, y, texture).setDepth(30 + (options.additive ? 0.5 : 0));
    if (options.tint !== undefined) {
      sprite.setTint(options.tint);
    }
    if (options.additive) {
      sprite.setBlendMode(Phaser.BlendModes.ADD);
    }
    sprite.setRotation(Math.random() * Math.PI * 2);
    this.particles.push({
      sprite,
      vx: options.vx ?? 0,
      vy: options.vy ?? 0,
      life: options.life,
      maxLife: options.life,
      s0: options.s0,
      s1: options.s1,
      a0: options.a0,
      a1: options.a1,
      drag: options.drag ?? 1,
      spin: options.spin ?? 0,
    });
  }

  // ─── public effects ───────────────────────────────────────

  muzzleFlash(x: number, y: number, angle: number, size = 1, color = 0xffd27a) {
    const fx = x + Math.cos(angle) * 10 * size;
    const fy = y + Math.sin(angle) * 10 * size;
    this.spawn('fx:glow', fx, fy, { tint: color, additive: true, life: 110, s0: 0.5 * size, s1: 0.15 * size, a0: 1, a1: 0 });
    this.spawn('fx:glow', fx, fy, { tint: 0xffffff, additive: true, life: 70, s0: 0.28 * size, s1: 0.08 * size, a0: 1, a1: 0 });
    for (let i = 0; i < 3; i += 1) {
      const spread = angle + (Math.random() - 0.5) * 0.7;
      this.spawn('fx:glow', fx, fy, {
        tint: color,
        additive: true,
        vx: Math.cos(spread) * (120 + Math.random() * 120) * size,
        vy: Math.sin(spread) * (120 + Math.random() * 120) * size,
        life: 160,
        s0: 0.1,
        s1: 0.02,
        a0: 1,
        a1: 0,
        drag: 0.9,
      });
    }
  }

  fireProjectile(
    kind: ProjectileKind,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    onImpact: () => void,
  ) {
    const distance = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    const speed = kind === 'bullet' ? 1.6 : kind === 'bolt' ? 1.4 : kind === 'shell' ? 1.0 : 0.55;
    const duration = Math.max(kind === 'artillery' ? 420 : 70, distance / speed);
    this.projectiles.push({
      kind,
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      t: 0,
      duration,
      color,
      arc: kind === 'artillery' ? Math.min(90, distance * 0.35) : 0,
      onImpact,
    });
  }

  impact(x: number, y: number, kind: ProjectileKind, color = 0xffd27a) {
    if (kind === 'artillery') {
      this.explosion(x, y, 1.05);
      return;
    }
    if (kind === 'shell') {
      this.explosion(x, y, 0.55);
      return;
    }
    const tint = kind === 'bolt' ? color : 0xffe9a0;
    this.spawn('fx:glow', x, y, { tint, additive: true, life: 160, s0: 0.42, s1: 0.1, a0: 1, a1: 0 });
    for (let i = 0; i < 5; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      this.spawn('fx:glow', x, y, {
        tint,
        additive: true,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 220 + Math.random() * 120,
        s0: 0.1,
        s1: 0.02,
        a0: 1,
        a1: 0,
        drag: 0.9,
      });
    }
  }

  explosion(x: number, y: number, size = 1) {
    this.spawn('fx:glow', x, y, { tint: 0xfff2c8, additive: true, life: 260, s0: 0.5 * size, s1: 2.4 * size, a0: 1, a1: 0 });
    this.spawn('fx:glow', x, y, { tint: 0xff8a2a, additive: true, life: 420, s0: 0.7 * size, s1: 2.2 * size, a0: 0.85, a1: 0 });

    const fireballs = Math.round(6 + 6 * size);
    for (let i = 0; i < fireballs; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (40 + Math.random() * 110) * size;
      this.spawn('fx:glow', x, y, {
        tint: i % 2 ? 0xff9a3a : 0xffc95e,
        additive: true,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 320 + Math.random() * 380,
        s0: (0.4 + Math.random() * 0.3) * size,
        s1: 0.05,
        a0: 0.95,
        a1: 0,
        drag: 0.93,
      });
    }

    const puffs = Math.round(4 + 5 * size);
    for (let i = 0; i < puffs; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (12 + Math.random() * 40) * size;
      this.spawn('fx:smoke', x, y, {
        tint: 0x2a2724,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 14,
        life: 900 + Math.random() * 900,
        s0: 0.3 * size,
        s1: (0.9 + Math.random() * 0.6) * size,
        a0: 0.6,
        a1: 0,
        drag: 0.96,
        spin: (Math.random() - 0.5) * 0.8,
      });
    }

    const sparks = Math.round(8 * size);
    for (let i = 0; i < sparks; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 260;
      this.spawn('fx:glow', x, y, {
        tint: 0xffe6a0,
        additive: true,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 300 + Math.random() * 350,
        s0: 0.08,
        s1: 0.015,
        a0: 1,
        a1: 0,
        drag: 0.92,
      });
    }

    this.rings.push({ x, y, life: 340, maxLife: 340, from: 6 * size, to: 46 * size, width: 3, color: 0xffd9a0, style: 'ring' });
  }

  smokePuff(x: number, y: number, scale = 1, tint = 0x4b4744) {
    this.spawn('fx:smoke', x, y, {
      tint,
      vx: (Math.random() - 0.5) * 10,
      vy: -18 - Math.random() * 12,
      life: 1100 + Math.random() * 500,
      s0: 0.18 * scale,
      s1: 0.6 * scale,
      a0: 0.5,
      a1: 0,
      drag: 0.985,
      spin: (Math.random() - 0.5) * 0.5,
    });
  }

  fireLick(x: number, y: number, scale = 1) {
    this.spawn('fx:glow', x, y, {
      tint: 0xff8a2a,
      additive: true,
      vx: (Math.random() - 0.5) * 16,
      vy: -30 - Math.random() * 20,
      life: 420,
      s0: 0.32 * scale,
      s1: 0.06,
      a0: 0.9,
      a1: 0,
      drag: 0.97,
    });
  }

  sparkle(x: number, y: number, color = 0x7dffc0) {
    this.spawn('fx:glow', x, y, {
      tint: color,
      additive: true,
      vx: (Math.random() - 0.5) * 40,
      vy: -22 - Math.random() * 30,
      life: 480,
      s0: 0.14,
      s1: 0.02,
      a0: 1,
      a1: 0,
      drag: 0.96,
    });
  }

  dust(x: number, y: number, scale = 1) {
    this.spawn('fx:smoke', x, y, {
      tint: 0xb59a72,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 14,
      life: 520,
      s0: 0.1 * scale,
      s1: 0.3 * scale,
      a0: 0.28,
      a1: 0,
      drag: 0.96,
    });
  }

  constructionSpark(x: number, y: number) {
    this.spawn('fx:glow', x, y, {
      tint: 0xfff0a0,
      additive: true,
      vx: (Math.random() - 0.5) * 120,
      vy: -40 - Math.random() * 90,
      life: 380,
      s0: 0.12,
      s1: 0.02,
      a0: 1,
      a1: 0,
      drag: 0.94,
    });
  }

  ring(x: number, y: number, color: number, maxRadius = 30, life = 700) {
    this.rings.push({ x, y, life, maxLife: life, from: maxRadius * 0.3, to: maxRadius, width: 2.5, color, style: 'ring' });
  }

  commandMarker(x: number, y: number, kind: 'move' | 'attack') {
    this.rings.push({
      x,
      y,
      life: 620,
      maxLife: 620,
      from: 24,
      to: 8,
      width: 2.2,
      color: kind === 'attack' ? 0xff5c4d : 0x7dffa8,
      style: kind === 'attack' ? 'attack' : 'move',
    });
  }
}
