// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand(); // Разворачиваем на весь экран

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#4ea1d3',
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);
let player;
let clouds;
let cursors;

function preload() {
    // В реальной игре здесь будут ссылки на твои картинки
    // Пока используем цветные примитивы
    this.load.image('sun', 'https://labs.phaser.io');
    this.load.image('cloud', 'https://labs.phaser.io');
}

function create() {
    // Создаем Солнышко
    player = this.physics.add.sprite(config.width / 2, config.height - 100, 'sun');
    player.setCollideWorldBounds(true);
    player.setScale(1.5);

    // Группа для облаков
    clouds = this.physics.add.group();

    // Спавн облаков каждые 800мс
    this.time.addEvent({
        delay: 800,
        callback: spawnCloud,
        callbackScope: this,
        loop: true
    });

    // Обработка касаний (движение за пальцем)
    this.input.on('pointermove', (pointer) => {
        if (pointer.isDown) {
            player.x = pointer.x;
            player.y = pointer.y - 50; // Немного выше пальца, чтобы было видно
        }
    });

    // Столкновение
    this.physics.add.overlap(player, clouds, hitCloud, null, this);
}

function spawnCloud() {
    let x = Phaser.Math.Between(50, config.width - 50);
    let cloud = clouds.create(x, -50, 'cloud');
    cloud.setVelocityY(200); // Скорость падения
}

function hitCloud(player, cloud) {
    cloud.destroy();
    // Вибрация телефона при столкновении (функция Telegram)
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
    console.log("Ой! Врезались в тучку.");
}

function update() {
    // Удаляем облака, которые улетели за экран
    clouds.children.iterate(child => {
        if (child && child.y > config.height) {
            child.destroy();
        }
    });
}

