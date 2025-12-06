import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { getWhatsAppBrainBridge, AnalysisResult } from './whatsapp-brain-bridge';
import { ProcessedMessage } from './whatsapp-client';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';

// Importar schema (ajustar path según estructura)
import {
  transactions,
  contacts,
  contactBalances,
  alerts,
  whatsappMessages,
} from '../db/schema';

// Configuración
// Railway usa PORT, localmente usamos WHATSAPP_SERVICE_PORT
const PORT = process.env.PORT || process.env.WHATSAPP_SERVICE_PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  'https://*.vercel.app'
];

console.log(`🚀 Starting WhatsApp Service on port ${PORT}`);
console.log(`📡 Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL no configurada');
  process.exit(1);
}

// Conexión a base de datos
const sql = neon(DATABASE_URL) as NeonQueryFunction<boolean, boolean>;
const db = drizzle(sql);

// Express app para API y Socket.IO
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);

      // Check if origin matches any allowed pattern
      const isAllowed = ALLOWED_ORIGINS.some(allowed => {
        if (allowed.includes('*')) {
          const regex = new RegExp(allowed.replace('*', '.*'));
          return regex.test(origin);
        }
        return allowed === origin;
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        console.log(`🚫 Blocked origin: ${origin}`);
        callback(null, true); // Still allow for now, just log
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(express.json());

// CORS for Express
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Bridge de WhatsApp
const bridge = getWhatsAppBrainBridge();

// ============================================
// CALLBACKS PARA GUARDAR EN BASE DE DATOS
// ============================================

bridge.onTransaction = async (tx, message) => {
  try {
    // Buscar o crear contacto
    let contactId: number | null = null;

    if (tx.contactName) {
      const existing = await db
        .select()
        .from(contacts)
        .where(eq(contacts.name, tx.contactName))
        .limit(1);

      if (existing.length > 0) {
        contactId = existing[0].id;
      } else {
        const newContact = await db
          .insert(contacts)
          .values({
            name: tx.contactName,
            phone: message.sender.replace('@s.whatsapp.net', ''),
          })
          .returning();
        contactId = newContact[0].id;
        console.log(`   👤 Nuevo contacto creado: ${tx.contactName}`);
      }
    }

    // Crear transacción
    const newTx = await db
      .insert(transactions)
      .values({
        type: tx.type as any,
        category: tx.category as any,
        amount: tx.amount.toString(),
        currency: tx.currency as any || 'MXN',
        contactId,
        description: tx.description,
        originalMessage: message.content.text || message.content.caption || '',
        status: tx.status as any || 'completed',
      })
      .returning();

    console.log(`   ✅ Transacción guardada #${newTx[0].id}`);

    // Actualizar saldo si es préstamo
    if (contactId && ['loan_given', 'loan_received', 'loan_payment_received', 'loan_payment_made'].includes(tx.type)) {
      await updateContactBalance(contactId, tx.type, tx.amount, tx.currency || 'MXN');
    }

    // Emitir evento por Socket.IO
    io.emit('new-transaction', {
      transaction: newTx[0],
      contactName: tx.contactName,
      message: message.content.text,
    });

  } catch (error) {
    console.error('Error guardando transacción:', error);
  }
};

bridge.onReminder = async (reminder, message) => {
  try {
    // Buscar contacto si existe
    let contactId: number | null = null;

    if (reminder.contactName) {
      const existing = await db
        .select()
        .from(contacts)
        .where(eq(contacts.name, reminder.contactName))
        .limit(1);

      if (existing.length > 0) {
        contactId = existing[0].id;
      }
    }

    // Crear alerta/recordatorio
    const newAlert = await db
      .insert(alerts)
      .values({
        type: reminder.type || 'reminder',
        message: reminder.message,
        contactId,
        dueDate: reminder.dueDate ? new Date(reminder.dueDate) : null,
      })
      .returning();

    console.log(`   ⏰ Recordatorio guardado #${newAlert[0].id}`);

    // Emitir evento
    io.emit('new-reminder', {
      reminder: newAlert[0],
      contactName: reminder.contactName,
    });

  } catch (error) {
    console.error('Error guardando recordatorio:', error);
  }
};

bridge.onContact = async (contact) => {
  try {
    // Verificar si existe
    const existing = await db
      .select()
      .from(contacts)
      .where(eq(contacts.name, contact.name))
      .limit(1);

    if (existing.length === 0) {
      await db
        .insert(contacts)
        .values({
          name: contact.name,
          phone: contact.phone,
          company: contact.company,
        });
      console.log(`   👤 Nuevo contacto detectado: ${contact.name}`);
    }
  } catch (error) {
    console.error('Error guardando contacto:', error);
  }
};

bridge.onAnalysis = async (analysis: AnalysisResult, message: ProcessedMessage) => {
  // Guardar mensaje en historial
  try {
    await db
      .insert(whatsappMessages)
      .values({
        messageId: message.id,
        from: message.sender,
        body: message.content.text || message.content.caption || `[${message.type}]`,
        wasProcessed: analysis.hasFinancialContent,
        processingNotes: analysis.hasFinancialContent ? analysis.summary : null,
        receivedAt: message.timestamp,
        processedAt: new Date(),
      })
      .onConflictDoNothing();
  } catch (error) {
    // Ignorar errores de duplicados
  }

  // Emitir análisis por Socket.IO
  io.emit('message-analyzed', {
    chatId: message.chatId,
    chatName: message.chatName,
    isFromMe: message.isFromMe,
    hasFinancialContent: analysis.hasFinancialContent,
    summary: analysis.summary,
    timestamp: message.timestamp,
  });
};

// Función para actualizar saldos
async function updateContactBalance(
  contactId: number,
  type: string,
  amount: number,
  currency: string
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(contactBalances)
      .where(eq(contactBalances.contactId, contactId))
      .limit(1);

    let theyOweMe = parseFloat(existing[0]?.theyOweMe || '0');
    let iOweThem = parseFloat(existing[0]?.iOweThem || '0');

    switch (type) {
      case 'loan_given':
        theyOweMe += amount;
        break;
      case 'loan_received':
        iOweThem += amount;
        break;
      case 'loan_payment_received':
        theyOweMe = Math.max(0, theyOweMe - amount);
        break;
      case 'loan_payment_made':
        iOweThem = Math.max(0, iOweThem - amount);
        break;
    }

    const netBalance = theyOweMe - iOweThem;

    if (existing.length > 0) {
      await db
        .update(contactBalances)
        .set({
          theyOweMe: theyOweMe.toString(),
          iOweThem: iOweThem.toString(),
          netBalance: netBalance.toString(),
          lastTransactionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contactBalances.id, existing[0].id));
    } else {
      await db
        .insert(contactBalances)
        .values({
          contactId,
          currency: currency as any,
          theyOweMe: theyOweMe.toString(),
          iOweThem: iOweThem.toString(),
          netBalance: netBalance.toString(),
          lastTransactionAt: new Date(),
        });
    }

    console.log(`   💰 Saldo actualizado - Me deben: $${theyOweMe} | Debo: $${iOweThem}`);

  } catch (error) {
    console.error('Error actualizando saldo:', error);
  }
}

// ============================================
// API ENDPOINTS
// ============================================

// Estado de conexión
app.get('/api/status', (req, res) => {
  const status = bridge.getStatus();
  res.json({
    connected: status.connected,
    hasQR: !!status.qr,
  });
});

// Obtener QR
app.get('/api/qr', (req, res) => {
  const status = bridge.getStatus();
  if (status.qr) {
    res.json({ qr: status.qr });
  } else if (status.connected) {
    res.json({ connected: true, message: 'Ya está conectado' });
  } else {
    res.json({ waiting: true, message: 'Esperando QR...' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// SOCKET.IO EVENTS
// ============================================

io.on('connection', (socket) => {
  console.log('📱 Cliente conectado al dashboard');

  // Enviar estado actual
  const status = bridge.getStatus();
  socket.emit('status', {
    connected: status.connected,
    hasQR: !!status.qr,
    qr: status.qr,
  });

  socket.on('disconnect', () => {
    console.log('📱 Cliente desconectado');
  });
});

// ============================================
// INICIAR SERVICIO
// ============================================

async function start() {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     🤖 ASISTENTE FINANCIERO AUTÓNOMO      ║');
  console.log('║         WhatsApp Brain Service            ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');

  // Iniciar servidor HTTP
  httpServer.listen(PORT, () => {
    console.log(`🌐 Servidor corriendo en puerto ${PORT}`);
    console.log(`   API: http://localhost:${PORT}/api/status`);
    console.log(`   QR:  http://localhost:${PORT}/api/qr`);
    console.log('');
  });

  // Iniciar bridge de WhatsApp
  try {
    await bridge.start();
  } catch (error) {
    console.error('Error iniciando WhatsApp:', error);
  }
}

// Manejar cierre graceful
process.on('SIGINT', async () => {
  console.log('\n👋 Cerrando servicio...');
  httpServer.close();
  process.exit(0);
});

// Iniciar
start();
