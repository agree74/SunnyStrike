const tg = window.Telegram.WebApp;
tg.expand();

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
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
    // Создаем графику "на лету", чтобы не искать картинки
    let graphics = this.make.graphics({ x: 0, y: 0, add: false });
    
    // Рисуем Солнышко (желтый круг)
    graphics.fillStyle(0xffff00, 1);
    graphics.fillCircle(16, 16, 16);
    graphics.generateTexture('sun', 32, 32);
    graphics.clear();

    // Рисуем пулю (белый лучик)
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(0, 0, 4, 12);
    graphics.generateTexture('bullet', 4, 12);
    graphics.clear();

    // Рисуем Тучку (серый овал)
    graphics.fillStyle(0xcccccc, 1);
    graphics.fillEllipse(20, 15, 40, 30);
    graphics.generateTexture('cloud', 40, 30);
}

function create() {
    // Фон-градиент (имитация неба)
    this.cameras.main.setBackgroundColor('#4ea1d3');

    // Игрок
    player = this.physics.add.sprite(config.width / 2, config.height - 100, 'sun');
    player.setCollideWorldBounds(true);

    // Группы объектов
    bullets = this.physics.add.group();
    clouds = this.physics.add.group();

    // Автострельба каждые 300мс
    this.time.addEvent({
        delay: 300,
        callback: () => {
            let b = bullets.create(player.x, player.y - 20, 'bullet');
            b.setVelocityY(-400);
        },
        loop: true
    });

    // Спавн тучек
    this.time.addEvent({
        delay: 1000,
        callback: () => {
            let x = Phaser.Math.Between(30, config.width - 30);
            let c = clouds.create(x, -50, 'cloud');
            c.setVelocityY(150 + (score / 10)); // Сложность растет
        },
        loop: true
    });

    // Текст очков
    scoreText = this.add.text(20, 20, 'Очки: 0', { fontSize: '24px', fill: '#fff', fontFamily: 'Arial' });

    // Коллизии: Пуля + Тучка
    this.physics.add.overlap(bullets, clouds, (bullet, cloud) => {
        bullet.destroy();
        cloud.destroy();
        score += 10;
        scoreText.setText('Очки: ' + score);
    });

    // Коллизия: Игрок + Тучка
    this.physics.add.overlap(player, clouds, (p, c) => {
        tg.HapticFeedback.notificationOccurred('error');
        this.scene.restart(); // Рестарт при столкновении
        score = 0;
    });

    // Управление
    this.input.on('pointermove', (pointer) => {
        player.x = pointer.x;
        player.y = pointer.y - 60;
    });
}

function update() {
    // Очистка памяти: удаляем объекты за экраном
    bullets.children.iterate(b => { if (b && b.y < 0) b.destroy(); });
    clouds.children.iterate(c => { if (c && c.y > config.height) c.destroy(); });
}
