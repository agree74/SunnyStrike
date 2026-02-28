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

const game = new Phaser.Game(config);

let player, bullets, clouds, bonuses, boss, bossBar, bgClouds;
let score = 0, level = 1, lives = 3, isInvulnerable = false;
let scoreText, levelText, livesText, timerText;
let isBossActive = false, weaponLevel = 1, bonusTimer = null;
let levelTimer, levelTimeLeft = 20;

function preload() {
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffff00).fillCircle(16, 16, 16); g.generateTexture('sun', 32, 32); g.clear();
    g.fillStyle(0xffffff).fillRect(0, 0, 4, 12); g.generateTexture('bullet', 4, 12); g.clear();
    g.fillStyle(0xeeeeee).fillEllipse(20, 15, 40, 30); g.generateTexture('cloud1', 40, 30); g.clear();
    g.fillStyle(0x888888).fillEllipse(20, 15, 40, 30); g.generateTexture('cloud2', 40, 30); g.clear();
    g.fillStyle(0x00ff00).fillCircle(10, 10, 10); g.generateTexture('bonus', 20, 20); g.clear();
    // Текстуры боссов
    g.fillStyle(0x444444).fillCircle(40, 40, 40); g.generateTexture('boss1', 80, 80); g.clear();
    g.fillStyle(0xffffff).fillCircle(40, 40, 40); g.generateTexture('boss2', 80, 80); g.clear();
    g.fillStyle(0xffa500).fillTriangle(0, 50, 100, 50, 50, 0); g.generateTexture('boss3', 100, 50); g.clear();
    g.fillStyle(0x00ffff).fillRect(30, 0, 20, 80); g.fillRect(0, 30, 80, 20); g.generateTexture('boss4', 80, 80); g.clear();
    g.fillStyle(0xaaaaaa).fillRect(0, 20, 80, 40).fillStyle(0x555555).fillRect(30, 0, 20, 80); g.generateTexture('boss5', 80, 80);
}

function create() {
    this.cameras.main.setBackgroundColor('#4ea1d3');
    
    // НИЖНИЙ СЛОЙ (Параллакс фоновых облаков)
    bgClouds = this.add.group();
    for(let i=0; i<10; i++) {
        let bc = this.add.sprite(Phaser.Math.Between(0, config.width), Phaser.Math.Between(0, config.height), 'cloud1');
        bc.setAlpha(0.2).setScale(2).setDepth(-1);
        bgClouds.add(bc);
    }

    player = this.physics.add.sprite(config.width/2, config.height-100, 'sun').setCollideWorldBounds(true);
    bullets = this.physics.add.group();
    clouds = this.physics.add.group();
    bonuses = this.physics.add.group();

    scoreText = this.add.text(20, 40, 'Очки: 0', { fontSize: '20px', fill: '#fff', fontWeight: 'bold' });
    levelText = this.add.text(20, 70, 'Уровень: 1', { fontSize: '18px', fill: '#ffff00' });
    livesText = this.add.text(20, 100, '❤️❤️❤️', { fontSize: '20px' });
    timerText = this.add.text(config.width - 100, 40, '20s', { fontSize: '24px', fill: '#fff' });

    this.input.once('pointerdown', () => { initAudio(); startLevelTimer.call(this); });

    this.time.addEvent({ delay: 300, callback: fire, callbackScope: this, loop: true });
    this.time.addEvent({ delay: 1000, callback: () => { if(!isBossActive) spawnEnemy.call(this); }, loop: true });

    this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
    this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
    this.physics.add.overlap(player, bonuses, collectBonus, null, this);

    this.input.on('pointermove', (p) => { if (p.isDown) { player.x = p.x; player.y = p.y - 60; } });
    bossBar = this.add.graphics().setDepth(100);
}

function startLevelTimer() {
    if (levelTimer) levelTimer.remove();
    levelTimeLeft = 20;
    levelTimer = this.time.addEvent({
        delay: 1000,
        callback: () => {
            levelTimeLeft--;
            timerText.setText(levelTimeLeft + 's');
            if (levelTimeLeft <= 0) {
                levelTimer.remove();
                prepareBoss.call(this);
            }
        },
        loop: true
    });
}

function prepareBoss() {
    clouds.clear(true, true);
    isBossActive = true;
    timerText.setText("BOSS!");
    this.time.delayedCall(1000, () => {
        let bossKey = 'boss' + level;
        let bossHp = 20 + (level * 20);
        spawnBoss(this, bossKey, bossHp);
    });
}

function spawnBoss(scene, key, hp) {
    boss = scene.physics.add.sprite(config.width/2, -100, key);
    boss.maxHp = hp; boss.hp = hp;
    scene.tweens.add({ targets: boss, y: 150, duration: 2000, ease: 'Back.easeOut' });

    scene.physics.add.overlap(bullets, boss, (bObj, bullet) => {
        bullet.destroy(); bObj.hp--; playSound(120, 'sawtooth', 0.05);
        if (bObj.hp <= 0) {
            bObj.destroy(); isBossActive = false;
            score += 500; scoreText.setText('Очки: ' + score);
            bossBar.clear();
            
            // Награда за босса
            if(lives < 5) lives++; 
            livesText.setText('❤️'.repeat(lives));
            playSound(600, 'sine', 0.5, 0.3); // Звук победы

            if (level < 5) {
                level++;
                levelText.setText('Уровень: ' + level);
                updateEnvironment(scene);
                startLevelTimer.call(scene);
            } else {
                startEnding(scene);
            }
        }
    });
}

function updateEnvironment(scene) {
    const colors = ['#4ea1d3', '#a2d2ff', '#6a4c93', '#1a1a2e', '#000000'];
    scene.cameras.main.setBackgroundColor(colors[level-1]);
}

function fire() {
    if (isBossActive && !boss) return;
    playSound(450, 'square', 0.05, 0.02);
    if (weaponLevel === 1) {
        let b = bullets.create(player.x, player.y - 20, 'bullet');
        if (b) b.setVelocityY(-600);
    } else {
        [-200, 0, 200].forEach(vx => {
            let b = bullets.create(player.x, player.y - 20, 'bullet');
            if (b) { b.setVelocityY(-600); b.setVelocityX(vx); }
        });
    }
}

function collectBonus(p, b) {
    b.destroy();
    weaponLevel = 2;
    playSound(800, 'triangle', 0.3);
    
    // Если таймер уже запущен - сбрасываем и начинаем заново
    if (bonusTimer) bonusTimer.remove();
    bonusTimer = this.time.delayedCall(7000, () => { weaponLevel = 1; bonusTimer = null; });
}

function spawnEnemy() {
    let x = Phaser.Math.Between(40, config.width - 40);
    let type = (level >= 2) ? 'cloud2' : 'cloud1';
    let c = clouds.create(x, -50, type);
    c.hp = (level >= 3) ? 2 : 1;
    c.setVelocityY(200 + (level * 20));
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
    if (isInvulnerable) return;
    c.destroy(); lives--;
    livesText.setText('❤️'.repeat(lives));
    playSound(100, 'sawtooth', 0.4, 0.3);
    tg.HapticFeedback.notificationOccurred('error');
    if (lives <= 0) {
        if (window.Telegram && window.Telegram.WebApp) tg.sendData(score.toString());
        location.reload(); 
    } else {
        isInvulnerable = true;
        this.tweens.add({ targets: player, alpha: 0.2, duration: 100, yoyo: true, repeat: 10, onComplete: () => { player.alpha = 1; isInvulnerable = false; } });
    }
}

function update() {
    // Параллакс фона
    bgClouds.children.iterate(c => {
        c.y += 0.5;
        if (c.y > config.height) { c.y = -100; c.x = Phaser.Math.Between(0, config.width); }
    });

    bullets.children.iterate(b => { if (b && b.y < -20) b.destroy(); });
    
    if (isBossActive && boss && boss.active) {
        bossBar.clear(); bossBar.fillStyle(0xff0000);
        bossBar.fillRect(config.width/2 - 50, 50, (boss.hp/boss.maxHp) * 100, 10);
        
        // Логика поведения боссов (движение)
        boss.x = (config.width/2) + Math.sin(this.time.now/ (600 - level*50) ) * (50 + level*20);
        // На 4-5 уровне босс опускается чуть ниже
        if (level > 3) boss.y = 150 + Math.cos(this.time.now/1000) * 50;
    }
}

function startEnding(scene) {
    // (Код финала из предыдущей версии остается без изменений)
}
