// server.js
const express = require('express');
const axios = require('axios');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Konfigurasi
const PTERODACTYL_CONFIG = {
  panelUrl: 'https://jeekage.kandigpanel.my.id',
  apiKey: 'ptla_rk7sKX4gm65RoYmGqucFvNkf7flCCUBwVLot7MOWoLE'
};

// WhatsApp Client
const whatsappClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

// QR Code untuk login WhatsApp
whatsappClient.on('qr', (qr) => {
  console.log('Scan QR Code ini dengan WhatsApp:');
  qrcode.generate(qr, { small: true });
});

whatsappClient.on('ready', () => {
  console.log('WhatsApp client ready!');
});

whatsappClient.on('authenticated', () => {
  console.log('WhatsApp authenticated!');
});

whatsappClient.initialize();

// Helper function untuk Pterodactyl API
async function pterodactylAPI(endpoint, method = 'GET') {
  try {
    const response = await axios({
      method,
      url: `${PTERODACTYL_CONFIG.panelUrl}/api/application/${endpoint}`,
      headers: {
        'Authorization': `Bearer ${PTERODACTYL_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'Application/vnd.pterodactyl.v1+json'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Pterodactyl API Error:', error.message);
    throw error;
  }
}

// Routes

// Monitoring Pterodactyl
app.get('/api/pterodactyl/servers', async (req, res) => {
  try {
    const data = await pterodactylAPI('servers');
    res.json({
      success: true,
      data: data.data.map(server => ({
        id: server.attributes.id,
        name: server.attributes.name,
        status: server.attributes.status,
        memory: server.attributes.limits.memory,
        disk: server.attributes.limits.disk,
        cpu: server.attributes.limits.cpu,
        node: server.attributes.node,
        sftp_details: server.attributes.sftp_details
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/pterodactyl/nodes', async (req, res) => {
  try {
    const data = await pterodactylAPI('nodes');
    res.json({ success: true, data: data.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/pterodactyl/users', async (req, res) => {
  try {
    const data = await pterodactylAPI('users');
    res.json({ success: true, data: data.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Monitoring WhatsApp
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    success: true,
    status: whatsappClient.info ? 'connected' : 'disconnected',
    user: whatsappClient.info
  });
});

app.get('/api/whatsapp/chats', async (req, res) => {
  try {
    const chats = await whatsappClient.getChats();
    res.json({
      success: true,
      data: chats.map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        isReadOnly: chat.isReadOnly,
        unreadCount: chat.unreadCount,
        timestamp: chat.timestamp
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Group Info by ID
app.get('/api/whatsapp/group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const chat = await whatsappClient.getChatById(`${groupId}@g.us`);
    
    const participants = await chat.participants;
    
    res.json({
      success: true,
      data: {
        id: chat.id._serialized,
        name: chat.name,
        description: chat.description,
        participants: participants.map(p => ({
          id: p.id._serialized,
          isAdmin: p.isAdmin,
          isSuperAdmin: p.isSuperAdmin
        })),
        participantCount: participants.length,
        createdAt: chat.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Channel Info by ID
app.get('/api/whatsapp/channel/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const chat = await whatsappClient.getChatById(`${channelId}@status.broadcast`);
    
    res.json({
      success: true,
      data: {
        id: chat.id._serialized,
        name: chat.name,
        isReadOnly: chat.isReadOnly,
        timestamp: chat.timestamp
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send Message (untuk testing)
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { number, message } = req.body;
    const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
    
    await whatsappClient.sendMessage(chatId, message);
    res.json({ success: true, message: 'Pesan terkirim' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Monitoring server running on port ${PORT}`);
});
