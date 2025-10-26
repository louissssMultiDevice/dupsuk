const express = require('express');
const axios = require('axios');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Konfigurasi Pterodactyl
const PTERODACTYL_CONFIG = {
  panelUrl: process.env.PTERODACTYL_PANEL_URL || 'https://jeekage.kandigpanel.my.id',
  apiKey: process.env.PTERODACTYL_API_KEY || 'ptlc_fJdXa9GGTH4c7zxIEQECXWV7iva7ng1OwMbrGFcx4GJ'
};

// WhatsApp Client
let whatsappClient;
let isWhatsAppReady = false;

function initializeWhatsApp() {
  try {
    whatsappClient = new Client({
      authStrategy: new LocalAuth({ clientId: "monitoring-client" }),
      puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    whatsappClient.on('qr', (qr) => {
      console.log('📱 Scan QR Code berikut dengan WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    whatsappClient.on('ready', () => {
      console.log('✅ WhatsApp client ready!');
      isWhatsAppReady = true;
    });

    whatsappClient.on('auth_failure', (error) => {
      console.error('❌ WhatsApp auth failed:', error);
      isWhatsAppReady = false;
    });

    whatsappClient.on('disconnected', (reason) => {
      console.log('❌ WhatsApp disconnected:', reason);
      isWhatsAppReady = false;
      // Reinitialize after 5 seconds
      setTimeout(() => {
        initializeWhatsApp();
      }, 5000);
    });

    whatsappClient.initialize();
  } catch (error) {
    console.error('Error initializing WhatsApp:', error);
  }
}

// Initialize WhatsApp
initializeWhatsApp();

// Helper function untuk Pterodactyl API dengan error handling
async function pterodactylAPI(endpoint, method = 'GET') {
  try {
    const url = endpoint.startsWith('http') 
      ? endpoint 
      : `${PTERODACTYL_CONFIG.panelUrl}/api/application/${endpoint.replace(/^\//, '')}`;
    
    console.log(`🔄 Calling Pterodactyl API: ${url}`);
    
    const response = await axios({
      method,
      url,
      headers: {
        'Authorization': `Bearer ${PTERODACTYL_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'Application/vnd.pterodactyl.v1+json'
      },
      timeout: 10000
    });
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ Pterodactyl API Error:', error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data?.errors?.[0]?.detail || error.message 
    };
  }
}

// Routes untuk Pterodactyl
app.get('/api/pterodactyl/servers', async (req, res) => {
  try {
    const result = await pterodactylAPI('servers?include=node');
    
    if (!result.success) {
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    const servers = result.data.data.map(server => ({
      id: server.attributes.id,
      uuid: server.attributes.uuid,
      name: server.attributes.name,
      status: server.attributes.status,
      memory: server.attributes.limits.memory,
      disk: server.attributes.limits.disk,
      cpu: server.attributes.limits.cpu,
      node: server.attributes.node,
      suspension_status: server.attributes.suspension_status,
      created_at: server.attributes.created_at
    }));

    res.json({ success: true, data: servers });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/pterodactyl/nodes', async (req, res) => {
  try {
    const result = await pterodactylAPI('nodes');
    
    if (!result.success) {
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    const nodes = result.data.data.map(node => ({
      id: node.attributes.id,
      name: node.attributes.name,
      location: node.attributes.location_id,
      memory: node.attributes.memory,
      disk: node.attributes.disk,
      maintenance: node.attributes.maintenance_mode,
      created_at: node.attributes.created_at
    }));

    res.json({ success: true, data: nodes });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/pterodactyl/users', async (req, res) => {
  try {
    const result = await pterodactylAPI('users');
    
    if (!result.success) {
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    const users = result.data.data.map(user => ({
      id: user.attributes.id,
      username: user.attributes.username,
      email: user.attributes.email,
      first_name: user.attributes.first_name,
      last_name: user.attributes.last_name,
      created_at: user.attributes.created_at
    }));

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Routes untuk WhatsApp
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    success: true,
    status: isWhatsAppReady ? 'connected' : 'disconnected',
    isReady: isWhatsAppReady,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/whatsapp/chats', async (req, res) => {
  try {
    if (!isWhatsAppReady || !whatsappClient) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp client not ready' 
      });
    }

    const chats = await whatsappClient.getChats();
    const formattedChats = chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      isReadOnly: chat.isReadOnly,
      unreadCount: chat.unreadCount,
      timestamp: chat.timestamp,
      lastMessage: chat.lastMessage?.body?.substring(0, 50) || 'No messages'
    }));

    res.json({ success: true, data: formattedChats });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/whatsapp/groups', async (req, res) => {
  try {
    if (!isWhatsAppReady || !whatsappClient) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp client not ready' 
      });
    }

    const chats = await whatsappClient.getChats();
    const groups = chats.filter(chat => chat.isGroup);
    
    const formattedGroups = await Promise.all(
      groups.map(async (group) => {
        try {
          const participants = group.participants || [];
          return {
            id: group.id._serialized,
            name: group.name,
            description: group.description || 'No description',
            participantCount: participants.length,
            createdAt: group.createdAt,
            isReadOnly: group.isReadOnly
          };
        } catch (error) {
          return {
            id: group.id._serialized,
            name: group.name,
            description: 'Error loading details',
            participantCount: 0,
            createdAt: group.timestamp,
            isReadOnly: group.isReadOnly
          };
        }
      })
    );

    res.json({ success: true, data: formattedGroups });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/whatsapp/group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    if (!isWhatsAppReady || !whatsappClient) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp client not ready' 
      });
    }

    // Format group ID properly
    const formattedGroupId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    
    const chat = await whatsappClient.getChatById(formattedGroupId);
    
    if (!chat.isGroup) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID provided is not a group' 
      });
    }

    const participants = chat.participants || [];
    
    const groupInfo = {
      id: chat.id._serialized,
      name: chat.name,
      description: chat.description || 'No description',
      participants: participants.map(p => ({
        id: p.id._serialized,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin
      })),
      participantCount: participants.length,
      createdAt: chat.createdAt,
      isReadOnly: chat.isReadOnly
    };

    res.json({ success: true, data: groupInfo });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Group not found or error loading group: ' + error.message 
    });
  }
});

// Test connection endpoint
app.get('/api/test/pterodactyl', async (req, res) => {
  try {
    const result = await pterodactylAPI('nodes');
    res.json({ 
      success: result.success, 
      message: result.success ? 'Pterodactyl connection successful' : result.error 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Monitoring server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔧 Pterodactyl URL: ${PTERODACTYL_CONFIG.panelUrl}`);
});
