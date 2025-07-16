// server.js
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode'); // Adicione esta linha
const app = express();
const port = 3000;

app.use(express.json());

let sock;
let qrCodeData = null; // Variável para armazenar os dados do QR Code

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    sock = makeWASocket({
        auth: state,
        // printQRInTerminal: true // Remova ou comente esta linha
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Se um QR code for gerado, salve-o
        if (qr) {
            qrCodeData = qr;
            console.log('QR Code gerado. Acesse /qrcode para escanear.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            // reconnect if not logged out
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('Você foi deslogado. Por favor, reinicie o serviço e escaneie o QR Code novamente.');
                qrCodeData = null; // Limpa o QR Code se deslogado
            }
        } else if (connection === 'open') {
            console.log('opened connection - Baileys está logado!');
            qrCodeData = null; // Limpa o QR Code uma vez conectado
        }
    });
}

// Endpoint para exibir o QR Code como imagem SVG
app.get('/qrcode', async (req, res) => {
    if (qrCodeData) {
        try {
            // Gera o QR Code em formato SVG
            const svg = await qrcode.toString(qrCodeData, { type: 'svg' });
            res.type('image/svg+xml');
            res.send(svg);
        } catch (err) {
            console.error('Erro ao gerar QR Code SVG:', err);
            res.status(500).send('Erro ao gerar QR Code.');
        }
    } else {
        if (sock && sock.user) {
            res.status(200).send('Baileys já está conectado. Nenhum QR Code necessário.');
        } else {
            res.status(503).send('QR Code não disponível no momento. Aguarde ou verifique os logs.');
        }
    }
});

// Endpoint para enviar mensagem
app.post('/send-message', async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        return res.status(400).json({ error: 'Número e mensagem são obrigatórios.' });
    }
    if (!sock || !sock.user) { // Verifica se está autenticado
        return res.status(503).json({ error: 'Serviço WhatsApp não conectado ou autenticado. Por favor, escaneie o QR Code.' });
    }
    try {
        await sock.sendMessage(to + '@s.whatsapp.net', { text: message });
        res.status(200).json({ success: true, message: 'Mensagem enviada!' });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: 'Falha ao enviar mensagem.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor Baileys rodando em http://localhost:${port}`);
    connectToWhatsApp();
});
