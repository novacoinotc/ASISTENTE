import { WhatsAppClient, ProcessedMessage, getWhatsAppClient } from './whatsapp-client';
import { getOpenAI } from '../lib/openai';

// Lazy OpenAI client
const openai = {
  get chat() { return getOpenAI().chat; },
  get audio() { return getOpenAI().audio; }
};

// Configuración
const CONFIG = {
  // Enviar confirmaciones automáticas por WhatsApp
  sendConfirmations: true,
  // Número del dueño (para enviar resúmenes)
  ownerNumber: process.env.OWNER_WHATSAPP_NUMBER,
  // Mínima confianza para registrar transacción automáticamente
  minConfidence: 0.7,
};

// El prompt del cerebro para analizar mensajes
const BRAIN_PROMPT = `Eres un asistente financiero autónomo que analiza mensajes de WhatsApp.
Tu trabajo es detectar CUALQUIER información financiera en los mensajes.

CONTEXTO: El usuario maneja múltiples negocios (banco, crypto, divisas, préstamos, despacho fiscal, etc.)

ANALIZA CADA MENSAJE Y DETECTA:
1. TRANSACCIONES: Cualquier mención de dinero, pagos, cobros, préstamos
2. COMPROMISOS: Fechas de pago, promesas, acuerdos
3. RECORDATORIOS: Cosas pendientes por hacer
4. INFORMACIÓN DE CONTACTOS: Datos de personas mencionadas

TIPOS DE TRANSACCIÓN:
- income: Dinero que entra
- expense: Dinero que sale
- loan_given: Préstamo que dio (le van a deber)
- loan_received: Préstamo que recibió (él debe)
- loan_payment_received: Le pagaron un préstamo
- loan_payment_made: Pagó un préstamo

RESPONDE EN JSON:
{
  "hasFinancialContent": true/false,
  "confidence": 0.0-1.0,
  "transactions": [
    {
      "type": "income|expense|loan_given|loan_received|loan_payment_received|loan_payment_made",
      "amount": 1000,
      "currency": "MXN|USD|EUR|USDT|BTC",
      "contactName": "nombre de la persona",
      "description": "descripción clara",
      "category": "banco|crypto|divisas|prestamos|despacho_fiscal|efectivo|otro",
      "status": "completed|pending"
    }
  ],
  "reminders": [
    {
      "type": "collection|payment|meeting|deadline",
      "message": "recordatorio",
      "contactName": "persona",
      "dueDate": "2024-01-20 o null",
      "amount": 1000
    }
  ],
  "contacts": [
    {
      "name": "nombre",
      "phone": "si se menciona",
      "company": "si se menciona"
    }
  ],
  "summary": "Resumen breve de lo relevante del mensaje",
  "shouldNotify": true/false,
  "notificationMessage": "mensaje para enviar si aplica"
}

IMPORTANTE:
- Si es un mensaje casual sin contenido financiero, hasFinancialContent = false
- Detecta montos en cualquier formato: "50mil", "50k", "$50,000", "50000"
- El contexto de la conversación importa (quién envía, a quién)
- Si hay imagen/documento, analiza lo que se describe`;

export interface AnalysisResult {
  hasFinancialContent: boolean;
  confidence: number;
  transactions: Array<{
    type: string;
    amount: number;
    currency: string;
    contactName?: string;
    description: string;
    category: string;
    status: string;
  }>;
  reminders: Array<{
    type: string;
    message: string;
    contactName?: string;
    dueDate?: string;
    amount?: number;
  }>;
  contacts: Array<{
    name: string;
    phone?: string;
    company?: string;
  }>;
  summary: string;
  shouldNotify: boolean;
  notificationMessage?: string;
}

export class WhatsAppBrainBridge {
  private client: WhatsAppClient;
  private messageBuffer: Map<string, ProcessedMessage[]> = new Map();
  private conversationContext: Map<string, string[]> = new Map();

  // Callbacks para integración
  public onTransaction?: (transaction: any, message: ProcessedMessage) => Promise<void>;
  public onReminder?: (reminder: any, message: ProcessedMessage) => Promise<void>;
  public onContact?: (contact: any) => Promise<void>;
  public onAnalysis?: (analysis: AnalysisResult, message: ProcessedMessage) => Promise<void>;

  constructor() {
    this.client = getWhatsAppClient();
    this.setupListeners();
  }

  private setupListeners(): void {
    // Escuchar todos los mensajes
    this.client.on('message', async (message: ProcessedMessage) => {
      await this.processMessage(message);
    });

    // Escuchar conexión
    this.client.on('connected', () => {
      console.log('🧠 Bridge conectado - Analizando todos los mensajes...');
    });

    // Escuchar QR
    this.client.on('qr', (qr: string) => {
      console.log('📱 QR disponible para escanear');
    });
  }

  async start(): Promise<void> {
    console.log('🚀 Iniciando WhatsApp Brain Bridge...');
    await this.client.connect();
  }

  private async processMessage(message: ProcessedMessage): Promise<void> {
    try {
      // Agregar al contexto de conversación
      this.addToConversationContext(message);

      // Preparar contenido para análisis
      let contentToAnalyze = '';

      switch (message.type) {
        case 'text':
          contentToAnalyze = message.content.text || '';
          break;

        case 'image':
          // Analizar imagen con Vision
          if (message.content.mediaBuffer) {
            contentToAnalyze = await this.analyzeImage(
              message.content.mediaBuffer,
              message.content.mimeType || 'image/jpeg',
              message.content.caption
            );
          } else {
            contentToAnalyze = `[Imagen] ${message.content.caption || ''}`;
          }
          break;

        case 'audio':
          // Transcribir audio
          if (message.content.mediaBuffer) {
            contentToAnalyze = await this.transcribeAudio(
              message.content.mediaBuffer,
              message.content.mimeType || 'audio/ogg'
            );
          }
          break;

        case 'document':
          // Analizar documento
          contentToAnalyze = `[Documento: ${message.content.filename}]`;
          // TODO: Procesar PDF si es necesario
          break;

        default:
          return; // Ignorar otros tipos
      }

      if (!contentToAnalyze.trim()) return;

      // Obtener contexto de la conversación
      const context = this.getConversationContext(message.chatId);

      // Analizar con IA
      const analysis = await this.analyzeWithAI(
        contentToAnalyze,
        message,
        context
      );

      // Procesar resultados
      await this.handleAnalysisResults(analysis, message);

    } catch (error) {
      console.error('Error procesando mensaje:', error);
    }
  }

  private async analyzeWithAI(
    content: string,
    message: ProcessedMessage,
    context: string[]
  ): Promise<AnalysisResult> {
    try {
      const contextText = context.length > 0
        ? `\nCONTEXTO DE CONVERSACIÓN RECIENTE:\n${context.join('\n')}`
        : '';

      const prompt = `${message.isFromMe ? 'MENSAJE ENVIADO POR EL USUARIO' : 'MENSAJE RECIBIDO'}
De: ${message.senderName}
Chat: ${message.chatName}
Fecha: ${message.timestamp.toISOString()}

CONTENIDO:
${content}
${contextText}

Analiza este mensaje y extrae información financiera.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: BRAIN_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      return {
        hasFinancialContent: result.hasFinancialContent || false,
        confidence: result.confidence || 0,
        transactions: result.transactions || [],
        reminders: result.reminders || [],
        contacts: result.contacts || [],
        summary: result.summary || '',
        shouldNotify: result.shouldNotify || false,
        notificationMessage: result.notificationMessage,
      };
    } catch (error) {
      console.error('Error en análisis IA:', error);
      return {
        hasFinancialContent: false,
        confidence: 0,
        transactions: [],
        reminders: [],
        contacts: [],
        summary: '',
        shouldNotify: false,
      };
    }
  }

  private async analyzeImage(
    buffer: Buffer,
    mimeType: string,
    caption?: string
  ): Promise<string> {
    try {
      const base64 = buffer.toString('base64');

      const response = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analiza esta imagen y extrae TODA la información financiera visible.
Si es un comprobante: monto, fecha, referencia, banco, concepto.
Si es una factura: total, conceptos, RFC.
Si es un documento: información relevante.
${caption ? `Caption: ${caption}` : ''}

Describe todo lo que ves de forma estructurada.`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      });

      return response.choices[0].message.content || '[Imagen no analizable]';
    } catch (error) {
      console.error('Error analizando imagen:', error);
      return `[Imagen] ${caption || ''}`;
    }
  }

  private async transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      // Crear un archivo temporal para Whisper (convertir Buffer a Uint8Array)
      const uint8Array = new Uint8Array(buffer);
      const audioFile = new File([uint8Array], 'audio.ogg', { type: mimeType });

      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'es',
      });

      return `[Audio transcrito]: ${response.text}`;
    } catch (error) {
      console.error('Error transcribiendo audio:', error);
      return '[Audio no transcrito]';
    }
  }

  private async handleAnalysisResults(
    analysis: AnalysisResult,
    message: ProcessedMessage
  ): Promise<void> {
    // Llamar callback de análisis
    if (this.onAnalysis) {
      await this.onAnalysis(analysis, message);
    }

    if (!analysis.hasFinancialContent) return;

    console.log(`\n💰 CONTENIDO FINANCIERO DETECTADO:`);
    console.log(`   Chat: ${message.chatName}`);
    console.log(`   Resumen: ${analysis.summary}`);

    // Procesar transacciones
    for (const tx of analysis.transactions) {
      console.log(`   📝 Transacción: ${tx.type} - $${tx.amount} ${tx.currency} - ${tx.contactName || 'Sin contacto'}`);

      if (this.onTransaction && analysis.confidence >= CONFIG.minConfidence) {
        await this.onTransaction(tx, message);
      }
    }

    // Procesar recordatorios
    for (const reminder of analysis.reminders) {
      console.log(`   ⏰ Recordatorio: ${reminder.message}`);

      if (this.onReminder) {
        await this.onReminder(reminder, message);
      }
    }

    // Procesar contactos
    for (const contact of analysis.contacts) {
      if (this.onContact) {
        await this.onContact(contact);
      }
    }

    // Enviar notificación si corresponde
    if (analysis.shouldNotify && analysis.notificationMessage && CONFIG.sendConfirmations) {
      // Solo notificar en el chat del dueño, no en todos los chats
      if (CONFIG.ownerNumber && message.chatId.includes(CONFIG.ownerNumber)) {
        await this.sendNotification(message.chatId, analysis.notificationMessage);
      }
    }
  }

  private async sendNotification(chatId: string, message: string): Promise<void> {
    try {
      await this.client.sendMessage(chatId, message);
    } catch (error) {
      console.error('Error enviando notificación:', error);
    }
  }

  private addToConversationContext(message: ProcessedMessage): void {
    const context = this.conversationContext.get(message.chatId) || [];
    const text = message.content.text || message.content.caption || `[${message.type}]`;

    context.push(`[${message.isFromMe ? 'Yo' : message.senderName}]: ${text}`);

    // Mantener solo últimos 10 mensajes por chat
    if (context.length > 10) {
      context.shift();
    }

    this.conversationContext.set(message.chatId, context);
  }

  private getConversationContext(chatId: string): string[] {
    return this.conversationContext.get(chatId) || [];
  }

  // Enviar resumen diario
  async sendDailySummary(summary: string): Promise<void> {
    if (CONFIG.ownerNumber) {
      const chatId = CONFIG.ownerNumber.includes('@')
        ? CONFIG.ownerNumber
        : `${CONFIG.ownerNumber}@s.whatsapp.net`;

      await this.client.sendMessage(chatId, summary);
    }
  }

  // Obtener estado
  getStatus(): { connected: boolean; qr: string | null } {
    return {
      connected: this.client.isReady(),
      qr: this.client.getQRCode(),
    };
  }
}

// Singleton
let bridgeInstance: WhatsAppBrainBridge | null = null;

export function getWhatsAppBrainBridge(): WhatsAppBrainBridge {
  if (!bridgeInstance) {
    bridgeInstance = new WhatsAppBrainBridge();
  }
  return bridgeInstance;
}
