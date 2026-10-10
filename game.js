// ============================================================================
// SUNNY STRIKE - РАБОЧАЯ ЧИСТАЯ ВЕРСИЯ БЕЗ ОШИБОК
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

// === НАСТРОЙКИ УРОВНЕЙ (ОБЪЯВЛЕНЫ ДО ИСПОЛЬЗОВАНИЯ В CREATE) ===
const LEVEL_CONFIG = {
    1: { name: "Голубое небо", enemy: "cloud1", enemyHp: 1, speed: 200, color: "#4ea1d3", bossBullets: 1 },
    2: { name: "Грозовой фронт", enemy: "cloud2", enemyHp: 2, speed: 250, color: "#2c5f7f", bossBullets: 2 },
    3: { name: "Закат", enemy: "cloud3", enemyHp: 3, speed: 300, color: "#ff6b35", bossBullets: 3 },
    4: { name: "Стратосфера", enemy: "crystal", enemyHp: 6, speed: 400, color: "#3a3a5e", bossBullets: 4 },
    5: { name: "Орбита", enemy: "debris", enemyHp: 8, speed: 500, color: "#1a1a1a", bossBullets: 5 }
};

function getEnemyHp(baseHp) {
    return baseHp + Math.floor(level / 2);
}

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let bestScore = parseInt(localStorage.getItem('bestScore') || '0');
let audioCtx = null;
let gameState = "playing";
let score = 0, level = 1, lives = 3;
let weaponLevel = 1, playerDamage = 1, bulletMultiplier = 1;
let greenBulletsActive = false;
let isInvulnerable = false, isBossActive = false, isBossInvulnerable = false;

// Механики комбо и ульты
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
// AUDIO SYSTEM (ОРИГИНАЛЬНАЯ РАБОЧАЯ)
// ============================================================================

function initAudio() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSFX(scene, type) {
    const ctx = (scene && scene.sound && scene.sound.context) || audioCtx;
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
        o.start(t);
        o.stop(t + d);
    };

    switch(type) {
        case 'shoot': osc(600, 100, 0.2, 'triangle'); break;
        case 'hit': osc(400, 50, 0.2, 'sine'); break;
        case 'hurt':
            [523, 440, 349, 261].forEach((f, i) => osc(f, f - 50, 0.15, 'square', now + i * 0.1));
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
            break;
        case 'boss_win':
            [523, 659, 783, 1046].forEach((f, i) => osc(f, f, 0.4, 'square', now + i * 0.08));
            break;
        case 'boss5_win':
            [523, 523, 523, 698].forEach((f, i) => osc(f, f, 0.6, 'sawtooth', now + i * 0.15));
            osc(1046, 1046, 1.2, 'sawtooth', now + 0.6, 0.05);
            break;
        case 'game_over':
            [392, 370, 349].forEach((f, i) => osc(f, f - 10, 1.2, 'sawtooth', now + i * 0.6));
            break;
        case 'evil_triumph':
            [110, 103, 98, 82].forEach((f, i) => osc(f, f, 1.5, 'sawtooth', now + i * 0.8, 0.07));
            break;
        case 'powerup': osc(800, 1200, 0.3, 'triangle', now, 0.1); break;
        case 'enemy_death': osc(100, 50, 0.15, 'triangle', now, 0.15); break;
        case 'ult': osc(150, 900, 0.4, 'sawtooth', now, 0.15); break;
    }
}

// ============================================================================
// PHASER CONFIG
// ============================================================================

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { preload, create, update },
    backgroundColor: '#4ea1d3'
};

const game = new Phaser.Game(config);

// ============================================================================
// PRELOAD - ЧЕТКИЙ ВЕКТОРНЫЙ РЕНДЕРИНГ БЕЗ МЫЛА
// ============================================================================

function preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Солнышко обычное (80x80)
    for(let i=0; i<12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        g.fillStyle(0xffdd00);
        g.fillCircle(40 + Math.cos(angle) * 28, 40 + Math.sin(angle) * 28, 5);
    }
    g.fillStyle(0xffcc00);
    g.fillCircle(40, 40, 24);
    g.fillStyle(0x000000);
    g.fillCircle(33, 36, 3);
    g.fillCircle(47, 36, 3);
    g.lineStyle(2, 0x000000);
    g.beginPath();
    g.arc(40, 46, 10, 0.15 * Math.PI, 0.85 * Math.PI);
    g.strokePath();
    g.generateTexture('sun_normal', 80, 80);
    g.clear();

    // Солнышко раненое (80x80)
    for(let i=0; i<12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        g.fillStyle(0xccaa00);
        g.fillCircle(40 + Math.cos(angle) * 28, 40 + Math.sin(angle) * 28, 5);
    }
    g.fillStyle(0xffaa00);
    g.fillCircle(40, 40, 24);
    g.fillStyle(0x000000);
    g.fillCircle(33, 36, 3);
    g.fillCircle(47, 36, 3);
    g.lineStyle(2, 0x000000);
    g.beginPath();
    g.moveTo(29, 32); g.lineTo(37, 34);
    g.moveTo(51, 32); g.lineTo(43, 34);
    g.strokePath();
    g.beginPath();
    g.moveTo(32, 52); g.lineTo(40, 48); g.lineTo(48, 52);
    g.strokePath();
    g.generateTexture('sun_hurt', 80, 80);
    g.clear();

    // Солнышко счастливое (120x120)
    for(let i=0; i<12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        g.fillStyle(0xffdd00);
        g.fillCircle(60 + Math.cos(angle) * 50, 60 + Math.sin(angle) * 50, 9);
    }
    g.fillStyle(0xffcc00);
    g.fillCircle(60, 60, 44);
    g.fillStyle(0x000000);
    g.fillCircle(47, 53, 6);
    g.fillCircle(73, 53, 6);
    g.fillStyle(0xffffff);
    g.fillCircle(50, 50, 3);
    g.fillCircle(76, 50, 3);
    g.lineStyle(4, 0xcc3300);
    g.beginPath();
    g.arc(60, 75, 24, 0.1 * Math.PI, 0.9 * Math.PI);
    g.strokePath();
    g.generateTexture('sun_happy', 120, 120);
    g.clear();

    // Враг 1: Облако (80x60)
    g.fillStyle(0xf8f8f8);
    g.fillCircle(40, 32, 16);
    g.fillStyle(0xf0f0f0);
    g.fillCircle(20, 26, 10);
    g.fillCircle(60, 26, 10);
    g.fillCircle(40, 22, 12);
    g.fillStyle(0x000000);
    g.fillCircle(32, 34, 2);
    g.fillCircle(48, 34, 2);
    g.lineStyle(3, 0x000000);
    g.beginPath();
    g.arc(40, 40, 6, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('cloud1', 80, 60);
    g.clear();

    // Враг 2: Грозовая туча (80x75)
    g.fillStyle(0x4a4a5a);
    g.fillCircle(40, 38, 16);
    g.fillCircle(20, 26, 12);
    g.fillCircle(40, 22, 14);
    g.fillCircle(60, 26, 12);
    g.lineStyle(4, 0xffff00);
    for(let i=0; i<3; i++) {
        const mx = 16 + i * 24;
        g.beginPath();
        g.moveTo(mx, 44);
        g.lineTo(mx - 6, 54);
        g.lineTo(mx, 54);
        g.lineTo(mx - 6, 64);
        g.strokePath();
    }
    g.fillStyle(0x000000);
    g.fillCircle(32, 38, 2);
    g.fillCircle(48, 38, 2);
    g.lineStyle(4, 0x000000);
    g.beginPath();
    g.arc(40, 46, 7, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('cloud2', 80, 75);
    g.clear();

    // Враг 3: Перистое облако (100x50)
    g.fillStyle(0xffcccc);
    g.fillCircle(50, 25, 21);
    g.fillStyle(0xffdddd);
    g.fillCircle(25, 18, 10);
    g.fillCircle(38, 15, 10);
    g.fillCircle(50, 14, 11);
    g.fillCircle(62, 15, 10);
    g.fillCircle(75, 18, 10);
    g.fillStyle(0x000000);
    g.fillCircle(38, 28, 2);
    g.fillCircle(62, 28, 2);
    g.lineStyle(3, 0x000000);
    g.beginPath();
    g.arc(50, 34, 7, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('cloud3', 100, 50);
    g.clear();

    // Враг 4: Кристалл (70x70)
    g.fillStyle(0x00ffff);
    g.fillTriangle(35, 5, 55, 35, 35, 65);
    g.fillTriangle(35, 5, 15, 35, 35, 65);
    g.lineStyle(3, 0xffffff);
    g.beginPath();
    g.moveTo(35, 5); g.lineTo(55, 35); g.lineTo(35, 65); g.lineTo(15, 35);
    g.closePath();
    g.strokePath();
    g.generateTexture('crystal', 70, 70);
    g.clear();

    // Враг 5: Техно-мусор (70x70)
    g.fillStyle(0x999999);
    g.fillRect(17, 17, 36, 36);
    g.lineStyle(6, 0x666666);
    for(let i=0; i<6; i++) {
        const angle = (i / 6) * Math.PI + Math.PI;
        g.beginPath();
        g.moveTo(35 + Math.cos(angle) * 18, 35 + Math.sin(angle) * 18);
        g.lineTo(35 + Math.cos(angle) * 32, 35 + Math.sin(angle) * 32);
        g.strokePath();
    }
    g.fillStyle(0xff0000);
    g.fillCircle(35, 32, 6);
    g.generateTexture('debris', 70, 70);
    g.clear();

    // Босс 1 (120x120)
    g.fillStyle(0x333344);
    g.fillCircle(60, 60, 45);
    g.lineStyle(4, 0xffff00);
    for(let i=0; i<8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(60 + Math.cos(angle) * 40, 60 + Math.sin(angle) * 40);
        g.lineTo(60 + Math.cos(angle) * 65, 60 + Math.sin(angle) * 65);
        g.strokePath();
    }
    g.fillStyle(0xff0000);
    g.fillCircle(45, 50, 6); g.fillCircle(75, 50, 6);
    g.fillStyle(0x000000);
    g.fillCircle(45, 50, 3); g.fillCircle(75, 50, 3);
    g.lineStyle(4, 0xff0000);
    g.beginPath();
    g.arc(60, 78, 14, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('boss1', 120, 120);
    g.clear();

    // Босс 2 (120x120)
    g.fillStyle(0x4a5a6a);
    g.fillCircle(60, 60, 45);
    g.lineStyle(4, 0x6a7a8a);
    for(let arm=0; arm<4; arm++) {
        g.beginPath();
        for(let i=0; i<40; i++) {
            const a = (arm / 4) * Math.PI * 2 + i * 0.15;
            const r = 15 + i;
            if(i===0) g.moveTo(60 + Math.cos(a) * r, 60 + Math.sin(a) * r);
            else g.lineTo(60 + Math.cos(a) * r, 60 + Math.sin(a) * r);
        }
        g.strokePath();
    }
    g.fillStyle(0xff0000);
    g.fillCircle(50, 55, 6); g.fillCircle(70, 55, 6);
    g.generateTexture('boss2', 120, 120);
    g.clear();

    // Босс 3 (120x120)
    g.fillStyle(0xff6600);
    g.fillCircle(60, 60, 48);
    g.fillStyle(0x111111);
    g.fillCircle(75, 60, 44);
    g.fillStyle(0xff0000);
    g.fillCircle(68, 50, 5); g.fillCircle(82, 50, 5);
    g.generateTexture('boss3', 120, 120);
    g.clear();

    // Босс 4 (120x120)
    g.fillStyle(0xaaddff);
    g.fillCircle(60, 60, 48);
    g.fillStyle(0x4488cc);
    g.fillCircle(50, 50, 36);
    g.fillStyle(0x00ffff);
    g.fillCircle(45, 50, 6); g.fillCircle(75, 50, 6);
    g.generateTexture('boss4', 120, 120);
    g.clear();

    // Босс 5 (120x120)
    g.fillStyle(0x220022);
    g.fillCircle(60, 60, 54);
    g.fillStyle(0x000000);
    g.fillCircle(60, 60, 48);
    g.lineStyle(4, 0xcc00cc);
    g.strokeCircle(60, 60, 48);
    g.fillStyle(0xff00ff);
    g.fillCircle(45, 50, 8); g.fillCircle(75, 50, 8);
    g.generateTexture('boss5', 120, 120);
    g.clear();

    // Пули
    g.fillStyle(0xffffff);
    g.fillCircle(12, 20, 8);
    g.generateTexture('bullet', 24, 40);
    g.clear();

    g.fillStyle(0xffff00);
    g.fillCircle(16, 16, 12);
    g.lineStyle(2, 0xffaa00);
    g.strokeCircle(16, 16, 14);
    g.generateTexture('bullet_double', 32, 32);
    g.clear();

    g.fillStyle(0xff3333);
    g.fillCircle(12, 12, 8);
    g.lineStyle(2, 0xffffff);
    g.strokeCircle(12, 12, 10);
    g.generateTexture('enemy_bullet', 24, 24);
    g.clear();

    // Бонусы (50x50)
    const drawBonusBase = (color) => {
        g.fillStyle(color);
        g.fillCircle(25, 25, 23);
        g.lineStyle(3, 0xffffff);
        g.strokeCircle(25, 25, 23);
    };

    // Зеленый бонус (x3 пули)
    drawBonusBase(0x00cc00);
    g.lineStyle(3, 0xffffff);
    g.beginPath();
    g.moveTo(31, 13); g.lineTo(19, 25); g.lineTo(27, 25); g.lineTo(19, 39);
    g.strokePath();
    g.generateTexture('bonus_double', 50, 50);
    g.clear();

    // Желтый бонус (+1 пуля)
    drawBonusBase(0xddaa00);
    g.fillStyle(0xffffff);
    g.fillCircle(25, 25, 8);
    g.generateTexture('bonus_speed', 50, 50);
    g.clear();

    // Фиолетовый бонус (+1 урон)
    drawBonusBase(0x9900cc);
    g.lineStyle(3, 0xffffff);
    g.beginPath();
    g.moveTo(25, 13); g.lineTo(18, 25); g.lineTo(22, 25); g.lineTo(22, 35);
    g.lineTo(28, 35); g.lineTo(28, 25); g.lineTo(32, 25);
    g.closePath();
    g.strokePath();
    g.generateTexture('bonus_damage', 50, 50);
    g.clear();

    // Красный бонус (сердце)
    drawBonusBase(0xcc0000);
    g.fillStyle(0xffffff);
    g.fillCircle(20, 22, 5); g.fillCircle(30, 22, 5);
    g.beginPath();
    g.moveTo(15, 23); g.lineTo(25, 35); g.lineTo(35, 23);
    g.fill();
    g.generateTexture('bonus_heart', 50, 50);
    g.clear();

    // Бирюзовый бонус (щит)
    drawBonusBase(0x00aaaa);
    g.lineStyle(3, 0xffffff);
    g.strokeCircle(25, 25, 12);
    g.generateTexture('bonus_shield', 50, 50);
    g.clear();

    // Эффект щита
    g.lineStyle(3, 0x00ffff, 0.9);
    g.strokeCircle(45, 45, 40);
    g.generateTexture('shield_fx', 90, 90);
    g.clear();

    // Волна ульты
    g.lineStyle(4, 0xffff00);
    g.strokeCircle(75, 75, 70);
    g.generateTexture('ult_wave', 150, 150);
    g.clear();

    // Фоновое облако
    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(50, 25, 18);
    g.fillCircle(30, 21, 12);
    g.fillCircle(70, 21, 12);
    g.generateTexture('cloud_bg', 100, 50);
    g.clear();

    // Планеты финала
    g.fillStyle(0xff8866); g.fillCircle(30, 30, 26); g.generateTexture('planet1', 60, 60); g.clear();
    g.fillStyle(0xffcc88); g.fillCircle(30, 30, 26); g.generateTexture('planet2', 60, 60); g.clear();
    g.fillStyle(0x4488ff); g.fillCircle(30, 30, 26); g.generateTexture('planet3', 60, 60); g.clear();
    g.fillStyle(0x88ff88); g.fillCircle(30, 30, 26); g.generateTexture('planet4', 60, 60); g.clear();
    g.fillStyle(0xcc88ff); g.fillCircle(30, 30, 24); g.lineStyle(4, 0xffffff); g.strokeCircle(30, 30, 29); g.generateTexture('planet5', 60, 60); g.clear();

    g.fillStyle(0xffffff, 0.4); g.fillCircle(100, 100, 80); g.generateTexture('galaxy', 200, 200); g.clear();
    g.fillStyle(0x000000); g.fillCircle(100, 100, 75); g.lineStyle(6, 0xcc00cc); g.strokeCircle(100, 100, 75); g.generateTexture('final_blackhole', 200, 200); g.clear();
}

// ============================================================================
// CREATE
// ============================================================================

function create() {
    initAudio();
    this.cameras.main.setBackgroundColor(LEVEL_CONFIG[level].color);

    // Фоновые облака
    bgClouds = this.add.group();
    for(let i=0; i<15; i++) {
        const bc = this.add.image(
            Phaser.Math.Between(0, config.width),
            Phaser.Math.Between(0, config.height),
            'cloud_bg'
        ).setScale(2).setDepth(-2);
        bc.cloudSpeed = Phaser.Math.FloatBetween(1.2, 2.4);
        bgClouds.add(bc);
    }

    // Игрок
    player = this.physics.add.sprite(config.width/2, config.height - 120, 'sun_normal');
    player.setCollideWorldBounds(true);
    player.setDisplaySize(60, 60);

    // Группы
    bullets = this.physics.add.group();
    enemyBullets = this.physics.add.group();
    clouds = this.physics.add.group();
    bonuses = this.physics.add.group();

    // UI
    scoreText = this.add.text(20, 20, 'Очки: 0', {
        fontSize: '22px', fill: '#ffffff', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    });

    bestScoreText = this.add.text(config.width - 20, 20, '🏆: ' + bestScore, {
        fontSize: '20px', fill: '#ffd700', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    }).setOrigin(1, 0);

    levelText = this.add.text(20, 50, 'Уровень: 1', {
        fontSize: '20px', fill: '#ffff00', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    });

    damageText = this.add.text(20, 110, 'Урон: 1', {
        fontSize: '18px', fill: '#ff6600', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    });

    comboText = this.add.text(20, 135, 'Комбо: x1', {
        fontSize: '18px', fill: '#00ffcc', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    });

    updateLivesText.call(this);

    // Кнопки
    ultButton = this.add.text(config.width - 25, config.height - 105, 'ВСПЫШКА\n0%', {
        fontSize: '14px', fill: '#ffffff', fontWeight: 'bold', align: 'center',
        backgroundColor: '#4a5568', padding: { x: 12, y: 10 }
    }).setOrigin(1, 1).setInteractive().setDepth(100);

    ultButton.on('pointerdown', () => {
        triggerUltimate.call(this);
    });

    exitButton = this.add.text(config.width - 15, config.height - 25, 'Выйти', {
        fontSize: '16px', fill: '#ffffff',
        backgroundColor: '#e53e3e', padding: { x: 10, y: 5 }
    }).setOrigin(1, 1).setInteractive().setDepth(100);

    exitButton.on('pointerdown', () => {
        sendScoreAndClose();
    });

    // Управление
    this.input.on('pointermove', (p) => {
        if (player && player.active && gameState === "playing") {
            player.x = Phaser.Math.Clamp(p.x, 20, config.width - 20);
            player.y = Phaser.Math.Clamp(p.y - 20, 20, config.height - 20);
            if (player.shieldSprite && player.shieldSprite.active) {
                player.shieldSprite.setPosition(player.x, player.y);
            }
        }
    });

    this.input.on('pointerdown', () => {
        initAudio();
    });

    // Таймеры
    this.time.addEvent({
        delay: 300,
        callback: fire,
        callbackScope: this,
        loop: true
    });

    this.spawnTimer = this.time.addEvent({
        delay: 1000,
        callback: () => {
            if (!isBossActive && gameState === "playing") {
                spawnEnemy.call(this);
            }
        },
        loop: true
    });

    this.bossTimer = this.time.addEvent({
        delay: 20000,
        callback: prepareBoss,
        callbackScope: this,
        loop: true
    });

    // Коллизии
    this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
    this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
    this.physics.add.overlap(player, enemyBullets, onPlayerHitBullet, null, this);
    this.physics.add.overlap(player, bonuses, collectBonus, null, this);

    bossBar = this.add.graphics().setDepth(100);
}

// ============================================================================
// GAMEPLAY
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
        comboCount = 0;
        comboMultiplier = 1;
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
    ultCharge = 0;
    addUltCharge(0);

    playSFX(this, 'ult');
    this.cameras.main.shake(200, 0.01);

    const wave = this.add.image(player.x, player.y, 'ult_wave');
    this.tweens.add({
        targets: wave,
        scale: 6,
        alpha: 0,
        duration: 500,
        onComplete: () => wave.destroy()
    });

    enemyBullets.clear(true, true);
    clouds.children.each(enemy => {
        if (enemy && enemy.active) {
            enemy.hp -= 10;
            if (enemy.hp <= 0) hitEnemy.call(this, { destroy: () => {}, active: true }, enemy);
        }
    });

    if (boss && boss.active && !isBossInvulnerable) {
        boss.hp -= 20;
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
                b.hasHit = false;
                b.body.setSize(20, 35);
                const angle = ((i / Math.max(1, centerX)) * spreadAngle - (spreadAngle / 2)) * (Math.PI / 180);
                b.setVelocity(Math.sin(angle) * 600, -Math.cos(angle) * 600);
            }
        }
    } else if (weaponLevel === 1) {
        const spacing = 15;
        const startX = player.x - ((totalBullets - 1) * spacing) / 2;
        for (let i = 0; i < totalBullets; i++) {
            const b = bullets.create(startX + (i * spacing), player.y - 20, 'bullet');
            if (b) {
                b.setVelocityY(-600);
                b.hasHit = false;
                b.body.setSize(20, 35);
            }
        }
    } else {
        const positions = [-150, -75, 0, 75, 150];
        for (let i = 0; i < totalBullets; i++) {
            const b = bullets.create(player.x, player.y - 20, 'bullet_double');
            if (b) {
                b.setVelocityY(-500);
                b.setVelocityX(positions[i % positions.length]);
                b.hasHit = false;
                b.body.setSize(28, 28);
            }
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
        this.tweens.add({
            targets: enemy,
            x: enemy.x + Phaser.Math.Between(-80, 80),
            duration: 1000,
            yoyo: true,
            repeat: -1
        });
    }
}

function hitEnemy(bullet, enemy) {
    if (bullet.hasHit || !bullet.active || !enemy.active) return;
    bullet.hasHit = true;
    bullet.destroy();

    enemy.hp -= playerDamage;
    playSFX(this, 'hit');
    showDamageText.call(this, enemy.x + 20, enemy.y - 20, playerDamage);

    if (enemy.hp <= 0) {
        playSFX(this, 'enemy_death');
        enemy.disableBody(true, true);
        addUltCharge(4);
        addCombo();

        if (Math.random() < 0.22) {
            const types = ['bonus_double', 'bonus_speed', 'bonus_damage', 'bonus_heart', 'bonus_shield'];
            const bonus = bonuses.create(enemy.x, enemy.y + 20, Phaser.Utils.Array.GetRandom(types));
            if (bonus) bonus.setVelocityY(80);
        }

        score += 10 * comboMultiplier;
        scoreText.setText('Очки: ' + score);
        if (score > bestScore) {
            bestScore = score;
            bestScoreText.setText('🏆: ' + bestScore);
        }
    }
}

function collectBonus(player, bonus) {
    const type = bonus.texture.key;
    playSFX(this, 'powerup');

    const txt = this.add.text(player.x, player.y - 30, '', {
        fontSize: '28px', fill: '#ffff00', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5);

    if (type === 'bonus_double') {
        greenBulletsActive = true;
        txt.setText('x3 ПУЛИ!');
        this.time.delayedCall(7000, () => { greenBulletsActive = false; });
    } else if (type === 'bonus_speed') {
        bulletMultiplier += 1;
        updateDamageText();
        txt.setText('ПУЛИ +1!');
    } else if (type === 'bonus_damage') {
        playerDamage += 1;
        updateDamageText();
        txt.setText('УРОН +1!');
    } else if (type === 'bonus_shield') {
        isShieldActive = true;
        txt.setText('ЩИТ!');
        if (!player.shieldSprite) player.shieldSprite = this.add.image(player.x, player.y, 'shield_fx');
    } else if (type === 'bonus_heart') {
        if (lives < 5) {
            lives++;
            updateLivesText.call(this);
            txt.setText('+1 ЖИЗНЬ!');
        } else {
            score += 50;
            scoreText.setText('Очки: ' + score);
            txt.setText('+50 ОЧКОВ!');
        }
    }

    this.tweens.add({
        targets: txt,
        y: txt.y - 30,
        alpha: 0,
        duration: 500,
        onComplete: () => txt.destroy()
    });

    bonus.destroy();
}

function onPlayerHitBullet(player, bullet) {
    bullet.destroy();
    onPlayerHit.call(this, player, { destroy: () => {} });
}

function onPlayerHit(player, enemy) {
    if (isInvulnerable || gameState !== "playing") return;
    if (enemy.destroy) enemy.destroy();

    comboCount = 0;
    comboMultiplier = 1;
    if (comboText) comboText.setText('Комбо: x1').setColor('#00ffcc');

    if (isShieldActive) {
        isShieldActive = false;
        if (player.shieldSprite) {
            player.shieldSprite.destroy();
            player.shieldSprite = null;
        }
        return;
    }

    lives--;
    updateLivesText.call(this);
    playSFX(this, 'hurt');

    if (lives <= 0) {
        gameState = "gameover";
        if (this.spawnTimer) this.spawnTimer.remove();
        if (this.bossTimer) this.bossTimer.remove();

        bullets.clear(true, true);
        enemyBullets.clear(true, true);
        clouds.clear(true, true);
        bonuses.clear(true, true);
        bossBar.clear();
        if (boss) boss.destroy();

        playSFX(this, 'game_over');

        this.add.text(config.width / 2, config.height / 2, 'GAME OVER', {
            fontSize: '64px', fill: '#ff0000', fontWeight: 'bold',
            stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5);

        this.time.delayedCall(2000, () => {
            this.tweens.killAll();
            this.time.removeAllEvents();
            if (player && player.active) player.destroy();
            sendScoreAndClose();
        });
        return;
    }

    isInvulnerable = true;
    player.setTexture('sun_hurt');
    this.tweens.add({
        targets: player,
        alpha: 0.2,
        duration: 100,
        yoyo: true,
        repeat: 10,
        onComplete: () => {
            player.alpha = 1;
            player.setTexture('sun_normal');
            isInvulnerable = false;
        }
    });
}

// ============================================================================
// BOSS LOGIC
// ============================================================================

function prepareBoss() {
    if (isBossActive || gameState !== "playing" || level > 5) return;

    isBossInvulnerable = true;
    this.time.delayedCall(2000, () => { isBossInvulnerable = false; });
    isBossActive = true;

    boss = this.physics.add.sprite(config.width / 2, -100, 'boss' + level);
    boss.setDisplaySize(100, 100);
    boss.body.setSize(80, 80);

    // HP выставляется сразу, с запасом под честный баланс
    boss.maxHp = 25 + (level * 25);
    boss.hp = boss.maxHp;
    boss.alpha = 0.5;

    this.tweens.add({
        targets: boss,
        alpha: 0.2,
        duration: 200,
        yoyo: true,
        repeat: 5
    });

    showBossText(this, level);

    this.time.delayedCall(2000, () => {
        if (!boss || !boss.active) return;
        boss.alpha = 1;

        boss.shootTimer = this.time.addEvent({
            delay: 1200,
            callback: () => {
                if (!boss || !boss.active || isBossInvulnerable || gameState !== 'playing') return;
                const count = LEVEL_CONFIG[level].bossBullets || 2;
                for (let i = 0; i < count; i++) {
                    const eb = enemyBullets.create(boss.x, boss.y + 40, 'enemy_bullet');
                    if (eb) {
                        const angle = ((i / Math.max(1, count - 1)) * 60 - 30) * (Math.PI / 180);
                        eb.setVelocity(Math.sin(angle) * 240, Math.cos(angle) * 240);
                    }
                }
            },
            loop: true
        });
    });

    this.tweens.add({
        targets: boss,
        y: 150,
        duration: 2000,
        ease: 'Back.out'
    });

    this.physics.add.overlap(player, boss, () => {
        if (!isBossInvulnerable) onPlayerHit.call(this, player, { destroy: () => {} });
    });

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

    score += 1000 * comboMultiplier;
    scoreText.setText('Очки: ' + score);

    if (lives < 5) {
        lives++;
        updateLivesText.call(this);
    }

    if (level < 5) {
        playSFX(this, 'boss_win');
        level++;
        levelText.setText('Уровень: ' + level);
        this.cameras.main.setBackgroundColor(LEVEL_CONFIG[level].color);

        if (this.bossTimer) {
            this.bossTimer.remove();
            this.bossTimer = this.time.addEvent({
                delay: 20000,
                callback: prepareBoss,
                callbackScope: this,
                loop: true
            });
        }

        isBossActive = true;
        this.time.delayedCall(3000, () => {
            isBossActive = false;
        });
    } else {
        startEnding.call(this);
    }
}

function updateBossBar() {
    if (!boss || !boss.active || !bossBar) return;
    bossBar.clear();

    const barWidth = 120;
    const barHeight = 12;
    const barX = (config.width / 2) - 60;
    const barY = 20;

    bossBar.fillStyle(0x333333);
    bossBar.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

    bossBar.fillStyle(0xff0000);
    bossBar.fillRect(barX, barY, (boss.hp / boss.maxHp) * barWidth, barHeight);

    bossBar.lineStyle(2, 0xffffff);
    bossBar.strokeRect(barX, barY, barWidth, barHeight);
}

// ============================================================================
// ENDING & UPDATE
// ============================================================================

function startEnding() {
    gameState = "ending";
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.bossTimer) this.bossTimer.remove();

    clouds.clear(true, true);
    bullets.clear(true, true);
    bgClouds.clear(true, true);
    bonuses.clear(true, true);
    bossBar.clear();
    if (player.shieldSprite) player.shieldSprite.destroy();

    playSFX(this, 'boss5_win');

    player.setTexture('sun_happy');
    player.setDisplaySize(40, 40);

    this.tweens.add({
        targets: player,
        x: config.width / 2,
        y: config.height / 2,
        scale: 3,
        duration: 2000,
        onComplete: () => {
            showSpaceScene.call(this);
        }
    });
}

function showSpaceScene() {
    this.cameras.main.setBackgroundColor('#000000');
    player.x = config.width / 2;
    player.y = config.height / 2;
    player.setDepth(10);

    const planets = [];
    const planetTextures = ['planet1', 'planet2', 'planet3', 'planet4', 'planet5'];

    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const dist = 150 + (i * 40);
        const p = this.add.image(
            config.width / 2 + Math.cos(angle) * dist,
            config.height / 2 + Math.sin(angle) * dist,
            planetTextures[i]
        ).setDisplaySize(100, 100).setDepth(5);
        planets.push(p);
    }

    this.tweens.add({
        targets: planets,
        angle: 360,
        duration: 10000,
        repeat: -1
    });

    this.time.delayedCall(4000, () => {
        this.cameras.main.zoomTo(0.1, 6000);
        this.add.image(config.width / 2, config.height / 2, 'galaxy').setDisplaySize(2000, 2000);

        this.time.delayedCall(6000, () => {
            playSFX(this, 'evil_triumph');
            const bh = this.add.image(config.width * 5, config.height / 2, 'final_blackhole')
                .setDisplaySize(2000, 2000).setDepth(100);

            this.tweens.add({
                targets: bh,
                x: config.width / 2,
                duration: 5000,
                ease: 'Power2'
            });

            this.time.delayedCall(5500, () => {
                this.add.text(config.width / 2, config.height / 2 + 800, 'ПРОДОЛЖЕНИЕ\nСЛЕДУЕТ...', {
                    fontSize: '192px', fill: '#ffffff', fontWeight: 'bold',
                    stroke: '#ff00ff', strokeThickness: 12, align: 'center'
                }).setOrigin(0.5).setDepth(102);

                this.time.delayedCall(1000, () => {
                    sendScoreAndClose();
                });
            });
        });
    });
}

function sendScoreAndClose() {
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('bestScore', bestScore.toString());
    }
    if (tg.sendData) tg.sendData(score.toString());
    setTimeout(() => { tg.close(); }, 1000);
}

function update() {
    if (gameState !== "playing") return;

    bgClouds.children.iterate(c => {
        if (c) {
            c.y += c.cloudSpeed;
            if (c.y > config.height) {
                c.y = -50;
                c.x = Phaser.Math.Between(0, config.width);
            }
        }
    });

    bullets.children.iterate(b => {
        if (b && b.y < -100) b.destroy();
    });

    enemyBullets.children.iterate(eb => {
        if (eb && (eb.y > config.height + 50 || eb.y < -50 || eb.x < -50 || eb.x > config.width + 50)) {
            eb.destroy();
        }
    });

    clouds.children.iterate(e => {
        if (e && e.y > config.height + 50) e.destroy();
    });

    bonuses.children.iterate(b => {
        if (b && b.y > config.height + 50) b.destroy();
    });

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
    const dmgText = this.add.text(x, y, '-' + damage, {
        fontSize: '20px', fontWeight: 'bold', fill: '#ff4444',
        stroke: '#ffffff', strokeThickness: 3
    }).setOrigin(0.5);

    this.tweens.add({
        targets: dmgText,
        y: y - 25,
        alpha: 0,
        duration: 350,
        onComplete: () => dmgText.destroy()
    });
}

function showBossDamageText(bossObj) {
    showDamageText.call(this, bossObj.x + Phaser.Math.Between(-20, 20), bossObj.y - 20, playerDamage);
}

function showAnimatedText(scene, text, color, duration) {
    const lines = text.split('\n');
    const startY = config.height / 2 - 30;

    lines.forEach((line, i) => {
        const txt = scene.add.text(config.width / 2, startY + i * 40, line, {
            fontSize: '28px', fontWeight: 'bold',
            fill: '#' + color.toString(16).padStart(6, '0'),
            stroke: '#ffffff', strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0).setScale(0.5);

        scene.tweens.add({ targets: txt, alpha: 1, scale: 1.2, duration: 300, ease: 'Back.out' });
        scene.tweens.add({ targets: txt, alpha: 0, scale: 0.8, delay: duration - 500, duration: 500, onComplete: () => txt.destroy() });
    });
}
