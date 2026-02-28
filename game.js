// ... (начало кода со звуками и конфигом без изменений) ...

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

    // Динамический спавн тучек (частота растет с уровнем)
    this.spawnTimer = this.time.addEvent({ 
        delay: 1000, 
        callback: () => { if(!isBossActive && gameState !== "ending") spawnEnemy.call(this); }, 
        loop: true 
    });

    this.time.addEvent({ delay: 300, callback: fire, callbackScope: this, loop: true });

    this.physics.add.overlap(bullets, clouds, hitEnemy, null, this);
    this.physics.add.overlap(player, clouds, onPlayerHit, null, this);
    this.physics.add.overlap(player, bonuses, collectBonus, null, this);

    // УПРАВЛЕНИЕ: Солнышко чуть выше пальца (20px вместо 60px)
    this.input.on('pointermove', (p) => { 
        if (p.isDown) { player.x = p.x; player.y = p.y - 20; } 
    });
    bossBar = this.add.graphics().setDepth(100);
}

function spawnEnemy() {
    let x = Phaser.Math.Between(40, config.width - 40);
    let type = (level >= 2) ? 'cloud2' : 'cloud1';
    let c = clouds.create(x, -50, type);
    c.hp = (level >= 3) ? 2 : 1;
    c.setVelocityY(200 + (level * 25));
    
    // Ускоряем таймер спавна при росте уровня
    this.spawnTimer.delay = Math.max(300, 1000 - (level * 120));
}

function spawnBoss(scene, key, hp) {
    boss = scene.physics.add.sprite(config.width/2, -100, key);
    boss.maxHp = hp; boss.hp = hp;
    scene.tweens.add({ targets: boss, y: 150, duration: 2000, ease: 'Back.easeOut' });

    // КОЛЛИЗИЯ ИГРОКА С БОССОМ
    scene.physics.add.overlap(player, boss, () => {
        onPlayerHit.call(scene, player, { destroy: () => {} }); // Передаем фейковый объект облака
    }, null, scene);

    scene.physics.add.overlap(bullets, boss, (bObj, bullet) => {
        bullet.destroy(); bObj.hp--; playSound(120, 'sawtooth', 0.05);
        if (bObj.hp <= 0) {
            bObj.destroy(); isBossActive = false;
            score += 1000; scoreText.setText('Очки: ' + score);
            bossBar.clear();
            
            if(lives < 5) lives++; 
            livesText.setText('❤️'.repeat(lives));
            playSound(600, 'sine', 0.4, 0.3);

            if (level < 5) {
                level++;
                levelText.setText('Уровень: ' + level);
                const colors = ['#4ea1d3', '#a2d2ff', '#6a4c93', '#1a1a2e', '#0b0b0b'];
                scene.cameras.main.setBackgroundColor(colors[level-1]);
                startLevelTimer.call(scene);
            } else {
                startEnding(scene); // ФИНАЛ ПОСЛЕ 5 БОССА
            }
        }
    });
}

function update() {
    bgClouds.children.iterate(c => {
        c.y += 0.8;
        if (c.y > config.height) { c.y = -100; c.x = Phaser.Math.Between(0, config.width); }
    });

    bullets.children.iterate(b => { if (b && b.y < -20) b.destroy(); });
    
    if (isBossActive && boss && boss.active) {
        bossBar.clear(); bossBar.fillStyle(0xff0000);
        bossBar.fillRect(config.width/2 - 50, 50, (boss.hp/boss.maxHp) * 100, 10);
        
        // ДВИЖЕНИЕ БОССА ПО ГОРИЗОНТАЛИ И ВЕРТИКАЛИ (Восьмерка)
        boss.x = (config.width/2) + Math.sin(this.time.now / 500) * (60 + level*15);
        boss.y = 150 + Math.cos(this.time.now / 800) * (40 + level*10);
    }
}

function startEnding(scene) {
    gameState = "ending";
    levelText.setText("ВСЕЛЕННАЯ СПАСЕНА!");
    timerText.setText("");
    clouds.clear(true, true);
    
    scene.tweens.add({
        targets: player, x: config.width / 2, y: config.height / 2,
        scale: 3, duration: 3000, ease: 'Cubic.easeInOut',
        onComplete: () => {
            scene.cameras.main.zoomTo(0.05, 6000);
            scene.time.delayedCall(6000, () => {
                let villain = scene.add.text(config.width/2, config.height/2 + 250, "😈", { fontSize: '120px' }).setOrigin(0.5).setScrollFactor(0);
                villain.setAlpha(0);
                scene.tweens.add({ targets: villain, alpha: 1, duration: 2500 });
                scene.add.text(config.width/2, config.height/2 + 400, "To be continued...", { fontSize: '30px', fill: '#f0f', fontWeight: 'bold' }).setOrigin(0.5).setScrollFactor(0);
                
                scene.time.delayedCall(5000, () => {
                    if (window.Telegram && window.Telegram.WebApp) tg.sendData(score.toString());
                });
            });
        }
    });
}
// ... (остальные функции fire, hitEnemy, onPlayerHit без изменений) ...
