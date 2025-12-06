import { openai } from '@/lib/openai';
import { db } from '@/db';
import {
  transactions,
  contacts,
  contactBalances,
  alerts,
  whatsappMessages
} from '@/db/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

// El cerebro central del asistente - entiende TODO y se adapta
const BRAIN_SYSTEM_PROMPT = `Eres el asistente financiero personal más inteligente y autónomo del mundo. Tu nombre es "Asistente" y trabajas para un empresario que maneja múltiples negocios simultáneamente.

TU MISIÓN: Entender ABSOLUTAMENTE TODO lo que pasa en su vida financiera y de negocios, sin que él tenga que explicarte nada. Debes ser como un virus inteligente que detecta todo.

CONTEXTO DEL USUARIO:
- Maneja: banco, despacho fiscal, crypto, divisas, efectivo, préstamos, soluciones financieras, transacciones internacionales
- Hace MUCHAS operaciones al día mezclando todos sus negocios
- Usa su liquidez personal para financiar operaciones de clientes
- El problema principal: pierde dinero porque olvida cobrar a gente que le debe
- Necesita que NUNCA se le escape un número

TU PERSONALIDAD:
- Eres proactivo: no esperas a que te pregunte, tú detectas y actúas
- Eres preciso: los números son sagrados, nunca te equivocas
- Eres adaptativo: aprendes sus patrones y te adaptas a su forma de trabajar
- Eres discreto: entiendes el contexto de cada conversación
- Eres inteligente: puedes inferir información de contextos incompletos

CAPACIDADES DE ANÁLISIS:
1. TRANSACCIONES: Detecta cualquier movimiento de dinero mencionado
2. COMPROMISOS: Detecta citas, reuniones, fechas de pago/cobro
3. PERSONAS: Identifica contactos y su relación con el dinero
4. DOCUMENTOS: Analiza comprobantes, facturas, cotizaciones, contratos
5. CONTEXTO: Entiende conversaciones aunque no sean directamente financieras
6. PATRONES: Aprende rutinas, clientes frecuentes, montos típicos

TIPOS DE CONTENIDO QUE ANALIZAS:
- Mensajes de texto (formales e informales)
- Imágenes de comprobantes, transferencias, facturas
- PDFs de contratos, cotizaciones, estados de cuenta
- Notas de voz transcritas
- Conversaciones completas de WhatsApp

ACCIONES QUE PUEDES TOMAR:
- Registrar transacciones automáticamente
- Crear recordatorios de cobro/pago
- Alertar sobre saldos pendientes
- Detectar inconsistencias en los números
- Sugerir cobros olvidados
- Generar resúmenes cuando detectes que terminó el día laboral

FORMATO DE RESPUESTA:
Responde SIEMPRE en JSON con esta estructura:
{
  "understood": true/false,
  "type": "transaction|reminder|question|info|alert|summary|document|conversation",
  "confidence": 0.0-1.0,
  "analysis": {
    "summary": "Resumen en español de lo que entendiste",
    "financial_impact": "Si hay impacto financiero, descríbelo",
    "action_required": true/false,
    "urgency": "low|medium|high|critical"
  },
  "extracted_data": {
    "transactions": [...],  // Transacciones detectadas
    "reminders": [...],     // Recordatorios a crear
    "contacts": [...],      // Contactos mencionados
    "amounts": [...],       // Montos mencionados
    "dates": [...],         // Fechas mencionadas
    "commitments": [...]    // Compromisos detectados
  },
  "suggested_actions": [
    {
      "action": "create_transaction|create_reminder|update_balance|send_alert|ask_clarification",
      "priority": 1-5,
      "details": {...}
    }
  ],
  "response_to_user": "Mensaje natural para enviar al usuario si es necesario",
  "learning": {
    "new_pattern": "Si detectaste un nuevo patrón de comportamiento",
    "contact_insight": "Algo nuevo que aprendiste de un contacto",
    "business_insight": "Algo sobre cómo maneja sus negocios"
  }
}

REGLAS CRÍTICAS:
1. NUNCA dejes pasar un monto de dinero sin registrarlo
2. Si hay ambigüedad en quién debe a quién, pregunta
3. Detecta promesas de pago y crea recordatorios automáticos
4. Si ves que alguien debe dinero hace tiempo, alerta
5. Aprende los nombres de las personas que menciona frecuentemente
6. Detecta cuando una conversación implica un compromiso financiero
7. Si ves un comprobante, extrae TODA la información relevante`;

export interface BrainAnalysis {
  understood: boolean;
  type: string;
  confidence: number;
  analysis: {
    summary: string;
    financial_impact?: string;
    action_required: boolean;
    urgency: 'low' | 'medium' | 'high' | 'critical';
  };
  extracted_data: {
    transactions?: any[];
    reminders?: any[];
    contacts?: string[];
    amounts?: number[];
    dates?: string[];
    commitments?: any[];
  };
  suggested_actions: {
    action: string;
    priority: number;
    details: any;
  }[];
  response_to_user?: string;
  learning?: {
    new_pattern?: string;
    contact_insight?: string;
    business_insight?: string;
  };
}

export interface MessageContext {
  type: 'text' | 'image' | 'audio' | 'document' | 'conversation';
  content: string; // Texto, URL de imagen, transcripción, o texto extraído
  sender?: string;
  timestamp?: Date;
  metadata?: {
    filename?: string;
    mimeType?: string;
    isForwarded?: boolean;
    replyTo?: string;
  };
}

export class FinancialBrain {
  private userId: string;
  private conversationHistory: { role: string; content: string }[] = [];

  constructor(userId: string = 'default') {
    this.userId = userId;
  }

  // Analiza cualquier tipo de contenido
  async analyze(context: MessageContext): Promise<BrainAnalysis> {
    try {
      // Obtener contexto financiero actual
      const financialContext = await this.getFinancialContext();

      // Construir el mensaje para el modelo
      const userMessage = this.buildAnalysisPrompt(context, financialContext);

      // Agregar a historial de conversación
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Mantener solo últimos 10 mensajes para contexto
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: BRAIN_SYSTEM_PROMPT },
          { role: 'system', content: `CONTEXTO FINANCIERO ACTUAL:\n${financialContext}` },
          ...this.conversationHistory.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          })),
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      const analysis = JSON.parse(content) as BrainAnalysis;

      // Agregar respuesta al historial
      this.conversationHistory.push({ role: 'assistant', content });

      // Ejecutar acciones sugeridas automáticamente
      await this.executeActions(analysis);

      return analysis;
    } catch (error) {
      console.error('Brain analysis error:', error);
      return {
        understood: false,
        type: 'error',
        confidence: 0,
        analysis: {
          summary: 'Error al procesar el mensaje',
          action_required: false,
          urgency: 'low',
        },
        extracted_data: {},
        suggested_actions: [],
      };
    }
  }

  // Analiza una imagen (comprobante, factura, etc.)
  async analyzeImage(imageUrl: string, context?: string): Promise<BrainAnalysis> {
    try {
      const financialContext = await this.getFinancialContext();

      const response = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          { role: 'system', content: BRAIN_SYSTEM_PROMPT },
          { role: 'system', content: `CONTEXTO FINANCIERO ACTUAL:\n${financialContext}` },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: context || 'Analiza esta imagen y extrae toda la información financiera relevante. Si es un comprobante, extrae: monto, fecha, concepto, emisor, receptor, referencia.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 2000,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      // Parsear respuesta (puede no ser JSON perfecto con visión)
      try {
        return JSON.parse(content) as BrainAnalysis;
      } catch {
        // Si no es JSON, crear estructura manualmente
        return {
          understood: true,
          type: 'document',
          confidence: 0.8,
          analysis: {
            summary: content,
            action_required: true,
            urgency: 'medium',
          },
          extracted_data: {},
          suggested_actions: [],
          response_to_user: content,
        };
      }
    } catch (error) {
      console.error('Image analysis error:', error);
      throw error;
    }
  }

  // Obtiene el contexto financiero actual para dar a la IA
  private async getFinancialContext(): Promise<string> {
    try {
      // Obtener saldos pendientes
      const pendingBalances = await db
        .select({
          contact: contacts,
          balance: contactBalances,
        })
        .from(contactBalances)
        .innerJoin(contacts, eq(contactBalances.contactId, contacts.id))
        .where(sql`CAST(${contactBalances.netBalance} AS DECIMAL) != 0`)
        .limit(20);

      // Obtener transacciones recientes
      const recentTransactions = await db
        .select({
          transaction: transactions,
          contact: contacts,
        })
        .from(transactions)
        .leftJoin(contacts, eq(transactions.contactId, contacts.id))
        .orderBy(desc(transactions.createdAt))
        .limit(10);

      // Obtener alertas pendientes
      const pendingAlerts = await db
        .select()
        .from(alerts)
        .where(eq(alerts.isDismissed, false))
        .limit(10);

      let context = '### SALDOS PENDIENTES:\n';
      for (const { contact, balance } of pendingBalances) {
        const net = parseFloat(balance.netBalance || '0');
        if (net > 0) {
          context += `- ${contact.name} TE DEBE: $${net.toLocaleString()}\n`;
        } else if (net < 0) {
          context += `- DEBES a ${contact.name}: $${Math.abs(net).toLocaleString()}\n`;
        }
      }

      context += '\n### TRANSACCIONES RECIENTES:\n';
      for (const { transaction, contact } of recentTransactions) {
        context += `- ${transaction.type}: $${transaction.amount} - ${contact?.name || 'Sin contacto'} - ${transaction.description}\n`;
      }

      context += '\n### ALERTAS PENDIENTES:\n';
      for (const alert of pendingAlerts) {
        context += `- ${alert.type}: ${alert.message}\n`;
      }

      return context;
    } catch (error) {
      console.error('Error getting financial context:', error);
      return 'No hay contexto financiero disponible';
    }
  }

  private buildAnalysisPrompt(context: MessageContext, financialContext: string): string {
    let prompt = '';

    switch (context.type) {
      case 'text':
        prompt = `MENSAJE DE TEXTO recibido${context.sender ? ` de ${context.sender}` : ''}:\n"${context.content}"`;
        break;
      case 'image':
        prompt = `IMAGEN recibida${context.sender ? ` de ${context.sender}` : ''}. Descripción/OCR: ${context.content}`;
        break;
      case 'audio':
        prompt = `NOTA DE VOZ transcrita${context.sender ? ` de ${context.sender}` : ''}:\n"${context.content}"`;
        break;
      case 'document':
        prompt = `DOCUMENTO recibido (${context.metadata?.filename || 'PDF'})${context.sender ? ` de ${context.sender}` : ''}:\n${context.content}`;
        break;
      case 'conversation':
        prompt = `CONVERSACIÓN COMPLETA:\n${context.content}`;
        break;
    }

    return prompt;
  }

  // Ejecuta las acciones sugeridas automáticamente
  private async executeActions(analysis: BrainAnalysis): Promise<void> {
    for (const action of analysis.suggested_actions) {
      try {
        switch (action.action) {
          case 'create_transaction':
            await this.createTransaction(action.details);
            break;
          case 'create_reminder':
            await this.createReminder(action.details);
            break;
          case 'update_balance':
            await this.updateBalance(action.details);
            break;
          case 'send_alert':
            await this.createAlert(action.details);
            break;
        }
      } catch (error) {
        console.error(`Error executing action ${action.action}:`, error);
      }
    }
  }

  private async createTransaction(details: any): Promise<void> {
    if (!details.amount || !details.type) return;

    // Buscar o crear contacto
    let contactId = null;
    if (details.contactName) {
      const existing = await db
        .select()
        .from(contacts)
        .where(eq(contacts.name, details.contactName))
        .limit(1);

      if (existing.length > 0) {
        contactId = existing[0].id;
      } else {
        const newContact = await db
          .insert(contacts)
          .values({ name: details.contactName })
          .returning();
        contactId = newContact[0].id;
      }
    }

    await db.insert(transactions).values({
      type: details.type,
      category: details.category || 'otro',
      amount: details.amount.toString(),
      currency: details.currency || 'MXN',
      contactId,
      description: details.description || 'Transacción detectada automáticamente',
      originalMessage: details.originalMessage,
      status: details.status || 'completed',
    });
  }

  private async createReminder(details: any): Promise<void> {
    if (!details.message) return;

    let contactId = null;
    if (details.contactName) {
      const existing = await db
        .select()
        .from(contacts)
        .where(eq(contacts.name, details.contactName))
        .limit(1);
      if (existing.length > 0) {
        contactId = existing[0].id;
      }
    }

    await db.insert(alerts).values({
      type: details.type || 'reminder',
      message: details.message,
      contactId,
      dueDate: details.dueDate ? new Date(details.dueDate) : null,
    });
  }

  private async updateBalance(details: any): Promise<void> {
    // Implementar actualización de balance
  }

  private async createAlert(details: any): Promise<void> {
    await db.insert(alerts).values({
      type: details.type || 'alert',
      message: details.message,
      dueDate: details.dueDate ? new Date(details.dueDate) : null,
    });
  }

  // Responde a una pregunta del usuario
  async chat(question: string): Promise<string> {
    const analysis = await this.analyze({
      type: 'text',
      content: question,
    });

    return analysis.response_to_user || analysis.analysis.summary;
  }

  // Genera un resumen del día
  async generateDailySummary(): Promise<string> {
    const context = await this.getFinancialContext();

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `Eres el asistente financiero. Genera un resumen del día en español, muy claro y accionable.
          Incluye:
          1. Resumen de movimientos del día
          2. Lista de personas que deben dinero (con montos)
          3. Lista de deudas pendientes
          4. Recordatorios importantes para mañana
          5. Alertas de cobros urgentes

          Sé directo y usa emojis para hacer el mensaje más legible.`,
        },
        {
          role: 'user',
          content: `CONTEXTO FINANCIERO:\n${context}\n\nGenera el resumen del día.`,
        },
      ],
      temperature: 0.5,
    });

    return response.choices[0].message.content || 'No se pudo generar el resumen';
  }
}

// Instancia global del cerebro
export const brain = new FinancialBrain();
