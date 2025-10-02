// Fan-made Clash Royale–style mini game
// No assets, only shapes. Works on GitHub Pages (static).
// Author: ChatGPT
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const UI = {
  cardsEl: document.getElementById('cards'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resetBtn: document.getElementById('resetBtn'),
  muteToggle: document.getElementById('muteToggle'),
  elixirFill: document.getElementById('elixirFill'),
  elixirText: document.getElementById('elixirText'),
};

// -------------------------------------------
// Utility
// -------------------------------------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const now = () => performance.now() / 1000;

function randRange(a, b) { return a + Math.random() * (b - a); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// -------------------------------------------
// Arena + Lanes
// -------------------------------------------
const ARENA = { w: 1280, h: 720, riverY: 360 };
const LANE_Y = [ARENA.h * 0.3, ARENA.h * 0.7];
const SIDE = { PLAYER: 'player', ENEMY: 'enemy' };

// Towers positions (2 per side)
const TowersLayout = {
  [SIDE.PLAYER]: [{ x: 120, y: LANE_Y[0] }, { x: 120, y: LANE_Y[1] }],
  [SIDE.ENEMY]: [{ x: ARENA.w - 120, y: LANE_Y[0] }, { x: ARENA.w - 120, y: LANE_Y[1] }],
};

// -------------------------------------------
// Audio (optional blips)
// -------------------------------------------
const Sound = (() => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  function blip(freq = 400, dur = 0.07, vol = 0.02) {
    if (Game.muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.type = 'square';
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }
  return { blip };
})();

// -------------------------------------------
// Entities
// -------------------------------------------
let nextId = 1;
class Entity {
  constructor(opts) {
    Object.assign(this, {
      id: nextId++,
      side: SIDE.PLAYER,
      x: 0, y: 0,
      w: 24, h: 24,
      hp: 100, maxHp: 100,
      speed: 40,
      range: 28,
      dmg: 30,
      atkCd: 1.0,
      atkTimer: 0,
      targetType: 'any', // 'any' | 'ground' | 'tower'
      projectile: null, // {speed, size}
      laneIndex: 0,
      isTower: false,
    }, opts);
  }
  isAlive() { return this.hp > 0; }
  center() { return { x: this.x, y: this.y }; }
  update(dt, game) {
    if (this.isTower) return this.updateTower(dt, game);
    // Acquire target
    let tgt = game.findTargetFor(this);
    if (tgt && dist(this, tgt) <= this.range) {
      this.atkTimer -= dt;
      if (this.atkTimer <= 0) {
        this.attack(tgt, game);
        this.atkTimer = this.atkCd;
      }
      // hold position while attacking
    } else {
      // move along lane towards enemy side
      const dir = (this.side === SIDE.PLAYER) ? 1 : -1;
      this.x += dir * this.speed * dt;
    }
  }
  updateTower(dt, game) {
    // Shoot nearest enemy in range
    const tgt = game.findNearestEnemyInRange(this, this.range + 20);
    if (tgt) {
      this.atkTimer -= dt;
      if (this.atkTimer <= 0) {
        this.attack(tgt, game);
        this.atkTimer = this.atkCd;
      }
    }
  }
  attack(tgt, game) {
    Sound.blip(this.isTower ? 600 : 300);
    if (this.projectile) {
      // spawn projectile
      game.projectiles.push(new Projectile({
        x: this.x, y: this.y, side: this.side, dmg: this.dmg,
        speed: this.projectile.speed, size: this.projectile.size, targetId: tgt.id
      }));
    } else {
      tgt.hp -= this.dmg;
    }
  }
  draw(g) {
    // Body
    g.save();
    const col = this.side === SIDE.PLAYER ? '#6d8dff' : '#ff5d7d';
    g.fillStyle = this.isTower ? (this.side === SIDE.PLAYER ? '#3a5bd8' : '#d83a6f') : col;
    const w = this.isTower ? this.w * 1.4 : this.w;
    const h = this.isTower ? this.h * 1.4 : this.h;
    g.fillRect(this.x - w/2, this.y - h/2, w, h);
    // Range debug? (optional)
    // HP bar
    const hpw = 32, hph = 4;
    const pct = clamp(this.hp / this.maxHp, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(this.x - hpw/2, this.y - (h/2) - 10, hpw, hph);
    g.fillStyle = '#4ade80';
    g.fillRect(this.x - hpw/2, this.y - (h/2) - 10, hpw * pct, hph);
    g.restore();
  }
}

class Projectile {
  constructor(o) { Object.assign(this, { x:0,y:0, size:6, speed:260, dmg:40, side:SIDE.PLAYER, targetId:null }, o); }
  update(dt, game) {
    const tgt = game.getEntityById(this.targetId);
    if (!tgt || !tgt.isAlive()) { this.dead = true; return; }
    const dx = tgt.x - this.x;
    const dy = tgt.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= this.speed * dt + tgt.w/2) {
      tgt.hp -= this.dmg;
      this.dead = true;
      return;
    }
    this.x += (dx / d) * this.speed * dt;
    this.y += (dy / d) * this.speed * dt;
  }
  draw(g) {
    g.save();
    g.fillStyle = this.side === SIDE.PLAYER ? '#c7d2ff' : '#ffc7d5';
    g.beginPath();
    g.arc(this.x, this.y, this.size/2, 0, TAU);
    g.fill();
    g.restore();
  }
}

// -------------------------------------------
// Cards & Spells
// -------------------------------------------
const CARDS = [
  {
    key: 'knight', name: 'Knight', cost: 3, emoji: '🛡️',
    spawn: (side, laneIndex, x, y) => new Entity({
      side, x, y, laneIndex,
      w: 22, h: 22,
      hp: 720, maxHp: 720,
      speed: 46, range: 26, dmg: 84, atkCd: 1.1, targetType: 'any'
    })
  },
  {
    key: 'archer', name: 'Archer', cost: 3, emoji: '🏹',
    spawn: (side, laneIndex, x, y) => new Entity({
      side, x, y, laneIndex,
      w: 18, h: 18,
      hp: 290, maxHp: 290,
      speed: 42, range: 140, dmg: 64, atkCd: 1.0,
      projectile: { speed: 280, size: 6 },
      targetType: 'any'
    })
  },
  {
    key: 'giant', name: 'Giant', cost: 5, emoji: '🗿',
    spawn: (side, laneIndex, x, y) => new Entity({
      side, x, y, laneIndex,
      w: 26, h: 26,
      hp: 1600, maxHp: 1600,
      speed: 30, range: 24, dmg: 120, atkCd: 1.4,
      targetType: 'tower'
    })
  },
  {
    key: 'goblins', name: 'Goblins', cost: 2, emoji: '👹',
    spawn: (side, laneIndex, x, y, game) => {
      const units = [];
      for (let i = 0; i < 3; i++) {
        units.push(new Entity({
          side, x: x + i*10-10, y: y + (i%2?8:-8), laneIndex,
          w: 16, h: 16,
          hp: 180, maxHp: 180,
          speed: 64, range: 22, dmg: 46, atkCd: 0.8, targetType: 'any'
        }));
      }
      return units;
    }
  },
  {
    key: 'fireball', name: 'Fireball', cost: 4, emoji: '🔥',
    spell: true, radius: 64, damage: 320
  }
];

const CARD_MAP = Object.fromEntries(CARDS.map(c => [c.key, c]));

// -------------------------------------------
// Game Core
// -------------------------------------------
const Game = {
  running: false,
  paused: false,
  muted: false,
  lastT: 0, acc: 0,
  entities: [], projectiles: [],
  towers: [],
  playerElixir: 5, enemyElixir: 5, maxElixir: 10,
  elixirRate: 0.35, // per second
  time: 0,
  duration: 180, // 3 minutes
  doubleTimeAt: 120,
  crowns: { player: 0, enemy: 0 },
  selectedCard: null,
  spellPreview: null,
  hover: { x: 0, y: 0 },
  deck: ['knight','archer','goblins','giant','fireball'],
  aiTimer: 0,

  reset() {
    this.entities = [];
    this.projectiles = [];
    this.towers = [];
    this.crowns = { player: 0, enemy: 0 };
    this.playerElixir = 5;
    this.enemyElixir = 5;
    this.time = 0;
    this.running = false;
    this.paused = false;
    this.lastT = now();
    this.acc = 0;
    this.aiTimer = 0;

    // Build towers
    for (const side of [SIDE.PLAYER, SIDE.ENEMY]) {
      for (let i = 0; i < 2; i++) {
        const pos = TowersLayout[side][i];
        const tower = new Entity({
          side, x: pos.x, y: pos.y, isTower: true, w: 28, h: 28,
          hp: 1800, maxHp: 1800, range: 160, dmg: 80, atkCd: 1.0
        });
        tower.laneIndex = i;
        this.towers.push(tower);
      }
    }
  },

  start() {
    if (!this.running) {
      this.running = true;
      this.lastT = now();
      requestAnimationFrame(loop);
    }
  },

  pauseToggle() {
    this.paused = !this.paused;
  },

  getEntities() { return this.entities.concat(this.towers.filter(t=>t.isAlive())); },
  getEntityById(id) { return this.getEntities().find(e => e.id === id); },

  findTargets(pool, forEnt) {
    return pool.filter(e => e.side !== forEnt.side && e.isAlive() && (!forEnt.targetType || forEnt.targetType === 'any' || (forEnt.targetType === 'tower' && e.isTower) || (forEnt.targetType === 'ground' && !e.isTower)));
  },

  findNearestEnemyInRange(ent, range) {
    const options = this.findTargets(this.getEntities(), ent);
    let best = null, bestD = Infinity;
    for (const o of options) {
      const d = dist(ent, o);
      if (d < range && d < bestD) { bestD = d; best = o; }
    }
    return best;
  },

  findTargetFor(ent) {
    // prefer same lane
    const options = this.findTargets(this.getEntities(), ent).sort((a,b)=>{
      const laneScore = (a.laneIndex === ent.laneIndex) - (b.laneIndex === ent.laneIndex);
      if (laneScore !== 0) return -laneScore;
      const da = Math.abs(a.y - ent.y), db = Math.abs(b.y - ent.y);
      if (da !== db) return da - db;
      return dist(ent,a) - dist(ent,b);
    });
    if (ent.targetType === 'tower') {
      const towers = options.filter(o => o.isTower);
      if (towers.length) return towers.sort((a,b)=>dist(ent,a)-dist(ent,b))[0];
    }
    return options[0] || null;
  },

  deploy(cardKey, side, x, y, laneIndex) {
    const card = CARD_MAP[cardKey];
    if (!card) return;
    if (card.spell) {
      // apply fireball damage
      this.doFireball({ x, y }, card.radius, card.damage, side);
      return;
    }
    const spawnX = x, spawnY = y;
    const out = card.spawn(side, laneIndex, spawnX, spawnY, this);
    if (Array.isArray(out)) {
      for (const e of out) this.entities.push(e);
    } else {
      this.entities.push(out);
    }
  },

  canDropAt(x, side) {
    // Only on your side
    if (side === SIDE.PLAYER) return x < ARENA.w/2 - 20;
    return x > ARENA.w/2 + 20;
  },

  doFireball(p, radius, damage, side) {
    Sound.blip(180, 0.09, 0.04);
    for (const e of this.getEntities()) {
      if (e.side === side) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d <= radius + (e.isTower ? 16 : 10)) {
        e.hp -= damage;
      }
    }
    // tiny visual effect stored as ephemeral circles
    Particles.spawnExplosion(p.x, p.y, radius);
  },

  tick(dt) {
    if (!this.running || this.paused) return;
    this.time += dt;

    // Elixir (faster after double time point)
    const rate = this.time >= this.doubleTimeAt ? this.elixirRate*2 : this.elixirRate;
    this.playerElixir = clamp(this.playerElixir + rate*dt, 0, this.maxElixir);
    this.enemyElixir  = clamp(this.enemyElixir + rate*dt, 0, this.maxElixir);

    // Update entities
    for (const e of this.entities) e.update(dt, this);
    for (const t of this.towers) if (t.isAlive()) t.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);

    // Clean up
    this.entities = this.entities.filter(e => e.isAlive() && e.x > 40 && e.x < ARENA.w-40);
    this.projectiles = this.projectiles.filter(p => !p.dead);

    // Tower deaths -> crowns
    for (const t of this.towers) {
      if (t.hp <= 0 && !t._counted) {
        t._counted = true;
        if (t.side === SIDE.ENEMY) this.crowns.player++; else this.crowns.enemy++;
      }
    }

    // AI
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = randRange(1.5, 3.0);
      this.runAI();
    }

    // End conditions
    const playerWon = this.crowns.player >= 2 || this.towers.filter(t=>t.side===SIDE.ENEMY && t.isAlive()).length === 0;
    const enemyWon  = this.crowns.enemy  >= 2 || this.towers.filter(t=>t.side===SIDE.PLAYER && t.isAlive()).length === 0;
    if (playerWon || enemyWon || this.time >= this.duration) {
      this.running = false;
    }

    // HUD
    UI.elixirFill.style.width = `${(this.playerElixir/this.maxElixir)*100}%`;
    UI.elixirText.textContent = `${Math.floor(this.playerElixir)} / ${this.maxElixir}`;
  },

  runAI() {
    // Simple: if enough elixir, pick a random affordable card and drop on a lane
    const affordable = CARDS.filter(c => c.cost <= Math.floor(this.enemyElixir));
    if (affordable.length === 0) return;
    const card = choice(affordable);
    const laneIndex = Math.random() < 0.5 ? 0 : 1;
    const pos = { x: ARENA.w - randRange(220, 280), y: LANE_Y[laneIndex] + randRange(-22, 22) };
    if (card.spell) {
      // try to target cluster of player's units; fallback center of lane
      const candidates = this.entities.filter(e => e.side === SIDE.PLAYER);
      let best = pos, bestCount = 0;
      for (let k = 0; k < 10; k++) {
        const sx = ARENA.w - randRange(260, 520);
        const sy = LANE_Y[laneIndex] + randRange(-40, 40);
        const count = candidates.filter(e => Math.hypot(e.x - sx, e.y - sy) < (card.radius+8)).length;
        if (count > bestCount) { bestCount = count; best = { x: sx, y: sy }; }
      }
      if (this.enemyElixir >= card.cost) {
        this.enemyElixir -= card.cost;
        this.doFireball(best, card.radius, card.damage, SIDE.ENEMY);
      }
    } else {
      if (this.enemyElixir >= card.cost) {
        this.enemyElixir -= card.cost;
        this.deploy(card.key, SIDE.ENEMY, pos.x, pos.y, laneIndex);
      }
    }
  }
};

// -------------------------------------------
// Particles (simple fireball effect)
// -------------------------------------------
const Particles = {
  items: [],
  spawnExplosion(x, y, radius) {
    for (let i = 0; i < 24; i++) {
      this.items.push({
        x, y, r: randRange(2, 5), life: randRange(.3,.6),
        vx: randRange(-120,120), vy: randRange(-120,120)
      });
    }
  },
  update(dt) {
    for (const p of this.items) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98; p.vy *= 0.98;
    }
    this.items = this.items.filter(p=>p.life>0);
  },
  draw(g) {
    g.save();
    g.fillStyle = 'rgba(255,180,120,0.8)';
    for (const p of this.items) {
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, TAU);
      g.fill();
    }
    g.restore();
  }
};

// -------------------------------------------
// Rendering
// -------------------------------------------
function drawArena(g) {
  // background grid & river
  g.save();
  // Tiles
  g.fillStyle = '#0e1231';
  g.fillRect(0,0,ARENA.w, ARENA.h);
  g.strokeStyle = 'rgba(255,255,255,0.04)';
  g.lineWidth = 1;
  for (let x = 0; x < ARENA.w; x += 40) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ARENA.h); g.stroke();
  }
  for (let y = 0; y < ARENA.h; y += 40) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(ARENA.w, y); g.stroke();
  }
  // River
  g.fillStyle = '#1e2a64';
  g.fillRect(0, ARENA.riverY - 4, ARENA.w, 8);
  // Mid line
  g.fillStyle = '#2f3572';
  g.fillRect(ARENA.w/2 - 2, 0, 4, ARENA.h);
  // Lanes guides
  g.strokeStyle = 'rgba(109,141,255,.2)';
  g.setLineDash([8,8]);
  g.beginPath();
  g.moveTo(0, LANE_Y[0]); g.lineTo(ARENA.w, LANE_Y[0]);
  g.moveTo(0, LANE_Y[1]); g.lineTo(ARENA.w, LANE_Y[1]);
  g.stroke();
  g.setLineDash([]);
  g.restore();
}

function drawUI(g) {
  g.save();
  // Time & crowns
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fillRect(ARENA.w/2 - 90, 12, 180, 36);
  g.fillStyle = '#e7e8ee';
  g.font = 'bold 18px Inter, Arial';
  const tLeft = Math.max(0, Math.floor(Game.duration - Game.time));
  const m = Math.floor(tLeft / 60).toString().padStart(1,'0');
  const s = (tLeft % 60).toString().padStart(2,'0');
  g.fillText(`${m}:${s}`, ARENA.w/2 - 18, 36);

  g.textAlign = 'right';
  g.fillText(`👑 ${Game.crowns.player}`, ARENA.w/2 - 20, 36);
  g.textAlign = 'left';
  g.fillText(`${Game.crowns.enemy} 👑`, ARENA.w/2 + 20, 36);
  g.textAlign = 'left';

  // Spell preview
  if (Game.selectedCard && CARD_MAP[Game.selectedCard].spell && Game.spellPreview) {
    const card = CARD_MAP[Game.selectedCard];
    g.strokeStyle = 'rgba(255, 210, 150, .7)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(Game.hover.x, Game.hover.y, card.radius, 0, TAU);
    g.stroke();
  }
  g.restore();
}

// -------------------------------------------
// Input & Cards
// -------------------------------------------
function buildCardUI() {
  UI.cardsEl.innerHTML = '';
  for (const key of Game.deck) {
    const card = CARD_MAP[key];
    const el = document.createElement('button');
    el.className = 'card';
    el.setAttribute('data-key', key);
    el.innerHTML = `
      <div class="art"><span>${card.emoji || '🎴'}</span></div>
      <div class="title">${card.name}</div>
      <div class="cost">💧 ${card.cost}</div>
    `;
    el.addEventListener('click', () => {
      if (Math.floor(Game.playerElixir) < card.cost) return;
      Game.selectedCard = key;
      if (card.spell) {
        Game.spellPreview = true;
      } else {
        Game.spellPreview = false;
      }
      refreshCardStates();
    });
    UI.cardsEl.appendChild(el);
  }
  refreshCardStates();
}

function refreshCardStates() {
  const els = UI.cardsEl.querySelectorAll('.card');
  const e = Math.floor(Game.playerElixir);
  els.forEach(el => {
    const key = el.getAttribute('data-key');
    const cost = CARD_MAP[key].cost;
    el.classList.toggle('disabled', e < cost);
    el.classList.toggle('selected', Game.selectedCard === key);
  });
}

// Mouse controls
canvas.addEventListener('mousemove', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  Game.hover.x = sx * scaleX;
  Game.hover.y = sy * scaleY;
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  Game.selectedCard = null;
  Game.spellPreview = false;
  refreshCardStates();
  return false;
});

canvas.addEventListener('click', (ev) => {
  if (!Game.running || Game.paused) return;
  if (!Game.selectedCard) return;
  const card = CARD_MAP[Game.selectedCard];
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width/rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height/rect.height);

  // Determine lane
  const laneIndex = (Math.abs(y - LANE_Y[0]) < Math.abs(y - LANE_Y[1])) ? 0 : 1;

  if (card.spell) {
    // Fireball anywhere
    if (Math.floor(Game.playerElixir) >= card.cost) {
      Game.playerElixir -= card.cost;
      Game.doFireball({x,y}, card.radius, card.damage, SIDE.PLAYER);
      Game.selectedCard = null; Game.spellPreview = false; refreshCardStates();
    }
    return;
  }

  if (!Game.canDropAt(x, SIDE.PLAYER)) return;
  if (Math.floor(Game.playerElixir) < card.cost) return;

  Game.playerElixir -= card.cost;
  Game.deploy(card.key, SIDE.PLAYER, x, LANE_Y[laneIndex], laneIndex);
  Game.selectedCard = null;
  refreshCardStates();
});

// Buttons
UI.startBtn.addEventListener('click', () => { if (!Game.running) Game.start(); });
UI.pauseBtn.addEventListener('click', () => { Game.pauseToggle(); });
UI.resetBtn.addEventListener('click', () => { Game.reset(); buildCardUI(); drawFrame(); });
UI.muteToggle.addEventListener('change', (e) => { Game.muted = e.target.checked; });

// -------------------------------------------
// Main Loop
// -------------------------------------------
function loop() {
  const t = now();
  let dt = t - Game.lastT;
  Game.lastT = t;
  if (dt > 0.05) dt = 0.05; // clamp

  if (Game.running && !Game.paused) {
    Game.tick(dt);
    Particles.update(dt);
  }
  drawFrame();
  if (Game.running) requestAnimationFrame(loop);
}

function drawFrame() {
  // clear
  ctx.clearRect(0,0,canvas.width, canvas.height);
  drawArena(ctx);

  // towers
  for (const t of Game.towers) if (t.isAlive()) t.draw(ctx);

  // entities & projectiles
  for (const p of Game.projectiles) p.draw(ctx);
  for (const e of Game.entities) e.draw(ctx);

  // particles last for top overlay
  Particles.draw(ctx);
  drawUI(ctx);

  // game over banner
  if (!Game.running && Game.time > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, ARENA.h/2 - 60, ARENA.w, 120);
    ctx.fillStyle = '#e7e8ee';
    ctx.font = '800 32px Inter, Arial';
    const p = Game.crowns.player, e = Game.crowns.enemy;
    const text = p === e ? `Draw! (${p}-${e})` : (p>e ? `You Win! (${p}-${e})` : `You Lose! (${p}-${e})`);
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, ARENA.w/2 - tw/2, ARENA.h/2 + 10);
    ctx.restore();
  }
}

// -------------------------------------------
// Init
// -------------------------------------------
function fitCanvas() {
  // Keep internal resolution but scale to container
  const wrap = document.querySelector('.stage-wrap');
  const w = wrap.clientWidth;
  const aspect = ARENA.w / ARENA.h;
  const h = w / aspect;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
window.addEventListener('resize', fitCanvas);

Game.reset();
buildCardUI();
fitCanvas();
drawFrame();
