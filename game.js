const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// === СОХРАНЕНИЕ ЛУЧШЕГО СЧЁТА ===
let bestScore = parseInt(localStorage.getItem('bestScore') || '0');
let leaderboard = JSON.parse(localStorage.getItem('leaderboard') || '[]');

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

function playBossWin() {
    [523, 659, 783].forEach((f, i) => setTimeout(() => playSound(f, 'triangle', 0.3, 0.1), i * 100));
}

function playFinalVictory() {
    [523, 659, 783, 1046].forEach((f, i) => setTimeout(() => playSound(f, 'square', 0.5, 0.1), i * 200));
}

function playEvilMelody() {
    [80, 75, 70, 60].forEach((f, i) => setTimeout(() => playSound(f, 'sawtooth', 1.2, 0.3), i * 600));
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
let player, bullets, clouds, bonuses, boss, bossBar, bgClouds, planetsGroup, galaxyStars;
let score = 0, level = 1, lives = 3, isInvulnerable = false;
let scoreText, levelText, livesText, timerText, isBossActive = false, weaponLevel = 1, gameState = "playing";
let exitButton, bestScoreText;

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
    g.fillStyle(0xffffff).fillCircle(5, 5, 5); g.generateTexture('dot', 10, 10);
}

function create() {
    this.cameras.main.setBackgroundColor('#4ea1d3');
    bgClouds = this.add.group();
    for(let i=0; i<15; i++) {
        let bc = this.add.sprite(Phaser.Math.Between(0, config.width), Phaser.Math.Between(0, config.height), 'cloud1').setAlpha(0.15).setScale(2).setDepth(-2);
        bgClouds.add(bc);
    }
    planetsGroup = this.add.group();
    galaxyStars = this.add.graphics().setDepth(-5).setAlpha(0);

    player = this.physics.add.sprite(config.width/2, config.height-100, 'sun').setCollideWorldBounds(true);
    bullets = this.physics.add.group(); clouds = this.physics.add.group(); bonuses = this.physics.add.group();

    scoreText = this.add.text(20, 40, 'Очки: 0', { fontSize: '20px', fill: '#fff', fontWeight: 'bold' });
    levelText = this.add.text(20, 70, 'Уровень: 1', { fontSize: '18px', fill: '#ffff00' });
    livesText = this.add.text(20, 100, '❤️❤️❤️', { fontSize: '20px' });
    timerText = this.add.text(config.width - 80, 40, '20s', { fontSize: '24px', fill: '#fff' });
    
    // === ЛУЧШИЙ СЧЁТ ===
    bestScoreText = this.add.text(config.width - 20, 70, '🏆: ' + bestScore, { fontSize: '16px', fill: '#ffd700', fontWeight: 'bold' }).setOrigin(1, 0);
    
    // === КНОПКА ВЫХОДА ===
    exitButton = this.add.text(config.width - 10, config.height - 30, '🚪 Выйти', { 
        fontSize: '18px', fill: '#fff', backgroundColor: '#ff4444', padding: { x: 10, y: 5 } 
    }).setOrigin(1, 1).setInteractive().setDepth(100);
    
    exitButton.on('pointerdown', () => {
        sendScoreAndClose();
    });
    
    this.input.once('pointerdown', () => { initAudio(); startLevelTimer.call(this); });
    this.spawnTimer = this.time.addEvent({ delay: 1000, callback: () => { if(!isBossActive && gameState === "playing") spawnEnemy.call(this); }, loop: true });
    this.time.addEvent({ delay: 300, callback: fire, callbackScope: this, loop: true });

    this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
    this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
    this.physics.add.overlap(player, bonuses, (p, b) => { b.destroy(); weaponLevel = 2; playSound(800, 'triangle', 0.3); if(this.bTimer) this.bTimer.remove(); this.bTimer = this.time.delayedCall(7000, () => weaponLevel = 1); }, null, this);
    this.input.on('pointermove', (p) => { if (p.isDown) { player.x = p.x; player.y = p.y - 20; } });
    bossBar = this.add.graphics().setDepth(100);
}

function startLevelTimer() {
    let timeLeft = 20;
    if(this.lTimer) this.lTimer.remove();
    this.lTimer = this.time.addEvent({ delay: 1000, callback: () => { timeLeft--; timerText.setText(timeLeft+'s'); if(timeLeft<=0){ this.lTimer.remove(); prepareBoss.call(this); } }, loop: true });
}

function prepareBoss() {
    isBossActive = true; timerText.setText("БОСС!");
    this.time.delayedCall(1000, () => {
        boss = this.physics.add.sprite(config.width/2, -100, 'boss'+level);
        boss.maxHp = 20+(level*20); boss.hp = boss.maxHp;
        this.tweens.add({ targets: boss, y: 150, duration: 2000, ease: 'Back.out' });
        this.physics.add.overlap(player, boss, () => onPlayerHit.call(this, player, {destroy:()=>{}}));
        this.physics.add.overlap(bullets, boss, (bObj, bullet) => {
            bullet.destroy(); bObj.hp--; playSound(120, 'sawtooth', 0.05);
            if (bObj.hp <= 0) {
                bObj.destroy(); isBossActive = false; score += 1000; scoreText.setText('Очки: '+score); bossBar.clear();
                if(lives<5) lives++; livesText.setText('❤️'.repeat(lives));
                if (level < 5) { playBossWin(); level++; levelText.setText('Уровень: '+level); this.cameras.main.setBackgroundColor(['#4ea1d3','#a2d2ff','#6a4c93','#1a1a2e','#0b0b0b'][level-1]); startLevelTimer.call(this); }
                else { startEnding(this); }  // === ОТПРАВКА БУДЕТ В startEnding ===
            }
        });
    });
}

function startEnding(scene) {
    gameState = "ending"; timerText.setText(""); scoreText.destroy(); levelText.destroy(); livesText.destroy();
    bgClouds.clear(true, true); clouds.clear(true, true);
    playFinalVictory();

    scene.tweens.add({
        targets: player, x: config.width/2, y: config.height/2, scale: 2, duration: 2000,
        onComplete: () => {
            for(let i=0; i<4; i++) {
                let p = scene.add.sprite(config.width/2, config.height/2, 'p'+i);
                planetsGroup.add(p);
                scene.tweens.add({ targets: p, x: config.width/2 + Math.cos(i)*60, y: config.height/2 + Math.sin(i)*60, duration: 1500 });
            }
            scene.time.delayedCall(3000, () => {
                scene.tweens.add({
                    targets: [player, ...planetsGroup.getChildren()],
                    scale: 0, alpha: 0, duration: 1000,
                    onComplete: () => {
                        let centerDot = scene.add.sprite(config.width/2, config.height/2, 'dot').setScale(0.5);
                        for(let i=0; i<150; i++) {
                            let angle = Math.random()*Math.PI*2; let d = 800;
                            let s = scene.add.sprite(config.width/2 + Math.cos(angle)*d, config.height/2 + Math.sin(angle)*d, 'dot').setScale(Math.random());
                            scene.tweens.add({ targets: s, x: config.width/2, y: config.height/2, alpha: 0, duration: 1500 + Math.random()*1500 });
                        }
                        scene.time.delayedCall(2000, () => {
                            scene.cameras.main.zoomTo(0.02, 6000);
                            galaxyStars.lineStyle(2, 0xffffff, 0.4);
                            for(let i=0; i<900; i++) {
                                let r=i*4; let a=i*0.09;
                                galaxyStars.strokeCircle(config.width/2 + Math.cos(a)*r, config.height/2 + Math.sin(a)*r, 1);
                            }
                            scene.tweens.add({ targets: galaxyStars, alpha: 1, duration: 4000 });

                            scene.time.delayedCall(6000, () => {
                                playEvilMelody();
                                // ЧЕРНАЯ ДЫРА: центрирована и огромна
                                let bh = scene.add.text(config.width*5, config.height/2, "🌑", { fontSize: '500px' }).setOrigin(0.5).setScrollFactor(0).setTint(0x220022).setDepth(100);
                                bh.setScale(10);
                                let eyes = scene.add.text(config.width*4.8, config.height/2, "👁️  👁️", { fontSize: '200px' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

                                scene.tweens.add({ targets: [bh, eyes], x: '-=3800', duration: 5000, ease: 'Power2' });

                                scene.time.delayedCall(5500, () => {
                                    // ТЕКСТ: зафиксирован на экране
                                    let fin = scene.add.text(config.width/2, config.height/2 + 200, "ПРОДОЛЖЕНИЕ СЛЕДУЕТ...", {
                                        fontSize: '40px', fill: '#f0f', fontWeight: 'bold', stroke: '#000', strokeThickness: 4
                                    }).setOrigin(0.5).setScrollFactor(0).setDepth(102);

                                    // === ОТПРАВКА СЧЁТА И ЗАКРЫТИЕ (с паузой 1 сек после окончания анимации) ===
                                    scene.time.delayedCall(6000, () => {
                                        sendScoreAndClose();
                                    });
                                });
                            });
                        });
                    }
                });
            });
        }
    });
}

function fire() { if(gameState==="ending") return; playSound(450,'square',0.05,0.02); if(weaponLevel===1){ let b=bullets.create(player.x,player.y-20,'bullet'); if(b) b.setVelocityY(-600); } else { [-200,0,200].forEach(vx=>{ let b=bullets.create(player.x,player.y-20,'bullet'); if(b){ b.setVelocityY(-600); b.setVelocityX(vx); }}); } }
function spawnEnemy() { let x=Phaser.Math.Between(40,config.width-40); let c=clouds.create(x,-50,level>=2?'cloud2':'cloud1'); c.hp=level>=3?2:1; c.setVelocityY(200+(level*25)); }
function hitEnemy(bullet, enemy) { bullet.destroy(); enemy.hp--; if(enemy.hp<=0){ playSound(150, 'sine', 0.1, 0.2); if(Math.random()>0.9) bonuses.create(enemy.x, enemy.y, 'bonus').setVelocityY(100); enemy.destroy(); score+=10; scoreText.setText('Очки: '+score); 
    // Обновляем лучший счёт
    if(score > bestScore) { bestScore = score; bestScoreText.setText('🏆: ' + bestScore); }
    // Лёгкая вибрация при попадании
    if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
} }
function onPlayerHit(p, c) { if(isInvulnerable||gameState==="ending") return; if(c.destroy) c.destroy(); lives--; livesText.setText('❤️'.repeat(lives)); playSound(100,'sawtooth',0.4,0.3); tg.HapticFeedback.notificationOccurred('error'); if(lives<=0){ sendScoreAndClose(); } else { isInvulnerable=true; this.tweens.add({ targets: player, alpha: 0.2, duration: 100, yoyo: true, repeat: 10, onComplete: () => { player.alpha = 1; isInvulnerable = false; } }); } }
function update() {
    bgClouds.children.iterate(c => { if(c){ c.y+=0.8; if(c.y>config.height){ c.y=-100; c.x=Phaser.Math.Between(0,config.width); }} });
    bullets.children.iterate(b => { if(b && b.y<-20) b.destroy(); });
    if (isBossActive && boss && boss.active) {
        bossBar.clear().fillStyle(0xff0000).fillRect(config.width/2-50, 50, (boss.hp/boss.maxHp)*100, 10);
        boss.x = (config.width/2) + Math.sin(this.time.now/500)*(60+level*15);
        boss.y = 150 + Math.cos(this.time.now/800)*(40+level*10);
    }
}

// === ФУНКЦИЯ ОТПРАВКИ СЧЁТА И ЗАКРЫТИЯ ===
function sendScoreAndClose() {
    // Сохраняем лучший счёт локально
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('bestScore', bestScore.toString());
    }
    
    // Отправляем счёт в Telegram
    if (tg.sendData) {
        tg.sendData(score.toString());
    }
    
    // Закрываем игру с небольшой задержкой
    setTimeout(() => {
        tg.close();
    }, 1000);
}

