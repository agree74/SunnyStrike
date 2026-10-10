// ============================================================================
// SUNNY STRIKE - FULL FIXED VERSION (PIXEL-PERFECT & ORIGINAL AUDIO)
// ============================================================================

const tg = window.Telegram?.WebApp || {
    ready: () => {},
    expand: () => {},
    HapticFeedback: { notificationOccurred: () => {} },
    sendData: () => {},
    close: () => {}
};
tg.ready();
tg.expand();

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let bestScore = parseInt(localStorage.getItem('bestScore') || '0');
let audioCtx;
let gameState = "playing";
let score = 0, level = 1, lives = 3;
let weaponLevel = 1, playerDamage = 1, bulletMultiplier = 1;
let greenBulletsActive = false;
let isInvulnerable = false, isBossActive = false, isBossInvulnerable = false;

// Дополнительные механики
let comboCount = 0;
let comboMultiplier = 1;
let comboTimer = null;
let ultCharge = 0;
const MAX_ULT = 100;
let isShieldActive = false;

// === ИГРОВЫЕ ОБЪЕКТЫ ===
let player, bullets, enemyBullets, clouds, bonuses, boss, bossBar, bgClouds;
let scoreText, levelText, livesText, bestScoreText, damageText, comboText, ultButton;
let exitButton;

// ============================================================================
// ORIGINAL AUDIO SYSTEM (ВОЗВРАЩЕНА ИЗ ИСХОДНОЙ ВЕРСИИ)
// ============================================================================

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSFX(scene, type) {
    const ctx = scene.sound.context || audioCtx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    const osc = (f, e, d, w, t = now, v = 0.1) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = w;
        o.frequency.setValueAtTime(f, t);
        if (f !== e) o.frequency.exponentialRampToValueAtTime(Math.max(1, e), t + d);
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + d);
    };

    switch(type) {
        case 'shoot': osc(600, 100, 0.2, 'triangle'); break;
        case 'hit': osc(400, 50, 0.2, 'sine'); break;
        case 'hurt': 
            [523, 440, 349, 261].forEach((f, i) => osc(f, f - 50, 0.15, 'square', now + i * 0.1));
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
            break;
        case 'boss_win': [523, 659, 783, 1046].forEach((f, i) => osc(f, f, 0.4, 'square', now + i * 0.08)); break;
        case 'game_over': [392, 370, 349].forEach((f, i) => osc(f, f - 10, 1.2, 'sawtooth', now + i * 0.6)); break;
        case 'powerup': osc(800, 1200, 0.3, 'triangle', now, 0.1); break;
        case 'enemy_death': osc(100, 50, 0.15, 'triangle', now, 0.15); break;
        case 'ult': osc(150, 900, 0.4, 'sawtooth', now, 0.15); break;
    }
}

// ============================================================================
// PHASER CONFIG (PIXEL-PERFECT РЕНДЕРИНГ БЕЗ МЫЛА)
// ============================================================================

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    pixelArt: true, // Включаем режим PixelArt для жестких и четких границ текстур
    antialias: false, // Отключаем размытие градиентов браузером
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { preload, create, update },
    backgroundColor: '#4ea1d3'
};

const game = new Phaser.Game(config);

// ============================================================================
// PRELOAD - ЧЕТКАЯ ГЕНЕРАЦИЯ ТЕКСТУР И ПИКСЕЛЬНЫХ ФОРМ
// ============================================================================

function preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    
    // Вспомогательный метод четкой генерации текстур с отключением интерполяции контекста
    const createSharpTexture = (key, width, height, drawCallback) => {
        const canvas = this.textures.createCanvas(key, width, height);
        const ctx = canvas.getContext();
        ctx.imageSmoothingEnabled = false; // Ключевой фикс размытия для Canvas
        drawCallback(g, ctx, width, height);
        canvas.refresh();
        g.clear();
    };

    // 1. Солнышко обычное (80x80)
    createSharpTexture('sun_normal', 80, 80, (graphics) => {
        for(let i=0; i<12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            graphics.fillStyle(0xffdd00);
            graphics.fillCircle(40 + Math.cos(angle) * 28, 40 + Math.sin(angle) * 28, 5);
        }
        graphics.fillStyle(0xffcc00); graphics.fillCircle(40, 40, 24);
        graphics.fillStyle(0x000000); graphics.fillCircle(33, 36, 3); graphics.fillCircle(47, 36, 3);
        graphics.lineStyle(2, 0x000000); graphics.beginPath(); graphics.arc(40, 46, 10, 0.15 * Math.PI, 0.85 * Math.PI); graphics.strokePath();
        graphics.generateTexture('sun_normal', 80, 80);
    });

    // 2. Солнышко раненое (80x80)
    createSharpTexture('sun_hurt', 80, 80, (graphics) => {
        for(let i=0; i<12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            graphics.fillStyle(0xccaa00); graphics.fillCircle(40 + Math.cos(angle) * 28, 40 + Math.sin(angle) * 28, 5);
        }
        graphics.fillStyle(0xffaa00); graphics.fillCircle(40, 40, 24);
        graphics.fillStyle(0x000000); graphics.fillCircle(33, 36, 3); graphics.fillCircle(47, 36, 3);
        graphics.lineStyle(2, 0x000000);
        graphics.beginPath(); graphics.moveTo(29, 32); graphics.lineTo(37, 34); graphics.moveTo(51, 32); graphics.lineTo(43, 34); graphics.strokePath();
        graphics.beginPath(); graphics.moveTo(32, 52); graphics.lineTo(40, 48); graphics.lineTo(48, 52); graphics.strokePath();
        graphics.generateTexture('sun_hurt', 80, 80);
    });

    // 3. Солнышко счастливое (120x120)
    createSharpTexture('sun_happy', 120, 120, (graphics) => {
        for(let i=0; i<12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            graphics.fillStyle(0xffdd00); graphics.fillCircle(60 + Math.cos(angle) * 50, 60 + Math.sin(angle) * 50, 9);
        }
        graphics.fillStyle(0xffcc00); graphics.fillCircle(60, 60, 44);
        graphics.fillStyle(0x000000); graphics.fillCircle(47, 53, 6); graphics.fillCircle(73, 53, 6);
        graphics.fillStyle(0xffffff); graphics.fillCircle(50, 50, 3); graphics.fillCircle(76, 50, 3);
        graphics.lineStyle(4, 0xcc3300); graphics.beginPath(); graphics.arc(60, 75, 24, 0.1 * Math.PI, 0.9 * Math.PI); graphics.strokePath();
        graphics.generateTexture('sun_happy', 120, 120);
    });

    // Враги
    createSharpTexture('cloud1', 80, 60, (graphics) => {
        graphics.fillStyle(0xf8f8f8); graphics.fillCircle(40, 32, 16); graphics.fillCircle(20, 26, 10); graphics.fillCircle(60, 26, 10); graphics.fillCircle(40, 22, 12);
        graphics.fillStyle(0x000000); graphics.fillCircle(32, 34, 2); graphics.fillCircle(48, 34, 2);
        graphics.lineStyle(3, 0x000000); graphics.beginPath(); graphics.arc(40, 40, 6, 0.2 * Math.PI, 0.8 * Math.PI, true); graphics.strokePath();
        graphics.generateTexture('cloud1', 80, 60);
    });

    createSharpTexture('cloud2', 80, 75, (graphics) => {
        graphics.fillStyle(0x4a4a5a); graphics.fillCircle(40, 38, 16); graphics.fillCircle(20, 26, 12); graphics.fillCircle(40, 22, 14); graphics.fillCircle(60, 26, 12);
        graphics.lineStyle(4, 0xffff00);
        for(let i=0; i<3; i++) {
            const mx = 16 + i * 24; graphics.beginPath(); graphics.moveTo(mx, 44); graphics.lineTo(mx - 6, 54); graphics.lineTo(mx, 54); graphics.lineTo(mx - 6, 64); graphics.strokePath();
        }
        graphics.fillStyle(0x000000); graphics.fillCircle(32, 38, 2); graphics.fillCircle(48, 38, 2);
        graphics.generateTexture('cloud2', 80, 75);
    });

    createSharpTexture('cloud3', 100, 50, (graphics) => {
        graphics.fillStyle(0xffcccc); graphics.fillCircle(50, 25, 21); graphics.fillStyle(0xffdddd); graphics.fillCircle(25, 18, 10); graphics.fillCircle(75, 18, 10);
        graphics.fillStyle(0x000000); graphics.fillCircle(38, 28, 2); graphics.fillCircle(62, 28, 2);
        graphics.generateTexture('cloud3', 100, 50);
    });

    createSharpTexture('crystal', 70, 70, (graphics) => {
        graphics.fillStyle(0x00ffff); graphics.fillTriangle(35, 5, 55, 35, 35, 65); graphics.fillTriangle(35, 5, 15, 35, 35, 65);
        graphics.lineStyle(3, 0xffffff); graphics.beginPath(); graphics.moveTo(35, 5); graphics.lineTo(55, 35); graphics.lineTo(35, 65); graphics.lineTo(15, 35); graphics.closePath(); graphics.strokePath();
        graphics.generateTexture('crystal', 70, 70);
    });

    createSharpTexture('debris', 70, 70, (graphics) => {
        graphics.fillStyle(0x999999); graphics.fillRect(17, 17, 36, 36);
        graphics.fillStyle(0xff0000); graphics.fillCircle(35, 32, 6);
        graphics.generateTexture('debris', 70, 70);
    });

    // Боссы
    createSharpTexture('boss1', 120, 120, (graphics) => {
        graphics.fillStyle(0x333344); graphics.fillCircle(60, 60, 45);
        graphics.lineStyle(4, 0xffff00); for(let i=0; i<8; i++) { const a = (i / 8) * Math.PI * 2; graphics.beginPath(); graphics.moveTo(60 + Math.cos(a) * 40, 60 + Math.sin(a) * 40); graphics.lineTo(60 + Math.cos(a) * 65, 60 + Math.sin(a) * 65); graphics.strokePath(); }
        graphics.generateTexture('boss1', 120, 120);
    });
    createSharpTexture('boss2', 120, 120, (graphics) => { graphics.fillStyle(0x4a5a6a); graphics.fillCircle(60, 60, 45); graphics.generateTexture('boss2', 120, 120); });
Используйте код с осторожностью.
createSharpTexture('boss3', 120, 120, (graphics) => { graphics.fillStyle(0xff6600); graphics.fillCircle(60, 60, 45); graphics.fillStyle(0x111111); graphics.fillCircle(75, 60, 42); graphics.generateTexture('boss3', 120, 120); });
createSharpTexture('boss4', 120, 120, (graphics) => { graphics.fillStyle(0xaaddff); graphics.fillCircle(60, 60, 48); graphics.generateTexture('boss4', 120, 120); });
createSharpTexture('boss5', 120, 120, (graphics) => { graphics.fillStyle(0x000000); graphics.fillCircle(60, 60, 50); graphics.lineStyle(4, 0xcc00cc); graphics.strokeCircle(60, 60, 50); graphics.generateTexture('boss5', 120, 120); });
// Пули и бонусы
createSharpTexture('bullet', 24, 40, (graphics) => { graphics.fillStyle(0xffffff); graphics.fillCircle(12, 20, 7); graphics.generateTexture('bullet', 24, 40); });
createSharpTexture('bullet_double', 32, 32, (graphics) => { graphics.fillStyle(0xffff00); graphics.fillCircle(16, 16, 10); graphics.generateTexture('bullet_double', 32, 32); });
createSharpTexture('enemy_bullet', 24, 24, (graphics) => { graphics.fillStyle(0xff4444); graphics.fillCircle(12, 12, 6); graphics.generateTexture('enemy_bullet', 24, 24); });
createSharpTexture('bonus_double', 50, 50, (graphics) => { graphics.fillStyle(0x00ff00); graphics.fillCircle(25, 25, 20); graphics.generateTexture('bonus_double', 50, 50); });
createSharpTexture('bonus_speed', 50, 50, (graphics) => { graphics.fillStyle(0xffff00); graphics.fillCircle(25, 25, 20); graphics.generateTexture('bonus_speed', 50, 50); });
createSharpTexture('bonus_damage', 50, 50, (graphics) => { graphics.fillStyle(0xff00ff); graphics.fillCircle(25, 25, 20); graphics.generateTexture('bonus_damage', 50, 50); });
createSharpTexture('bonus_heart', 50, 50, (graphics) => { graphics.fillStyle(0xff0000); graphics.fillCircle(25, 25, 20); graphics.generateTexture('bonus_heart', 50, 50); });
createSharpTexture('bonus_shield', 50, 50, (graphics) => { graphics.fillStyle(0x00ffff); graphics.fillCircle(25, 25, 20); graphics.generateTexture('bonus_shield', 50, 50); });
createSharpTexture('shield_fx', 90, 90, (graphics) => { graphics.lineStyle(3, 0x00ffff, 0.8); graphics.strokeCircle(45, 45, 40); graphics.generateTexture('shield_fx', 90, 90); });
createSharpTexture('ult_wave', 160, 160, (graphics) => { graphics.lineStyle(4, 0xffdd00); graphics.strokeCircle(80, 80, 75); graphics.generateTexture('ult_wave', 160, 160); });
// Фоновые облака (100x50)
createSharpTexture('cloud_bg', 100, 50, (graphics) => {
graphics.fillStyle(0xffffff, 0.15); graphics.fillCircle(50, 25, 16); graphics.fillCircle(30, 21, 10); graphics.fillCircle(70, 21, 10);
graphics.generateTexture('cloud_bg', 100, 50);
});
// Финал
createSharpTexture('planet1', 60, 60, (graphics) => { graphics.fillStyle(0xff8866); graphics.fillCircle(30, 30, 25); graphics.generateTexture('planet1', 60, 60); });
createSharpTexture('planet2', 60, 60, (graphics) => { graphics.fillStyle(0xffcc88); graphics.fillCircle(30, 30, 25); graphics.generateTexture('planet2', 60, 60); });
createSharpTexture('planet3', 60, 60, (graphics) => { graphics.fillStyle(0x4488ff); graphics.fillCircle(30, 30, 25); graphics.generateTexture('planet3', 60, 60); });
createSharpTexture('planet4', 60, 60, (graphics) => { graphics.fillStyle(0x88ff88); graphics.fillCircle(30, 30, 25); graphics.generateTexture('planet4', 60, 60); });
createSharpTexture('planet5', 60, 60, (graphics) => { graphics.fillStyle(0xcc88ff); graphics.fillCircle(30, 30, 22); graphics.lineStyle(4, 0xe2e8f0); graphics.strokeCircle(30, 30, 28); graphics.generateTexture('planet5', 60, 60); });
createSharpTexture('galaxy', 200, 200, (graphics) => { graphics.fillStyle(0xffffff, 0.3); graphics.fillCircle(100, 100, 80); graphics.generateTexture('galaxy', 200, 200); });
createSharpTexture('final_blackhole', 200, 200, (graphics) => { graphics.fillStyle(0x000000); graphics.fillCircle(100, 100, 70); graphics.lineStyle(4, 0xcc00cc); graphics.strokeCircle(100, 100, 70); graphics.generateTexture('final_blackhole', 200, 200); });
}
// ============================================================================
// CREATE - ИНИЦИАЛИЗАЦИЯ И СБОРКА ИГРЫ
// ============================================================================
function create() {
initAudio();
this.cameras.main.setBackgroundColor(LEVEL_CONFIG[1].color);
// Фоновые облака параллакса
bgClouds = this.add.group();
for (let i = 0; i < 15; i++) {
const bc = this.add.image(Phaser.Math.Between(0, config.width), Phaser.Math.Between(0, config.height), 'cloud_bg').setScale(2.0).setDepth(-2);
bc.cloudSpeed = Phaser.Math.FloatBetween(1.0, 2.5);
bgClouds.add(bc);
}
// Игрок
player = this.physics.add.sprite(config.width / 2, config.height - 120, 'sun_normal');
player.setCollideWorldBounds(true);
player.setDisplaySize(60, 60);
// Группы объектов
bullets = this.physics.add.group();
enemyBullets = this.physics.add.group();
clouds = this.physics.add.group();
bonuses = this.physics.add.group();
// HUD Текст
scoreText = this.add.text(20, 20, 'Очки: 0', { fontSize: '22px', fill: '#ffffff', fontWeight: 'bold', stroke: '#000000', strokeThickness: 4 });
bestScoreText = this.add.text(config.width - 20, 20, '🏆: ' + bestScore, { fontSize: '20px', fill: '#ffd700', fontWeight: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(1, 0);
levelText = this.add.text(20, 50, 'Уровень: 1', { fontSize: '20px', fill: '#ffff00', fontWeight: 'bold', stroke: '#000000', strokeThickness: 4 });
damageText = this.add.text(20, 110, 'Урон: 1', { fontSize: '18px', fill: '#ff6600', fontWeight: 'bold', stroke: '#000000', strokeThickness: 4 });
comboText = this.add.text(20, 135, 'Комбо: x1', { fontSize: '18px', fill: '#00ffcc', fontWeight: 'bold', stroke: '#000000', strokeThickness: 4 });
updateLivesText.call(this);
// Интерактивные кнопки
ultButton = this.add.text(config.width - 25, config.height - 105, 'ВСПЫШКА\n0%', { fontSize: '14px', fill: '#ffffff', fontWeight: 'bold', align: 'center', backgroundColor: '#4a5568', padding: { x: 12, y: 10 } }).setOrigin(1, 1).setInteractive().setDepth(100);
ultButton.on('pointerdown', () => { triggerUltimate.call(this); });
exitButton = this.add.text(config.width - 15, config.height - 25, 'Выйти', { fontSize: '16px', fill: '#ffffff', backgroundColor: '#e53e3e', padding: { x: 10, y: 5 } }).setOrigin(1, 1).setInteractive().setDepth(100);
exitButton.on('pointerdown', () => { sendScoreAndClose(); });
// Управление пальцем / мышью
this.input.on('pointermove', (p) => {
if (player && player.active && gameState === "playing") {
player.x = Phaser.Math.Clamp(p.x, 20, config.width - 20);
player.y = Phaser.Math.Clamp(p.y - 20, 20, config.height - 20);
if(player.shieldSprite && player.shieldSprite.active) player.shieldSprite.setPosition(player.x, player.y);
}
});
this.input.on('pointerdown', () => { initAudio(); });
// Таймеры спавна и стрельбы
this.time.addEvent({ delay: 300, callback: fire, callbackScope: this, loop: true });
this.spawnTimer = this.time.addEvent({ delay: 1000, callback: () => { if (!isBossActive && gameState === "playing") spawnEnemy.call(this); }, loop: true });
this.bossTimer = this.time.addEvent({ delay: 20000, callback: prepareBoss, callbackScope: this, loop: true });
// Коллизии
this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
this.physics.add.overlap(player, enemyBullets, onPlayerHitBullet, null, this);
this.physics.add.overlap(player, bonuses, collectBonus, null, this);
bossBar = this.add.graphics().setDepth(100);
}
// ============================================================================
// GAMEPLAY MECHANICS (ОБНОВЛЕННЫЙ БАЛАНС И ЛОГИКА)
// ============================================================================
function addCombo() {
comboCount++;
comboMultiplier = Math.min(5, 1 + Math.floor(comboCount / 5));
if (comboText) {
comboText.setText('Комбо: x' + comboMultiplier);
comboText.setColor(comboMultiplier > 2 ? '#ff0055' : '#00ffcc');
}
clearTimeout(comboTimer);
comboTimer = setTimeout(() => {
comboCount = 0; comboMultiplier = 1;
if (comboText) comboText.setText('Комбо: x1').setColor('#00ffcc');
}, 2500);
}
function addUltCharge(amount) {
ultCharge = Math.min(MAX_ULT, ultCharge + amount);
if (ultButton) {
ultButton.setText('ВСПЫШКА\n' + Math.floor(ultCharge) + '%');
ultButton.setStyle({ backgroundColor: ultCharge >= 100 ? '#ffaa00' : '#4a5568' });
}
}
function triggerUltimate() {
if (ultCharge < 100 || gameState !== 'playing') return;
ultCharge = 0; addUltCharge(0);
playSFX(this, 'ult');
this.cameras.main.shake(200, 0.01);
const wave = this.add.image(player.x, player.y, 'ult_wave');
this.tweens.add({ targets: wave, scale: 5, alpha: 0, duration: 500, onComplete: () => wave.destroy() });
enemyBullets.clear(true, true);
clouds.children.each(enemy => {
if (enemy && enemy.active) {
enemy.hp -= 10;
if (enemy.hp <= 0) hitEnemy.call(this, { destroy: () => {}, active: true }, enemy);
}
});
if (boss && boss.active && !isBossInvulnerable) {
boss.hp -= 15;
showBossDamageText.call(this, boss);
checkBossDeath.call(this);
}
}
function updateLivesText() {
if (livesText) livesText.destroy();
let hearts = '';
for (let i = 0; i < lives; i++) hearts += '💛';
livesText = this.add.text(20, 80, hearts, { fontSize: '24px' });
}
function updateDamageText() {
if (damageText) damageText.setText('Урон: ' + playerDamage);
}
function fire() {
if (gameState !== "playing" || !player.active) return;
playSFX(this, 'shoot');
let totalBullets = greenBulletsActive ? bulletMultiplier * 3 : bulletMultiplier;
const baseTexture = greenBulletsActive ? 'bullet' : (weaponLevel === 1 ? 'bullet' : 'bullet_double');
if (greenBulletsActive) {
const spreadAngle = 60;
const centerX = totalBullets - 1;
for (let i = 0; i < totalBullets; i++) {
const b = bullets.create(player.x, player.y - 20, baseTexture);
if (b) {
b.hasHit = false; b.body.setSize(20, 35);
const angle = ((i / Math.max(1, centerX)) * spreadAngle - (spreadAngle / 2)) * (Math.PI / 180);
b.setVelocity(Math.sin(angle) * 600, -Math.cos(angle) * 600);
}
}
} else if (weaponLevel === 1) {
const spacing = 15;
const startX = player.x - ((totalBullets - 1) * spacing) / 2;
for (let i = 0; i < totalBullets; i++) {
const b = bullets.create(startX + (i * spacing), player.y - 20, 'bullet');
if (b) { b.setVelocityY(-600); b.hasHit = false; b.body.setSize(20, 35); }
}
} else {
const positions = [-150, -75, 0, 75, 150];
for (let i = 0; i < totalBullets; i++) {
const b = bullets.create(player.x, player.y - 20, 'bullet_double');
if (b) { b.setVelocityY(-500); b.setVelocityX(positions[i % positions.length]); b.hasHit = false; b.body.setSize(28, 28); }
}
}
}
function spawnEnemy() {
const cfg = LEVEL_CONFIG[level];
if (!cfg || isBossActive) return;
const x = Phaser.Math.Between(40, config.width - 40);
const enemy = clouds.create(x, -50, cfg.enemy);
if (!enemy) return;
enemy.hp = getEnemyHp(cfg.enemyHp);
const speed = cfg.speed * Math.pow(1.1, level - 1) * Phaser.Math.FloatBetween(0.8, 1.2);
enemy.setVelocityY(speed);
if (level >= 2) {
this.tweens.add({ targets: enemy, x: enemy.x + Phaser.Math.Between(-100, 100), duration: 1000, yoyo: true, repeat: -1 });
}
}
function hitEnemy(bullet, enemy) {
if (bullet.hasHit || !bullet.active || !enemy.active) return;
bullet.hasHit = true; bullet.destroy();
enemy.hp -= playerDamage;
playSFX(this, 'hit');
showDamageText.call(this, enemy.x + 20, enemy.y - 20, playerDamage);
if (enemy.hp <= 0) {
playSFX(this, 'enemy_death');
enemy.disableBody(true, true);
addUltCharge(4); addCombo();
if (Math.random() < 0.2) {
const types = ['bonus_double', 'bonus_speed', 'bonus_damage', 'bonus_heart', 'bonus_shield'];
const bonus = bonuses.create(enemy.x, enemy.y + 20, Phaser.Utils.Array.GetRandom(types));
if (bonus) bonus.setVelocityY(80);
}
score += 10 * comboMultiplier; scoreText.setText('Очки: ' + score);
if (score > bestScore) { bestScore = score; bestScoreText.setText('🏆: ' + bestScore); }
}
}
function collectBonus(player, bonus) {
const type = bonus.texture.key; playSFX(this, 'powerup');
const txt = this.add.text(player.x, player.y - 30, '', { fontSize: '28px', fill: '#ffff00', fontWeight: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
if (type === 'bonus_double') {
greenBulletsActive = true; txt.setText('x3 ПУЛИ!');
this.time.delayedCall(7000, () => { greenBulletsActive = false; });
} else if (type === 'bonus_speed') {
bulletMultiplier += 1; updateDamageText(); txt.setText('ПУЛИ +1!');
} else if (type === 'bonus_damage') {
playerDamage += 1; updateDamageText(); txt.setText('УРОН +1!');
} else if (type === 'bonus_shield') {
isShieldActive = true; txt.setText('ЩИТ!');
if (!player.shieldSprite) player.shieldSprite = this.add.image(player.x, player.y, 'shield_fx');
} else if (type === 'bonus_heart') {
if (lives < 5) { lives++; updateLivesText.call(this); txt.setText('+1 ЖИЗНЬ!'); }
else { score += 50; scoreText.setText('Очки: ' + score); txt.setText('+50 ОЧКОВ!'); }
}
this.tweens.add({ targets: txt, y: txt.y - 30, alpha: 0, duration: 500, onComplete: () => txt.destroy() });
bonus.destroy();
}
function onPlayerHitBullet(player, bullet) {
bullet.destroy(); onPlayerHit.call(this, player, { destroy: () => {} });
}
function onPlayerHit(player, enemy) {
if (isInvulnerable || gameState !== "playing") return;
if (enemy.destroy) enemy.destroy();
comboCount = 0; comboMultiplier = 1;
if (comboText) comboText.setText('Комбо: x1').setColor('#00ffcc');
if (isShieldActive) {
isShieldActive = false;
if (player.shieldSprite) { player.shieldSprite.destroy(); player.shieldSprite = null; }
return;
}
lives--; updateLivesText.call(this);
playSFX(this, 'hurt');
if (lives <= 0) {
gameState = "gameover";
if (this.spawnTimer) this.spawnTimer.remove(); if (this.bossTimer) this.bossTimer.remove();
bullets.clear(true, true); enemyBullets.clear(true, true); clouds.clear(true, true); bonuses.clear(true, true); bossBar.clear();
if (boss) boss.destroy();
playSFX(this, 'game_over');
this.add.text(config.width / 2, config.height / 2, 'GAME OVER', { fontSize: '64px', fill: '#ff0000', fontWeight: 'bold' }).setOrigin(0.5);
this.time.delayedCall(2000, () => { this.tweens.killAll(); this.time.removeAllEvents(); player.destroy(); sendScoreAndClose(); });
return;
}
isInvulnerable = true; player.setTexture('sun_hurt');
this.tweens.add({
targets: player, alpha: 0.2, duration: 100, yoyo: true, repeat: 10,
onComplete: () => { player.alpha = 1; player.setTexture('sun_normal'); isInvulnerable = false; }
});
}
// ============================================================================
// БОССЫ И БАЛАНС HP (ФИКС МОМЕНТАЛЬНОЙ СМЕРТИ БОССА)
// ============================================================================
function prepareBoss() {
if (isBossActive || gameState !== "playing" || level > 5) return;
isBossInvulnerable = true;
this.time.delayedCall(2000, () => { isBossInvulnerable = false; });
isBossActive = true;
boss = this.physics.add.sprite(config.width / 2, -100, 'boss' + level);
boss.setDisplaySize(100, 100); boss.body.setSize(80, 80);
// ВАЖНЫЙ ФИКС: Хитпоинты прописываются СРАЗУ при создании, а не через 2 секунды
boss.maxHp = 20 + (level * 20);
boss.hp = boss.maxHp;
boss.alpha = 0.5;
this.tweens.add({ targets: boss, alpha: 0.2, duration: 200, yoyo: true, repeat: 5 });
showBossText(this, level);
this.time.delayedCall(2000, () => {
if (!boss || !boss.active) return;
boss.alpha = 1;
// Паттерн атаки снарядами
boss.shootTimer = this.time.addEvent({
delay: 1200,
callback: () => {
if (!boss || !boss.active || isBossInvulnerable || gameState !== 'playing') return;
const count = LEVEL_CONFIG[level].bossBullets || 2;
for (let i = 0; i < count; i++) {
const eb = enemyBullets.create(boss.x, boss.y + 40, 'enemy_bullet');
if (eb) {
const angle = ((i / Math.max(1, count - 1)) * 60 - 30) * (Math.PI / 180);
eb.setVelocity(Math.sin(angle) * 250, Math.cos(angle) * 250);
}
}
},
loop: true
});
});
this.tweens.add({ targets: boss, y: 150, duration: 2000, ease: 'Back.out' });
this.physics.add.overlap(player, boss, () => { if (!isBossInvulnerable) onPlayerHit.call(this, player, { destroy: () => {} }); });
this.physics.add.overlap(bullets, boss, (bObj, bullet) => {
if (isBossInvulnerable) return;
bullet.destroy();
bObj.hp -= playerDamage;
playSFX(this, 'hit');
showBossDamageText.call(this, boss);
checkBossDeath.call(this);
});
}
function checkBossDeath() {
if (!boss || !boss.active || boss.hp > 0) return;
if (boss.shootTimer) boss.shootTimer.remove();
boss.destroy();
isBossActive = false;
bossBar.clear();
enemyBullets.clear(true, true);
score += 1000; scoreText.setText('Очки: ' + score);
if (lives < 5) { lives++; updateLivesText.call(this); }
if (level < 5) {
playSFX(this, 'boss_win');
level++; levelText.setText('Уровень: ' + level);
this.cameras.main.setBackgroundColor(LEVEL_CONFIG[level].color);
if (this.bossTimer) {
this.bossTimer.remove();
this.bossTimer = this.time.addEvent({ delay: 20000, callback: prepareBoss, callbackScope: this, loop: true });
}
isBossActive = true;
this.time.delayedCall(3000, () => { isBossActive = false; });
} else {
startEnding.call(this);
}
}
function updateBossBar() {
if (!boss || !boss.active || !bossBar) return;
bossBar.clear();
const barWidth = 112, barHeight = 12, barX = (config.width / 2) - 56, barY = 20;
bossBar.fillStyle(0x333333); bossBar.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
bossBar.fillStyle(0xff0000); bossBar.fillRect(barX, barY, (boss.hp / boss.maxHp) * barWidth, barHeight);
bossBar.lineStyle(2, 0xffffff); bossBar.strokeRect(barX, barY, barWidth, barHeight);
}
// ============================================================================
// ENDING SEQUENCE & SYSTEMS
// ============================================================================
function startEnding() {
gameState = "ending";
if (this.spawnTimer) this.spawnTimer.remove(); if (this.bossTimer) this.bossTimer.remove();
clouds.clear(true, true); bullets.clear(true, true); bgClouds.clear(true, true); bonuses.clear(true, true); bossBar.clear();
player.setTexture('sun_happy'); player.setDisplaySize(40, 40);
this.tweens.add({ targets: player, x: config.width / 2, y: config.height / 2, scale: 3, duration: 2000, onComplete: () => showSpaceScene.call(this) });
}
function showSpaceScene() {
this.cameras.main.setBackgroundColor('#000000');
player.x = config.width / 2; player.y = config.height / 2; player.setDepth(10);
const planets = [], planetTextures = ['planet1', 'planet2', 'planet3', 'planet4', 'planet5'];
for (let i = 0; i < 5; i++) {
const angle = (i / 5) * Math.PI * 2, dist = 150 + (i * 40);
const p = this.add.image(config.width / 2 + Math.cos(angle) * dist, config.height / 2 + Math.sin(angle) * dist, planetTextures[i]).setDisplaySize(120, 120).setDepth(5);
planets.push(p);
}
this.tweens.add({ targets: planets, angle: 360, duration: 10000, repeat: -1 });
this.time.delayedCall(4000, () => {
this.cameras.main.zoomTo(0.1, 6000);
this.add.image(config.width / 2, config.height / 2, 'galaxy').setDisplaySize(2000, 2000);
this.time.delayedCall(6000, () => {
const bh = this.add.image(config.width * 5, config.height / 2, 'final_blackhole').setDisplaySize(2000, 2000).setDepth(100);
this.tweens.add({ targets: bh, x: config.width / 2, duration: 5000, ease: 'Power2' });
this.time.delayedCall(5500, () => {
this.add.text(config.width / 2, config.height / 2 + 800, 'ПРОДОЛЖЕНИЕ\nСЛЕДУЕТ...', { fontSize: '192px', fill: '#ffffff', fontWeight: 'bold', stroke: '#ff00ff', strokeThickness: 12 }).setOrigin(0.5).setDepth(102);
this.time.delayedCall(1000, () => { sendScoreAndClose(); });
});
});
});
}
function sendScoreAndClose() {
if (score > bestScore) { bestScore = score; localStorage.setItem('bestScore', bestScore.toString()); }
if (tg.sendData) tg.sendData(score.toString());
setTimeout(() => { tg.close(); }, 1000);
}
function update() {
if (gameState !== "playing") return;
bgClouds.children.iterate(c => {
if (c) {
c.y += c.cloudSpeed;
if (c.y > config.height) { c.y = -50; c.x = Phaser.Math.Between(0, config.width); }
}
});
bullets.children.iterate(b => { if (b && b.y < -100) b.destroy(); });
enemyBullets.children.iterate(eb => { if (eb && eb.y > config.height + 50) eb.destroy(); });
clouds.children.iterate(e => { if (e && e.y > config.height + 50) e.destroy(); });
bonuses.children.iterate(b => { if (b && b.y > config.height + 50) b.destroy(); });
if (isBossActive && boss && boss.active) {
updateBossBar();
boss.x = (config.width / 2) + Math.sin(this.time.now / 500) * (60 + level * 15);
boss.y = 150 + Math.cos(this.time.now / 800) * (40 + level * 10);
}
}
function showBossText(scene, bossNum) {
const texts = { 1: 'Взрывной ураган', 2: 'Шторм Вихрь', 3: 'Затмение', 4: 'Ледяной Гигант', 5: 'Чёрная Дыра' };
showAnimatedText(scene, 'БОСС:\n' + (texts[bossNum] || 'Босс ' + bossNum), 0xff00ff, 2000);
}
function showDamageText(x, y, damage) {
const dmgText = this.add.text(x, y, '-' + damage, { fontSize: '20px', fontWeight: 'bold', fill: '#ff4444', stroke: '#ffffff', strokeThickness: 3 }).setOrigin(0.5);
this.tweens.add({ targets: dmgText, y: y - 25, alpha: 0, duration: 350, onComplete: () => dmgText.destroy() });
}
function showBossDamageText(bossObj) {
showDamageText.call(this, bossObj.x + Phaser.Math.Between(-20, 20), bossObj.y - 20, playerDamage);
}
function showAnimatedText(scene, text, color, duration) {
const lines = text.split('\n');
const startY = config.height / 2 - 30;
lines.forEach((line, i) => {
const txt = scene.add.text(config.width / 2, startY + i * 40, line, { fontSize: '28px', fontWeight: 'bold', fill: '#' + color.toString(16).padStart(6, '0'), stroke: '#ffffff', strokeThickness: 4 }).setOrigin(0.5).setAlpha(0).setScale(0.5);
scene.tweens.add({ targets: txt, alpha: 1, scale: 1.2, duration: 300, ease: 'Back.out' });
scene.tweens.add({ targets: txt, alpha: 0, scale: 0.8, delay: duration - 500, duration: 500, onComplete: () => txt.destroy() });
});
}
const LEVEL_CONFIG = {
1: { enemy: "cloud1", enemyHp: 1, speed: 200, color: "#4ea1d3" },
2: { enemy: "cloud2", enemyHp: 2, speed: 250, color: "#2c5f7f" },
3: { enemy: "cloud3", enemyHp: 3, speed: 300, color: "#ff6b35" },
4: { enemy: "crystal", enemyHp: 6, speed: 400, color: "#3a3a5e" },
5: { enemy: "debris", enemyHp: 8, speed: 500, color: "#1a1a1a" }
};
