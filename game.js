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
    //console.log('initAudio вызван, состояние:', audioCtx.state);
}

// ============================================================================
// PROCEDURAL SYNTHESIS (Phaser 3 Web Audio API)
// ============================================================================

// Компактный процедурный синтезатор звуков
function playSFX(scene, type) {
    const ctx = scene.sound.context;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    const osc = (f, e, d, w, t = now, v = 0.1) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = w;
        o.frequency.setValueAtTime(f, t);
        if (f !== e) o.frequency.exponentialRampToValueAtTime(e, t + d);
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + d);
    };

    switch(type) {
        case 'shoot': // 8-бит Пиу
            osc(600, 100, 0.2, 'triangle'); 
            break;
            
        case 'hit': // Всплеск/Слизь
            osc(400, 50, 0.2, 'sine'); 
            break;
            
        case 'hurt': // Цифровой спад (Потеря жизни)
            [523, 440, 349, 261].forEach((f, i) => osc(f, f - 50, 0.15, 'square', now + i * 0.1));
            break;
            
        case 'boss_win': // Победа над боссом (уровни 1-4)
            [523, 659, 783, 1046].forEach((f, i) => osc(f, f, 0.4, 'square', now + i * 0.08));
            break;
            
        case 'boss5_win': // Победа над боссом 5 (начало финала)
            [523, 523, 523, 698].forEach((f, i) => osc(f, f, 0.6, 'sawtooth', now + i * 0.15));
            osc(1046, 1046, 1.2, 'sawtooth', now + 0.6, 0.05);
            break;
            
        case 'game_over': // Проигрыш (грустная мелодия)
            [392, 370, 349].forEach((f, i) => osc(f, f - 10, 1.2, 'sawtooth', now + i * 0.6));
            break;
            
        case 'evil_triumph': // Торжество зла (Черная дыра)
            [110, 103, 98, 82].forEach((f, i) => osc(f, f, 1.5, 'sawtooth', now + i * 0.8, 0.07));
            break;
            
        case 'powerup': // Бонус
            osc(800, 1200, 0.3, 'triangle', now, 0.1);
            break;
            
        case 'enemy_death': // Смерть врага
            osc(100, 50, 0.15, 'triangle', now, 0.15);
            break;
    }
}

// ============================================================================
// PHASER CONFIG
// ============================================================================

const config = {
    type: Phaser.AUTO,  // Автоматический выбор (WebGL или Canvas)
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
// PRELOAD - ГРАФИКА (КРАСИВАЯ!)
// ============================================================================


function preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    
    // === 1.1 СОЛНЫШКО Обычное - вариант 1 (80x80) ===
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
    
    // === 1.2 СОЛНЫШКО Раненое - вариант 2 (80x80) ===
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
    g.moveTo(29, 32);
    g.lineTo(37, 34);
    g.moveTo(51, 32);
    g.lineTo(43, 34);
    g.strokePath();
    g.beginPath();
    g.moveTo(32, 52);
    g.lineTo(40, 48);
    g.lineTo(48, 52);
    g.strokePath();
    g.beginPath();
    g.moveTo(28, 30);
    g.lineTo(36, 32);
    g.moveTo(52, 30);
    g.lineTo(44, 32);
    g.strokePath();
    g.generateTexture('sun_hurt', 80, 80);
    g.clear();
    
    // === 1.3 СОЛНЫШКО Счастливое - вариант 3 (120x120) ===
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
    
    // === 2.1 ОБЛАКО - вариант 2 (80x60) ===
    g.fillStyle(0xf8f8f8);
    g.fillCircle(40, 32, Math.max(32, 12) / 2);
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
    
    // === 2.2 ГРОЗОВАЯ ТУЧА - вариант 2 (80x75) ===
    g.fillStyle(0x4a4a5a);
    g.fillCircle(40, 38, Math.max(32, 14) / 2);
    g.fillStyle(0x4a4a5a);
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
    
    // === 2.3 ПЕРИСТОЕ ОБЛАКО - вариант 1 (100x50) ===
    g.fillStyle(0xffcccc);
    g.fillCircle(50, 25, Math.max(42, 8) / 2);
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
    
    // === 2.4 КРИСТАЛЛ - вариант 1 (70x70) ===
    g.fillStyle(0x00ffff);
    g.fillTriangle(35, 5, 55, 35, 35, 65);
    g.fillTriangle(35, 5, 15, 35, 35, 65);
    g.lineStyle(4, 'rgba(255,255,255,0.7)');
    g.beginPath();
    g.moveTo(35, 5);
    g.lineTo(55, 35);
    g.lineTo(35, 65);
    g.lineTo(15, 35);
    g.closePath();
    g.strokePath();
    g.lineStyle(3, 'rgba(255,255,255,0.7)');
    g.beginPath();
    g.moveTo(35, 10);
    g.lineTo(35, 60);
    g.moveTo(20, 35);
    g.lineTo(50, 35);
    g.strokePath();
    g.fillStyle(0x003333);
    g.fillCircle(28, 25, 2.5);
    g.fillCircle(42, 25, 2.5);
    g.lineStyle(4, 0x003333);
    g.beginPath();
    g.arc(35, 45, 6, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('crystal', 70, 70);
    g.clear();
    
    // === 2.5 ТЕХНО-МУСОР - вариант 7 (70x70) ===
    g.fillStyle(0x999999);
    g.fillRect(17, 17, 36, 36);
    g.lineStyle(8, 0x666666);
    for(let i=0; i<6; i++) {
        const angle = (i / 6) * Math.PI + Math.PI;
        const startX = 35 + Math.cos(angle) * 20;
        const startY = 35 + Math.sin(angle) * 20;
        const endX = 35 + Math.cos(angle) * 35;
        const endY = 35 + Math.sin(angle) * 35;
        g.beginPath();
        g.moveTo(startX, startY);
        g.lineTo(endX, endY);
        g.strokePath();
    }
    g.fillStyle(0xff0000);
    g.fillCircle(35, 32, 6);
    g.fillStyle(0xffffff);
    g.fillCircle(33, 30, 2);
    g.fillStyle(0xff0000);
    g.fillCircle(27, 25, 2);
    g.fillCircle(43, 25, 2);
    g.lineStyle(4, 0xff0000);
    g.beginPath();
    g.arc(35, 45, 6, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('debris', 70, 70);
    g.clear();
    
    // === 3.1 БОСС 1 - Грозовая Туча (120x120) ===
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
    g.fillCircle(45, 50, Math.max(12, 10) / 2);
    g.fillCircle(75, 50, Math.max(12, 10) / 2);
    g.fillStyle(0x000000);
    g.fillCircle(45, 50, 4);
    g.fillCircle(75, 50, 4);
    g.lineStyle(4, 0x000000);
    g.beginPath();
    g.moveTo(35, 40);
    g.lineTo(52, 44);
    g.moveTo(85, 40);
    g.lineTo(68, 44);
    g.strokePath();
    g.lineStyle(4, 0xff0000);
    g.beginPath();
    g.arc(60, 78, 14, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('boss1', 120, 120);
    g.clear();
    
    // === 3.2 БОСС 2 - Штормовой Вихрь (120x120) ===
    g.fillStyle(0x4a5a6a);
    g.fillCircle(60, 60, 45);
    g.lineStyle(4, 0x6a7a8a);
    for(let arm=0; arm<4; arm++) {
        g.beginPath();
        for(let i=0; i<50; i++) {
            const a = (arm / 4) * Math.PI * 2 + i * 0.15;
            const r = 15 + i;
            if(i===0) g.moveTo(60 + Math.cos(a) * r, 60 + Math.sin(a) * r);
            else g.lineTo(60 + Math.cos(a) * r, 60 + Math.sin(a) * r);
        }
        g.strokePath();
    }
    g.fillStyle(0xff0000);
    g.fillCircle(50, 55, 6);
    g.fillCircle(70, 55, 6);
    g.fillStyle(0x000000);
    g.fillCircle(50, 55, 2);
    g.fillCircle(70, 55, 2);
    g.lineStyle(3, 0xff0000);
    g.beginPath();
    g.arc(60, 75, 12, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('boss2', 120, 120);
    g.clear();
    
    // === 3.3 БОСС 3 - Затмение (120x120) ===
    for(let i=0; i<12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.fillStyle(0xff6600);
        g.beginPath();
        g.moveTo(60 + Math.cos(a) * 45, 60 + Math.sin(a) * 45);
        g.lineTo(60 + Math.cos(a) * 65, 60 + Math.sin(a) * 65);
        g.lineTo(60 + Math.cos(a + 0.26) * 45, 60 + Math.sin(a + 0.26) * 45);
        g.fill();
    }
    g.fillStyle(0xffcc00);
    g.fillCircle(60, 60, 45);
    g.fillStyle(0x111111);
    g.fillCircle(75, 60, 42);
    g.fillStyle(0xff0000);
    g.fillCircle(68, 50, 6);
    g.fillCircle(82, 50, 6);
    g.fillStyle(0x000000);
    g.fillCircle(68, 50, 2);
    g.fillCircle(82, 50, 2);
    g.lineStyle(3, 0xff0000);
    g.beginPath();
    g.arc(75, 75, 12, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('boss3', 120, 120);
    g.clear();
    
    // === 3.4 БОСС 4 - Ледяной Гигант (120x120) ===
    g.fillStyle(0xaaddff);
    g.fillCircle(60, 60, 48);
    g.fillStyle(0x4488cc);
    g.fillCircle(50, 50, 40);
    g.fillStyle(0x004488);
    g.fillCircle(70, 70, 35);
    g.fillStyle(0x00ffff);
    g.fillCircle(45, 50, Math.max(12, 10) / 2);
    g.fillCircle(75, 50, Math.max(12, 10) / 2);
    g.fillStyle(0x000000);
    g.fillCircle(45, 50, 4);
    g.fillCircle(75, 50, 4);
    g.lineStyle(4, 0xaaddff);
    g.beginPath();
    g.moveTo(35, 38);
    g.lineTo(52, 42);
    g.moveTo(85, 38);
    g.lineTo(68, 42);
    g.strokePath();
    g.lineStyle(3, 0x00ffff);
    g.beginPath();
    g.arc(60, 80, 14, 0.2 * Math.PI, 0.8 * Math.PI, true);
    g.strokePath();
    g.generateTexture('boss4', 120, 120);
    g.clear();
    
    // === 3.5 БОСС 5 - Чёрная Дыра (120x120) - НАСМЕШЛИВАЯ (вариант 5) ===
    // Фиолетовая аура
    g.fillStyle('rgba(200,0,200,0.4)');
    g.fillCircle(60, 60, 70);
    // Чёрная дыра
    g.fillStyle(0x000000);
    g.fillCircle(60, 60, 50);
    g.lineStyle(4, 0xcc00cc);
    g.strokeCircle(60, 60, 50);
    // Насмешливые глаза
    g.fillStyle(0xff66ff);
    g.fillCircle(45, 50, 14);
    g.fillCircle(75, 50, 14);
    // Зрачки
    g.fillStyle(0x000000);
    g.fillCircle(43, 48, 5);
    g.fillCircle(77, 48, 5);
    // Поднятая бровь (одна выше другой)
    g.lineStyle(4, 0xff66ff);
    g.beginPath();
    g.moveTo(30, 35);
    g.lineTo(55, 38);
    g.moveTo(90, 32);
    g.lineTo(65, 38);
    g.strokePath();
    // Насмешливая полуулыбка
    g.lineStyle(5, 0xff66ff);
    g.beginPath();
    g.arc(65, 75, 28, 0.25*Math.PI, 0.75*Math.PI, false);
    g.strokePath();
    g.generateTexture('boss5', 120, 120);
    g.clear();
    
    // === 4.1 ПУЛЯ обычная (24x40) ===
    g.fillStyle(0xffffff);
    g.fillCircle(12, 20, Math.max(5, 15) / 2);
    g.generateTexture('bullet', 24, 40);
    g.clear();
    
    // === 4.2 ПУЛЯ усиленная (32x32) ===
    // Градиент заменён на цвет
    g.fillStyle(0xffffff);
    g.fillCircle(16, 16, 14);
    g.lineStyle(2, 0x00ffff);
    g.fillStyle(0xffffff);
    g.fillCircle(16, 16, 14);
    g.lineStyle(2, 'rgba(0,255,255,0.5)');
    g.strokeCircle(16, 16, 16);
    g.generateTexture('bullet_double', 32, 32);
    g.clear();
    
    // === 5.1 БОНУС Зелёный (50x50) ===
    g.fillStyle(0x00ff00);
    g.fillCircle(25, 25, 23);
    g.lineStyle(3, 0xffffff);
    g.strokeCircle(25, 25, 23);
    g.lineStyle(3, 0xffffff);
    g.beginPath();
    g.moveTo(31, 13);
    g.lineTo(19, 25);
    g.lineTo(27, 25);
    g.lineTo(19, 39);
    g.strokePath();
    g.generateTexture('bonus_double', 50, 50);
    g.clear();
    
    // === 5.2 БОНУС Жёлтый (50x50) ===
    g.fillStyle(0xffff00);
    g.fillCircle(25, 25, 23);
    g.lineStyle(3, 0xffffff);
    g.strokeCircle(25, 25, 23);
    g.lineStyle(2.5, 0xffffff);
    g.beginPath();
    for(let i=0; i<5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const inner = a + Math.PI / 5;
        if(i===0) g.moveTo(25 + Math.cos(a) * 14, 25 + Math.sin(a) * 14);
        else g.lineTo(25 + Math.cos(a) * 14, 25 + Math.sin(a) * 14);
        g.lineTo(25 + Math.cos(inner) * 6, 25 + Math.sin(inner) * 6);
    }
    g.closePath();
    g.strokePath();
    g.generateTexture('bonus_speed', 50, 50);
    g.clear();
    
    // === 5.3 БОНУС Фиолетовый (50x50) ===
    g.fillStyle(0xff00ff);
    g.fillCircle(25, 25, 23);
    g.lineStyle(3, 0xffffff);
    g.strokeCircle(25, 25, 23);
    g.lineStyle(3, 0xffffff);
    g.beginPath();
    g.moveTo(25, 13);
    g.lineTo(18, 25);
    g.lineTo(22, 25);
    g.lineTo(22, 35);
    g.lineTo(28, 35);
    g.lineTo(28, 25);
    g.lineTo(32, 25);
    g.closePath();
    g.strokePath();
    g.generateTexture('bonus_damage', 50, 50);
    g.clear();
    
    // === 5.4 БОНУС Красный - сердечко (50x50) ===
    g.fillStyle(0xff0000);
    g.fillCircle(18, 22, 8);
    g.fillCircle(32, 22, 8);
    g.beginPath();
    g.moveTo(10, 22);
    g.lineTo(25, 42);
    g.lineTo(40, 22);
    g.fill();
    g.fillStyle('rgba(255,255,255,0.4)');
    g.fillCircle(20, 19, 3);
    g.generateTexture('bonus_heart', 50, 50);
    g.clear();
    
    // === 6. ФОНОВОЕ ОБЛАКО (100x50) ===
    g.fillStyle('rgba(255,255,255,0.1)');
    g.fillCircle(50, 25, Math.max(35, 12) / 2);
    g.fillStyle('rgba(255,255,255,0.1)');
    g.fillCircle(30, 21, 10);
    g.fillCircle(70, 21, 10);
    g.generateTexture('cloud_bg', 100, 50);
    g.clear();
    
    // === 7.1 ПЛАНЕТА 1 - Меркурий (120x120) - из gallery_v4.html ===
    // Градиент: ff8866 → cc5533 → 662211
    g.fillStyle(0xff8866);
    g.fillCircle(60, 60, 50);
    g.fillStyle(0xcc5533);
    g.fillCircle(60, 60, 45);
    g.fillStyle(0x662211);
    g.fillCircle(60, 60, 40);
    // Кратеры
    g.fillStyle('rgba(100,40,20,0.6)');
    for(let i=0; i<13; i++) {
        g.fillCircle(60 + ((i%7)-3)*10, 60 + ((i%5)-2)*10, 3 + ((i%4)*2));
    }
    g.generateTexture('planet1', 120, 120);
    g.clear();

    // === 7.2 ПЛАНЕТА 2 - Венера (120x120) - из gallery_v4.html ===
    // Градиент: ffcc88 → ff9944 → cc6600 + полосы
    g.fillStyle(0xffcc88);
    g.fillCircle(60, 60, 48);
    g.fillStyle(0xff9944);
    g.fillCircle(60, 60, 44);
    g.fillStyle(0xcc6600);
    g.fillCircle(60, 60, 40);
    // Полосы облаков (эллипсы заменены на круги)
    g.fillStyle('rgba(255,200,150,0.4)');
    for(let i=0; i<5; i++) {
        g.fillCircle(60, 60 - 20 + i*10, 22);
    }
    g.generateTexture('planet2', 120, 120);
    g.clear();

    // === 7.3 ПЛАНЕТА 3 - Земля (120x120) - из gallery_v4.html ===
    // Градиент: 4488ff → 003388 + континенты
    g.fillStyle(0x4488ff);
    g.fillCircle(60, 60, 50);
    g.fillStyle(0x003388);
    g.fillCircle(60, 60, 46);
    // Континенты
    g.fillStyle(0x44aa44);
    g.fillCircle(45, 50, 18);
    g.fillCircle(80, 65, 16);
    // Облака
    g.fillStyle('rgba(255,255,255,0.4)');
    for(let i=0; i<4; i++) {
        g.fillCircle(60 + ((i%5)-2)*15, 60 + ((i%3)-1)*20, 10);
    }
    g.generateTexture('planet3', 120, 120);
    g.clear();

    // === 7.4 ПЛАНЕТА 4 - Газовый гигант (120x120) - из gallery_v4.html ===
    // Градиент: 88ff88 → 44aa44 → 006600 + полосы
    g.fillStyle(0x88ff88);
    g.fillCircle(60, 60, 52);
    g.fillStyle(0x44aa44);
    g.fillCircle(60, 60, 48);
    g.fillStyle(0x006600);
    g.fillCircle(60, 60, 44);
    // Полосы
    const colors = [0x66cc66, 0x44aa44, 0x228822, 0x006600, 0x66dd66];
    g.globalAlpha = 0.6;
    for(let i=0; i<8; i++) {
        g.fillStyle(colors[(7+i)%5]);
        g.fillCircle(60, 60 - 25 + i*8, 20);
    }
    g.globalAlpha = 1;
    g.generateTexture('planet4', 120, 120);
    g.clear();

    // === 7.5 ПЛАНЕТА 5 - Ледяной гигант с кольцами (120x120) - из gallery_v4.html ===
    // Градиент: cc88ff → 8844cc → 440088 + кольца
    g.fillStyle(0xcc88ff);
    g.fillCircle(60, 60, 45);
    g.fillStyle(0x8844cc);
    g.fillCircle(60, 60, 41);
    g.fillStyle(0x440088);
    g.fillCircle(60, 60, 37);
    // Кольца (эллипсы заменены на окружности)
    g.lineStyle(8, 'rgba(200,180,220,0.6)');
    g.strokeCircle(60, 60, 75);
    g.lineStyle(5, 'rgba(180,160,200,0.4)');
    g.strokeCircle(60, 60, 68);
    g.generateTexture('planet5', 120, 120);
    g.clear();

    // === 8. ГАЛАКТИКА (250x250) - из gallery_v4.html ===
    // Центр (градиент: white →ffffcc → transparent)
    g.fillStyle(0xffffff);
    g.fillCircle(125, 125, 50);
    g.fillStyle(0xffffcc);
    g.fillCircle(125, 125, 45);
    // 4 спиральных рукава с 150 звёздами каждый
    const armColors = [0xaaccff, 0xffcccc, 0xffffaa, 0xccffcc];
    for(let arm=0; arm<4; arm++) {
        for(let i=0; i<150; i++) {
            const a = (arm/4)*Math.PI*2 + i*0.03;
            const r = 50 + i*0.8;
            const spread = ((i%5)-2)*2;
            const x = 125 + Math.cos(a)*r + Math.cos(a+Math.PI/2)*spread;
            const y = 125 + Math.sin(a)*r*0.7 + Math.sin(a+Math.PI/2)*spread;
            g.globalAlpha = 0.1 + (150-i)/150*0.4;
            g.fillStyle(armColors[arm]);
            g.fillCircle(x, y, 1.5);
        }
    }
    g.globalAlpha = 1;
    g.generateTexture('galaxy', 250, 250);
    g.clear();
    
    // === 8.5 ФИНАЛЬНАЯ ЧЁРНАЯ ДЫРА (250x250) - из blackhole_final.html вариант 5 ===
    // Аура
    g.fillStyle('rgba(200,0,200,0.4)');
    g.fillCircle(125, 125, 125);
    // Чёрная дыра
    g.fillStyle(0x000000);
    g.fillCircle(125, 125, 80);
    g.lineStyle(4, 0xcc00cc);
    g.strokeCircle(125, 125, 80);
    // Насмешливые глаза
    g.fillStyle(0xff66ff);
    g.fillCircle(95, 105, 18);
    g.fillCircle(155, 105, 18);
    // Зрачки
    g.fillStyle(0x000000);
    g.fillCircle(93, 103, 6);
    g.fillCircle(157, 103, 6);
    // Поднятая бровь
    g.lineStyle(4, 0xff66ff);
    g.beginPath();
    g.moveTo(75, 85);
    g.lineTo(105, 88);
    g.moveTo(175, 85);
    g.lineTo(145, 88);
    g.strokePath();
    // Насмешливая полуулыбка
    g.lineStyle(5, 0xff66ff);
    g.beginPath();
    g.arc(135, 135, 40, 0.25*Math.PI, 0.75*Math.PI, false);
    g.strokePath();
    g.generateTexture('final_blackhole', 250, 250);
    g.clear();
    
    // === 9.1 ЧАСТИЦЫ (80x80) ===
    for(let i=0; i<12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = 40 + Math.cos(a) * 30;
        const y = 40 + Math.sin(a) * 30;
        g.fillStyle(0x88ccff);
        g.fillCircle(x, y, 6);
    }
    g.generateTexture('particle', 80, 80);
    g.clear();
    
    // === 9.2 КАПЛИ ДОЖДЯ (40x60) ===
    for(let i=0; i<5; i++) {
        g.fillStyle(0x88ccff);
        g.fillCircle(15 + i*3, 30, Math.max(2, 15) / 2);
    }
    g.generateTexture('raindrop', 40, 60);
    g.clear();
}
function create() {
    // Фикс для Web Audio API (активация контекста)
    if (this.sound.context.state === 'suspended') {
        this.sound.context.resume();
    }
    
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
    player.setDisplaySize(60, 60); // Уменьшаем до игрового размера (текстура 80x80)
    
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
            //console.log('Аудио инициализировано!');
        }
    });
    
    // === УПРАВЛЕНИЕ ===
    this.input.on('pointermove', (p) => {
        if(player && player.active && gameState === "playing") {
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
    
    // Показ надписи нового врага
    showNewEnemyText(this, cfg.enemy);
    
    if(enemy) {
        // HP врага растёт с уровнем
        enemy.hp = getEnemyHp(cfg.enemyHp);
        
        // Базовая скорость растёт с уровнем (множитель 1.1)
        const baseSpeed = cfg.speed * Math.pow(1.1, level - 1);
        // Рандомная скорость: 0.8 - 1.2 от базовой (каждое облако имеет свою скорость)
        const randomFactor = Phaser.Math.FloatBetween(0.8, 1.2);
        const speed = baseSpeed * randomFactor;
        
        enemy.setVelocityY(speed);
        
        // Отладка в консоль
        //console.log('Облако ' + cfg.enemy + ': скорость=' + speed.toFixed(1) + ' (база=' + baseSpeed.toFixed(1) + ', рандом=' + randomFactor.toFixed(2) + ')');
        
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
    
    playSFX(this, 'shoot');
    
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
                // ← ЗАЩИТА ОТ ЗАВИСАНИЯ: флаг попадания
                b.hasHit = false;
                // Увеличенный хитбокс для лучшей коллизии
                b.body.setSize(20, 35);
                
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
                b.hasHit = false;  // ← ЗАЩИТА ОТ ЗАВИСАНИЯ
                // Увеличенный хитбокс для лучшей коллизии
                b.body.setSize(20, 35);
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
                b.hasHit = false;  // ← ЗАЩИТА ОТ ЗАВИСАНИЯ
                // Увеличенный хитбокс для лучшей коллизии
                b.body.setSize(28, 28);
            }
        }
    }
}

function hitEnemy(bullet, enemy) {
    // ← ПРОВЕРКА №1: Если пуля уже попала - выходим (ЗАЩИТА ОТ ЗАВИСАНИЯ)
    if(bullet.hasHit) return;
    
    // ← ПРОВЕРКА №2: Если объекты неактивны - выходим
    if(!bullet.active || !enemy.active) return;
    
    // ← ПРОВЕРКА №3: Помечаем пулю как попавшую
    bullet.hasHit = true;
    
    // Сразу деактивируем пулю
    bullet.destroy();
    
    // Уменьшаем здоровье врага (с учётом урона игрока)
    enemy.hp -= playerDamage;
    playSFX(this, 'hit');
    
    // Надпись урона в правом верхнем углу врага
    showDamageText.call(this, enemy.x + 20, enemy.y - 20, playerDamage);
    
    // Если враг уничтожен
    if(enemy.hp <= 0) {
        playSFX(this, 'enemy_death');
        
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
                //console.log('Бонус создан:', bonusName, 'в точке', enemy.x, enemy.y);
            }
        }
        
        score += 10;
        scoreText.setText('Очки: ' + score);
        
        if(score > bestScore) {
            bestScore = score;
            bestScoreText.setText('🏆: ' + bestScore);
        }
        
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
        playSFX(this, 'powerup');
        bonusText.setText('x3 ПУЛИ!');
        bonusText.setTint(0x00ff00);
        this.time.delayedCall(7000, () => { greenBulletsActive = false; });
        //console.log('Зелёный бонус: x3 пули на 7 сек');
    } else if(bonusType === 'bonus_speed') {
        // ЖЁЛТЫЙ: кол-во пуль +1 (перманентно)
        bulletMultiplier += 1;
        playSFX(this, 'powerup');
        updateDamageText();
        bonusText.setText('ПУЛИ +1!');
        bonusText.setTint(0xffff00);
        //console.log('Жёлтый бонус: множитель пуль стал', bulletMultiplier);
    } else if(bonusType === 'bonus_damage') {
        // ФИОЛЕТОВЫЙ: урон +1 (перманентно)
        playerDamage += 1;
        playSFX(this, 'powerup');
        updateDamageText();
        //console.log('Урон изменён:', playerDamage);
        bonusText.setText('УРОН +1!');
        bonusText.setTint(0xff00ff);
    } else if(bonusType === 'bonus_heart') {
        // +1 жизнь
        if(lives < 5) {
            lives++;
            updateLivesText.call(this);
            playSFX(this, 'powerup');
            bonusText.setText('+1 ЖИЗНЬ!');
            bonusText.setTint(0xff0000);
            //console.log('Сердечко: жизней стало', lives);
        } else {
            score += 50;
            scoreText.setText('Очки: ' + score);
            bonusText.setText('+50 ОЧКОВ!');
            bonusText.setTint(0xff0000);
            //console.log('Сердечко: +50 очков (жизни полные)');
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
    
    playSFX(this, 'hurt');
    
    if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    
    if(lives <= 0) {
        // === GAME OVER ===
        gameState = "gameover";
        
        // ОСТАНАВЛИВАЕМ игровые таймеры
        if(this.spawnTimer) this.spawnTimer.remove();
        if(this.bossTimer) this.bossTimer.remove();
        
        // Уничтожаем игровые объекты
        bullets.clear(true, true);
        clouds.clear(true, true);
        bonuses.clear(true, true);
        bossBar.clear();
        if(boss) boss.destroy();
        bgClouds.clear(true, true);
        
        // Показываем Game Over и включаем мелодию проигрыша (процедурный синтез)
        playSFX(this, 'game_over');
        
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
        
        // Ждём 2 секунды, показываем надпись, потом очищаем всё
        this.time.delayedCall(2000, () => {
            // Теперь останавливаем всё
            this.tweens.killAll();
            this.time.removeAllEvents();
            //this.cameras.main.stopZoom() // не существует в Phaser 3;
            player.destroy();
            
            sendScoreAndClose();
        });
        
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
    
    // Враги НЕ исчезают - продолжают лететь пока не вылетят за экран или не будут убиты
    
    // === БОСС ПОЯВЛЯЕТСЯ ===
    boss = this.physics.add.sprite(config.width/2, -100, 'boss' + level);
    boss.setDisplaySize(100, 100);  // Визуальный размер меньше текстуры
    boss.body.setSize(80, 80);  // Хитбокс ещё меньше для честного попадания
    boss.body.setOffset(20, 20);  // Центрируем хитбокс
    
    // Босс неактивен и мигает пока показывается надпись (2 сек)
    boss.alpha = 0.5;
    boss.visible = true;
    
    // Мигание босса
    this.tweens.add({
        targets: boss,
        alpha: 0.2,
        duration: 200,
        yoyo: true,
        repeat: 5
    });
    
    // Показ надписи босса (2 секунды)
    showBossText(this, level);
    
    // После надписи босс становится активным
    this.time.delayedCall(2000, () => {
        boss.alpha = 1;
        boss.maxHp = 20 + (level * 20);
        boss.hp = boss.maxHp;
    });
    
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
        playSFX(this, 'hit');
        
        // Надпись урона боссу (с накоплением)
        showBossDamageText.call(this, boss);
        
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
                playSFX(this, 'boss_win');
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
    
    // Полоска здоровья по центру вверху (уменьшена для мобильных)
    const barWidth = 112;
    const barHeight = 12;
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
    
    // ОСТАНАВЛИВАЕМ игровые таймеры (но не tweens!)
    if(this.spawnTimer) this.spawnTimer.remove();
    if(this.bossTimer) this.bossTimer.remove();
    
    clouds.clear(true, true);
    bullets.clear(true, true);
    bgClouds.clear(true, true);
    bonuses.clear(true, true);
    bossBar.clear();
    if(boss) boss.destroy();
    
    playSFX(this, 'boss5_win');
    
    player.setTexture('sun_happy');
    player.setDisplaySize(40, 40);
    
    // Солнце летит в ЦЕНТР экрана
    this.tweens.add({
        targets: player,
        x: config.width/2,
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
    
    // СОЛНЦЕ СТРОГО ПО ЦЕНТРУ
    player.x = config.width/2;
    player.y = config.height/2;
    player.setDepth(10);  // Солнце поверх планет
    
    // ПЛАНЕТЫ вокруг солнца (увеличены в 3 раза)
    const planets = [];
    const planetTextures = ['planet1', 'planet2', 'planet3', 'planet4', 'planet5'];
    
    for(let i=0; i<5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const dist = 150 + (i * 40);  // Увеличил расстояние
        const p = this.add.image(
            config.width/2 + Math.cos(angle) * dist,
            config.height/2 + Math.sin(angle) * dist,
            planetTextures[i]
        ).setDisplaySize((60 - i*8) * 3, (60 - i*8) * 3);  // Увеличено в 3 раза
        p.setDepth(5);  // Планеты под солнцем
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
        
        // ГАЛАКТИКА из текстуры
        const galaxy = this.add.image(config.width/2, config.height/2, 'galaxy')
            .setDisplaySize(2000, 2000);
        
        this.time.delayedCall(6000, () => {
            // Мелодия "Торжество зла" (процедурный синтез)
            playSFX(this, 'evil_triumph');
            
            // ЧЁРНАЯ ДЫРА (из texture final_blackhole) - в 2 раза больше
            const bh = this.add.image(config.width * 5, config.height/2, 'final_blackhole')
                .setDisplaySize(2000, 2000)
                .setDepth(100);
            
            this.tweens.add({
                targets: bh,
                x: config.width/2,
                duration: 5000,
                ease: 'Power2'
            });
            
            // НАДПИСЬ (увеличена в 4 раза, две строки, ниже чёрной дыры)
            this.time.delayedCall(5500, () => {
                const finText = this.add.text(config.width/2, config.height/2 + 800, 
                    'ПРОДОЛЖЕНИЕ\nСЛЕДУЕТ...', {
                    fontSize: '192px',
                    fill: '#ffffff',
                    fontWeight: 'bold',
                    stroke: '#ff00ff',
                    strokeThickness: 12
                }).setOrigin(0.5).setDepth(102);
                
                this.time.delayedCall(1000, () => {
                    sendScoreAndClose();
                    
                    // ОЧИСТКА: останавливаем всё после отправки счёта
                    this.time.delayedCall(500, () => {
                        this.tweens.killAll();
                        this.time.removeAllEvents();
                        //this.cameras.main.stopZoom() // не существует в Phaser 3;
                        if(player && player.active) player.destroy();
                    });
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
    
    // Фоновые облака: базовая скорость растёт с уровнем, у каждого облака свой рандом
    const baseSpeed = 2 * Math.pow(1.1, level - 1);
    bgClouds.children.iterate(c => {
        if(c) {
            // У каждого облака своя скорость: 0.8 - 1.2 от базовой
            // Используем уникальное свойство cloudSpeed для постоянного рандома
            if(!c.cloudSpeed) {
                c.cloudSpeed = baseSpeed * Phaser.Math.FloatBetween(0.8, 1.2);
            }
            c.y += c.cloudSpeed;
            if(c.y > config.height) {
                c.y = -50;
                c.x = Phaser.Math.Between(0, config.width);
                c.cloudSpeed = baseSpeed * Phaser.Math.FloatBetween(0.8, 1.2);
            }
        }
    });
    
    bullets.children.iterate(b => {
        if(b && b.y < -100) b.destroy();  // Увеличил запас чтобы пуля долетала до босса
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
    4: { name: "Стратосфера", enemy: "crystal", enemyHp: 6, speed: 400, color: "#3a3a5e" },
    5: { name: "Орбита", enemy: "debris", enemyHp: 8, speed: 500, color: "#1a1a1a" }
};

// Функция для получения HP врага с учётом уровня
function getEnemyHp(baseHp) {
    return baseHp + Math.floor(level / 2);
}

// === НОВЫЙ КОД - НАДПИСИ ДЛЯ ВРАГОВ И БОССОВ ===

// Переменные для отслеживания показанных врагов
let shownEnemies = {};
let shownBosses = {};

// Функция показа надписи нового врага
function showNewEnemyText(scene, enemyType) {
    if(shownEnemies[enemyType]) return;
    shownEnemies[enemyType] = true;
    
    const texts = {
        'cloud1': 'Злое Облако',
        'cloud2': 'Грозовая туча',
        'cloud3': 'Перистые облака',
        'crystal': 'Кристалл холода',
        'debris': 'Техно-мусор'
    };
    
    const name = texts[enemyType] || enemyType;
    showAnimatedText(scene, 'НОВЫЙ ВРАГ:\n' + name, 0xff0000, 2000);
}

// Функция показа надписи босса
function showBossText(scene, bossNum) {
    if(shownBosses[bossNum]) return;
    shownBosses[bossNum] = true;
    
    const texts = {
        1: 'Взрывной ураган',
        2: 'Штормовой Вихрь',
        3: 'Затмение',
        4: 'Ледяной Гигант',
        5: 'Чёрная Дыра'
    };
    
    const name = texts[bossNum] || 'Босс ' + bossNum;
    // Длительность 2 секунды (в 2 раза дольше)
    showAnimatedText(scene, 'БОСС:\n' + name, 0xff00ff, 2000);
}

// Функция показа накопленного урона
function showDamageText(x, y, damage) {
    // Инициализируем pendingDamage если нет
    if(!this.pendingDamage) this.pendingDamage = {};
    
    // Создаём или обновляем накопитель урона
    const key = 'dmg_' + Math.round(x) + '_' + Math.round(y);
    
    if(this.pendingDamage[key]) {
        // Уже есть накопитель - добавляем урон
        this.pendingDamage[key].damage += damage;
        this.pendingDamage[key].timer = 0.15;  // Сброс таймера
    } else {
        // Новый накопитель
        this.pendingDamage[key] = {
            damage: damage,
            timer: 0.15,
            x: x,
            y: y
        };
        
        // Создаём текст
        const dmgText = this.add.text(x, y, '-' + damage, {
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#ff0000',
            stroke: '#ffffff',
            strokeThickness: 3
        }).setOrigin(0.5);
        this.pendingDamage[key].text = dmgText;
        
        // Запускаем обновление
        this.time.addEvent({
            delay: 50,
            callback: updateDamageTextKey,
            callbackScope: this,
            args: [key],
            repeat: 10
        });
    }
}

// Обновление текста урона (для накопленного урона)
function updateDamageTextKey(key) {
    if(!this.pendingDamage) this.pendingDamage = {};
    if(!this.pendingDamage[key]) return;
    
    const data = this.pendingDamage[key];
    data.timer -= 0.05;
    
    // Обновляем текст
    if(data.text && data.text.active) {
        data.text.setText('-' + data.damage);
        data.text.y -= 1;  // Медленно плывёт вверх
    }
    
    // Время вышло - уничтожаем
    if(data.timer <= 0) {
        if(data.text) {
            // Финальная анимация исчезновения
            this.tweens.add({
                targets: data.text,
                alpha: 0,
                y: data.text.y - 20,
                duration: 200,
                onComplete: () => {
                    if(data.text) data.text.destroy();
                }
            });
        }
        delete this.pendingDamage[key];
        return true;  // Остановить повторения
    }
    return false;  // Продолжить повторения
}

// Функция показа урона боссу
function showBossDamageText(bossObj) {
    showDamageText.call(this, bossObj.x + 30, bossObj.y - 30, playerDamage);
}

// Функция показа анимированной надписи
function showAnimatedText(scene, text, color, duration) {
    const lines = text.split('\n');
    const startY = config.height / 2 - (lines.length - 1) * 20;
    
    lines.forEach((line, i) => {
        const txt = scene.add.text(config.width / 2, startY + i * 40, line, {
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#' + color.toString(16).padStart(6, '0'),
            stroke: '#ffffff',
            strokeThickness: 4
        }).setOrigin(0.5);
        
        txt.alpha = 0;
        txt.scale = 0.5;
        
        scene.tweens.add({
            targets: txt,
            alpha: 1,
            scale: 1.2,
            duration: 300,
            ease: 'Back.out'
        });
        
        scene.tweens.add({
            targets: txt,
            alpha: 0,
            scale: 0.8,
            delay: duration - 500,
            duration: 500,
            onComplete: () => txt.destroy()
        });
    });
}
