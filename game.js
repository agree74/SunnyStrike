// ============================================================================
// SUNNY STRIKE - PRO VERSION (ALL ENHANCEMENTS)
// ============================================================================

const tg = window.Telegram?.WebApp || {
    ready: () => {},
    expand: () => {},
    HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {}
    },
    sendData: () => {},
    close: () => {}
};
tg.ready();
tg.expand();

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЯ ===
let bestScore = parseInt(localStorage.getItem('bestScore') || '0');
let audioCtx = null;
let musicInterval = null;
let musicStep = 0;
let isAudioEnabled = false;

let gameState = "playing";
let score = 0, level = 1, lives = 3;
let weaponLevel = 1, playerDamage = 1, bulletMultiplier = 1;
let greenBulletsActive = false;
let isInvulnerable = false, isBossActive = false, isBossInvulnerable = false;

// Новые механики: Комбо и Ульта (Flash)
let comboCount = 0;
let comboMultiplier = 1;
let comboTimer = null;
let ultCharge = 0; // 0..100%
const MAX_ULT = 100;
let isShieldActive = false;

// === ИГРОВЫЕ ОБЪЕКТЫ ===
let player, bullets, enemyBullets, clouds, bonuses, boss, bossBar, bgClouds, particles;
let scoreText, levelText, livesText, bestScoreText, damageText, comboText, ultButton;
let exitButton;

// ============================================================================
// НАСТРОЙКИ УРОВНЕЙ
// ============================================================================
const LEVEL_CONFIG = {
    1: { name: "Голубое небо", enemy: "cloud1", enemyHp: 1, speed: 200, color: "#2575fc", bossBullets: 1 },
    2: { name: "Грозовой фронт", enemy: "cloud2", enemyHp: 2, speed: 240, color: "#1a365d", bossBullets: 2 },
    3: { name: "Закат", enemy: "cloud3", enemyHp: 3, speed: 280, color: "#b83280", bossBullets: 3 },
    4: { name: "Стратосфера", enemy: "crystal", enemyHp: 5, speed: 320, color: "#2d3748", bossBullets: 4 },
    5: { name: "Орбита", enemy: "debris", enemyHp: 7, speed: 380, color: "#0d1117", bossBullets: 5 }
};

function getEnemyHp(baseHp) {
    return baseHp + Math.floor(level / 2);
}

// ============================================================================
// УЛУЧШЕННАЯ АУДИОСИСТЕМА (СИНТВЕЙВ + ФИЛЬТРЫ + HAPTICS)
// ============================================================================

function initAudio() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (!musicInterval && audioCtx) {
        startProceduralMusic();
    }
    isAudioEnabled = true;
}

// Фоновый процедурный синтвейв-бит (0 КБ веса)
function startProceduralMusic() {
    // 120 BPM -> 16-е ноты каждые 125 мс
    const bassNotes = [110, 110, 130.81, 110, 98, 98, 110, 123.47]; // A2, C3, G2, B2
    const arpNotes = [440, 523.25, 659.25, 523.25, 392, 493.88, 587.33, 493.88];

    musicInterval = setInterval(() => {
        if (!audioCtx || audioCtx.state !== 'running' || gameState !== 'playing') return;

        const now = audioCtx.currentTime;
        const step = musicStep % 16;
        musicStep++;

        // Басовая линия (каждые 2 шага)
        if (step % 2 === 0) {
            const freq = bassNotes[Math.floor((step / 2) % bassNotes.length)];
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(400, now);

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

            osc.connect(filter).connect(gain).connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        }

        // Кик/бит на каждый 4-й шаг
        if (step % 4 === 0) {
            const kickOsc = audioCtx.createOscillator();
            const kickGain = audioCtx.createGain();
            kickOsc.frequency.setValueAtTime(140, now);
            kickOsc.frequency.exponentialRampToValueAtTime(30, now + 0.08);

            kickGain.gain.setValueAtTime(0.08, now);
            kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

            kickOsc.connect(kickGain).connect(audioCtx.destination);
            kickOsc.start(now);
            kickOsc.stop(now + 0.09);
        }

        // Легкое фоновое арпеджио
        if (step % 4 === 2) {
            const arpFreq = arpNotes[step % arpNotes.length];
            const aOsc = audioCtx.createOscillator();
            const aGain = audioCtx.createGain();
            aOsc.type = 'sine';
            aOsc.frequency.setValueAtTime(arpFreq, now);

            aGain.gain.setValueAtTime(0.015, now);
            aGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

            aOsc.connect(aGain).connect(audioCtx.destination);
            aOsc.start(now);
            aOsc.stop(now + 0.16);
        }
    }, 125);
}

// Звуковые эффекты с мягкими Low-Pass фильтрами
function playSFX(scene, type) {
    if (!audioCtx) {
        initAudio();
    }
    if (!audioCtx || audioCtx.state !== 'running') return;

    const ctx = audioCtx;
    const now = ctx.currentTime;

    const osc = (f, e, d, w, t = now, v = 0.08, filterFreq = 1800) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, t);

        o.type = w;
        o.frequency.setValueAtTime(f, t);
        if (f !== e) o.frequency.exponentialRampToValueAtTime(Math.max(10, e), t + d);

        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);

        o.connect(filter).connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + d);
    };

    switch(type) {
        case 'shoot':
            osc(750, 220, 0.12, 'triangle', now, 0.04, 2500);
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            break;

        case 'hit':
            osc(350, 80, 0.08, 'sine', now, 0.06, 1200);
            break;

        case 'enemy_death':
            osc(180, 40, 0.22, 'square', now, 0.08, 800);
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
            break;

        case 'hurt':
            [440, 330, 220, 110].forEach((f, i) => osc(f, f - 30, 0.12, 'sawtooth', now + i * 0.08, 0.08, 1000));
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
            break;

        case 'powerup':
            [523, 659, 783, 1046].forEach((f, i) => osc(f, f, 0.15, 'triangle', now + i * 0.06, 0.06, 3000));
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            break;

        case 'ult':
            osc(120, 800, 0.4, 'sawtooth', now, 0.15, 3500);
            [523, 783, 1046, 1318].forEach((f, i) => osc(f, f * 1.2, 0.25, 'triangle', now + 0.1 + i * 0.05, 0.08));
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
            break;

        case 'boss_win':
            [523, 659, 783, 1046, 1318].forEach((f, i) => osc(f, f, 0.35, 'triangle', now + i * 0.08, 0.08));
            break;

        case 'game_over':
            [349, 329, 293, 261].forEach((f, i) => osc(f, f - 15, 0.8, 'sawtooth', now + i * 0.4, 0.08, 900));
            break;
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
    backgroundColor: '#1a365d'
};

const game = new Phaser.Game(config);

// ============================================================================
// PRELOAD - ПРОЦЕДУРНАЯ ГРАФИКА ВЫСОКОЙ ЧЁТКОСТИ
// ============================================================================

function preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Вспомогательная функция для создания кругового градиента на Canvas
    const createRadial = (key, size, innerColor, outerColor, radius = size / 2) => {
        const canvas = this.textures.createCanvas(key, size, size);
        const ctx = canvas.getContext();
        const rad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, radius);
        rad.addColorStop(0, innerColor);
        rad.addColorStop(1, outerColor);
        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
        ctx.fill();
        canvas.refresh();
    };

    // 1. ИГРОК: СОЛНЫШКО С МЯГКОЙ КОРОНОЙ (80x80)
    createRadial('sun_glow', 90, 'rgba(255, 230, 100, 0.9)', 'rgba(255, 140, 0, 0)');

    // 1.1 Нормальное солнышко
    g.fillStyle(0xffaa00, 0.4);
    g.fillCircle(40, 40, 36);
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        g.fillStyle(0xffe066);
        g.fillCircle(40 + Math.cos(angle) * 28, 40 + Math.sin(angle) * 28, 5);
    }
    g.fillStyle(0xffd000);
    g.fillCircle(40, 40, 24);
    g.fillStyle(0x1a202c);
    g.fillCircle(33, 36, 3.5);
    g.fillCircle(47, 36, 3.5);
    g.fillStyle(0xffffff);
    g.fillCircle(34, 35, 1);
    g.fillCircle(48, 35, 1);
    g.lineStyle(2.5, 0x1a202c);
    g.beginPath();
    g.arc(40, 45, 10, 0.15 * Math.PI, 0.85 * Math.PI);
    g.strokePath();
    g.generateTexture('sun_normal', 80, 80);
    g.clear();

    // 1.2 Раненое солнышко
    g.fillStyle(0xe53e3e, 0.3);
    g.fillCircle(40, 40, 34);
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        g.fillStyle(0xdd6b20);
        g.fillCircle(40 + Math.cos(angle) * 28, 40 + Math.sin(angle) * 28, 4);
    }
    g.fillStyle(0xed8936);
    g.fillCircle(40, 40, 24);
    g.lineStyle(3, 0x1a202c);
    g.beginPath();
    g.moveTo(30, 32); g.lineTo(37, 38);
    g.moveTo(37, 32); g.lineTo(30, 38);
    g.moveTo(43, 32); g.lineTo(50, 38);
    g.moveTo(50, 32); g.lineTo(43, 38);
    g.strokePath();
    g.beginPath();
    g.moveTo(34, 48); g.lineTo(40, 44); g.lineTo(46, 48);
    g.strokePath();
    g.generateTexture('sun_hurt', 80, 80);
    g.clear();

    // 1.3 Счастливое солнышко (Финал)
    createRadial('sun_happy', 120, '#fff3b0', '#e65100', 55);

    // 2. ВРАГИ
    // 2.1 Облако (80x60)
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(40, 32, 20);
    g.fillCircle(24, 30, 14);
    g.fillCircle(56, 30, 14);
    g.fillStyle(0x2d3748);
    g.fillCircle(33, 32, 2.5);
    g.fillCircle(47, 32, 2.5);
    g.lineStyle(2, 0x2d3748);
    g.beginPath();
    g.arc(40, 40, 6, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('cloud1', 80, 60);
    g.clear();

    // 2.2 Грозовая туча (80x75)
    g.fillStyle(0x4a5568);
    g.fillCircle(40, 36, 22);
    g.fillCircle(22, 34, 15);
    g.fillCircle(58, 34, 15);
    g.lineStyle(3, 0xf6e05e);
    for (let i = 0; i < 3; i++) {
        const mx = 24 + i * 16;
        g.beginPath();
        g.moveTo(mx, 46); g.lineTo(mx - 4, 54);
        g.lineTo(mx + 2, 54); g.lineTo(mx - 3, 64);
        g.strokePath();
    }
    g.fillStyle(0xf56565);
    g.fillCircle(33, 34, 2.5);
    g.fillCircle(47, 34, 2.5);
    g.generateTexture('cloud2', 80, 75);
    g.clear();

    // 2.3 Перистое облако (100x50)
    g.fillStyle(0xfbb6ce);
    g.fillCircle(50, 25, 18);
    g.fillCircle(28, 25, 12);
    g.fillCircle(72, 25, 12);
    g.fillStyle(0x702459);
    g.fillCircle(42, 24, 2.5);
    g.fillCircle(58, 24, 2.5);
    g.generateTexture('cloud3', 100, 50);
    g.clear();

    // 2.4 Кристалл (70x70)
    g.fillStyle(0x63b3ed);
    g.fillTriangle(35, 5, 60, 35, 35, 65);
    g.fillTriangle(35, 5, 10, 35, 35, 65);
    g.fillStyle(0xbee3f8);
    g.fillTriangle(35, 10, 50, 35, 35, 55);
    g.generateTexture('crystal', 70, 70);
    g.clear();

    // 2.5 Техно-мусор (70x70)
    g.fillStyle(0x718096);
    g.fillRect(18, 18, 34, 34);
    g.lineStyle(4, 0xe2e8f0);
    g.strokeRect(20, 20, 30, 30);
    g.fillStyle(0xe53e3e);
    g.fillCircle(35, 35, 6);
    g.generateTexture('debris', 70, 70);
    g.clear();

    // 3. БОССЫ (120x120)
    // 3.1 Босс 1 - Ураган
    createRadial('boss1', 120, '#4a5568', '#1a202c', 55);
    // 3.2 Босс 2 - Штормовой Вихрь
    createRadial('boss2', 120, '#4299e1', '#2b6cb0', 55);
    // 3.3 Босс 3 - Затмение
    createRadial('boss3', 120, '#ed8936', '#9c4221', 55);
    // 3.4 Босс 4 - Ледяной Гигант
    createRadial('boss4', 120, '#90cdf4', '#2c5282', 55);
    // 3.5 Босс 5 - Чёрная Дыра
    createRadial('boss5', 120, '#d53f8c', '#171923', 58);

    // 4. СНАРЯДЫ И ПУЛИ С НЕОНОВЫМ СВЕЧЕНИЕМ
    createRadial('bullet', 24, '#ffffff', 'rgba(0, 195, 255, 0)', 10);
    createRadial('bullet_double', 32, '#ffff66', 'rgba(255, 150, 0, 0)', 14);
    createRadial('enemy_bullet', 20, '#ff4444', 'rgba(255, 0, 0, 0)', 9);

    // 5. БОНУСЫ (50x50) С ЯРКОЙ КАЙМОЙ
    createRadial('bonus_double', 50, '#48bb78', 'rgba(72, 187, 120, 0)', 24);
    createRadial('bonus_speed', 50, '#ecc94b', 'rgba(236, 201, 75, 0)', 24);
    createRadial('bonus_damage', 50, '#9f7aea', 'rgba(159, 122, 234, 0)', 24);
    createRadial('bonus_heart', 50, '#f56565', 'rgba(245, 101, 101, 0)', 24);
    createRadial('bonus_shield', 50, '#00e5ff', 'rgba(0, 229, 255, 0)', 24);

    // 6. СПЕЦЭФФЕКТЫ: Щит и Волна Ульты
    createRadial('shield_fx', 100, 'rgba(0, 229, 255, 0.4)', 'rgba(0, 229, 255, 0)', 48);
    createRadial('ult_wave', 200, 'rgba(255, 230, 100, 0.8)', 'rgba(255, 100, 0, 0)', 98);
    createRadial('cloud_bg', 90, 'rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0)', 42);

    // 7. КОСМОС: Планеты, Галактика и Финальная Чёрная Дыра
    createRadial('planet1', 120, '#f6ad55', '#7b341e', 50);
    createRadial('planet2', 120, '#ecc94b', '#975a16', 50);
    createRadial('planet3', 120, '#63b3ed', '#234e52', 50);
    createRadial('planet4', 120, '#68d391', '#22543d', 50);
    createRadial('planet5', 120, '#b794f4', '#44337a', 50);
    createRadial('galaxy', 260, '#ffffff', 'rgba(107, 70, 193, 0)', 125);
    createRadial('final_blackhole', 260, '#d53f8c', '#000000', 128);
}
// ============================================================================
// CREATE - СБОРКА СЦЕНЫ, ИНТЕРФЕЙС И ЭФФЕКТЫ
// ============================================================================

function create() {
    // Активация аудиоконтекста при старте
    if (this.sound.context.state === 'suspended') {
        this.sound.context.resume();
    }

    this.cameras.main.setBackgroundColor(LEVEL_CONFIG[1].color);

    // 1. МНОГОСЛОЙНЫЙ ПАРАЛЛАКС-ФОН
    bgClouds = this.add.group();
    for (let i = 0; i < 20; i++) {
        const speedMultiplier = Phaser.Math.FloatBetween(0.5, 2.0);
        const bc = this.add.image(
            Phaser.Math.Between(0, config.width),
            Phaser.Math.Between(0, config.height),
            'cloud_bg'
        )
        .setAlpha(0.2)
        .setScale(speedMultiplier)
        .setDepth(-2);
        bc.parallaxSpeed = speedMultiplier;
        bgClouds.add(bc);
    }

    // 2. ИГРОК И СВЕТЯЩАЯСЯ АУРА
    const playerGlow = this.add.image(0, 0, 'sun_glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
    player = this.physics.add.sprite(config.width / 2, config.height - 120, 'sun_normal');
    player.setCollideWorldBounds(true);
    player.setDisplaySize(64, 64);
    player.glow = playerGlow;

    // Световой шлейф за игроком
    player.trailTimer = this.time.addEvent({
        delay: 60,
        callback: () => {
            if (player && player.active && gameState === 'playing') {
                const spark = this.add.circle(player.x, player.y + 15, 6, 0xffaa00, 0.7);
                spark.setBlendMode(Phaser.BlendModes.ADD);
                this.tweens.add({
                    targets: spark,
                    scale: 0.1,
                    alpha: 0,
                    y: spark.y + 35,
                    duration: 350,
                    onComplete: () => spark.destroy()
                });
            }
        },
        loop: true
    });

    // 3. ФИЗИЧЕСКИЕ ГРУППЫ
    bullets = this.physics.add.group();
    enemyBullets = this.physics.add.group();
    clouds = this.physics.add.group();
    bonuses = this.physics.add.group();

    // 4. UI И HUD (СЧЕТ, УРОВЕНЬ, КОМБО, УЛЬТА)
    scoreText = this.add.text(20, 20, 'Очки: 0', {
        fontSize: '22px', fill: '#ffffff', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    });

    bestScoreText = this.add.text(config.width - 20, 20, '🏆: ' + bestScore, {
        fontSize: '20px', fill: '#ffd700', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    }).setOrigin(1, 0);

    levelText = this.add.text(20, 50, 'Уровень: 1', {
        fontSize: '18px', fill: '#ffff00', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    });

    damageText = this.add.text(20, 110, 'Урон: 1', {
        fontSize: '16px', fill: '#ff6600', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    });

    comboText = this.add.text(20, 135, 'Комбо: x1', {
        fontSize: '18px', fill: '#00ffcc', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    });

    updateLivesText.call(this);

    // КНОПКА УЛЬТЫ (СОЛНЕЧНАЯ ВСПЫШКА)
    ultButton = this.add.text(config.width - 25, config.height - 100, 'ВСПЫШКА\n0%', {
        fontSize: '14px', fill: '#ffffff', fontWeight: 'bold',
        align: 'center', backgroundColor: '#4a5568',
        padding: { x: 12, y: 10 }
    }).setOrigin(1, 1).setInteractive().setDepth(100);

    ultButton.on('pointerdown', () => {
        triggerUltimate.call(this);
    });

    // КНОПКА ВЫХОДА
    exitButton = this.add.text(config.width - 15, config.height - 25, 'Выйти', {
        fontSize: '16px', fill: '#ffffff',
        backgroundColor: '#e53e3e', padding: { x: 10, y: 5 }
    }).setOrigin(1, 1).setInteractive().setDepth(100);

    exitButton.on('pointerdown', () => {
        sendScoreAndClose();
    });

    // ИНИЦИАЛИЗАЦИЯ АУДИО ПРИ ПЕРВОМ ТАПЕ
    this.input.once('pointerdown', () => {
        initAudio();
    });

    // УПРАВЛЕНИЕ ТАПОМ/МЫШЬЮ
    this.input.on('pointermove', (p) => {
        if (player && player.active && gameState === "playing") {
            player.x = Phaser.Math.Clamp(p.x, 25, config.width - 25);
            player.y = Phaser.Math.Clamp(p.y - 25, 25, config.height - 25);
            player.glow.setPosition(player.x, player.y);
        }
    });

    // ЦИКЛ АВТОСТРЕЛЬБЫ ИГРОКА
    this.time.addEvent({
        delay: 260,
        callback: fire,
        callbackScope: this,
        loop: true
    });

    // СПАВН ВРАГОВ
    this.spawnTimer = this.time.addEvent({
        delay: 950,
        callback: () => {
            if (!isBossActive && gameState === "playing") {
                spawnEnemy.call(this);
            }
        },
        loop: true
    });

    // ТАЙМЕР ВЫЗОВА БОССА (каждые 22 сек)
    this.bossTimer = this.time.addEvent({
        delay: 22000,
        callback: prepareBoss,
        callbackScope: this,
        loop: true
    });

    // КОЛЛИЗИИ
    this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
    this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
    this.physics.add.overlap(player, enemyBullets, onPlayerHitBullet, null, this);
    this.physics.add.overlap(player, bonuses, collectBonus, null, this);

    // ГРАФИКА ДЛЯ ПОЛОСКИ БОССА
    bossBar = this.add.graphics().setDepth(100);
}
// ============================================================================
// 4.1 БОЕВЫЕ МЕХАНИКИ: КОМБО, УЛЬТА, СТРЕЛЬБА И СПАВН
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
    this.cameras.main.shake(250, 0.015);
    this.cameras.main.flash(200, 255, 255, 200);

    const wave = this.add.image(player.x, player.y, 'ult_wave').setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
        targets: wave,
        scale: 8,
        alpha: 0,
        duration: 600,
        onComplete: () => wave.destroy()
    });

    enemyBullets.clear(true, true);
    clouds.children.each(enemy => {
        if (enemy && enemy.active) {
            enemy.hp -= 15;
            if (enemy.hp <= 0) hitEnemy.call(this, { destroy: () => {}, active: true }, enemy);
        }
    });

    if (boss && boss.active) {
        boss.hp -= 20;
        showBossDamageText.call(this, boss);
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

    for (let i = 0; i < totalBullets; i++) {
        const b = bullets.create(player.x, player.y - 20, baseTexture);
        if (!b) continue;
        b.setBlendMode(Phaser.BlendModes.ADD);
        b.hasHit = false;
        b.body.setSize(22, 32);

        if (greenBulletsActive) {
            b.setTint(0x00ff88);
            const spreadAngle = 50;
            const angle = ((i / Math.max(1, totalBullets - 1)) * spreadAngle - (spreadAngle / 2)) * (Math.PI / 180);
            b.setVelocity(Math.sin(angle) * 650, -Math.cos(angle) * 650);
        } else {
            const spacing = 14;
            b.x = player.x + (i - (totalBullets - 1) / 2) * spacing;
            b.setVelocityY(-650);
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
    const speed = cfg.speed * Math.pow(1.08, level - 1) * Phaser.Math.FloatBetween(0.85, 1.15);
    enemy.setVelocityY(speed);

    if (level >= 2) {
        this.tweens.add({
            targets: enemy,
            x: Phaser.Math.Clamp(enemy.x + Phaser.Math.Between(-80, 80), 40, config.width - 40),
            duration: 900,
            yoyo: true,
            repeat: -1
        });
    }
}
// ============================================================================
// 4.2 ПОПАДАНИЯ, ЭФФЕКТЫ (SHAKE + HIT-FLASH) И БОНУСЫ
// ============================================================================

function hitEnemy(bullet, enemy) {
    if (bullet.hasHit || !bullet.active || !enemy.active) return;
    bullet.hasHit = true;
    bullet.destroy();

    enemy.hp -= playerDamage;
    playSFX(this, 'hit');
    showDamageText.call(this, enemy.x + 15, enemy.y - 15, playerDamage);

    // Hit-Flash эффект (белая вспышка при попадании)
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
        if (enemy && enemy.active) enemy.clearTint();
    });

    if (enemy.hp <= 0) {
        playSFX(this, 'enemy_death');
        enemy.disableBody(true, true);

        // Легкая встряска камеры
        this.cameras.main.shake(80, 0.004);

        // Заряд ульты и комбо
        addUltCharge(4);
        addCombo();

        // Неоновые частицы взрыва
        for (let i = 0; i < 6; i++) {
            const p = this.add.circle(enemy.x, enemy.y, 4, 0x00ffff, 0.8).setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
                targets: p,
                x: p.x + Phaser.Math.Between(-60, 60),
                y: p.y + Phaser.Math.Between(-60, 60),
                alpha: 0,
                scale: 0.2,
                duration: 400,
                onComplete: () => p.destroy()
            });
        }

        // Спавн бонусов (22% шанс)
        if (Math.random() < 0.22) {
            const types = ['bonus_double', 'bonus_speed', 'bonus_damage', 'bonus_heart', 'bonus_shield'];
            const bName = Phaser.Utils.Array.GetRandom(types);
            const bonus = bonuses.create(enemy.x, enemy.y + 15, bName);
            if (bonus) {
                bonus.setVelocityY(90);
                bonus.setBlendMode(Phaser.BlendModes.ADD);
            }
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
        fontSize: '32px', fill: '#ffff00', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 5
    }).setOrigin(0.5).setDepth(200);

    if (type === 'bonus_double') {
        greenBulletsActive = true;
        txt.setText('x3 ПУЛИ!').setTint(0x00ff00);
        this.time.delayedCall(7000, () => { greenBulletsActive = false; });
    } else if (type === 'bonus_speed') {
        bulletMultiplier += 1;
        updateDamageText();
        txt.setText('ПУЛИ +1!');
    } else if (type === 'bonus_damage') {
        playerDamage += 1;
        updateDamageText();
        txt.setText('УРОН +1!').setTint(0xff00ff);
    } else if (type === 'bonus_shield') {
        isShieldActive = true;
        txt.setText('ЩИТ!').setTint(0x00ffff);
        if (!player.shieldSprite) {
            player.shieldSprite = this.add.image(player.x, player.y, 'shield_fx').setBlendMode(Phaser.BlendModes.ADD);
        }
    } else if (type === 'bonus_heart') {
        if (lives < 5) {
            lives++;
            updateLivesText.call(this);
            txt.setText('+1 ЖИЗНЬ!').setTint(0xff4444);
        } else {
            score += 100;
            scoreText.setText('Очки: ' + score);
            txt.setText('+100 ОЧКОВ!');
        }
    }

    this.tweens.add({
        targets: txt,
        y: txt.y - 35,
        alpha: 0,
        duration: 600,
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

    // Сброс комбо при получении урона
    comboCount = 0;
    comboMultiplier = 1;
    if (comboText) comboText.setText('Комбо: x1').setColor('#00ffcc');

    if (isShieldActive) {
        isShieldActive = false;
        if (player.shieldSprite) {
            player.shieldSprite.destroy();
            player.shieldSprite = null;
        }
        playSFX(this, 'hit');
        this.cameras.main.shake(120, 0.008);
        return;
    }

    if (enemy.destroy) enemy.destroy();
    lives--;
    updateLivesText.call(this);

    playSFX(this, 'hurt');
    this.cameras.main.shake(200, 0.015);

    if (lives <= 0) {
        triggerGameOver.call(this);
        return;
    }

    isInvulnerable = true;
    player.setTexture('sun_hurt');
    this.tweens.add({
        targets: player,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: 8,
        onComplete: () => {
            player.alpha = 1;
            player.setTexture('sun_normal');
            isInvulnerable = false;
        }
    });
}
// ============================================================================
// 4.3 БОССЫ: ПОЯВЛЕНИЕ, АТАКИ, ПОЛОСКА HP И ПЕРЕХОД ПО УРОВНЯМ
// ============================================================================

function prepareBoss() {
    if (isBossActive || gameState !== "playing" || level > 5) return;

    isBossInvulnerable = true;
    this.time.delayedCall(2000, () => { isBossInvulnerable = false; });
    isBossActive = true;

    boss = this.physics.add.sprite(config.width / 2, -100, 'boss' + level);
    boss.setDisplaySize(110, 110);
    boss.body.setSize(80, 80);
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
        boss.maxHp = 25 + (level * 25);
        boss.hp = boss.maxHp;

        // Паттерн атак босса (залпы снарядов каждые 1.2 сек)
        boss.shootTimer = this.time.addEvent({
            delay: 1200,
            callback: () => {
                if (!boss || !boss.active || isBossInvulnerable || gameState !== 'playing') return;
                const count = LEVEL_CONFIG[level].bossBullets || 2;
                for (let i = 0; i < count; i++) {
                    const eb = enemyBullets.create(boss.x, boss.y + 40, 'enemy_bullet');
                    if (eb) {
                        eb.setBlendMode(Phaser.BlendModes.ADD);
                        const angle = ((i / Math.max(1, count - 1)) * 60 - 30) * (Math.PI / 180);
                        eb.setVelocity(Math.sin(angle) * 260, Math.cos(angle) * 260);
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

        // Hit-flash босса
        bObj.setTintFill(0xffffff);
        this.time.delayedCall(50, () => {
            if (bObj && bObj.active) bObj.clearTint();
        });

        if (bObj.hp <= 0) {
            if (bObj.shootTimer) bObj.shootTimer.remove();
            bObj.destroy();
            isBossActive = false;
            bossBar.clear();
            enemyBullets.clear(true, true);

            this.cameras.main.shake(300, 0.02);
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
                        delay: 22000,
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
    });
}

function updateBossBar() {
    if (!boss || !boss.active || !bossBar) return;
    bossBar.clear();

    const barWidth = 140;
    const barHeight = 10;
    const barX = (config.width / 2) - (barWidth / 2);
    const barY = 22;

    bossBar.fillStyle(0x1a202c, 0.8);
    bossBar.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

    bossBar.fillStyle(0xe53e3e);
    bossBar.fillRect(barX, barY, Math.max(0, (boss.hp / boss.maxHp) * barWidth), barHeight);

    bossBar.lineStyle(2, 0xffffff);
    bossBar.strokeRect(barX, barY, barWidth, barHeight);
}
// ============================================================================
// 4.4 UPDATE, GAME OVER, ЭПИЧНЫЙ ФИНАЛ И ИНТЕРФЕЙС УРОНА
// ============================================================================

function triggerGameOver() {
    gameState = "gameover";

    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.bossTimer) this.bossTimer.remove();
    if (player.trailTimer) player.trailTimer.remove();
    if (boss && boss.shootTimer) boss.shootTimer.remove();

    bullets.clear(true, true);
    enemyBullets.clear(true, true);
    clouds.clear(true, true);
    bonuses.clear(true, true);
    bossBar.clear();
    if (boss) boss.destroy();
    if (player.glow) player.glow.destroy();
    if (player.shieldSprite) player.shieldSprite.destroy();

    playSFX(this, 'game_over');

    this.add.text(config.width / 2, config.height / 2 - 20, 'GAME OVER', {
        fontSize: '56px', fill: '#ff4444', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 6
    }).setOrigin(0.5).setDepth(100);

    this.add.text(config.width / 2, config.height / 2 + 50, 'Счёт: ' + score, {
        fontSize: '28px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(100);

    this.time.delayedCall(2000, () => {
        this.tweens.killAll();
        this.time.removeAllEvents();
        if (player && player.active) player.destroy();
        sendScoreAndClose();
    });
}

function startEnding() {
    gameState = "ending";

    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.bossTimer) this.bossTimer.remove();
    if (player.trailTimer) player.trailTimer.remove();

    clouds.clear(true, true);
    bullets.clear(true, true);
    enemyBullets.clear(true, true);
    bonuses.clear(true, true);
    bossBar.clear();
    if (boss) boss.destroy();
    if (player.shieldSprite) player.shieldSprite.destroy();

    playSFX(this, 'boss_win');

    player.setTexture('sun_happy');
    player.setDisplaySize(50, 50);

    this.tweens.add({
        targets: player,
        x: config.width / 2,
        y: config.height / 2,
        scale: 2.5,
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
        const dist = 140 + (i * 35);
        const p = this.add.image(
            config.width / 2 + Math.cos(angle) * dist,
            config.height / 2 + Math.sin(angle) * dist,
            planetTextures[i]
        ).setDisplaySize(45, 45).setDepth(5);
        planets.push(p);
    }

    this.tweens.add({
        targets: planets,
        angle: 360,
        duration: 10000,
        repeat: -1
    });

    this.time.delayedCall(3500, () => {
        this.cameras.main.zoomTo(0.12, 5000);
        this.add.image(config.width / 2, config.height / 2, 'galaxy').setDisplaySize(1800, 1800);

        this.time.delayedCall(5000, () => {
            const bh = this.add.image(config.width * 3, config.height / 2, 'final_blackhole')
                .setDisplaySize(1600, 1600).setDepth(100);

            this.tweens.add({
                targets: bh,
                x: config.width / 2,
                duration: 4000,
                ease: 'Power2'
            });

            this.time.delayedCall(4500, () => {
                this.add.text(config.width / 2, config.height / 2 + 650, 'ПРОДОЛЖЕНИЕ\nСЛЕДУЕТ...', {
                    fontSize: '140px', fill: '#ffffff', fontWeight: 'bold',
                    stroke: '#ff00ff', strokeThickness: 10, align: 'center'
                }).setOrigin(0.5).setDepth(102);

                this.time.delayedCall(2000, () => {
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

    if (player && player.active) {
        if (player.glow) player.glow.setPosition(player.x, player.y);
        if (player.shieldSprite) player.shieldSprite.setPosition(player.x, player.y);
    }

    bgClouds.children.iterate(c => {
        if (c) {
            c.y += (1.5 * (c.parallaxSpeed || 1));
            if (c.y > config.height + 50) {
                c.y = -50;
                c.x = Phaser.Math.Between(0, config.width);
            }
        }
    });

    bullets.children.iterate(b => {
        if (b && b.y < -50) b.destroy();
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
        boss.x = (config.width / 2) + Math.sin(this.time.now / 600) * (50 + level * 12);
        boss.y = 140 + Math.cos(this.time.now / 900) * (30 + level * 8);
    }
}

function showBossText(scene, bossNum) {
    const texts = { 1: 'Ураган', 2: 'Шторм', 3: 'Затмение', 4: 'Ледяной Гигант', 5: 'Чёрная Дыра' };
    showAnimatedText(scene, 'БОСС:\n' + (texts[bossNum] || 'Босс ' + bossNum), 0xff00ff, 1800);
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
        const txt = scene.add.text(config.width / 2, startY + i * 36, line, {
            fontSize: '26px', fontWeight: 'bold',
            fill: '#' + color.toString(16).padStart(6, '0'),
            stroke: '#ffffff', strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0).setScale(0.6);

        scene.tweens.add({ targets: txt, alpha: 1, scale: 1.1, duration: 250, ease: 'Back.out' });
        scene.tweens.add({ targets: txt, alpha: 0, scale: 0.8, delay: duration - 400, duration: 400, onComplete: () => txt.destroy() });
    });
}
