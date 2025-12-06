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
const BRAIN_PROMPT = `Analizas mensajes de WhatsApp para detectar transacciones.

CÓMO DETECTAR UN COMPROBANTE:
Si el contenido empieza con "[COMPROBANTE]" significa que HAY un comprobante de pago.
Si dice "[NO FINANCIERO]" o no tiene "[COMPROBANTE]", NO hay transacción.

REGLAS:
1. contactName = el valor de "Chat:" (NUNCA nombres del comprobante)
2. Si "MENSAJE ENVIADO POR EL USUARIO" + [COMPROBANTE] = type: "expense"
3. Si "MENSAJE RECIBIDO" + [COMPROBANTE] = type: "income"
4. Sin [COMPROBANTE] = hasFinancialContent: false

RESPONDE EN JSON:
{
  "hasFinancialContent": true/false,
  "confidence": 0.9,
  "transactions": [
    {
      "type": "income|expense",
      "amount": 1000,
      "currency": "MXN",
      "contactName": "valor de Chat:",
      "description": "transferencia",
      "category": "banco",
      "status": "completed"
    }
  ],
  "reminders": [],
  "contacts": [],
  "summary": "Resumen",
  "shouldNotify": false,
  "notificationMessage": null
}`;

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
        model: 'gpt-4o-mini',
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

      const imageAnalysisPrompt = `Eres un experto en detectar comprobantes de pago y transferencias bancarias.

ANALIZA ESTA IMAGEN CON MUCHO CUIDADO. Busca CUALQUIER indicio de que sea un comprobante:

TIPOS DE COMPROBANTES A DETECTAR:
1. SPEI/Transferencias bancarias (BBVA, Banorte, Santander, Banamex, HSBC, Scotiabank, Banco Azteca, etc.)
2. Screenshots de apps bancarias mostrando transferencias realizadas/recibidas
3. CoDi / Transferencias QR
4. Pagos en OXXO, 7-Eleven, depósitos en tiendas
5. Mercado Pago, PayPal, Kueski, Nu, Klar, Stori, Hey Banco
6. Recibos de Western Union, MoneyGram, Elektra
7. Comprobantes de crypto (Binance, Bitso, etc.)
8. Tickets/vouchers de cajero automático
9. Recibos de pago de servicios (luz, agua, gas, teléfono)
10. Cualquier imagen con: monto, fecha, referencia, folio, número de operación

SEÑALES DE UN COMPROBANTE (busca CUALQUIERA de estas):
- Palabras: "Transferencia", "Operación exitosa", "Comprobante", "Referencia", "Folio", "Monto", "Beneficiario", "Ordenante", "Cuenta destino", "CLABE", "Número de autorización", "Confirmación", "Pago realizado", "Depósito", "Enviaste", "Recibiste"
- Logos de bancos mexicanos
- Formato típico de recibo (fecha, hora, monto, referencia)
- Números de cuenta o CLABE (18 dígitos)
- Símbolos de pesos ($) o USD
- Códigos QR de pago
- Sellos de "Pagado" o "Exitoso"

SI ENCUENTRAS UN COMPROBANTE, responde EXACTAMENTE así:
[COMPROBANTE] Monto: $X, Banco/Plataforma: Y, Referencia: Z, Beneficiario: W

SI NO ES un comprobante financiero (fotos personales, memes, etc.), responde:
[NO FINANCIERO]

IMPORTANTE:
- Si hay CUALQUIER duda, asume que ES un comprobante y extrae la información
- Es mejor detectar de más que perder un comprobante real
- Los montos pueden estar en MXN, USD, USDT, etc.
${caption ? `\nCaption del mensaje: ${caption}` : ''}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',  // Usar modelo más potente para análisis de imágenes
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: imageAnalysisPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: 'high',  // Análisis de alta resolución
                },
              },
            ],
          },
        ],
        max_tokens: 1500,
      });

      const result = response.choices[0].message.content || '[Imagen no analizable]';
      console.log(`🖼️ Análisis de imagen: ${result.substring(0, 100)}...`);
      return result;
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
