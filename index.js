import express from 'express';
import qrcode from 'qrcode-terminal';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { create } = require('@wppconnect-team/wppconnect');

const app = express();
const PORT = 3000;

const messageQueue = [];
let isProcessing = false;
let isReady = false;
const MAX_BATCH = 25;
let sentInBatch = 0;

const templates = [
    'Привет 👋',
    'Здравствуйте!',
    'Добрый день 🌞',
    'Хай 🙌',
    'Приветствую ✨',
    'Доброго времени суток 👋'
];
const tmpProfile = `/tmp/chrome-profile-${Date.now()}`;
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
    console.log(`📥 В очередь добавлено ${chats.length} чатов`);
}

async function processQueue(client) {
    if (!isReady || isProcessing || messageQueue.length === 0) return;

    isProcessing = true;

    while (messageQueue.length > 0) {
        const { number, text } = messageQueue.shift();
        try {
            await client.sendText(`${number}@c.us`, text);
            console.log(`✅ Сообщение отправлено: ${number} | Текст: ${text}`);
            sentInBatch++;
        } catch (err) {
            console.error(`❌ Ошибка при отправке ${number}:`, err.message);
        }

        const shortDelay = Math.floor(Math.random() * 5000) + 3000;
        await new Promise(r => setTimeout(r, shortDelay));

        if (sentInBatch >= MAX_BATCH) {
            console.log(`⏸ Достигнут лимит ${MAX_BATCH}, пауза 17 минут...`);
            await new Promise(r => setTimeout(r, 17 * 60 * 1000));
            sentInBatch = 0;
        }
    }
    isProcessing = false;
}

// создаём клиента
create({
    session: 'main-session',
    headless: true,
    debug: true,
    autoClose: 0,
    puppeteerOptions: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            `--user-data-dir=${tmpProfile}` // это для дева походу
        ],
        executablePath: '/usr/bin/chromium'
    },
    catchQR: (base64Qr, asciiQR) => {
        console.log('Сканируй QR-код:');
        qrcode.generate(asciiQR, { small: true, quiet: 1  });
    }
}).then(async client => {
    console.log('🔑 Авторизация пройдена');
    isReady = true;

    const chats = await client.listChats();
    console.log('Всего чатов:', chats.length);

    // Роут рассылки
    app.get('/broadcast', async (req, res) => {
        const message = req.query.message || 'Как дела?';
        if (!isReady) return res.status(503).send('❌ Клиент ещё не готов');

        try {
            await client.waitForPageLoad()
            const chats = await client.getAllContacts();
            const privateChats = chats.filter(chat => !chat.isGroup);
            res.send(`📢 В очередь добавлено ${privateChats.length} чатов`);
            console.log(`📢 В очередь добавлено ${privateChats.length} чатов`, privateChats);

            enqueueMessage(privateChats, message);
            await processQueue(client);
        } catch (err) {
            console.error('Ошибка при получении чатов:', err);
            res.status(500).send('Ошибка при получении чатов');
        }
    });

    // Запуск сервера
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    });
});
