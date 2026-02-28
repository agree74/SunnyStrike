const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

let audioCtx;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
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

// Запускаем игру сразу, без ожидания window.onload
const game = new Phaser.Game(config);

let player, bullets, clouds, bonuses, boss, bossBar, bgClouds;
let score = 0, level = 1, lives = 3, isInvulnerable = false;
let scoreText, levelText, livesText, timerText;
let isBossActive = false, weaponLevel = 1, bonusTimer = null;
let levelTimer, levelTimeLeft = 20, gameState = "playing";

function preload() {
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffff00).fillCircle(16, 16, 16); g.generateTexture('sun', 32, 32); g.clear();
    g.fillStyle(0xffffff).fillRect(0, 0, 4, 12); g.generateTexture('bullet', 4, 12); g.clear();
    g.fillStyle(0xeeeeee).fillEllipse(20, 15, 40, 30); g.generateTexture('cloud1', 40, 30); g.clear();
    g.fillStyle(0x888888).fillEllipse(20, 15, 40, 30); g.generateTexture('cloud2', 40, 30); g.clear();
    g.fillStyle(0x00ff00).fillCircle(10, 10, 10); g.generateTexture('bonus', 20, 20); g.clear();
    g.fillStyle(0x444444).fillCircle(40, 40, 40); g.generateTexture('boss1', 80, 80); g.clear();
    g.fillStyle(0xffffff).fillCircle(40, 40, 40); g.generateTexture('boss2', 80, 80); g.clear();
    g.fillStyle(0xffa500).fillTriangle(0, 50, 100, 50, 50, 0); g.generateTexture('boss3', 100, 50); g.clear();
    g.fillStyle(0x00ffff).fillRect(30, 0, 20, 80); g.fillRect(0, 30, 80, 20); g.generateTexture('boss4', 80, 80); g.clear();
    g.fillStyle(0xaaaaaa).fillRect(0, 20, 80, 40).fillStyle(0x555555).fillRect(30, 0, 20, 80); g.generateTexture('boss5', 80, 80);
}

function create() {
    this.cameras.main.setBackgroundColor('#4ea1d3');
    bgClouds = this.add.group();
    for(let i=0; i<10; i++) {
        let bc = this.add.sprite(Phaser.Math.Between(0, config.width), Phaser.Math.Between(0, config.height), 'cloud1');
        bc.setAlpha(0.15).setScale(2).setDepth(-1);
        bgClouds.add(bc);
    }
    player = this.physics.add.sprite(config.width/2, config.height-100, 'sun').setCollideWorldBounds(true);
    bullets = this.physics.add.group();
    clouds = this.physics.add.group();
    bonuses = this.physics.add.group();
    scoreText = this.add.text(20, 40, 'Очки: 0', { fontSize: '20px', fill: '#fff', fontWeight: 'bold' });
    levelText = this.add.text(20, 70, 'Уровень: 1', { fontSize: '18px', fill: '#ffff00' });
    livesText = this.add.text(20, 100, '❤️❤️❤️', { fontSize: '20px' });
    timerText = this.add.text(config.width - 80, 40, '20s', { fontSize: '24px', fill: '#fff' });

    this.input.once('pointerdown', () => { initAudio(); startLevelTimer.call(this); });
    this.spawnTimer = this.time.addEvent({ delay: 1000, callback: () => { if(!isBossActive && gameState !== "ending") spawnEnemy.call(this); }, loop: true });
    this.time.addEvent({ delay: 300, callback: fire, callbackScope: this, loop: true });

    this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
    this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
    this.physics.add.overlap(player, bonuses, collectBonus, null, this);
    this.input.on('pointermove', (p) => { if (p.isDown) { player.x = p.x; player.y = p.y - 20; } });
    bossBar = this.add.graphics().setDepth(100);
}

function startLevelTimer() {
    if (levelTimer) levelTimer.remove();
    levelTimeLeft = 20;
    levelTimer = this.time.addEvent({ delay: 1000, callback: () => {
        levelTimeLeft--; timerText.setText(levelTimeLeft + 's');
        if (levelTimeLeft <= 0) { levelTimer.remove(); prepareBoss.call(this); }
    }, loop: true });
}

function prepareBoss() {
    // clouds.clear(true, true); <-- Эту строку удалили, теперь тучки не исчезают
    isBossActive = true;
    timerText.setText("БОСС!");
    
    // Даем небольшую паузу (1 сек), чтобы игрок увидел надпись, прежде чем босс вылетит
    this.time.delayedCall(1000, () => {
        spawnBoss(this, 'boss' + level, 20 + (level * 20));
    });
}


function spawnBoss(scene, key, hp) {
    boss = scene.physics.add.sprite(config.width/2, -100, key);
    boss.maxHp = hp; boss.hp = hp;
    scene.tweens.add({ targets: boss, y: 150, duration: 2000, ease: 'Back.easeOut' });
    scene.physics.add.overlap(player, boss, () => onPlayerHit.call(scene, player, { destroy: () => {} }), null, scene);
    scene.physics.add.overlap(bullets, boss, (bObj, bullet) => {
        bullet.destroy(); bObj.hp--; playSound(120, 'sawtooth', 0.05);
        if (bObj.hp <= 0) {
            bObj.destroy(); isBossActive = false; score += 1000; scoreText.setText('Очки: ' + score);
            bossBar.clear(); if(lives < 5) lives++; livesText.setText('❤️'.repeat(lives)); playSound(600, 'sine', 0.4, 0.3);
            if (level < 5) { level++; levelText.setText('Уровень: ' + level); scene.cameras.main.setBackgroundColor(['#4ea1d3','#a2d2ff','#6a4c93','#1a1a2e','#0b0b0b'][level-1]); startLevelTimer.call(scene); }
            else { startEnding(scene); }
        }
    });
}

function fire() {
    if (gameState === "ending") return;
    playSound(450, 'square', 0.05, 0.02);
    if (weaponLevel === 1) { let b = bullets.create(player.x, player.y-20, 'bullet'); if (b) b.setVelocityY(-600); }
    else { [-200, 0, 200].forEach(vx => { let b = bullets.create(player.x, player.y-20, 'bullet'); if (b) { b.setVelocityY(-600); b.setVelocityX(vx); } }); }
}

function spawnEnemy() {
    let x = Phaser.Math.Between(40, config.width - 40);
    let c = clouds.create(x, -50, level >= 2 ? 'cloud2' : 'cloud1');
    c.hp = level >= 3 ? 2 : 1; c.setVelocityY(200 + (level * 25));
    this.spawnTimer.delay = Math.max(300, 1000 - (level * 120));
}

function collectBonus(p, b) { b.destroy(); weaponLevel = 2; playSound(800, 'triangle', 0.3); if (bonusTimer) bonusTimer.remove(); bonusTimer = this.time.delayedCall(7000, () => { weaponLevel = 1; bonusTimer = null; }); }

function hitEnemy(bullet, enemy) { bullet.destroy(); enemy.hp--; if (enemy.hp <= 0) { playSound(150, 'sine', 0.1, 0.2); if (Math.random() > 0.9) bonuses.create(enemy.x, enemy.y, 'bonus').setVelocityY(100); enemy.destroy(); score += 10; scoreText.setText('Очки: ' + score); } }

function onPlayerHit(p, c) { if (isInvulnerable || gameState === "ending") return; c.destroy(); lives--; livesText.setText('❤️'.repeat(lives)); playSound(100, 'sawtooth', 0.4, 0.3); tg.HapticFeedback.notificationOccurred('error'); if (lives <= 0) { tg.sendData(score.toString()); location.reload(); } else { isInvulnerable = true; this.tweens.add({ targets: player, alpha: 0.2, duration: 100, yoyo: true, repeat: 10, onComplete: () => { player.alpha = 1; isInvulnerable = false; } }); } }

function update() {
    bgClouds.children.iterate(c => { c.y += 0.8; if (c.y > config.height) { c.y = -100; c.x = Phaser.Math.Between(0, config.width); } });
    bullets.children.iterate(b => { if (b && b.y < -20) b.destroy(); });
    if (isBossActive && boss && boss.active) {
        bossBar.clear(); bossBar.fillStyle(0xff0000); bossBar.fillRect(config.width/2 - 50, 50, (boss.hp/boss.maxHp) * 100, 10);
        boss.x = (config.width/2) + Math.sin(this.time.now / 500) * (60 + level*15);
        boss.y = 150 + Math.cos(this.time.now / 800) * (40 + level*10);
    }
}

function startEnding(scene) {
    gameState = "ending"; timerText.setText(""); clouds.clear(true, true);
    scene.tweens.add({ targets: player, x: config.width / 2, y: config.height / 2, scale: 3, duration: 3000, ease: 'Cubic.easeInOut', onComplete: () => {
        scene.cameras.main.zoomTo(0.05, 6000);
        scene.time.delayedCall(6000, () => {
            scene.add.text(config.width/2, config.height/2 + 250, "😈", { fontSize: '120px' }).setOrigin(0.5).setScrollFactor(0);
            scene.add.text(config.width/2, config.height/2 + 400, "To be continued...", { fontSize: '30px', fill: '#f0f' }).setOrigin(0.5).setScrollFactor(0);
            scene.time.delayedCall(5000, () => tg.sendData(score.toString()));
        });
    }});
}
