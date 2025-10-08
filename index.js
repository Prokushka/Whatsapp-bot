import express from 'express';
import qrcode from 'qrcode-terminal';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { create } = require('@wppconnect-team/wppconnect');

const app = express();
const PORT = 3000;

const messageQueue = [];
let isReady = false;
let sentInBatch = 0;
let cl = null;
let message = '';
const templates = [
    'Привет 👋',
    'Здравствуйте!',
    'Добрый день 🌞',
    'Хай 🙌',
    'Приветствую ✨',
    'Доброго времени суток 👋'
];

const tmpProfile = `/tmp/chrome-profile-${Date.now()}`;

// Добавляем случайное приветствие
function getRandomMessage(baseMessage) {
    const prefix = templates[Math.floor(Math.random() * templates.length)];
    return `${prefix}! ${baseMessage}`;
}
function enqueueMessage(chats, baseText) {
    chats.forEach(chat => {
        const number = chat.id.user; // у wppconnect id это объект {user, server}
        const text = getRandomMessage(baseText);
        messageQueue.push({ number, text });
    });
}

// Бесконечный воркер очереди
async function processQueue() {
    if (!isReady) return;
    let queue = Math.floor(Math.random() * 6000) + 13000;
    while (queue > 0) {
        queue--
        const { number, text } = messageQueue.shift();
        let num = `${number}@c.us`;
        try {
            await cl.sendText(num, text);
            sentInBatch++;
            console.log(`${sentInBatch}. Отправлено на ${number}`);
        } catch (err) {
            console.error(`❌ Ошибка при отправке ${number}:`, err.message);
        }

        // случайная пауза между сообщениями (3–8 сек)
        const shortDelay = Math.floor(Math.random() * 5000) + 4000;
        await new Promise(r => setTimeout(r, shortDelay));
    }
    await scheduleJob(cl)
}

// Ждём до утра, если ночь
function waitIfNight() {
    const now = new Date();
    const hour = now.getHours();

    if (hour >= 22 || hour < 8) {
        const target = new Date(now);
        if (hour >= 22) {
            target.setDate(target.getDate() + 1);
        }
        target.setHours(8, 0, 0, 0);

        const msToWait = target - now;
        console.log(`⏸ Ночной режим: ждём до 08:00 (${(msToWait / 1000 / 60).toFixed(0)} мин)`);

        return new Promise(resolve => setTimeout(resolve, msToWait));
    }
    console.log('Сейчас не ночное время! ')

    return Promise.resolve();
}

async function loadOldChats(){
        const contacts = await cl.getAllContacts();
    return contacts.filter(res => {
          if (
              res.id.user.length === 11 &&
              res.id.user[0] === '7'
          ){
              return true
          }
        })

}

// Подгрузка чатов
async function start() {

    const chats = await loadOldChats()
    console.log(`✅ Все чаты пройдены! Всего: ${chats.length}`);

    enqueueMessage(chats, message);

    await processQueue();
}

// Планировщик (каждые 17 минут)
function scheduleJob() {
    let rand = Math.floor(Math.random() * 5) * 20 * 60 * 1000
    console.log('Чаты пройдены, задержка 17 минут')
    setInterval(async () => {
        try {
            await waitIfNight();
            console.log('📥 Запуск сбора новых чатов...');
            await processQueue();
        } catch (err) {
            console.error('Ошибка планировщика:', err);
        }
    }, rand);
}

// Создание клиента
create({
    session: 'main-session',
    headless: true,
    debug: true,
    autoClose: 0,
    timeout: 120000,
    puppeteerOptions: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            `--user-data-dir=${tmpProfile}`
        ],
        executablePath: '/usr/bin/chromium'
    },
    catchQR: (base64Qr, asciiQR) => {
        console.log('Сканируй QR-код:');
        qrcode.generate(asciiQR, { small: true, quiet: 1 });
    }
}).then(async client => {
    console.log('Авторизация пройдена');
    isReady = true;
    cl = client;
    // Роут рассылки
    app.get('/broadcast', async (req, res) => {
        if (!isReady) return res.status(503).send('❌ Клиент ещё не готов');
        message = req.query.message ?? 'Приятного дня';
        res.status(200).send('📨 Запущена рассылка');
        await start(cl); // сразу добавляем чаты в очередь
    });

    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    });
});
