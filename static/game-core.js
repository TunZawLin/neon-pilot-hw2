export const WIDTH = 960, HEIGHT = 700;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const collides = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
export const difficulty = seconds => 1 + Math.min(seconds / 28, 9);

// Geometry rules applied to pretrained landmarks; these are not learned gestures.
export class GestureFilter {
  constructor() { this.reset(); }
  reset() { this.ratio = null; this.pinched = false; this.closeFrames = 0; this.x = null; this.y = null; }
  update(points, aspect = 4 / 3) {
    if (!points || points.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) { this.reset(); return null; }
    const distance = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    const size = Math.max(distance(points[0], points[9]), distance(points[5], points[17]));
    if (size < .035) { this.reset(); return null; }
    const rawRatio = distance(points[4], points[8]) / size;
    const fingers = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]];
    // Compare distances, rather than screen y coordinates, so either hand can
    // rotate in the camera. A shooting pinch curls only the index finger.
    const fist = fingers.every(([base, joint, tip]) =>
      distance(points[tip], points[0]) < distance(points[joint], points[0]) * 1.05 &&
      distance(points[tip], points[base]) < size * .65);
    const openPalm = rawRatio > .6 && fingers.every(([base, joint, tip]) =>
      distance(points[tip], points[0]) > distance(points[joint], points[0]) * 1.15 &&
      distance(points[tip], points[base]) > size * .65);
    this.ratio = this.ratio === null ? rawRatio : this.ratio * .6 + rawRatio * .4;
    if (this.ratio < .32) { if (++this.closeFrames >= 2) this.pinched = true; }
    else { this.closeFrames = 0; if (this.ratio > .46) this.pinched = false; }
    if (fist) { this.pinched = false; this.closeFrames = 0; }
    const palm = [0, 5, 9, 13, 17].map(i => points[i]);
    const x = clamp(((1 - palm.reduce((sum, p) => sum + p.x, 0) / 5) - .15) / .7, 0, 1);
    const y = clamp((palm.reduce((sum, p) => sum + p.y, 0) / 5 - .18) / .67, 0, 1);
    this.x = this.x === null ? x : this.x + (x - this.x) * .42;
    this.y = this.y === null ? y : this.y + (y - this.y) * .42;
    return { x: this.x, y: this.y, pinched: this.pinched, ratio: this.ratio, fist, openPalm };
  }
}

export class GestureHold {
  constructor(holdMs = 1000, maxGapMs = 400) { this.holdMs = holdMs; this.maxGapMs = maxGapMs; this.reset(); }
  reset() { this.action = null; this.since = null; this.lastAt = null; this.fired = false; }
  update(action, now) {
    if (!action || !Number.isFinite(now)) { this.reset(); return { progress: 0, triggered: false }; }
    if (action !== this.action || now < this.lastAt || (this.lastAt !== null && now - this.lastAt > this.maxGapMs)) {
      this.reset(); this.action = action; this.since = now;
    }
    this.lastAt = now;
    const progress = clamp((now - this.since) / this.holdMs, 0, 1);
    const triggered = progress === 1 && !this.fired;
    if (triggered) this.fired = true;
    return { progress, triggered };
  }
}

export class Game {
  constructor(random = Math.random) { this.random = random; this.state = 'title'; this.reset(); this.state = 'title'; }
  reset() {
    this.player = { x: WIDTH / 2, y: HEIGHT * .79, r: 16 };
    this.enemies = []; this.lasers = []; this.particles = [];
    this.score = 0; this.lives = 3; this.time = 0; this.kills = 0;
    this.shots = 0; this.cooldown = 0; this.spawnIn = .5; this.invincible = 1.5;
  }
  start() { this.reset(); this.state = 'playing'; }
  burst(x, y, color, count = 18) {
    for (let i = 0; i < count; i++) {
      const a = this.random() * Math.PI * 2, speed = 35 + this.random() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .3 + this.random() * .5, color });
    }
    if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450);
  }
  damage() {
    if (this.invincible > 0) return;
    this.lives--; this.invincible = 1.6;
    this.burst(this.player.x, this.player.y, '#ed6fc2', 25);
    if (this.lives <= 0) this.state = 'over';
  }
  update(delta, input = {}) {
    if (this.state !== 'playing') return;
    const dt = clamp(delta, 0, .05), level = difficulty(this.time);
    this.time += dt; this.cooldown -= dt; this.invincible -= dt; this.spawnIn -= dt;
    if (input.target) {
      const ease = 1 - Math.exp(-13 * dt);
      this.player.x += (32 + input.target.x * (WIDTH - 64) - this.player.x) * ease;
      this.player.y += (118 + input.target.y * (HEIGHT - 150) - this.player.y) * ease;
    } else {
      let dx = input.dx || 0, dy = input.dy || 0;
      const scale = Math.hypot(dx, dy) > 1 ? Math.SQRT1_2 : 1;
      this.player.x += dx * 385 * dt * scale; this.player.y += dy * 385 * dt * scale;
    }
    this.player.x = clamp(this.player.x, 25, WIDTH - 25); this.player.y = clamp(this.player.y, 118, HEIGHT - 30);
    if (input.fire && this.cooldown <= 0) {
      this.lasers.push({ x: this.player.x, y: this.player.y - 23, r: 5, previousY: this.player.y - 23 });
      this.cooldown = .17; this.shots++;
    }
    if (this.spawnIn <= 0) {
      const x = 35 + this.random() * (WIDTH - 70);
      this.enemies.push({ x, baseX: x, y: -30, r: 18 + this.random() * 8, speed: 65 + level * 20 + this.random() * 40, phase: this.random() * 6.28, drift: this.random() < .5, hp: level > 3 && this.random() < .28 ? 2 : 1 });
      this.spawnIn = Math.max(.22, .95 - level * .065) * (.75 + this.random() * .5);
    }
    for (const laser of this.lasers) { laser.previousY = laser.y; laser.y -= 760 * dt; }
    for (const enemy of this.enemies) {
      enemy.y += enemy.speed * dt;
      if (enemy.drift) enemy.x = clamp(enemy.baseX + Math.sin(this.time * 1.6 + enemy.phase) * 60, 25, WIDTH - 25);
      for (const laser of this.lasers) {
        // Swept vertical laser segment avoids missing collisions on slower frames.
        const nearest = { x: laser.x, y: clamp(enemy.y, laser.y, laser.previousY), r: laser.r };
        if (!laser.dead && !enemy.dead && collides(nearest, enemy)) {
          laser.dead = true; enemy.hp--;
          if (enemy.hp <= 0) { enemy.dead = true; this.score += 100; this.kills++; this.burst(enemy.x, enemy.y, enemy.drift ? '#ed6fc2' : '#5bf5e0'); }
          else this.burst(enemy.x, enemy.y, '#fff0ae', 5);
        }
      }
      if (!enemy.dead && collides(enemy, this.player)) { enemy.dead = true; this.burst(enemy.x, enemy.y, '#ed6fc2'); this.damage(); }
      // Drones that pass the ship leave the sector; only impacts cost a life.
    }
    this.lasers = this.lasers.filter(l => !l.dead && l.y > -40);
    this.enemies = this.enemies.filter(e => !e.dead && e.y < HEIGHT + 50);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
  }
}
