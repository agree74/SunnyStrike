const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

let audioCtx;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(f, t, d, v = 0.1) {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    try {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = t;
        o.frequency.setValueAtTime(f, audioCtx.currentTime);
        g.gain.setValueAtTime(v, audioCtx.currentTime);
        o.connect(g); g.connect(audioCtx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + d);
        o.stop(audioCtx.currentTime + d);
    } catch(e) {}
}

// Звуки без массивов (фикс ошибки SyntaxError)
function playBossWin() {
    setTimeout(function() { playSound(523, 'triangle', 0.3, 0.1) }, 0);
    setTimeout(function() { playSound(659, 'triangle', 0.3, 0.1) }, 150);
    setTimeout(function() { playSound(783, 'triangle', 0.3, 0.1) }, 300);
}

function playFinalVictory() {
    setTimeout(function() { playSound(523, 'square', 0.5, 0.1) }, 0);
    setTimeout(function() { playSound(659, 'square', 0.5, 0.1) }, 200);
    setTimeout(function() { playSound(783, 'square', 0.5, 0.1) }, 400);
    setTimeout(function() { playSound(1046, 'square', 0.6, 0.1) }, 600);
}

function playEvilMelody() {
    setTimeout(function() { playSound(80, 'sawtooth', 1.0, 0.2) }, 0);
    setTimeout(function() { playSound(70, 'sawtooth', 1.2, 0.2) }, 600);
    setTimeout(function() { playSound(60, 'sawtooth', 1.5, 0.2) }, 1200);
}

const config = {
    type: Phaser.AUTO,
    width: 400,
    height: 600,
    parent: 'game-container',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade' },
    scene: { preload: preload, create: create, update: update }
};

const game = new Phaser.Game(config);
let player, bullets, clouds, bonuses, boss, bossBar, bgClouds, planetsGroup, galaxyStars;
let score = 0, level = 1, lives = 3, isInvulnerable = false;
let scoreText, levelText, livesText, timerText, isBossActive = false, weaponLevel = 1, gameState = "playing";

function preload() {
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffff00).fillCircle(16, 16, 16); g.generateTexture('sun', 32, 32); g.clear();
    g.fillStyle(0xffffff).fillRect(0, 0, 4, 12); g.generateTexture('bullet', 4, 12); g.clear();
    g.fillStyle(0xeeeeee).fillEllipse(20, 15, 40, 30); g.generateTexture('cloud1', 40, 30); g.clear();
    g.fillStyle(0x888888).fillEllipse(20, 15, 40, 30); g.generateTexture('cloud2', 40, 30); g.clear();
    g.fillStyle(0x00ff00).fillCircle(10, 10, 10); g.generateTexture('bonus', 20, 20); g.clear();
    for(let i=1; i<=5; i++) { g.fillStyle(0x444444).fillCircle(40, 40, 40); g.generateTexture('boss'+i, 80, 80); g.clear(); }
    let pCols = [0xff4500, 0x1e90ff, 0x32cd32, 0xffd700];
    for(let i=0; i<4; i++) { g.fillStyle(pCols[i]).fillCircle(10, 10, 10); g.generateTexture('p'+i, 20, 20); g.clear(); }
    g.fillStyle(0xffffff).fillCircle(5, 5, 5); g.generateTexture('dot', 10, 10); g.clear();
    g.fillStyle(0x000000).fillCircle(100, 100, 95); g.lineStyle(8, 0x8a2be2).strokeCircle(100, 100, 100); g.generateTexture('blackhole', 200, 200);
}

function create() {
    this.cameras.main.setBackgroundColor('#4ea1d3');
    bgClouds = this.add.group();
    for(let i=0; i<10; i++) {
        let bc = this.add.sprite(Phaser.Math.Between(0, 400), Phaser.Math.Between(0, 600), 'cloud1').setAlpha(0.15).setScale(2).setDepth(-2);
        bgClouds.add(bc);
    }
    planetsGroup = this.add.group();
    galaxyStars = this.add.graphics().setDepth(-5).setAlpha(0);
    player = this.physics.add.sprite(200, 500, 'sun').setCollideWorldBounds(true).setDepth(5);
    bullets = this.physics.add.group(); clouds = this.physics.add.group(); bonuses = this.physics.add.group();

    scoreText = this.add.text(20, 40, 'Очки: 0', { fontSize: '20px', fill: '#fff', fontWeight: 'bold' });
    levelText = this.add.text(20, 70, 'Уровень: 1', { fontSize: '18px', fill: '#ffff00' });
    livesText = this.add.text(20, 100, '❤️❤️❤️', { fontSize: '20px' });
    timerText = this.add.text(320, 40, '20s', { fontSize: '24px', fill: '#fff' });

    for(let i=1; i<=5; i++) {
        this.add.text(360, 150+(i*40), 'B'+i, {background:'#333', padding:4}).setInteractive()
        .on('pointerdown', () => { level=i; prepareBoss.call(this); });
    }
    this.add.text(360, 400, 'WIN', {background:'#f00', padding:4}).setInteractive().on('pointerdown', () => startEnding(this));

    this.input.once('pointerdown', () => { initAudio(); startLevelTimer.call(this); });
    this.spawnTimer = this.time.addEvent({ delay: 1000, callback: () => { if(!isBossActive && gameState === "playing") spawnEnemy.call(this); }, loop: true });
    this.time.addEvent({ delay: 300, callback: fire, callbackScope: this, loop: true });

    this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
    this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
    this.physics.add.overlap(player, bonuses, (p, b) => { b.destroy(); weaponLevel = 2; playSound(800, 'triangle', 0.3); this.time.delayedCall(7000, () => weaponLevel = 1); }, null, this);
    this.input.on('pointermove', (p) => { if (p.isDown) { player.x = p.x; player.y = p.y - 20; } });
    bossBar = this.add.graphics().setDepth(100);
}

function startLevelTimer() {
    let tl = 20; if(this.lTimer) this.lTimer.remove();
    this.lTimer = this.time.addEvent({ delay: 1000, callback: () => { tl--; timerText.setText(tl+'s'); if(tl<=0){ this.lTimer.remove(); prepareBoss.call(this); } }, loop: true });
}

function prepareBoss() {
    isBossActive = true; timerText.setText("БОСС!");
    this.time.delayedCall(1000, () => {
        boss = this.physics.add.sprite(200, -100, 'boss'+level);
        boss.maxHp = 20+(level*20); boss.hp = boss.maxHp;
        this.tweens.add({ targets: boss, y: 150, duration: 2000, ease: 'Back.out' });
        this.physics.add.overlap(player, boss, () => onPlayerHit.call(this, player, {destroy:()=>{}}));
        this.physics.add.overlap(bullets, boss, (bObj, bullet) => {
            bullet.destroy(); bObj.hp--; playSound(120, 'sawtooth', 0.05);
            if (bObj.hp <= 0) {
                bObj.destroy(); isBossActive = false; score += 1000; scoreText.setText('Очки: '+score); bossBar.clear();
                if(lives<5) lives++; livesText.setText('❤️'.repeat(lives));
                if (level < 5) { playBossWin(); level++; levelText.setText('Уровень: '+level); this.cameras.main.setBackgroundColor(['#4ea1d3','#a2d2ff','#6a4c93','#1a1a2e','#0b0b0b'][level-1]); startLevelTimer.call(this); }
                else { if (tg.sendData) tg.sendData(score.toString()); startEnding(this); }
            }
        });
    });
}

function startEnding(scene) {
    gameState = "ending"; timerText.setText(""); scoreText.destroy(); levelText.destroy(); livesText.destroy();
    bgClouds.clear(true, true); clouds.clear(true, true);
    playFinalVictory();
    scene.tweens.add({
        targets: player, x: 200, y: 300, scale: 2.5, duration: 2000,
        onComplete: () => {
            for(let i=0; i<4; i++) {
                let p = scene.add.sprite(200, 300, 'p'+i);
                planetsGroup.add(p);
                scene.tweens.add({ targets: p, x: 200 + Math.cos(i)*80, y: 300 + Math.sin(i)*80, duration: 1500 });
            }
            scene.time.delayedCall(3000, () => {
                scene.cameras.main.setBackgroundColor('#000000');
                player.setAlpha(0); planetsGroup.clear(true, true);
                let dot = scene.add.sprite(200, 300, 'dot').setScale(0.5);
                for(let i=0; i<80; i++) {
                    let a = Math.random()*6.28; let d = 600;
                    let s = scene.add.sprite(200 + Math.cos(a)*d, 300 + Math.sin(a)*d, 'dot').setScale(Math.random());
                    scene.tweens.add({ targets: s, x: 200, y: 300, alpha: 0, duration: 1000 + Math.random()*1500 });
                }
                scene.time.delayedCall(2500, () => {
                    dot.destroy();
                    galaxyStars.clear().lineStyle(1, 0xffffff, 0.4).setAlpha(0);
                    for(let i=0; i<800; i++) {
                        let r = i*0.4; let a = i*0.1;
                        galaxyStars.strokeCircle(200 + Math.cos(a)*r, 300 + Math.sin(a)*r, 0.5);
                    }
                    scene.tweens.add({ targets: galaxyStars, alpha: 1, scale: 3.5, duration: 4000 });
                    scene.time.delayedCall(6000, () => {
                        playEvilMelody();
                        let bh = scene.add.sprite(700, 300, 'blackhole').setScale(4).setScrollFactor(0).setDepth(200);
                        let eyes = scene.add.text(700, 280, "👁️  👁️", { fontSize: '60px' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
                        scene.tweens.add({ targets: [bh, eyes], x: 250, duration: 4000, ease: 'Power2' });
                        scene.time.delayedCall(5000, () => {
                            scene.add.text(200, 450, "ПРОДОЛЖЕНИЕ СЛЕДУЕТ...", { fontSize: '24px', fill: '#f0f', fontWeight: 'bold' }).setOrigin(0.5).setScrollFactor(0);
                            scene.time.delayedCall(5000, () => { tg.close(); });
                        });
                    });
                });
            });
        }
    });
}

function fire() { if(gameState!=="playing") return; playSound(450,'square',0.05,0.02); if(weaponLevel===1){ let b=bullets.create(player.x,player.y-20,'bullet'); if(b) b.setVelocityY(-600); } else { [-200,0,200].forEach(vx=>{ let b=bullets.create(player.x,player.y-20,'bullet'); if(b){ b.setVelocityY(-600); b.setVelocityX(vx); }}); } }
function spawnEnemy() { let x=Phaser.Math.Between(40, 360); let c=clouds.create(x,-50,level>=2?'cloud2':'cloud1'); c.hp=level>=3?2:1; c.setVelocityY(200+(level*25)); }
function hitEnemy(bullet, enemy) { bullet.destroy(); enemy.hp--; if(enemy.hp<=0){ playSound(150, 'sine', 0.1, 0.2); if(Math.random()>0.9) bonuses.create(enemy.x, enemy.y, 'bonus').setVelocityY(100); enemy.destroy(); score += 10; scoreText.setText('Очки: '+score); } }
function onPlayerHit(p, c) { if(isInvulnerable||gameState==="ending") return; if(c && c.destroy) c.destroy(); lives--; livesText.setText('❤️'.repeat(lives)); playSound(100, 'sawtooth', 0.4, 0.3); tg.HapticFeedback.notificationOccurred('error'); if(lives<=0){ tg.sendData(score.toString()); location.reload(); } else { isInvulnerable=true; this.tweens.add({ targets: player, alpha: 0.2, duration: 100, yoyo: true, repeat: 10, onComplete: () => { player.alpha = 1; isInvulnerable = false; } }); } }
function update() {
    bgClouds.children.iterate(c => { if(c){ c.y+=0.8; if(c.y>600){ c.y=-100; c.x=Phaser.Math.Between(0,400); }} });
    bullets.children.iterate(b => { if(b && b.y<-20) b.destroy(); });
    if (isBossActive && boss && boss.active) {
        bossBar.clear().fillStyle(0xff0000).fillRect(150, 50, (boss.hp/boss.maxHp)*100, 10);
        boss.x = 200 + Math.sin(this.time.now/500)*(60+level*15);
        boss.y = 150 + Math.cos(this.time.now/800)*(40+level*10);
    }
}
