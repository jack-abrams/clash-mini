// Fan-made Clash Royale–style mini game rebuilt with authentic sprites/background.
// Works on GitHub Pages (static). Art sourced from RoyaleAPI asset mirror.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const UI = {
  cardsEl: document.getElementById('cards'),
  nextCardEl: document.getElementById('nextCard'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resetBtn: document.getElementById('resetBtn'),
  muteToggle: document.getElementById('muteToggle'),
  elixirFill: document.getElementById('elixirFill'),
  elixirText: document.getElementById('elixirText'),
};

// -------------------------------------------
// Assets
// -------------------------------------------
const Assets = (() => {
  const manifest = {
    arena: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/arenas/arena0.png',
    sprites: {
      knight: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/chr/knight.png',
      archers: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/chr/archers.png',
      giant: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/chr/giant.png',
      goblins: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/chr/goblins.png',
      miniPekka: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/chr/mini_pekka.png',
      musketeer: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/chr/musketeer.png',
      valkyrie: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/chr/valkyrie.png',
    },
    cards: {
      knight: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/knight.png',
      archers: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/archers.png',
      goblinGang: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/goblin-gang.png',
      giant: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/giant.png',
      miniPekka: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/mini-pekka.png',
      musketeer: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/musketeer.png',
      valkyrie: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/valkyrie.png',
      fireball: 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/fireball.png',
    }
  };

  const cache = new Map();
  let ready = false;

  function loadImage(key, url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cache.set(key, img);
        resolve({ key, img });
      };
      img.onerror = () => {
        console.warn('Failed to load asset:', url);
        resolve({ key, img: null });
      };
      img.src = url;
    });
  }

  function loadAll() {
    const tasks = [loadImage('arena', manifest.arena)];
    for (const [name, url] of Object.entries(manifest.sprites)) {
      tasks.push(loadImage(`sprite:${name}`, url));
    }
    for (const [name, url] of Object.entries(manifest.cards)) {
      tasks.push(loadImage(`card:${name}`, url));
    }
    return Promise.all(tasks).then(() => {
      ready = true;
    });
  }

  function get(key) { return cache.get(key) || null; }
  function getSprite(name) { return get(`sprite:${name}`); }
  function getCard(name) { return get(`card:${name}`); }
  function isReady() { return ready; }

  return { manifest, loadAll, get, getSprite, getCard, isReady };
})();

// -------------------------------------------
// Utility
// -------------------------------------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const now = () => performance.now() / 1000;

function randRange(a, b) { return a + Math.random() * (b - a); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function cycleHand(hand, queue, key) {
  const idx = hand.indexOf(key);
  if (idx === -1) return;
  hand.splice(idx, 1);
  queue.push(key);
  const next = queue.shift();
  if (next) hand.push(next);
}

// -------------------------------------------
// Arena + Lanes
// -------------------------------------------
const ARENA = { w: 1280, h: 720, riverY: 360 };
const LANE_Y = [ARENA.h * 0.32, ARENA.h * 0.68];
const SIDE = { PLAYER: 'player', ENEMY: 'enemy' };

const TowersLayout = {
  [SIDE.PLAYER]: {
    princess: [
      { x: 210, y: LANE_Y[0] },
      { x: 210, y: LANE_Y[1] }
    ],
    king: { x: 110, y: ARENA.h / 2 }
  },
  [SIDE.ENEMY]: {
    princess: [
      { x: ARENA.w - 210, y: LANE_Y[0] },
      { x: ARENA.w - 210, y: LANE_Y[1] }
    ],
    king: { x: ARENA.w - 110, y: ARENA.h / 2 }
  }
};

// -------------------------------------------
// Audio (optional blips)
// -------------------------------------------
const Sound = (() => {
  let audioCtx = null;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (err) {
    console.warn('Audio context unavailable, sounds disabled.');
  }
  function blip(freq = 400, dur = 0.07, vol = 0.02) {
    if (!audioCtx || Game.muted) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = 'square';
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
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
      targetType: 'any',
      projectile: null,
      splashRadius: 0,
      spriteKey: null,
      spriteScale: 0.4,
      spriteOffsetY: 0,
      laneIndex: 0,
      isTower: false,
      towerType: null,
      active: true,
      wakeFlash: 0
    }, opts);
  }
  isAlive() { return this.hp > 0; }
  center() { return { x: this.x, y: this.y }; }
  update(dt, game) {
    if (this.isTower) return this.updateTower(dt, game);
    if (!this.isAlive()) return;
    const tgt = game.findTargetFor(this);
    if (tgt && dist(this, tgt) <= this.range) {
      this.atkTimer -= dt;
      if (this.atkTimer <= 0) {
        this.attack(tgt, game);
        this.atkTimer = this.atkCd;
      }
    } else {
      const dir = (this.side === SIDE.PLAYER) ? 1 : -1;
      this.x += dir * this.speed * dt;
    }
  }
  updateTower(dt, game) {
    if (!this.active || !this.isAlive()) return;
    const tgt = game.findNearestEnemyInRange(this, this.range + 20);
    if (tgt) {
      this.atkTimer -= dt;
      if (this.atkTimer <= 0) {
        this.attack(tgt, game);
        this.atkTimer = this.atkCd;
      }
    }
    if (this.wakeFlash > 0) this.wakeFlash -= dt;
  }
  attack(tgt, game) {
    if (!this.isAlive()) return;
    Sound.blip(this.isTower ? 600 : 320, 0.08, this.isTower ? 0.035 : 0.025);
    if (this.projectile) {
      game.projectiles.push(new Projectile({
        x: this.x,
        y: this.y,
        side: this.side,
        dmg: this.dmg,
        speed: this.projectile.speed,
        size: this.projectile.size,
        targetId: tgt.id
      }));
    } else if (this.splashRadius > 0) {
      const options = game.findTargets(game.getEntities(), this);
      for (const enemy of options) {
        if (dist(enemy, tgt) <= this.splashRadius) {
          game.applyDamage(enemy, this.dmg, this);
        }
      }
    } else {
      game.applyDamage(tgt, this.dmg, this);
    }
  }
  draw(g) {
    g.save();
    if (this.isTower) {
      const baseW = this.towerType === 'king' ? 88 : 70;
      const baseH = this.towerType === 'king' ? 70 : 58;
      const baseX = this.x - baseW / 2;
      const baseY = this.y - baseH + 16;
      const grad = g.createLinearGradient(baseX, baseY, baseX, baseY + baseH);
      const primary = this.side === SIDE.PLAYER ? '#3a5bd8' : '#d83a6f';
      const secondary = this.side === SIDE.PLAYER ? '#1f2d70' : '#701a40';
      grad.addColorStop(0, this.active ? primary : `${primary}AA`);
      grad.addColorStop(1, this.active ? secondary : `${secondary}AA`);
      g.fillStyle = grad;
      g.fillRect(baseX, baseY, baseW, baseH);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(baseX + 10, baseY + baseH - 18, baseW - 20, 12);
      g.fillStyle = '#f9cc66';
      g.font = 'bold 24px Inter, Arial';
      g.textAlign = 'center';
      g.fillText('👑', this.x, baseY + baseH - 8);
      if (this.wakeFlash > 0) {
        g.fillStyle = `rgba(255, 255, 120, ${Math.min(0.8, this.wakeFlash)})`;
        g.beginPath();
        g.arc(this.x, this.y - baseH / 2, baseW * 0.7, 0, TAU);
        g.fill();
      }
    } else {
      const sprite = this.spriteKey ? Assets.getSprite(this.spriteKey) : null;
      if (sprite) {
        const scale = this.spriteScale || 0.4;
        const drawW = sprite.width * scale;
        const drawH = sprite.height * scale;
        const drawX = this.x - drawW / 2;
        const drawY = this.y - drawH + (this.spriteOffsetY || 0);
        g.drawImage(sprite, drawX, drawY, drawW, drawH);
      } else {
        const col = this.side === SIDE.PLAYER ? '#6d8dff' : '#ff5d7d';
        g.fillStyle = col;
        g.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
      }
    }
    const hpw = this.isTower ? 70 : 40;
    const hph = 5;
    const pct = clamp(this.hp / this.maxHp, 0, 1);
    const barY = this.isTower ? (this.y - (this.towerType === 'king' ? 90 : 80)) : (this.y - this.h / 2 - 14);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(this.x - hpw / 2, barY, hpw, hph);
    g.fillStyle = pct > 0.33 ? '#4ade80' : '#ff5d7d';
    g.fillRect(this.x - hpw / 2, barY, hpw * pct, hph);
    g.restore();
  }
}

class Projectile {
  constructor(o) { Object.assign(this, { x: 0, y: 0, size: 8, speed: 320, dmg: 40, side: SIDE.PLAYER, targetId: null }, o); }
  update(dt, game) {
    const tgt = game.getEntityById(this.targetId);
    if (!tgt || !tgt.isAlive()) { this.dead = true; return; }
    const dx = tgt.x - this.x;
    const dy = tgt.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= this.speed * dt + tgt.w / 2) {
      game.applyDamage(tgt, this.dmg, this);
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
    g.arc(this.x, this.y, this.size / 2, 0, TAU);
    g.fill();
    g.restore();
  }
}

// -------------------------------------------
// Cards & Spells
// -------------------------------------------
const CardArt = Assets.manifest.cards;

const CARDS = [
  {
    key: 'knight',
    name: 'Knight',
    cost: 3,
    art: CardArt.knight,
    sprite: 'knight',
    previewScale: 0.38,
    spawn: (side, laneIndex, x, y) => new Entity({
      side, x, y,
      laneIndex,
      w: 24, h: 28,
      hp: 1480, maxHp: 1480,
      speed: 46, range: 32, dmg: 140, atkCd: 1.2,
      spriteKey: 'knight', spriteScale: 0.38, spriteOffsetY: 12
    })
  },
  {
    key: 'archers',
    name: 'Archers',
    cost: 3,
    art: CardArt.archers,
    sprite: 'archers',
    previewScale: 0.32,
    spawn: (side, laneIndex, x, y) => {
      const spread = 18;
      return [
        new Entity({
          side, x: x - spread, y: y - 10, laneIndex,
          w: 18, h: 20,
          hp: 340, maxHp: 340,
          speed: 44, range: 160, dmg: 96, atkCd: 1.0,
          projectile: { speed: 340, size: 6 },
          spriteKey: 'archers', spriteScale: 0.32, spriteOffsetY: 10
        }),
        new Entity({
          side, x: x + spread, y: y + 10, laneIndex,
          w: 18, h: 20,
          hp: 340, maxHp: 340,
          speed: 44, range: 160, dmg: 96, atkCd: 1.0,
          projectile: { speed: 340, size: 6 },
          spriteKey: 'archers', spriteScale: 0.32, spriteOffsetY: 10
        })
      ];
    }
  },
  {
    key: 'goblinGang',
    name: 'Goblin Gang',
    cost: 3,
    art: CardArt.goblinGang,
    sprite: 'goblins',
    previewScale: 0.34,
    spawn: (side, laneIndex, x, y) => {
      const units = [];
      for (let i = 0; i < 3; i++) {
        units.push(new Entity({
          side,
          x: x + (i - 1) * 16,
          y: y + (i === 1 ? 12 : -12),
          laneIndex,
          w: 16, h: 18,
          hp: 250, maxHp: 250,
          speed: 66, range: 26, dmg: 110, atkCd: 1.0,
          spriteKey: 'goblins', spriteScale: 0.34, spriteOffsetY: 8
        }));
      }
      return units;
    }
  },
  {
    key: 'miniPekka',
    name: 'Mini P.E.K.K.A.',
    cost: 4,
    art: CardArt.miniPekka,
    sprite: 'miniPekka',
    previewScale: 0.42,
    spawn: (side, laneIndex, x, y) => new Entity({
      side, x, y,
      laneIndex,
      w: 24, h: 28,
      hp: 1650, maxHp: 1650,
      speed: 68, range: 34, dmg: 450, atkCd: 1.6,
      spriteKey: 'miniPekka', spriteScale: 0.42, spriteOffsetY: 14
    })
  },
  {
    key: 'musketeer',
    name: 'Musketeer',
    cost: 4,
    art: CardArt.musketeer,
    sprite: 'musketeer',
    previewScale: 0.36,
    spawn: (side, laneIndex, x, y) => new Entity({
      side, x, y,
      laneIndex,
      w: 20, h: 22,
      hp: 680, maxHp: 680,
      speed: 45, range: 190, dmg: 250, atkCd: 1.2,
      projectile: { speed: 420, size: 8 },
      spriteKey: 'musketeer', spriteScale: 0.36, spriteOffsetY: 12
    })
  },
  {
    key: 'valkyrie',
    name: 'Valkyrie',
    cost: 4,
    art: CardArt.valkyrie,
    sprite: 'valkyrie',
    previewScale: 0.4,
    spawn: (side, laneIndex, x, y) => new Entity({
      side, x, y,
      laneIndex,
      w: 28, h: 30,
      hp: 1700, maxHp: 1700,
      speed: 52, range: 36, dmg: 320, atkCd: 1.4,
      splashRadius: 48,
      spriteKey: 'valkyrie', spriteScale: 0.4, spriteOffsetY: 14
    })
  },
  {
    key: 'giant',
    name: 'Giant',
    cost: 5,
    art: CardArt.giant,
    sprite: 'giant',
    previewScale: 0.44,
    spawn: (side, laneIndex, x, y) => new Entity({
      side, x, y,
      laneIndex,
      w: 30, h: 32,
      hp: 3800, maxHp: 3800,
      speed: 32, range: 32, dmg: 280, atkCd: 1.4,
      targetType: 'tower',
      spriteKey: 'giant', spriteScale: 0.44, spriteOffsetY: 18
    })
  },
  {
    key: 'fireball',
    name: 'Fireball',
    cost: 4,
    art: CardArt.fireball,
    spell: true,
    radius: 72,
    damage: 520
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
  lastT: 0,
  acc: 0,
  entities: [],
  projectiles: [],
  towers: [],
  playerElixir: 5,
  enemyElixir: 5,
  maxElixir: 10,
  elixirRate: 0.35,
  time: 0,
  duration: 180,
  doubleTimeAt: 120,
  crowns: { player: 0, enemy: 0 },
  selectedCard: null,
  spellPreview: false,
  hover: { x: 0, y: 0 },
  playerDeck: ['knight', 'archers', 'valkyrie', 'miniPekka', 'goblinGang', 'musketeer', 'giant', 'fireball'],
  enemyDeck: ['knight', 'archers', 'valkyrie', 'miniPekka', 'goblinGang', 'musketeer', 'giant', 'fireball'],
  hand: [],
  deckQueue: [],
  enemyHand: [],
  enemyQueue: [],
  aiTimer: 0,
  lastElixirWhole: 5,

  reset() {
    this.entities = [];
    this.projectiles = [];
    this.towers = [];
    Particles.items = [];
    this.crowns = { player: 0, enemy: 0 };
    this.playerElixir = 5;
    this.enemyElixir = 5;
    this.time = 0;
    this.running = false;
    this.paused = false;
    this.lastT = now();
    this.acc = 0;
    this.aiTimer = 0;
    this.selectedCard = null;
    this.spellPreview = false;
    this.lastElixirWhole = Math.floor(this.playerElixir);

    this.deckQueue = [...this.playerDeck];
    this.hand = this.deckQueue.splice(0, 4);
    if (this.hand.length < 4) {
      this.deckQueue = [...this.playerDeck];
      this.hand = this.deckQueue.splice(0, 4);
    }
    this.enemyQueue = [...this.enemyDeck];
    this.enemyHand = this.enemyQueue.splice(0, 4);

    for (const side of [SIDE.PLAYER, SIDE.ENEMY]) {
      const princessPositions = TowersLayout[side].princess;
      princessPositions.forEach((pos, idx) => {
        const tower = new Entity({
          side,
          x: pos.x,
          y: pos.y,
          isTower: true,
          towerType: 'princess',
          laneIndex: idx,
          w: 32,
          h: 32,
          hp: 2060,
          maxHp: 2060,
          range: 220,
          dmg: 120,
          atkCd: 1.0,
          active: true
        });
        this.towers.push(tower);
      });
      const kingPos = TowersLayout[side].king;
      const king = new Entity({
        side,
        x: kingPos.x,
        y: kingPos.y,
        isTower: true,
        towerType: 'king',
        laneIndex: -1,
        w: 36,
        h: 36,
        hp: 3900,
        maxHp: 3900,
        range: 240,
        dmg: 180,
        atkCd: 1.2,
        active: side === SIDE.PLAYER
      });
      if (side === SIDE.ENEMY) king.active = false;
      this.towers.push(king);
    }

    buildCardUI();
    refreshCardStates();
    updateNextCardUI();
    UI.elixirFill.style.width = `${(this.playerElixir / this.maxElixir) * 100}%`;
    UI.elixirText.textContent = `${Math.floor(this.playerElixir)} / ${this.maxElixir}`;
    drawFrame();
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

  getEntities() {
    return this.entities.concat(this.towers.filter(t => t.isAlive()));
  },

  getEntityById(id) {
    return this.getEntities().find(e => e.id === id);
  },

  findTargets(pool, forEnt) {
    return pool.filter(e => e.side !== forEnt.side && e.isAlive() && (!forEnt.targetType || forEnt.targetType === 'any' || (forEnt.targetType === 'tower' && e.isTower)));
  },

  findNearestEnemyInRange(ent, range) {
    const options = this.findTargets(this.getEntities(), ent);
    let best = null;
    let bestD = Infinity;
    for (const o of options) {
      const d = dist(ent, o);
      if (d < range && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  },

  findTargetFor(ent) {
    const options = this.findTargets(this.getEntities(), ent).sort((a, b) => {
      const laneScore = (a.laneIndex === ent.laneIndex ? -1 : 0) - (b.laneIndex === ent.laneIndex ? -1 : 0);
      if (laneScore !== 0) return laneScore;
      const da = Math.abs(a.y - ent.y);
      const db = Math.abs(b.y - ent.y);
      if (da !== db) return da - db;
      return dist(ent, a) - dist(ent, b);
    });
    if (ent.targetType === 'tower') {
      const towers = options.filter(o => o.isTower);
      if (towers.length) return towers[0];
    }
    return options[0] || null;
  },

  deploy(cardKey, side, x, y, laneIndex) {
    const card = CARD_MAP[cardKey];
    if (!card || card.spell) return;
    const dropY = clamp(y, LANE_Y[laneIndex] - 36, LANE_Y[laneIndex] + 36);
    const spawnX = clamp(x, 60, ARENA.w - 60);
    const out = card.spawn(side, laneIndex, spawnX, dropY, this);
    const units = Array.isArray(out) ? out : [out];
    for (const e of units) {
      e.laneIndex = e.laneIndex ?? laneIndex;
      this.entities.push(e);
    }
  },

  canDropAt(x, side, laneIndex = 0) {
    const bridgeBuffer = 40;
    if (side === SIDE.PLAYER) {
      if (x <= ARENA.w / 2 - bridgeBuffer) return true;
      const enemyTower = this.towers.find(t => t.side === SIDE.ENEMY && t.towerType === 'princess' && t.laneIndex === laneIndex);
      if (enemyTower && !enemyTower.isAlive()) return x < ARENA.w - 60;
      return false;
    }
    if (x >= ARENA.w / 2 + bridgeBuffer) return true;
    const playerTower = this.towers.find(t => t.side === SIDE.PLAYER && t.towerType === 'princess' && t.laneIndex === laneIndex);
    if (playerTower && !playerTower.isAlive()) return x > 60;
    return false;
  },

  applyDamage(target, amount, source) {
    if (!target || amount <= 0) return;
    target.hp -= amount;
    if (target.hp < 0) target.hp = 0;
    if (target.isTower) {
      if (target.towerType === 'king' && !target.active) {
        this.activateKing(target.side);
      }
      if (target.hp <= 0 && target.towerType === 'princess') {
        this.activateKing(target.side);
      }
    }
  },

  activateKing(side) {
    const king = this.towers.find(t => t.side === side && t.towerType === 'king');
    if (king && !king.active) {
      king.active = true;
      king.wakeFlash = 1.5;
      Sound.blip(780, 0.16, 0.05);
    }
  },

  doFireball(p, radius, damage, side) {
    Sound.blip(220, 0.12, 0.05);
    for (const e of this.getEntities()) {
      if (e.side === side) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d <= radius + (e.isTower ? 18 : 12)) {
        this.applyDamage(e, damage, { side });
      }
    }
    Particles.spawnExplosion(p.x, p.y, radius);
  },

  playPlayerCard(cardKey, laneIndex, x, rawY) {
    const card = CARD_MAP[cardKey];
    if (!card) return false;
    if (Math.floor(this.playerElixir) < card.cost) return false;

    if (card.spell) {
      this.playerElixir -= card.cost;
      this.doFireball({ x, y: rawY }, card.radius, card.damage, SIDE.PLAYER);
      this.cyclePlayerCard(cardKey);
      return true;
    }

    if (!this.canDropAt(x, SIDE.PLAYER, laneIndex)) return false;
    this.playerElixir -= card.cost;
    this.deploy(cardKey, SIDE.PLAYER, x, rawY, laneIndex);
    this.cyclePlayerCard(cardKey);
    return true;
  },

  cyclePlayerCard(key) {
    this.selectedCard = null;
    this.spellPreview = false;
    cycleHand(this.hand, this.deckQueue, key);
    buildCardUI();
    updateNextCardUI();
    refreshCardStates();
  },

  cycleEnemyCard(key) {
    cycleHand(this.enemyHand, this.enemyQueue, key);
  },

  playEnemyCard(cardKey, laneIndex) {
    const card = CARD_MAP[cardKey];
    if (!card) return false;
    if (Math.floor(this.enemyElixir) < card.cost) return false;
    const baseY = LANE_Y[laneIndex] + randRange(-20, 20);
    if (card.spell) {
      const targets = this.entities.filter(e => e.side === SIDE.PLAYER);
      let best = { x: ARENA.w / 2 - randRange(180, 260), y: baseY };
      let bestCount = 0;
      for (let k = 0; k < 10; k++) {
        const sx = ARENA.w / 2 - randRange(180, 260);
        const sy = LANE_Y[laneIndex] + randRange(-42, 42);
        const count = targets.filter(e => Math.hypot(e.x - sx, e.y - sy) < (card.radius + 8)).length;
        if (count > bestCount) {
          bestCount = count;
          best = { x: sx, y: sy };
        }
      }
      this.enemyElixir -= card.cost;
      this.doFireball(best, card.radius, card.damage, SIDE.ENEMY);
      this.cycleEnemyCard(cardKey);
      return true;
    }

    let dropX = ARENA.w - randRange(220, 300);
    if (!this.canDropAt(dropX, SIDE.ENEMY, laneIndex)) {
      dropX = ARENA.w - randRange(180, 220);
    }
    if (!this.canDropAt(dropX, SIDE.ENEMY, laneIndex)) return false;
    this.enemyElixir -= card.cost;
    this.deploy(cardKey, SIDE.ENEMY, dropX, baseY, laneIndex);
    this.cycleEnemyCard(cardKey);
    return true;
  },

  tick(dt) {
    if (!this.running || this.paused) return;
    this.time += dt;

    const rate = this.time >= this.doubleTimeAt ? this.elixirRate * 2 : this.elixirRate;
    this.playerElixir = clamp(this.playerElixir + rate * dt, 0, this.maxElixir);
    this.enemyElixir = clamp(this.enemyElixir + rate * dt, 0, this.maxElixir);

    for (const e of this.entities) e.update(dt, this);
    for (const t of this.towers) if (t.isAlive()) t.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);

    this.entities = this.entities.filter(e => e.isAlive() && e.x > 20 && e.x < ARENA.w - 20);
    this.projectiles = this.projectiles.filter(p => !p.dead);

    for (const t of this.towers) {
      if (t.hp <= 0 && !t._counted) {
        t._counted = true;
        if (t.side === SIDE.ENEMY) this.crowns.player++;
        else this.crowns.enemy++;
      }
    }

    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = randRange(1.4, 2.7);
      const affordable = this.enemyHand.filter(k => CARD_MAP[k].cost <= Math.floor(this.enemyElixir));
      if (affordable.length) {
        const cardKey = choice(affordable);
        const laneIndex = Math.random() < 0.5 ? 0 : 1;
        this.playEnemyCard(cardKey, laneIndex);
      }
    }

    const playerWon = this.crowns.player >= 3 || this.towers.filter(t => t.side === SIDE.ENEMY && t.isAlive()).length === 0;
    const enemyWon = this.crowns.enemy >= 3 || this.towers.filter(t => t.side === SIDE.PLAYER && t.isAlive()).length === 0;
    if (playerWon || enemyWon || this.time >= this.duration) {
      this.running = false;
    }

    UI.elixirFill.style.width = `${(this.playerElixir / this.maxElixir) * 100}%`;
    UI.elixirText.textContent = `${Math.floor(this.playerElixir)} / ${this.maxElixir}`;

    const whole = Math.floor(this.playerElixir);
    if (whole !== this.lastElixirWhole) {
      this.lastElixirWhole = whole;
      refreshCardStates();
    }
  }
};

// -------------------------------------------
// Particles
// -------------------------------------------
const Particles = {
  items: [],
  spawnExplosion(x, y, radius) {
    for (let i = 0; i < 26; i++) {
      this.items.push({
        x,
        y,
        r: randRange(4, 10),
        life: randRange(0.35, 0.55),
        vx: randRange(-160, 160),
        vy: randRange(-160, 160)
      });
    }
  },
  update(dt) {
    for (const p of this.items) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.items = this.items.filter(p => p.life > 0);
  },
  draw(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      g.globalAlpha = clamp(p.life * 2, 0, 1);
      g.fillStyle = 'rgba(255, 190, 120, 0.8)';
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
  g.save();
  const bg = Assets.get('arena');
  if (bg) {
    g.drawImage(bg, 0, 0, ARENA.w, ARENA.h);
  } else {
    g.fillStyle = '#0e1231';
    g.fillRect(0, 0, ARENA.w, ARENA.h);
    g.strokeStyle = 'rgba(255,255,255,0.04)';
    g.lineWidth = 1;
    for (let x = 0; x < ARENA.w; x += 40) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, ARENA.h);
      g.stroke();
    }
    for (let y = 0; y < ARENA.h; y += 40) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(ARENA.w, y);
      g.stroke();
    }
    g.fillStyle = '#1e2a64';
    g.fillRect(0, ARENA.riverY - 4, ARENA.w, 8);
  }
  // Drop zone overlay for player
  g.fillStyle = 'rgba(15, 18, 40, 0.28)';
  g.fillRect(0, 0, ARENA.w / 2 - 40, ARENA.h);
  g.fillStyle = 'rgba(80, 20, 32, 0.18)';
  g.fillRect(ARENA.w / 2 + 40, 0, ARENA.w / 2 - 40, ARENA.h);
  g.restore();
}

function drawUI(g) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(ARENA.w / 2 - 110, 12, 220, 44);
  g.fillStyle = '#e7e8ee';
  g.font = 'bold 20px Inter, Arial';
  const tLeft = Math.max(0, Math.floor(Game.duration - Game.time));
  const m = Math.floor(tLeft / 60).toString();
  const s = (tLeft % 60).toString().padStart(2, '0');
  g.fillText(`${m}:${s}`, ARENA.w / 2 - 20, 42);

  g.font = 'bold 18px Inter, Arial';
  g.textAlign = 'right';
  g.fillText(`👑 ${Game.crowns.player}`, ARENA.w / 2 - 30, 38);
  g.textAlign = 'left';
  g.fillText(`${Game.crowns.enemy} 👑`, ARENA.w / 2 + 30, 38);

  if (Game.time >= Game.doubleTimeAt) {
    g.fillStyle = 'rgba(255, 215, 0, 0.18)';
    g.fillRect(ARENA.w / 2 - 200, 16, 90, 32);
    g.fillStyle = '#ffd95a';
    g.font = 'bold 16px Inter, Arial';
    g.fillText('2x Elixir', ARENA.w / 2 - 190, 38);
  }

  if (Game.selectedCard) {
    const card = CARD_MAP[Game.selectedCard];
    if (card && !card.spell) {
      const laneIndex = Math.abs(Game.hover.y - LANE_Y[0]) < Math.abs(Game.hover.y - LANE_Y[1]) ? 0 : 1;
      const previewX = clamp(Game.hover.x, 60, ARENA.w - 60);
      const previewY = clamp(Game.hover.y, LANE_Y[laneIndex] - 36, LANE_Y[laneIndex] + 36);
      const canDrop = Game.canDropAt(previewX, SIDE.PLAYER, laneIndex) && Math.floor(Game.playerElixir) >= card.cost;
      const sprite = card.sprite ? Assets.getSprite(card.sprite) : null;
      g.globalAlpha = canDrop ? 0.75 : 0.35;
      if (sprite) {
        const scale = card.previewScale || 0.38;
        const drawW = sprite.width * scale;
        const drawH = sprite.height * scale;
        g.drawImage(sprite, previewX - drawW / 2, previewY - drawH + 14, drawW, drawH);
      } else {
        g.fillStyle = canDrop ? 'rgba(109,141,255,0.6)' : 'rgba(255,93,125,0.35)';
        g.beginPath();
        g.arc(previewX, previewY, 26, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    } else if (card && card.spell && Game.spellPreview) {
      g.strokeStyle = 'rgba(255, 210, 150, 0.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(Game.hover.x, Game.hover.y, card.radius, 0, TAU);
      g.stroke();
    }
  }

  g.restore();
}

// -------------------------------------------
// Input & Cards
// -------------------------------------------
function buildCardUI() {
  UI.cardsEl.innerHTML = '';
  for (const key of Game.hand) {
    const card = CARD_MAP[key];
    if (!card) continue;
    const btn = document.createElement('button');
    btn.className = 'card';
    btn.type = 'button';
    btn.setAttribute('data-key', key);
    const art = card.art ? `<img src="${card.art}" alt="${card.name} card art" loading="lazy" />` : '<span>🎴</span>';
    btn.innerHTML = `
      <div class="art">${art}</div>
      <div class="title">${card.name}</div>
      <div class="cost">💧 ${card.cost}</div>
    `;
    btn.addEventListener('click', () => {
      if (Math.floor(Game.playerElixir) < card.cost) return;
      if (Game.selectedCard === key) {
        Game.selectedCard = null;
        Game.spellPreview = false;
      } else {
        Game.selectedCard = key;
        Game.spellPreview = !!card.spell;
      }
      refreshCardStates();
    });
    UI.cardsEl.appendChild(btn);
  }
  refreshCardStates();
  updateNextCardUI();
}

function updateNextCardUI() {
  if (!UI.nextCardEl) return;
  const nextKey = Game.deckQueue[0];
  const card = nextKey ? CARD_MAP[nextKey] : null;
  if (!card) {
    UI.nextCardEl.innerHTML = '<div class="title">--</div>';
    return;
  }
  const art = card.art ? `<img src="${card.art}" alt="${card.name} upcoming card art" loading="lazy" />` : '<span>🎴</span>';
  UI.nextCardEl.innerHTML = `
    <div class="art">${art}</div>
    <div class="title">${card.name}</div>
    <div class="cost">💧 ${card.cost}</div>
  `;
}

function refreshCardStates() {
  if (Game.selectedCard && !Game.hand.includes(Game.selectedCard)) {
    Game.selectedCard = null;
    Game.spellPreview = false;
  }
  const e = Math.floor(Game.playerElixir);
  const buttons = UI.cardsEl.querySelectorAll('.card');
  buttons.forEach(btn => {
    const key = btn.getAttribute('data-key');
    const card = CARD_MAP[key];
    const disabled = !card || card.cost > e;
    btn.classList.toggle('disabled', disabled);
    btn.classList.toggle('selected', Game.selectedCard === key);
  });
}

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
  if (!card) return;
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const laneIndex = Math.abs(y - LANE_Y[0]) < Math.abs(y - LANE_Y[1]) ? 0 : 1;
  if (Game.playPlayerCard(Game.selectedCard, laneIndex, x, y)) {
    refreshCardStates();
  }
});

// Buttons
UI.startBtn.addEventListener('click', () => {
  Game.start();
});
UI.pauseBtn.addEventListener('click', () => {
  Game.pauseToggle();
  drawFrame();
});
UI.resetBtn.addEventListener('click', () => {
  Game.reset();
});
UI.muteToggle.addEventListener('change', (e) => {
  Game.muted = e.target.checked;
});

// -------------------------------------------
// Main Loop
// -------------------------------------------
function loop() {
  const t = now();
  let dt = t - Game.lastT;
  Game.lastT = t;
  if (dt > 0.05) dt = 0.05;

  if (Game.running && !Game.paused) {
    Game.tick(dt);
  }
  Particles.update(dt);
  drawFrame();

  if (Game.running || Particles.items.length > 0) {
    requestAnimationFrame(loop);
  }
}

function drawFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawArena(ctx);
  for (const t of Game.towers) if (t.isAlive()) t.draw(ctx);
  for (const p of Game.projectiles) p.draw(ctx);
  for (const e of Game.entities) e.draw(ctx);
  Particles.draw(ctx);
  drawUI(ctx);

  if (!Game.running && Game.time > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, ARENA.h / 2 - 70, ARENA.w, 140);
    ctx.fillStyle = '#e7e8ee';
    ctx.font = '800 32px Inter, Arial';
    const p = Game.crowns.player;
    const e = Game.crowns.enemy;
    const text = p === e ? `Draw! (${p}-${e})` : (p > e ? `You Win! (${p}-${e})` : `You Lose! (${p}-${e})`);
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, ARENA.w / 2 - tw / 2, ARENA.h / 2 + 12);
    ctx.restore();
  } else if (Game.paused && Game.running) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, ARENA.h / 2 - 60, ARENA.w, 120);
    ctx.fillStyle = '#e7e8ee';
    ctx.font = '800 28px Inter, Arial';
    const text = 'Paused';
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, ARENA.w / 2 - tw / 2, ARENA.h / 2 + 10);
    ctx.restore();
  }
}

// -------------------------------------------
// Init
// -------------------------------------------
function fitCanvas() {
  const wrap = document.querySelector('.stage-wrap');
  const w = wrap.clientWidth;
  const aspect = ARENA.w / ARENA.h;
  const h = w / aspect;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
window.addEventListener('resize', fitCanvas);

Game.reset();
fitCanvas();
drawFrame();

Assets.loadAll().then(() => {
  drawFrame();
});
