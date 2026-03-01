// ============================================================================
// SUNNY STRIKE - Полная версия по ТЗ
// ============================================================================

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let bestScore = parseInt(localStorage.getItem('bestScore') || '0');
let audioCtx;
let gameState = "playing";
let score = 0, level = 1, lives = 3;
let weaponLevel = 1, playerDamage = 1, bulletMultiplier = 1;
let greenBulletsActive = false;  // ← Зелёные пули (временный бонус)
let isInvulnerable = false, isBossActive = false, isBossInvulnerable = false;

// === ИГРОВЫЕ ОБЪЕКТЫ ===
let player, bullets, clouds, bonuses, boss, bossBar, bgClouds, particles;
let scoreText, levelText, livesText, bestScoreText, damageText;
let exitButton;

// ============================================================================
// AUDIO SYSTEM
// ============================================================================

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    console.log('initAudio вызван, состояние:', audioCtx.state);
}

function playSound(freq, type, duration, vol = 0.1) {
    if (!audioCtx) {
        console.log('Звук: audioCtx не создан!');
        return;
    }
    if (audioCtx.state === 'suspended') {
        console.log('Звук: audioCtx suspended, resume...');
        audioCtx.resume();
    }
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        osc.stop(audioCtx.currentTime + duration);
        console.log('Звук:', freq + 'Hz', type, duration + 'сек');
    } catch(e) {
        console.error('Ошибка звука:', e);
    }
}

const SFX = {
    shoot: () => playSound(450, 'square', 0.05, 0.02),
    hit: () => playSound(150, 'sine', 0.1, 0.2),
    enemyDeath: () => playSound(100, 'triangle', 0.15, 0.15),
    playerHit: () => playSound(100, 'sawtooth', 0.4, 0.3),
    bossWin: () => {
        [523, 659, 783].forEach((f, i) => setTimeout(() => playSound(f, 'triangle', 0.3, 0.1), i * 100));
    },
    finalVictory: () => {
        [523, 659, 783, 1046].forEach((f, i) => setTimeout(() => playSound(f, 'square', 0.5, 0.1), i * 200));
    },
    evilMelody: () => {
        [80, 75, 70, 60].forEach((f, i) => setTimeout(() => playSound(f, 'sawtooth', 1.2, 0.3), i * 600));
    },
    powerup: () => playSound(800, 'triangle', 0.3, 0.1)
};

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
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

// ============================================================================
// PRELOAD - ГРАФИКА (КРАСИВАЯ!)
// ============================================================================

function preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    
    // === СОЛНЫШКО - НОВОЕ (ИЗ SVG) ===
    const sunColor = 0xFFD700;
    const faceColor = 0x442200;
    
    // Обычное (добрая улыбка)
    // Лучи (10 треугольников)
    for (let i = 0; i < 10; i++) {
        const angle = Phaser.Math.DegToRad(i * 36);
        const p1 = new Phaser.Math.Vector2(0, -22).rotate(angle);
        const p2 = new Phaser.Math.Vector2(-6, -8).rotate(angle);
        const p3 = new Phaser.Math.Vector2(6, -8).rotate(angle);
        g.fillStyle(sunColor);
        g.fillTriangle(20 + p1.x, 20 + p1.y, 20 + p2.x, 20 + p2.y, 20 + p3.x, 20 + p3.y);
    }
    // Основной круг
    g.fillStyle(sunColor);
    g.fillCircle(20, 20, 12);
    // Глазки
    g.fillStyle(faceColor);
    g.fillCircle(16, 18, 1.5);
    g.fillCircle(24, 18, 1.5);
    // Улыбка
    g.lineStyle(2, faceColor);
    g.beginPath();
    g.arc(20, 22, 5, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
    g.strokePath();
    g.generateTexture('sun_normal', 40, 40);
    g.clear();
    
    // Сосредоточенное (стрельба)
    for (let i = 0; i < 10; i++) {
        const angle = Phaser.Math.DegToRad(i * 36);
        const p1 = new Phaser.Math.Vector2(0, -22).rotate(angle);
        const p2 = new Phaser.Math.Vector2(-6, -8).rotate(angle);
        const p3 = new Phaser.Math.Vector2(6, -8).rotate(angle);
        g.fillStyle(sunColor);
        g.fillTriangle(20 + p1.x, 20 + p1.y, 20 + p2.x, 20 + p2.y, 20 + p3.x, 20 + p3.y);
    }
    g.fillStyle(sunColor);
    g.fillCircle(20, 20, 12);
    g.fillStyle(faceColor);
    g.fillCircle(16, 18, 1.5);
    g.fillCircle(24, 18, 1.5);
    // Сосредоточенный рот
    g.lineStyle(2, faceColor);
    g.beginPath();
    g.moveTo(16, 25);
    g.lineTo(20, 23);
    g.lineTo(24, 25);
    g.strokePath();
    g.generateTexture('sun_focused', 40, 40);
    g.clear();
    
    // Раненое (грустное)
    for (let i = 0; i < 8; i++) {
        const angle = Phaser.Math.DegToRad(i * 45);
        const p1 = new Phaser.Math.Vector2(0, -20).rotate(angle);
        const p2 = new Phaser.Math.Vector2(-5, -8).rotate(angle);
        const p3 = new Phaser.Math.Vector2(5, -8).rotate(angle);
        g.fillStyle(0xFFCC00);
        g.fillTriangle(20 + p1.x, 20 + p1.y, 20 + p2.x, 20 + p2.y, 20 + p3.x, 20 + p3.y);
    }
    g.fillStyle(0xFFCC00);
    g.fillCircle(20, 20, 12);
    g.fillStyle(faceColor);
    g.fillCircle(16, 19, 1.5);
    g.fillCircle(24, 19, 1.5);
    // Грустный рот
    g.lineStyle(2, faceColor);
    g.beginPath();
    g.arc(20, 26, 4, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
    g.strokePath();
    g.generateTexture('sun_hurt', 40, 40);
    g.clear();
    
    // Счастливое (победа)
    for (let i = 0; i < 12; i++) {
        const angle = Phaser.Math.DegToRad(i * 30);
        const p1 = new Phaser.Math.Vector2(0, -24).rotate(angle);
        const p2 = new Phaser.Math.Vector2(-6, -8).rotate(angle);
        const p3 = new Phaser.Math.Vector2(6, -8).rotate(angle);
        g.fillStyle(0xFFFF00);
        g.fillTriangle(20 + p1.x, 20 + p1.y, 20 + p2.x, 20 + p2.y, 20 + p3.x, 20 + p3.y);
    }
    g.fillStyle(0xFFFF00);
    g.fillCircle(20, 20, 12);
    g.fillStyle(faceColor);
    g.fillCircle(16, 18, 1.5);
    g.fillCircle(24, 18, 1.5);
    // Блестящие глаза
    g.fillStyle(0xffffff);
    g.fillCircle(17, 17, 0.8);
    g.fillCircle(25, 17, 0.8);
    // Широкая улыбка
    g.lineStyle(2, faceColor);
    g.beginPath();
    g.arc(20, 22, 6, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
    g.strokePath();
    g.generateTexture('sun_happy', 40, 40);
    g.clear();
    
    // === ВРАГИ - ОБЛАКА (ЗЛЫЕ) ===
    // Облако 1 (1 HP) - белое, злое
    g.fillStyle(0xffffff).fillEllipse(20, 15, 40, 30);
    g.fillCircle(12, 18, 12);
    g.fillCircle(28, 18, 12);
    g.fillCircle(20, 12, 14);
    // Злое лицо
    g.fillStyle(0x000000);
    g.fillCircle(14, 16, 3);
    g.fillCircle(26, 16, 3);
    g.lineStyle(2, 0x000000);
    g.beginPath();
    g.moveTo(10, 14);
    g.lineTo(16, 16);
    g.moveTo(24, 16);
    g.lineTo(30, 14);
    g.strokePath();
    g.beginPath();
    g.arc(20, 22, 6, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('cloud1', 40, 35);
    g.clear();
    
    // Туча 2 (2 HP) - серая, с молниями
    g.fillStyle(0x666677).fillEllipse(20, 15, 40, 30);
    g.fillCircle(12, 18, 12);
    g.fillCircle(28, 18, 12);
    g.fillCircle(20, 12, 14);
    // Злое лицо
    g.fillStyle(0x000000);
    g.fillCircle(14, 16, 3);
    g.fillCircle(26, 16, 3);
    // Брови злые
    g.lineStyle(3, 0x000000);
    g.beginPath();
    g.moveTo(10, 12);
    g.lineTo(18, 14);
    g.moveTo(30, 12);
    g.lineTo(22, 14);
    g.strokePath();
    // Злой рот
    g.beginPath();
    g.arc(20, 24, 6, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    // Молнии
    g.lineStyle(2, 0xffff00);
    g.beginPath();
    g.moveTo(15, 30);
    g.lineTo(12, 36);
    g.lineTo(15, 36);
    g.lineTo(12, 42);
    g.strokePath();
    g.beginPath();
    g.moveTo(25, 30);
    g.lineTo(28, 36);
    g.lineTo(25, 36);
    g.lineTo(28, 42);
    g.strokePath();
    g.generateTexture('cloud2', 40, 45);
    g.clear();
    
    // Перистое облако 3 (3 HP) - розоватое
    g.fillStyle(0xffcccc).fillEllipse(25, 12, 50, 24);
    g.fillCircle(10, 14, 10);
    g.fillCircle(20, 10, 10);
    g.fillCircle(30, 14, 10);
    g.fillCircle(40, 12, 8);
    // Злое лицо
    g.fillStyle(0x000000);
    g.fillCircle(15, 14, 3);
    g.fillCircle(35, 14, 3);
    g.lineStyle(2, 0x000000);
    g.beginPath();
    g.arc(25, 18, 8, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('cloud3', 50, 28);
    g.clear();
    
    // Кристалл 4 (4 HP) - ледяной
    g.fillStyle(0x00ffff).fillTriangle(20, 0, 0, 40, 40, 40);
    g.lineStyle(1, 0xffffff, 0.5);
    g.beginPath();
    g.moveTo(20, 0);
    g.lineTo(20, 40);
    g.strokePath();
    // Злое лицо
    g.fillStyle(0x000000);
    g.fillCircle(15, 25, 3);
    g.fillCircle(25, 25, 3);
    g.lineStyle(2, 0x000000);
    g.beginPath();
    g.arc(20, 32, 6, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('crystal', 40, 40);
    g.clear();
    
    // Техно-мусор 5 (5 HP)
    g.fillStyle(0x666666).fillRect(0, 0, 35, 35);
    g.fillStyle(0x333333).fillRect(5, 5, 25, 25);
    g.fillStyle(0xff0000).fillCircle(17, 17, 5);
    // Злое лицо
    g.fillStyle(0xff0000);
    g.fillCircle(10, 12, 3);
    g.fillCircle(25, 12, 3);
    g.lineStyle(2, 0xff0000);
    g.beginPath();
    g.arc(17, 25, 8, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('debris', 35, 35);
    g.clear();
    
    // === БОССЫ - ЗЛЫЕ ===
    for(let i=1; i<=5; i++) {
        g.clear();
        const size = 70 + (i * 10);
        const half = size / 2;
        
        if (i === 1) { // Босс уровня 1 - Грозовая туча
            g.fillStyle(0x444455).fillCircle(half, half, half);
            // Молнии вокруг
            g.lineStyle(4, 0xffff00);
            for(let j=0; j<8; j++) {
                const angle = (j / 8) * Math.PI * 2;
                g.beginPath();
                g.moveTo(half + Math.cos(angle) * (half - 5), half + Math.sin(angle) * (half - 5));
                g.lineTo(half + Math.cos(angle) * (half + 15), half + Math.sin(angle) * (half + 15));
                g.strokePath();
            }
            // Злые красные глаза
            g.fillStyle(0xff0000);
            g.fillCircle(half - 15, half - 5, 10);
            g.fillCircle(half + 15, half - 5, 10);
            g.fillStyle(0x000000);
            g.fillCircle(half - 15, half - 5, 4);
            g.fillCircle(half + 15, half - 5, 4);
            // Злые брови
            g.lineStyle(4, 0x000000);
            g.beginPath();
            g.moveTo(half - 25, half - 15);
            g.lineTo(half - 5, half - 10);
            g.moveTo(half + 25, half - 15);
            g.lineTo(half + 5, half - 10);
            g.strokePath();
            // Злой рот
            g.lineStyle(4, 0xff0000);
            g.beginPath();
            g.arc(half, half + 20, 15, 0.2 * Math.PI, 0.8 * Math.PI, true);
            g.strokePath();
        } else if (i === 5) { // Финальный босс - Чёрная дыра
            g.fillStyle(0x111111).fillCircle(half, half, half);
            g.lineStyle(3, 0x333333);
            g.strokeCircle(half, half, half);
            // Фиолетовая аура
            g.lineStyle(6, 0x880088, 0.5);
            g.strokeCircle(half, half, half + 5);
            // Огромные злые глаза
            g.fillStyle(0xff00ff);
            g.fillCircle(half - 20, half - 10, 18);
            g.fillCircle(half + 20, half - 10, 18);
            g.fillStyle(0x000000);
            g.fillCircle(half - 20, half - 10, 8);
            g.fillCircle(half + 20, half - 10, 8);
            // Зловещая ухмылка
            g.lineStyle(5, 0xff00ff);
            g.beginPath();
            g.arc(half, half + 20, 25, 0.1 * Math.PI, 0.9 * Math.PI, true);
            g.strokePath();
        } else {
            g.fillStyle(0x555555 + (i * 0x111111)).fillCircle(half, half, half);
            g.lineStyle(3, 0x888888);
            g.strokeCircle(half, half, half);
            // Злые глаза
            g.fillStyle(0xff0000);
            g.fillCircle(half - 15, half - 5, 8);
            g.fillCircle(half + 15, half - 5, 8);
            g.fillStyle(0x000000);
            g.fillCircle(half - 15, half - 5, 3);
            g.fillCircle(half + 15, half - 5, 3);
            // Злые брови
            g.lineStyle(3, 0x000000);
            g.beginPath();
            g.moveTo(half - 22, half - 12);
            g.lineTo(half - 8, half - 8);
            g.moveTo(half + 22, half - 12);
            g.lineTo(half + 8, half - 8);
            g.strokePath();
            // Злой рот
            g.lineStyle(3, 0xff0000);
            g.beginPath();
            g.arc(half, half + 15, 12, 0.2 * Math.PI, 0.8 * Math.PI, true);
            g.strokePath();
        }
        
        g.generateTexture('boss'+i, size, size);
    }
    
    // === СНАРЯДЫ ===
    g.clear();
    g.fillStyle(0xffffff).fillRect(0, 0, 4, 12);
    g.generateTexture('bullet', 4, 12);
    
    g.clear();
    g.fillStyle(0x00ffff).fillCircle(6, 6, 6);
    g.generateTexture('bullet_double', 12, 12);
    
    // === БОНУСЫ (разные типы) ===
    // Радужная капля (двойной выстрел) - ЗЕЛЁНЫЙ
    g.clear();
    g.fillStyle(0x00ff00).fillCircle(10, 10, 10);
    g.lineStyle(2, 0xffffff);
    g.strokeCircle(10, 10, 10);
    g.generateTexture('bonus_double', 20, 20);
    
    // Солнечный зайчик (кол-во пуль x2) - ЖЁЛТЫЙ
    g.clear();
    g.fillStyle(0xffff00).fillCircle(10, 10, 10);
    g.lineStyle(2, 0xffffff);
    g.strokeCircle(10, 10, 10);
    g.generateTexture('bonus_speed', 20, 20);
    
    // Линза (урон x2) - ФИОЛЕТОВЫЙ
    g.clear();
    g.fillStyle(0xff00ff).fillCircle(10, 10, 10);
    g.lineStyle(2, 0xffffff);
    g.strokeCircle(10, 10, 10);
    g.generateTexture('bonus_damage', 20, 20);
    
    // Сердечко (+1 жизнь) - КРАСНЫЙ
    g.clear();
    g.fillStyle(0xff0000);
    // Рисуем сердечко
    g.fillCircle(7, 8, 5);
    g.fillCircle(13, 8, 5);
    g.fillTriangle(3, 8, 17, 8, 10, 17);
    g.generateTexture('bonus_heart', 20, 20);
    
    // === ЧАСТИЦЫ ===
    g.clear();
    g.fillStyle(0xffffff).fillCircle(3, 3, 3);
    g.generateTexture('particle', 6, 6);
    
    g.clear();
    g.fillStyle(0x88ccff).fillCircle(4, 4, 4);
    g.generateTexture('raindrop', 8, 8);
    
    // === ФОН ===
    g.clear();
    g.fillStyle(0xffffff).fillCircle(8, 8, 8);
    g.generateTexture('cloud_bg', 16, 16);
    
    g.clear();
    g.fillStyle(0xffffff).fillCircle(2, 2, 2);
    g.generateTexture('star', 4, 4);
}

// ============================================================================
// CREATE
// ============================================================================

function create() {
    this.cameras.main.setBackgroundColor(LEVEL_CONFIG[1].color);
    
    // === ФОН ===
    bgClouds = this.add.group();
    for(let i=0; i<15; i++) {
        const bc = this.add.sprite(
            Phaser.Math.Between(0, config.width),
            Phaser.Math.Between(0, config.height),
            'cloud_bg'
        ).setAlpha(0.15).setScale(2).setDepth(-2);
        bgClouds.add(bc);
    }
    
    // === ИГРОК ===
    player = this.physics.add.sprite(config.width/2, config.height - 100, 'sun_normal');
    player.setCollideWorldBounds(true);
    
    // === ГРУППЫ ===
    bullets = this.physics.add.group();
    clouds = this.physics.add.group();
    bonuses = this.physics.add.group();
    
    // === UI ===
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
    
    // Отображение урона (глобальная переменная)
    damageText = this.add.text(20, 110, 'Урон: 1', {
        fontSize: '18px', fill: '#ff6600', fontWeight: 'bold',
        stroke: '#000000', strokeThickness: 4
    });
    
    updateLivesText.call(this);
    
    // === КНОПКА ВЫХОДА ===
    exitButton = this.add.text(config.width - 10, config.height - 30, 'Выйти', {
        fontSize: '18px', fill: '#ffffff',
        backgroundColor: '#ff4444', padding: { x: 10, y: 5 }
    }).setOrigin(1, 1).setInteractive().setDepth(100);
    
    exitButton.on('pointerdown', () => {
        sendScoreAndClose();
    });
    
    // === ИНИЦИАЛИЗАЦИЯ АУДИО (при первом клике) ===
    let audioInitialized = false;
    this.input.once('pointerdown', () => {
        if(!audioInitialized) {
            initAudio();
            audioInitialized = true;
            console.log('Аудио инициализировано!');
        }
    });
    
    // === УПРАВЛЕНИЕ ===
    this.input.on('pointermove', (p) => {
        if(player.active && gameState === "playing") {
            player.x = Phaser.Math.Clamp(p.x, 20, config.width - 20);
            player.y = Phaser.Math.Clamp(p.y - 20, 20, config.height - 20);
        }
    });
    
    // === СТРЕЛЬБА ===
    this.time.addEvent({
        delay: 300,
        callback: fire,
        callbackScope: this,
        loop: true
    });
    
    // === СПАВН ВРАГОВ ===
    this.spawnTimer = this.time.addEvent({
        delay: 1000,
        callback: () => {
            if(!isBossActive && gameState === "playing") {
                spawnEnemy.call(this);
            }
        },
        loop: true
    });
    
    // === ТАЙМЕР БОССА ===
    this.bossTimer = this.time.addEvent({
        delay: 20000,
        callback: prepareBoss,
        callbackScope: this,
        loop: true
    });
    
    // === КОЛЛИЗИИ ===
    this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
    this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
    this.physics.add.overlap(player, bonuses, collectBonus, null, this);
    
    // === БАР БОССА ===
    bossBar = this.add.graphics().setDepth(100);
}

// ============================================================================
// GAMEPLAY
// ============================================================================

function updateLivesText() {
    if(livesText) livesText.destroy();
    let hearts = '';
    for(let i=0; i<lives; i++) hearts += '💛';
    livesText = this.add.text(20, 80, hearts, { fontSize: '24px' });
}

function spawnEnemy() {
    const cfg = LEVEL_CONFIG[level];
    if(!cfg || isBossActive) return;
    
    const x = Phaser.Math.Between(40, config.width - 40);
    const enemy = clouds.create(x, -50, cfg.enemy);
    
    if(enemy) {
        // HP врага растёт с уровнем
        enemy.hp = getEnemyHp(cfg.enemyHp);
        enemy.setVelocityY(cfg.speed);
        
        if(level >= 2) {
            this.tweens.add({
                targets: enemy,
                x: enemy.x + Phaser.Math.Between(-100, 100),
                duration: 1000,
                yoyo: true,
                repeat: -1
            });
        }
    }
}

function fire() {
    if(gameState !== "playing" || !player.active) return;
    
    SFX.shoot();
    
    // Определяем количество и тип пуль
    let totalBullets = bulletMultiplier;
    let isGreenMode = greenBulletsActive;
    
    // Зелёный режим: x3 пуль
    if(isGreenMode) {
        totalBullets = bulletMultiplier * 3;
    }
    
    // Создаём пули
    if(isGreenMode) {
        // ЗЕЛЁНЫЕ ПУЛИ: веером (влево и вправо)
        const baseTexture = 'bullet';  // Остаётся та же форма
        const spreadAngle = 60;  // Угол разброса
        const centerX = totalBullets - 1;
        
        for(let i=0; i<totalBullets; i++) {
            const b = bullets.create(player.x, player.y - 20, baseTexture);
            if(b) {
                // Tint в зелёный
                b.setTint(0x00ff00);
                
                // Угол для этой пули
                const angle = ((i / centerX) * spreadAngle - (spreadAngle / 2)) * (Math.PI / 180);
                
                // Скорость с углом
                const speed = 600;
                b.setVelocity(
                    Math.sin(angle) * speed,
                    -Math.cos(angle) * speed
                );
            }
        }
    } else if(weaponLevel === 1) {
        // Обычные пули: параллельно
        const spacing = 15;
        const startX = player.x - ((totalBullets - 1) * spacing) / 2;
        
        for(let i=0; i<totalBullets; i++) {
            const b = bullets.create(startX + (i * spacing), player.y - 20, 'bullet');
            if(b) {
                b.setVelocityY(-600);
            }
        }
    } else {
        // Двойной выстрел: веер
        const positions = [-150, -75, 0, 75, 150];
        
        for(let i=0; i<totalBullets; i++) {
            const posIndex = i % positions.length;
            const b = bullets.create(player.x, player.y - 20, 'bullet_double');
            if(b) {
                b.setVelocityY(-500);
                b.setVelocityX(positions[posIndex]);
            }
        }
    }
}

function hitEnemy(bullet, enemy) {
    // Защита от повторных вызовов
    if(!bullet.active || !enemy.active) return;
    
    // Сразу деактивируем пулю
    bullet.destroy();
    
    // Уменьшаем здоровье врага (с учётом урона игрока)
    enemy.hp -= playerDamage;
    SFX.hit();
    
    // Если враг уничтожен
    if(enemy.hp <= 0) {
        SFX.enemyDeath();
        
        // Сразу деактивируем врага (защита от повторных вызовов)
        enemy.disableBody(true, true);
        
        // Частицы
        for(let i=0; i<5; i++) {
            const p = this.add.circle(enemy.x, enemy.y, 4, 0x88ccff);
            this.tweens.add({
                targets: p,
                x: p.x + Phaser.Math.Between(-100, 100),
                y: p.y + Phaser.Math.Between(-100, 100),
                alpha: 0,
                duration: 500,
                onComplete: () => p.destroy()
            });
        }
        
        // Бонусы (20% шанс, разные типы)
        if(Math.random() < 0.2) {
            const bonusType = Phaser.Math.Between(1, 4);
            const bonusName = bonusType === 1 ? 'bonus_double' : 
                              bonusType === 2 ? 'bonus_speed' : 
                              bonusType === 3 ? 'bonus_damage' : 'bonus_heart';
            const bonus = bonuses.create(enemy.x, enemy.y + 20, bonusName);
            if(bonus) {
                bonus.setVelocityY(80);
                console.log('Бонус создан:', bonusName, 'в точке', enemy.x, enemy.y);
            }
        }
        
        score += 10;
        scoreText.setText('Очки: ' + score);
        
        if(score > bestScore) {
            bestScore = score;
            bestScoreText.setText('🏆: ' + bestScore);
        }
        
        if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    }
}

function updateDamageText() {
    if(damageText) {
        damageText.setText('Урон: ' + playerDamage);
    }
}

function collectBonus(player, bonus) {
    const bonusType = bonus.texture.key;
    
    // ← Анимированная надпись (появляется на 0.5 сек)
    const bonusText = this.add.text(player.x, player.y - 30, '', {
        fontSize: '48px',
        fill: '#ffffff',
        fontWeight: 'bold',
        stroke: '#000000',
        strokeThickness: 6
    }).setOrigin(0.5).setDepth(200);
    
    if(bonusType === 'bonus_double') {
        // ЗЕЛЁНЫЙ: x3 пуль на 7 сек (пули летят веером)
        greenBulletsActive = true;
        SFX.powerup();
        bonusText.setText('x3 ПУЛИ!');
        bonusText.setTint(0x00ff00);
        this.time.delayedCall(7000, () => { greenBulletsActive = false; });
        console.log('Зелёный бонус: x3 пули на 7 сек');
    } else if(bonusType === 'bonus_speed') {
        // ЖЁЛТЫЙ: кол-во пуль x2 (перманентно)
        bulletMultiplier *= 2;
        SFX.powerup();
        updateDamageText();
        bonusText.setText('x2 ПУЛИ!');
        bonusText.setTint(0xffff00);
        console.log('Жёлтый бонус: пуль стало', bulletMultiplier);
    } else if(bonusType === 'bonus_damage') {
        // ФИОЛЕТОВЫЙ: урон x2 (перманентно)
        playerDamage *= 2;
        SFX.powerup();
        updateDamageText();
        bonusText.setText('УРОН x2!');
        bonusText.setTint(0xff00ff);
        console.log('Фиолетовый бонус: урон стал', playerDamage);
    } else if(bonusType === 'bonus_heart') {
        // +1 жизнь
        if(lives < 5) {
            lives++;
            updateLivesText.call(this);
            SFX.powerup();
            bonusText.setText('+1 ЖИЗНЬ!');
            bonusText.setTint(0xff0000);
            console.log('Сердечко: жизней стало', lives);
        } else {
            score += 50;
            scoreText.setText('Очки: ' + score);
            bonusText.setText('+50 ОЧКОВ!');
            bonusText.setTint(0xff0000);
            console.log('Сердечко: +50 очков (жизни полные)');
        }
    }
    
    // Исчезновение надписи через 0.5 сек
    this.tweens.add({
        targets: bonusText,
        y: bonusText.y - 30,
        alpha: 0,
        duration: 500,
        onComplete: () => bonusText.destroy()
    });
    
    bonus.destroy();
}

function onPlayerHit(player, enemy) {
    if(isInvulnerable || gameState !== "playing") return;
    
    if(enemy.destroy) enemy.destroy();
    
    lives--;
    updateLivesText.call(this);
    
    SFX.playerHit();
    
    if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    
    if(lives <= 0) {
        // === GAME OVER ===
        gameState = "gameover";
        
        // Уничтожаем все объекты
        player.destroy();
        bullets.clear(true, true);
        clouds.clear(true, true);
        bonuses.clear(true, true);
        bossBar.clear();
        if(boss) boss.destroy();
        
        // Показываем Game Over
        const gameOverText = this.add.text(config.width/2, config.height/2, 'GAME OVER', {
            fontSize: '64px',
            fill: '#ff0000',
            fontWeight: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(100);
        
        this.add.text(config.width/2, config.height/2 + 80, 'Счёт: ' + score, {
            fontSize: '32px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(100);
        
        // Отправляем счёт и закрываем
        setTimeout(() => {
            sendScoreAndClose();
        }, 2000);
        
        return;
    } else {
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
}

function prepareBoss() {
    if(isBossActive || gameState !== "playing" || level > 5) return;
    
    isBossInvulnerable = true;
    this.time.delayedCall(2000, () => { isBossInvulnerable = false; });
    
    isBossActive = true;
    
    clouds.clear(true, true);
    
    // === НАДПИСЬ "БОСС!" (яркая, крупная, с анимацией) ===
    const bossWarning = this.add.text(config.width/2, config.height/2 - 50, '⚠️ БОСС! ⚠️', {
        fontSize: '120px',
        fill: '#ff0000',
        fontWeight: 'bold',
        stroke: '#000000',
        strokeThickness: 8
    }).setOrigin(0.5).setDepth(200);
    
    // Пульсация
    this.tweens.add({
        targets: bossWarning,
        scale: 1.3,
        duration: 200,
        yoyo: true,
        repeat: 2
    });
    
    // Исчезновение через 1 секунду
    this.time.delayedCall(1000, () => {
        this.tweens.add({
            targets: bossWarning,
            alpha: 0,
            y: bossWarning.y - 50,
            duration: 300,
            onComplete: () => bossWarning.destroy()
        });
    });
    
    boss = this.physics.add.sprite(config.width/2, -100, 'boss' + level);
    boss.maxHp = 20 + (level * 20);
    boss.hp = boss.maxHp;
    
    this.tweens.add({
        targets: boss,
        y: 150,
        duration: 2000,
        ease: 'Back.out'
    });
    
    this.physics.add.overlap(player, boss, () => {
        if(!isBossInvulnerable) onPlayerHit.call(this, player, {destroy:()=>{}});
    });
    
    this.physics.add.overlap(bullets, boss, (bObj, bullet) => {
        if(isBossInvulnerable) return;
        
        bullet.destroy();
        bObj.hp--;
        playSound(120, 'sawtooth', 0.05);
        
        if(bObj.hp <= 0) {
            bObj.destroy();
            isBossActive = false;
            bossBar.clear();
            
            score += 1000;
            scoreText.setText('Очки: ' + score);
            
            if(lives < 5) {
                lives++;
                updateLivesText.call(this);
            }
            
            if(level < 5) {
                SFX.bossWin();
                level++;
                levelText.setText('Уровень: ' + level);
                this.cameras.main.setBackgroundColor(LEVEL_CONFIG[level].color);
                
                // ← СБРОС таймера босса (пауза 3 сек перед врагами)
                if(this.bossTimer) {
                    this.bossTimer.remove();
                    this.bossTimer = this.time.addEvent({
                        delay: 20000,  // 20 сек до следующего босса
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
    if(!boss || !boss.active || !bossBar) return;
    
    bossBar.clear();
    
    // Полоска здоровья по центру вверху
    const barWidth = 200;
    const barHeight = 15;
    const barX = (config.width / 2) - (barWidth / 2);
    const barY = 20;
    
    // Фон полоски
    bossBar.fillStyle(0x333333);
    bossBar.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
    
    // Основная полоска (красная)
    bossBar.fillStyle(0xff0000);
    bossBar.fillRect(barX, barY, (boss.hp / boss.maxHp) * barWidth, barHeight);
    
    // Рамка (белая)
    bossBar.lineStyle(2, 0xffffff);
    bossBar.strokeRect(barX, barY, barWidth, barHeight);
    
    // Мигание босса при неуязвимости
    if(isBossInvulnerable && boss) {
        boss.alpha = 0.5 + Math.sin(Date.now() / 100) * 0.5;
    } else if(boss) {
        boss.alpha = 1;
    }
}

// ============================================================================
// ENDING
// ============================================================================

function startEnding() {
    gameState = "ending";
    clouds.clear(true, true);
    bullets.clear(true, true);
    
    SFX.finalVictory();
    
    player.setTexture('sun_happy');
    
    this.tweens.add({
        targets: player,
        y: config.height/2,
        scale: 3,
        duration: 2000,
        onComplete: () => {
            showSpaceScene.call(this);
        }
    });
}

function showSpaceScene() {
    this.cameras.main.setBackgroundColor('#000000');
    
    const planets = [];
    const colors = [0xff4500, 0xffa500, 0x1e90ff, 0x32cd32, 0x8b4513];
    
    for(let i=0; i<5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const dist = 80 + (i * 20);
        const p = this.add.circle(
            config.width/2 + Math.cos(angle) * dist,
            config.height/2 + Math.sin(angle) * dist,
            15 - (i * 2),
            colors[i]
        );
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
        
        const galaxy = this.add.graphics();
        galaxy.lineStyle(2, 0xffffff, 0.3);
        
        for(let i=0; i<500; i++) {
            const r = i * 3;
            const a = i * 0.1;
            galaxy.strokeCircle(
                config.width/2 + Math.cos(a) * r,
                config.height/2 + Math.sin(a) * r,
                1
            );
        }
        
        this.time.delayedCall(6000, () => {
            SFX.evilMelody();
            
            // ЧЁРНАЯ ДЫРА (огромная)
            const bh = this.add.text(config.width * 5, config.height/2, '🌑', {
                fontSize: '1000px'
            }).setOrigin(0.5).setDepth(100);
            
            // ГЛАЗА (увеличены в 5 раз - было 200, стало 1000)
            const eyes = this.add.text(config.width * 4.8, config.height/2, '👁️ 👁️', {
                fontSize: '1000px'
            }).setOrigin(0.5).setDepth(101);
            
            this.tweens.add({
                targets: [bh, eyes],
                x: config.width/2,
                duration: 5000,
                ease: 'Power2'
            });
            
            // НАДПИСЬ (увеличена в 4 раза, под чёрной дырой)
            this.time.delayedCall(5500, () => {
                const finText = this.add.text(config.width/2, config.height/2 + 400, 
                    'ПРОДОЛЖЕНИЕ СЛЕДУЕТ...', {
                    fontSize: '320px',  // Увеличено с 80 до 320 (в 4 раза)
                    fill: '#ffffff',
                    fontWeight: 'bold',
                    stroke: '#ff00ff',
                    strokeThickness: 12
                }).setOrigin(0.5).setDepth(102);
                
                this.time.delayedCall(6000, () => {
                    sendScoreAndClose();
                });
            });
        });
    });
}

// ============================================================================
// TELEGRAM
// ============================================================================

function sendScoreAndClose() {
    if(score > bestScore) {
        bestScore = score;
        localStorage.setItem('bestScore', bestScore.toString());
    }
    
    if(tg.sendData) {
        tg.sendData(score.toString());
    }
    
    setTimeout(() => { tg.close(); }, 1000);
}

// ============================================================================
// UPDATE
// ============================================================================

function update() {
    if(gameState !== "playing") return;
    
    bgClouds.children.iterate(c => {
        if(c) {
            c.y += 2;
            if(c.y > config.height) {
                c.y = -50;
                c.x = Phaser.Math.Between(0, config.width);
            }
        }
    });
    
    bullets.children.iterate(b => {
        if(b && b.y < -20) b.destroy();
    });
    
    clouds.children.iterate(e => {
        if(e && e.y > config.height + 50) e.destroy();
    });
    
    // Очистка бонусов, улетевших за экран
    bonuses.children.iterate(b => {
        if(b && b.y > config.height + 50) b.destroy();
    });
    
    if(isBossActive && boss && boss.active) {
        updateBossBar();
        boss.x = (config.width/2) + Math.sin(this.time.now/500) * (60 + level*15);
        boss.y = 150 + Math.cos(this.time.now/800) * (40 + level*10);
    }
}

// ============================================================================
// LEVEL CONFIG
// ============================================================================

const LEVEL_CONFIG = {
    1: { name: "Голубое небо", enemy: "cloud1", enemyHp: 1, speed: 200, color: "#4ea1d3" },
    2: { name: "Грозовой фронт", enemy: "cloud2", enemyHp: 2, speed: 250, color: "#2c5f7f" },
    3: { name: "Закат", enemy: "cloud3", enemyHp: 3, speed: 300, color: "#ff6b35" },
    4: { name: "Стратосфера", enemy: "crystal", enemyHp: 6, speed: 400, color: "#1a1a2e" },
    5: { name: "Орбита", enemy: "debris", enemyHp: 8, speed: 500, color: "#0b0b0b" }
};

// Функция для получения HP врага с учётом уровня
function getEnemyHp(baseHp) {
    return baseHp + Math.floor(level / 2);
}
