import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  downloadMediaMessage,
  getContentType,
  WAMessage,
  MessageUpsertType,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import QRCode from 'qrcode';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

const logger = pino({ level: 'silent' });

// Helper to add random delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min: number, max: number) => delay(min + Math.random() * (max - min));

// Configurar proxy si está definido
function getProxyAgent(useProxy: boolean = true) {
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl || !useProxy) {
    console.log('🌐 Conectando directamente (sin proxy)');
    return undefined;
  }

  console.log('🌐 Usando proxy:', proxyUrl.replace(/:[^:]+@/, ':***@'));

  if (proxyUrl.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrl);
  } else {
    return new HttpsProxyAgent(proxyUrl);
  }
}

export interface ProcessedMessage {
  id: string;
  chatId: string;
  chatName: string;
  sender: string;
  senderName: string;
  isFromMe: boolean;
  timestamp: Date;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'unknown';
  content: {
    text?: string;
    caption?: string;
    mediaBuffer?: Buffer;
    mimeType?: string;
    filename?: string;
  };
  quotedMessage?: {
    text?: string;
    sender?: string;
  };
  raw: WAMessage;
}

export class WhatsAppClient extends EventEmitter {
  private socket: WASocket | null = null;
  private authFolder: string;
  private qrCode: string | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private useProxy: boolean = false;  // Start with direct connection, proxy as fallback

  constructor(authFolder: string = './whatsapp-auth') {
    super();
    this.authFolder = authFolder;

    // Crear carpeta de autenticación si no existe
    if (!fs.existsSync(this.authFolder)) {
      fs.mkdirSync(this.authFolder, { recursive: true });
    }
  }

  async connect(): Promise<void> {
    try {
      // Add initial random delay to avoid detection
      if (this.reconnectAttempts > 0) {
        const delayMs = Math.min(30000, 5000 * Math.pow(1.5, this.reconnectAttempts - 1));
        console.log(`⏳ Esperando ${Math.round(delayMs / 1000)}s antes de reconectar...`);
        await randomDelay(delayMs, delayMs * 1.5);
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

      // Toggle proxy usage on consecutive failures
      // Start with direct connection, then try proxy as fallback
      if (this.reconnectAttempts >= 3 && !this.useProxy && process.env.PROXY_URL) {
        console.log('🔄 Conexión directa falló. Intentando con proxy...');
        this.useProxy = true;
      } else if (this.reconnectAttempts >= 6 && this.useProxy) {
        console.log('🔄 Proxy falló. Volviendo a conexión directa...');
        this.useProxy = false;
      }

      const agent = getProxyAgent(this.useProxy);

      // Use a legitimate WhatsApp Web browser fingerprint
      // Format: [platform, browser, version] - use real WhatsApp Web values
      const browserFingerprint: [string, string, string] = ['Ubuntu', 'Chrome', '124.0.6367.207'];

      this.socket = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        browser: browserFingerprint,
        connectTimeoutMs: 120000,
        defaultQueryTimeoutMs: 90000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 3000,
        agent,
        // Don't mark as online immediately to reduce detection
        markOnlineOnConnect: false,
        // Generate proper link preview
        generateHighQualityLinkPreview: false,
        // Sync full history on first connect
        syncFullHistory: false,
      });

      // Manejar actualización de credenciales
      this.socket.ev.on('creds.update', saveCreds);

      // Manejar estado de conexión
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          // Generar QR como imagen base64
          this.qrCode = await QRCode.toDataURL(qr);
          this.emit('qr', this.qrCode);
          console.log('📱 Escanea el código QR con WhatsApp');
        }

        if (connection === 'close') {
          this.isConnected = false;
          const error = lastDisconnect?.error as Boom;
          const statusCode = error?.output?.statusCode;
          const errorData = error?.data as { reason?: string } | undefined;

          // Check if we should reconnect
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          // Log detailed error info
          console.log('❌ Conexión cerrada:', error?.message || 'Unknown error');
          if (statusCode) {
            console.log(`   📊 Status: ${statusCode}, Reason: ${errorData?.reason || 'N/A'}`);
          }

          // Handle 405 specifically - usually means IP/fingerprint blocked
          if (statusCode === 405) {
            console.log('⚠️  Error 405: WhatsApp rechazó la conexión.');
            console.log('   Posibles causas: IP bloqueada, fingerprint detectado, o rate limiting.');
          }

          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const baseDelay = Math.min(60000, 10000 * Math.pow(1.3, this.reconnectAttempts - 1));
            const jitter = Math.random() * 5000;
            const reconnectDelay = baseDelay + jitter;

            console.log(`🔄 Reconectando... intento ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            console.log(`   ⏱️  Próximo intento en ${Math.round(reconnectDelay / 1000)}s`);

            setTimeout(() => this.connect(), reconnectDelay);
          } else if (!shouldReconnect) {
            console.log('🚪 Sesión cerrada. Necesitas escanear QR de nuevo.');
            // Clear auth folder to force new QR
            this.clearAuthState();
            this.emit('logout');
          } else {
            console.log('❌ Máximo de intentos de reconexión alcanzado.');
            console.log('💡 Sugerencias:');
            console.log('   1. Verifica que el proxy no esté bloqueado');
            console.log('   2. Intenta sin proxy (quita PROXY_URL)');
            console.log('   3. Espera unos minutos antes de reintentar');
            this.emit('max-retries-reached');
          }
        } else if (connection === 'open') {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.useProxy = !!process.env.PROXY_URL; // Reset to default
          this.qrCode = null;
          console.log('✅ Conectado a WhatsApp');
          console.log(`   🔗 Modo: ${this.useProxy ? 'via proxy' : 'conexión directa'}`);
          this.emit('connected');
        }
      });

      // Escuchar TODOS los mensajes (entrantes y salientes)
      this.socket.ev.on('messages.upsert', async (m) => {
        await this.handleMessages(m.messages, m.type);
      });

      // Escuchar actualizaciones de mensajes
      this.socket.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
          this.emit('message-update', update);
        }
      });

    } catch (error) {
      console.error('Error conectando a WhatsApp:', error);
      throw error;
    }
  }

  private async handleMessages(messages: WAMessage[], type: MessageUpsertType): Promise<void> {
    for (const msg of messages) {
      try {
        // Ignorar mensajes de status/broadcast
        if (msg.key.remoteJid === 'status@broadcast') continue;

        const processed = await this.processMessage(msg);
        if (processed) {
          this.emit('message', processed);

          // Log para debug
          const direction = processed.isFromMe ? '📤 ENVIADO' : '📥 RECIBIDO';
          console.log(`${direction} | ${processed.chatName} | ${processed.senderName}: ${processed.content.text?.slice(0, 50) || `[${processed.type}]`}`);
        }
      } catch (error) {
        console.error('Error procesando mensaje:', error);
      }
    }
  }

  private async processMessage(msg: WAMessage): Promise<ProcessedMessage | null> {
    try {
      const messageContent = msg.message;
      if (!messageContent) return null;

      const chatId = msg.key.remoteJid || '';
      const isFromMe = msg.key.fromMe || false;
      const sender = isFromMe
        ? this.socket?.user?.id || ''
        : msg.key.participant || msg.key.remoteJid || '';

      // Obtener nombre del chat/contacto
      let chatName = chatId;
      let senderName = sender;

      // Para grupos
      if (chatId.endsWith('@g.us')) {
        chatName = msg.pushName || chatId;
        senderName = msg.pushName || sender;
      } else {
        chatName = msg.pushName || chatId.replace('@s.whatsapp.net', '');
        senderName = msg.pushName || sender.replace('@s.whatsapp.net', '');
      }

      // Determinar tipo de mensaje
      const contentType = getContentType(messageContent);
      let type: ProcessedMessage['type'] = 'unknown';
      let content: ProcessedMessage['content'] = {};

      switch (contentType) {
        case 'conversation':
          type = 'text';
          content.text = messageContent.conversation || '';
          break;

        case 'extendedTextMessage':
          type = 'text';
          content.text = messageContent.extendedTextMessage?.text || '';
          break;

        case 'imageMessage':
          type = 'image';
          content.caption = messageContent.imageMessage?.caption || '';
          content.mimeType = messageContent.imageMessage?.mimetype || 'image/jpeg';
          // Descargar imagen
          try {
            content.mediaBuffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              { logger, reuploadRequest: this.socket!.updateMediaMessage }
            ) as Buffer;
          } catch (e) {
            console.error('Error descargando imagen:', e);
          }
          break;

        case 'audioMessage':
          type = 'audio';
          content.mimeType = messageContent.audioMessage?.mimetype || 'audio/ogg';
          try {
            content.mediaBuffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              { logger, reuploadRequest: this.socket!.updateMediaMessage }
            ) as Buffer;
          } catch (e) {
            console.error('Error descargando audio:', e);
          }
          break;

        case 'videoMessage':
          type = 'video';
          content.caption = messageContent.videoMessage?.caption || '';
          content.mimeType = messageContent.videoMessage?.mimetype || 'video/mp4';
          break;

        case 'documentMessage':
          type = 'document';
          content.filename = messageContent.documentMessage?.fileName || 'document';
          content.mimeType = messageContent.documentMessage?.mimetype || 'application/octet-stream';
          try {
            content.mediaBuffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              { logger, reuploadRequest: this.socket!.updateMediaMessage }
            ) as Buffer;
          } catch (e) {
            console.error('Error descargando documento:', e);
          }
          break;

        case 'stickerMessage':
          type = 'sticker';
          break;

        default:
          // Intentar extraer texto de otros tipos
          const anyContent = messageContent as any;
          if (anyContent?.text) {
            type = 'text';
            content.text = anyContent.text;
          }
          break;
      }

      // Mensaje citado/respondido
      let quotedMessage: ProcessedMessage['quotedMessage'];
      const contextInfo = (messageContent as any)[contentType || '']?.contextInfo;
      if (contextInfo?.quotedMessage) {
        const quotedType = getContentType(contextInfo.quotedMessage);
        quotedMessage = {
          text: contextInfo.quotedMessage?.conversation ||
                contextInfo.quotedMessage?.extendedTextMessage?.text ||
                `[${quotedType}]`,
          sender: contextInfo.participant,
        };
      }

      return {
        id: msg.key.id || '',
        chatId,
        chatName,
        sender,
        senderName,
        isFromMe,
        timestamp: new Date((msg.messageTimestamp as number) * 1000),
        type,
        content,
        quotedMessage,
        raw: msg,
      };
    } catch (error) {
      console.error('Error en processMessage:', error);
      return null;
    }
  }

  // Enviar mensaje de texto
  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.socket || !this.isConnected) {
      throw new Error('WhatsApp no está conectado');
    }

    await this.socket.sendMessage(chatId, { text });
  }

  // Obtener QR code actual
  getQRCode(): string | null {
    return this.qrCode;
  }

  // Verificar si está conectado
  isReady(): boolean {
    return this.isConnected;
  }

  // Obtener información del usuario conectado
  getUserInfo(): { id: string; name: string } | null {
    if (!this.socket?.user) return null;
    return {
      id: this.socket.user.id,
      name: this.socket.user.name || '',
    };
  }

  // Limpiar estado de autenticación
  private clearAuthState(): void {
    try {
      if (fs.existsSync(this.authFolder)) {
        const files = fs.readdirSync(this.authFolder);
        for (const file of files) {
          fs.unlinkSync(path.join(this.authFolder, file));
        }
        console.log('🗑️  Estado de autenticación limpiado');
      }
    } catch (error) {
      console.error('Error limpiando auth state:', error);
    }
  }

  // Desconectar
  async disconnect(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
      this.isConnected = false;
    }
  }

  // Forzar reconexión con nuevo estado
  async forceReconnect(): Promise<void> {
    console.log('🔄 Forzando reconexión limpia...');
    this.reconnectAttempts = 0;
    this.useProxy = !this.useProxy; // Toggle proxy mode
    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch (e) {
        // Ignore errors on forced close
      }
      this.socket = null;
    }
    await delay(2000);
    await this.connect();
  }
}

// Singleton para mantener una única conexión
let clientInstance: WhatsAppClient | null = null;

export function getWhatsAppClient(): WhatsAppClient {
  if (!clientInstance) {
    clientInstance = new WhatsAppClient('./whatsapp-auth');
  }
  return clientInstance;
}
