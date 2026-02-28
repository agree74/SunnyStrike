// Инициализация после загрузки окна
window.onload = function() {
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();

    const config = {
        type: Phaser.AUTO,
        width: window.innerWidth,
        height: window.innerHeight,
        parent: document.body, // Явно указываем куда рисовать
        physics: {
            default: 'arcade',
            arcade: { debug: false }
        },
        scene: { preload, create, update }
    };

    const game = new Phaser.Game(config);

    let player, bullets, clouds;
    let score = 0;
    let scoreText;

    function preload() {
        let graphics = this.make.graphics({ x: 0, y: 0, add: false });
        
        // Солнышко
        graphics.fillStyle(0xffff00, 1);
        graphics.fillCircle(16, 16, 16);
        graphics.generateTexture('sun', 32, 32);
        graphics.clear();

        // Пуля
        graphics.fillStyle(0xffffff, 1);
        graphics.fillRect(0, 0, 4, 12);
        graphics.generateTexture('bullet', 4, 12);
        graphics.clear();

        // Тучка
        graphics.fillStyle(0xeeeeee, 1);
        graphics.fillEllipse(20, 15, 40, 30);
        graphics.generateTexture('cloud', 40, 30);
    }

    function create() {
        this.cameras.main.setBackgroundColor('#4ea1d3');

        player = this.physics.add.sprite(config.width / 2, config.height - 100, 'sun');
        player.setCollideWorldBounds(true);
        player.setDepth(10); // Чтобы солнце было поверх облаков

        bullets = this.physics.add.group();
        clouds = this.physics.add.group();

        // Стрельба
        this.time.addEvent({
            delay: 350,
            callback: () => {
                let b = bullets.create(player.x, player.y - 20, 'bullet');
                if(b) b.setVelocityY(-450);
            },
            loop: true
        });

        // Спавн врагов
        this.time.addEvent({
            delay: 1200,
            callback: () => {
                let x = Phaser.Math.Between(40, config.width - 40);
                let c = clouds.create(x, -50, 'cloud');
                if(c) c.setVelocityY(180 + (score / 20));
            },
            loop: true
        });

        scoreText = this.add.text(20, 40, 'Score: 0', { 
            fontSize: '24px', 
            fill: '#fff', 
            fontFamily: 'sans-serif',
            fontWeight: 'bold'
        }).setDepth(20);

        // Столкновения
        this.physics.add.overlap(bullets, clouds, (bullet, cloud) => {
            bullet.destroy();
            cloud.destroy();
            score += 10;
            scoreText.setText('Score: ' + score);
        });

        this.physics.add.overlap(player, clouds, () => {
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
            this.scene.restart();
            score = 0;
        });

        // Управление для тачскрина
        this.input.on('pointermove', (pointer) => {
            if (pointer.isDown || true) { // Движение работает всегда
                player.x = pointer.x;
                player.y = pointer.y - 60;
            }
        });
    }

    function update() {
        bullets.children.iterate(b => { if (b && b.y < -20) b.destroy(); });
        clouds.children.iterate(c => { if (c && c.y > config.height + 50) c.destroy(); });
    }
};
