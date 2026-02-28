const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Исправляем блокировку звука: контекст создаем, но стартуем после клика
let audioCtx;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(freq, type, duration, vol = 0.1) {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    physics: { default: 'arcade' },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);
let player, bullets, clouds, bonuses, boss, bossBar;
let score = 0, level = 1, lives = 3, isInvulnerable = false;
let scoreText, levelText, livesText;
let isBossActive = false, bossSpawned = 0, weaponLevel = 1, gameState = "level1";

function preload() {
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    
    // Солнце
    g.fillStyle(0xffff00).fillCircle(16, 16, 16); 
    g.generateTexture('sun', 32, 32); g.clear();
    
    // Пуля
    g.fillStyle(0xffffff).fillRect(0, 0, 4, 12); 
    g.generateTexture('bullet', 4, 12); g.clear();
    
    // Враги
    g.fillStyle(0xeeeeee).fillEllipse(20, 15, 40, 30); g.generateTexture('cloud1', 40, 30); g.clear();
    g.fillStyle(0x888888).fillEllipse(20, 15, 40, 30); g.generateTexture('cloud2', 40, 30); g.clear();
    
    // Бонус
    g.fillStyle(0x00ff00).fillCircle(10, 10, 10); 
    g.generateTexture('bonus', 20, 20); g.clear();
    
    // БОССЫ (Рисуем простыми формами, чтобы не было ошибок)
    g.fillStyle(0x444444).fillCircle(40, 40, 40); g.generateTexture('boss1', 80, 80); g.clear();
    g.fillStyle(0xffffff).fillCircle(40, 40, 40); g.generateTexture('boss2', 80, 80); g.clear();
    g.fillStyle(0xffa500).fillTriangle(0, 50, 100, 50, 50, 0); g.generateTexture('boss3', 100, 50); g.clear();
    
    // Босс 4 (Ледяная Комета) - Заменили fillStar на два ромба (эффект звезды)
    g.fillStyle(0x00ffff);
    g.fillRect(30, 0, 20, 80); g.fillRect(0, 30, 80, 20);
    g.generateTexture('boss4', 80, 80); g.clear();
    
    // Босс 5 (Спутник)
    g.fillStyle(0xaaaaaa).fillRect(0, 20, 80, 40); 
    g.fillStyle(0x555555).fillRect(30, 0, 20, 80); 
    g.generateTexture('boss5', 80, 80);
}

function create() {
    this.cameras.main.setBackgroundColor('#4ea1d3');
    
    player = this.physics.add.sprite(config.width/2, config.height-100, 'sun').setCollideWorldBounds(true);
    bullets = this.physics.add.group();
    clouds = this.physics.add.group();
    bonuses = this.physics.add.group();

    scoreText = this.add.text(20, 40, 'Очки: 0', { fontSize: '20px', fill: '#fff', fontWeight: 'bold' });
    levelText = this.add.text(20, 70, 'Уровень: 1', { fontSize: '18px', fill: '#ffff00' });
    livesText = this.add.text(20, 100, 'Жизни: ❤️❤️❤️', { fontSize: '20px' });

    // Инициализация звука по первому клику
    this.input.once('pointerdown', () => { initAudio(); });

    this.time.addEvent({ delay: 300, callback: fire, callbackScope: this, loop: true });
    this.time.addEvent({ delay: 1000, callback: spawn, callbackScope: this, loop: true });

    this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
    this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
    this.physics.add.overlap(player, bonuses, (p, b) => { 
        b.destroy(); weaponLevel = 2; playSound(800, 'triangle', 0.3); 
        this.time.delayedCall(7000, () => weaponLevel = 1); 
    }, null, this);

    this.input.on('pointermove', (p) => { if (p.isDown) { player.x = p.x; player.y = p.y - 60; } });
    bossBar = this.add.graphics().setDepth(100);
}

function spawn() {
    if (isBossActive || gameState === "ending") return;

    if (gameState === "level1" && score >= 200) { spawnBoss(this, 'boss1', 30, "level1_done"); return; }
    if (gameState === "level1_done" && score >= 400) { level = 2; levelText.setText('Уровень: 2'); this.cameras.main.setBackgroundColor('#a2d2ff'); gameState = "level2"; }
    if (gameState === "level2" && score >= 800) { spawnBoss(this, 'boss2', 50, "level2_done"); return; }
    if (gameState === "level2_done" && score >= 1200) { level = 3; levelText.setText('Уровень: 3'); this.cameras.main.setBackgroundColor('#6a4c93'); gameState = "level3"; }
    if (gameState === "level3" && score >= 1600) { spawnBoss(this, 'boss3', 70, "level3_done"); return; }
    if (gameState === "level3_done" && score >= 2000) { level = 4; levelText.setText('Уровень: 4'); this.cameras.main.setBackgroundColor('#1a1a2e'); gameState = "level4"; }
    if (gameState === "level4" && score >= 2500) { spawnBoss(this, 'boss4', 90, "level4_done"); return; }
    if (gameState === "level4_done" && score >= 3000) { level = 5; levelText.setText('Уровень: 5'); this.cameras.main.setBackgroundColor('#000000'); gameState = "level5"; }
    if (gameState === "level5" && score >= 4000) { spawnBoss(this, 'boss5', 120, "game_win"); return; }

    let x = Phaser.Math.Between(40, config.width - 40);
    let type = (level >= 2) ? 'cloud2' : 'cloud1';
    let c = clouds.create(x, -50, type);
    c.hp = (level >= 4) ? 3 : (level >= 2 ? 2 : 1);
    c.setVelocityY(200 + (level * 25));
}

function spawnBoss(scene, key, hp, nextState) {
    isBossActive = true;
    levelText.setText('ВНИМАНИЕ: БОСС!');
    boss = scene.physics.add.sprite(config.width/2, -100, key);
    boss.maxHp = hp; boss.hp = hp;
    scene.tweens.add({ targets: boss, y: 150, duration: 2000, ease: 'Back.easeOut' });
    
    scene.physics.add.overlap(bullets, boss, (bObj, bullet) => {
        bullet.destroy(); bObj.hp--; playSound(120, 'sawtooth', 0.05);
        if (bObj.hp <= 0) {
            bObj.destroy(); isBossActive = false; score += 500; scoreText.setText('Очки: ' + score);
            bossBar.clear(); playSound(60, 'square', 0.5, 0.2);
            gameState = nextState;
            if (nextState === "game_win") startEnding(scene);
        }
    });
}

function startEnding(scene) {
    gameState = "ending";
    levelText.setText("МИССИЯ ВЫПОЛНЕНА!");
    clouds.clear(true, true);
    scene.tweens.add({
        targets: player, x: config.width / 2, y: config.height / 2,
        scale: 2, duration: 2000, ease: 'Power2',
        onComplete: () => {
            scene.cameras.main.zoomTo(0.1, 5000);
            scene.time.delayedCall(5000, () => {
                let villain = scene.add.text(config.width/2, config.height/2 + 200, "😈", { fontSize: '100px' }).setOrigin(0.5);
                villain.setAlpha(0);
                scene.tweens.add({ targets: villain, alpha: 1, duration: 2000 });
                scene.add.text(config.width/2, config.height/2 + 300, "To be continued...", { fontSize: '40px', fill: '#f0f' }).setOrigin(0.5);
                scene.time.delayedCall(4000, () => {
                    if (window.Telegram && window.Telegram.WebApp) tg.sendData(score.toString());
                });
            });
        }
    });
}

function fire() {
    if (gameState === "ending") return;
    playSound(450, 'square', 0.05, 0.03);
    if (weaponLevel === 1) {
        let b = bullets.create(player.x, player.y - 20, 'bullet');
        if (b) b.setVelocityY(-500);
    } else {
        [-150, 0, 150].forEach(vx => {
            let b = bullets.create(player.x, player.y - 20, 'bullet');
            if (b) { b.setVelocityY(-500); b.setVelocityX(vx); }
        });
    }
}

function hitEnemy(bullet, enemy) {
    bullet.destroy(); enemy.hp--;
    if (enemy.hp <= 0) {
        playSound(150, 'sine', 0.1, 0.2);
        if (Math.random() > 0.9) bonuses.create(enemy.x, enemy.y, 'bonus').setVelocityY(100);
        enemy.destroy(); score += 10; scoreText.setText('Очки: ' + score);
    }
}

function onPlayerHit(p, c) {
    if (isInvulnerable || gameState === "ending") return;
    c.destroy(); lives--;
    livesText.setText('Жизни: ' + '❤️'.repeat(lives));
    playSound(100, 'sawtooth', 0.4, 0.3);
    tg.HapticFeedback.notificationOccurred('error');
    if (lives <= 0) {
        if (window.Telegram && window.Telegram.WebApp) tg.sendData(score.toString());
        location.reload(); 
    } else {
        isInvulnerable = true; player.x = config.width/2; player.y = config.height-100;
        this.tweens.add({ targets: player, alpha: 0.2, duration: 100, yoyo: true, repeat: 10, onComplete: () => { player.alpha = 1; isInvulnerable = false; } });
    }
}

function update() {
    bullets.children.iterate(b => { 
        if (b && b.y < -20) b.destroy(); 
        if (level === 3 && b) b.x += 1.2;
    });
    if (isBossActive && boss && boss.active) {
        bossBar.clear(); bossBar.fillStyle(0xff0000);
        bossBar.fillRect(config.width/2 - 50, 50, (boss.hp/boss.maxHp) * 100, 10);
    }
}
