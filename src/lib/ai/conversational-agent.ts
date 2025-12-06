import OpenAI from 'openai';
import { db } from '@/db';
import { contacts, transactions, contactBalances, alerts } from '@/db/schema';
import { eq, desc, sql, and, like, gte, lte } from 'drizzle-orm';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export class ConversationalAgent {
  private conversationHistory: ConversationMessage[] = [];

  // Procesa un mensaje del usuario y genera una respuesta
  async chat(message: string): Promise<string> {
    try {
      // Detectar la intención del mensaje
      const intent = await this.detectIntent(message);

      // Obtener datos relevantes basados en la intención
      const contextData = await this.getRelevantData(intent, message);

      // Agregar mensaje al historial
      this.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
      });

      // Mantener solo últimos 10 mensajes
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Generar respuesta
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `Eres el asistente financiero personal. Respondes preguntas sobre las finanzas del usuario de forma clara, concisa y útil.

REGLAS:
1. Sé directo y conciso
2. Usa números exactos cuando los tengas
3. Si no tienes información, dilo claramente
4. Sugiere acciones cuando sea apropiado
5. Usa formato WhatsApp (negritas con *, listas con -)
6. Los montos siempre en formato legible ($1,000.00)

DATOS DISPONIBLES:
${JSON.stringify(contextData, null, 2)}`,
          },
          ...this.conversationHistory.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
        temperature: 0.5,
        max_tokens: 1000,
      });

      const reply = response.choices[0].message.content || 'No pude procesar tu consulta.';

      // Agregar respuesta al historial
      this.conversationHistory.push({
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      });

      return reply;
    } catch (error) {
      console.error('Conversational agent error:', error);
      return 'Hubo un error procesando tu consulta. Por favor intenta de nuevo.';
    }
  }

  // Detecta la intención del mensaje
  private async detectIntent(message: string): Promise<{
    type: string;
    entities: any;
  }> {
    const msg = message.toLowerCase();

    // Patrones comunes
    if (msg.includes('cuánto') && msg.includes('debe')) {
      const nameMatch = message.match(/(?:me\s+)?debe\s+(\w+)/i);
      return {
        type: 'query_debt',
        entities: { contactName: nameMatch?.[1] },
      };
    }

    if (msg.includes('cuánto') && msg.includes('debo')) {
      const nameMatch = message.match(/debo\s+(?:a\s+)?(\w+)/i);
      return {
        type: 'query_owed',
        entities: { contactName: nameMatch?.[1] },
      };
    }

    if (msg.includes('resumen') || msg.includes('reporte')) {
      if (msg.includes('hoy')) {
        return { type: 'summary_today', entities: {} };
      }
      if (msg.includes('semana')) {
        return { type: 'summary_week', entities: {} };
      }
      if (msg.includes('mes')) {
        return { type: 'summary_month', entities: {} };
      }
      return { type: 'summary_general', entities: {} };
    }

    if (msg.includes('saldo') || msg.includes('balance')) {
      return { type: 'query_balance', entities: {} };
    }

    if (msg.includes('transacciones') || msg.includes('movimientos')) {
      return { type: 'query_transactions', entities: {} };
    }

    if (msg.includes('recordar') || msg.includes('pendiente')) {
      return { type: 'query_reminders', entities: {} };
    }

    if (msg.includes('contacto') || msg.includes('info')) {
      const nameMatch = message.match(/(?:de|sobre)\s+(\w+)/i);
      return {
        type: 'query_contact',
        entities: { contactName: nameMatch?.[1] },
      };
    }

    // Usar IA para intenciones complejas
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `Clasifica la intención de este mensaje financiero.
Tipos posibles:
- query_debt: pregunta sobre deudas (quién debe)
- query_owed: pregunta sobre lo que debo
- query_balance: consulta de balance general
- query_transactions: historial de transacciones
- query_contact: información de un contacto
- query_reminders: recordatorios pendientes
- summary_today/week/month: resumen de período
- create_transaction: quiere registrar algo
- create_reminder: quiere crear recordatorio
- general_question: pregunta general

Responde en JSON: {"type": "tipo", "entities": {"contactName": "si hay", "amount": 0, "date": "si hay"}}`,
        },
        { role: 'user', content: message },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content || '{"type": "general_question", "entities": {}}');
  }

  // Obtiene datos relevantes basados en la intención
  private async getRelevantData(intent: { type: string; entities: any }, message: string): Promise<any> {
    const data: any = {};

    switch (intent.type) {
      case 'query_debt':
      case 'query_owed':
      case 'query_contact':
        if (intent.entities.contactName) {
          const contactData = await this.getContactData(intent.entities.contactName);
          data.contact = contactData;
        } else {
          // Obtener todos los saldos
          data.balances = await this.getAllBalances();
        }
        break;

      case 'query_balance':
        data.balances = await this.getAllBalances();
        data.summary = await this.getBalanceSummary();
        break;

      case 'query_transactions':
        data.recentTransactions = await this.getRecentTransactions(10);
        break;

      case 'summary_today':
        data.summary = await this.getDaySummary(new Date());
        break;

      case 'summary_week':
        data.summary = await this.getWeekSummary();
        break;

      case 'summary_month':
        data.summary = await this.getMonthSummary();
        break;

      case 'query_reminders':
        data.reminders = await this.getPendingReminders();
        break;

      default:
        // Para preguntas generales, dar contexto general
        data.balances = await this.getAllBalances();
        data.recentTransactions = await this.getRecentTransactions(5);
        data.pendingAlerts = await this.getPendingReminders();
    }

    return data;
  }

  // Obtiene datos de un contacto específico
  private async getContactData(name: string): Promise<any> {
    const contact = await db
      .select({
        contact: contacts,
        balance: contactBalances,
      })
      .from(contacts)
      .leftJoin(contactBalances, eq(contactBalances.contactId, contacts.id))
      .where(like(contacts.name, `%${name}%`))
      .limit(1);

    if (contact.length === 0) {
      return { found: false, searchedName: name };
    }

    const recentTx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.contactId, contact[0].contact.id))
      .orderBy(desc(transactions.transactionDate))
      .limit(10);

    return {
      found: true,
      name: contact[0].contact.name,
      phone: contact[0].contact.phone,
      company: contact[0].contact.company,
      balance: {
        theyOweMe: contact[0].balance?.theyOweMe || '0',
        iOweThem: contact[0].balance?.iOweThem || '0',
        netBalance: contact[0].balance?.netBalance || '0',
      },
      recentTransactions: recentTx.map(t => ({
        type: t.type,
        amount: t.amount,
        description: t.description,
        date: t.transactionDate,
      })),
    };
  }

  // Obtiene todos los saldos pendientes
  private async getAllBalances(): Promise<any> {
    const balances = await db
      .select({
        contact: contacts,
        balance: contactBalances,
      })
      .from(contactBalances)
      .innerJoin(contacts, eq(contactBalances.contactId, contacts.id))
      .where(sql`CAST(${contactBalances.netBalance} AS DECIMAL) != 0`);

    const debtors = balances
      .filter(b => parseFloat(b.balance.theyOweMe || '0') > 0)
      .map(b => ({
        name: b.contact.name,
        amount: parseFloat(b.balance.theyOweMe || '0'),
      }));

    const creditors = balances
      .filter(b => parseFloat(b.balance.iOweThem || '0') > 0)
      .map(b => ({
        name: b.contact.name,
        amount: parseFloat(b.balance.iOweThem || '0'),
      }));

    return {
      meDeben: {
        total: debtors.reduce((sum, d) => sum + d.amount, 0),
        personas: debtors,
      },
      debo: {
        total: creditors.reduce((sum, c) => sum + c.amount, 0),
        personas: creditors,
      },
    };
  }

  // Obtiene resumen de balance general
  private async getBalanceSummary(): Promise<any> {
    const balances = await db
      .select({
        totalOwedToMe: sql<number>`COALESCE(SUM(CAST(${contactBalances.theyOweMe} AS DECIMAL)), 0)`,
        totalIOwe: sql<number>`COALESCE(SUM(CAST(${contactBalances.iOweThem} AS DECIMAL)), 0)`,
      })
      .from(contactBalances);

    return {
      totalMeDeben: balances[0]?.totalOwedToMe || 0,
      totalDebo: balances[0]?.totalIOwe || 0,
      balanceNeto: (balances[0]?.totalOwedToMe || 0) - (balances[0]?.totalIOwe || 0),
    };
  }

  // Obtiene transacciones recientes
  private async getRecentTransactions(limit: number): Promise<any[]> {
    const txs = await db
      .select({
        transaction: transactions,
        contact: contacts,
      })
      .from(transactions)
      .leftJoin(contacts, eq(transactions.contactId, contacts.id))
      .orderBy(desc(transactions.transactionDate))
      .limit(limit);

    return txs.map(({ transaction, contact }) => ({
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description,
      contact: contact?.name,
      date: transaction.transactionDate,
      category: transaction.category,
    }));
  }

  // Obtiene resumen del día
  private async getDaySummary(date: Date): Promise<any> {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const dayTxs = await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.transactionDate, dayStart),
          lte(transactions.transactionDate, dayEnd)
        )
      );

    let income = 0, expense = 0, loansGiven = 0, loansReceived = 0;

    for (const tx of dayTxs) {
      const amount = parseFloat(tx.amount);
      switch (tx.type) {
        case 'income':
          income += amount;
          break;
        case 'expense':
          expense += amount;
          break;
        case 'loan_given':
          loansGiven += amount;
          break;
        case 'loan_received':
          loansReceived += amount;
          break;
        case 'loan_payment_received':
          income += amount;
          break;
        case 'loan_payment_made':
          expense += amount;
          break;
      }
    }

    return {
      fecha: format(date, 'EEEE d MMMM', { locale: es }),
      transacciones: dayTxs.length,
      ingresos: income,
      gastos: expense,
      prestamosOtorgados: loansGiven,
      prestamosRecibidos: loansReceived,
      flujoNeto: income - expense,
    };
  }

  // Obtiene resumen de la semana
  private async getWeekSummary(): Promise<any> {
    const weekAgo = subDays(new Date(), 7);

    const weekTxs = await db
      .select()
      .from(transactions)
      .where(gte(transactions.transactionDate, weekAgo));

    let income = 0, expense = 0;

    for (const tx of weekTxs) {
      const amount = parseFloat(tx.amount);
      if (tx.type === 'income' || tx.type === 'loan_payment_received') {
        income += amount;
      } else if (tx.type === 'expense' || tx.type === 'loan_payment_made') {
        expense += amount;
      }
    }

    return {
      periodo: 'Últimos 7 días',
      transacciones: weekTxs.length,
      ingresos: income,
      gastos: expense,
      flujoNeto: income - expense,
    };
  }

  // Obtiene resumen del mes
  private async getMonthSummary(): Promise<any> {
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    const monthTxs = await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.transactionDate, monthStart),
          lte(transactions.transactionDate, monthEnd)
        )
      );

    let income = 0, expense = 0;

    for (const tx of monthTxs) {
      const amount = parseFloat(tx.amount);
      if (tx.type === 'income' || tx.type === 'loan_payment_received') {
        income += amount;
      } else if (tx.type === 'expense' || tx.type === 'loan_payment_made') {
        expense += amount;
      }
    }

    return {
      periodo: format(new Date(), 'MMMM yyyy', { locale: es }),
      transacciones: monthTxs.length,
      ingresos: income,
      gastos: expense,
      flujoNeto: income - expense,
    };
  }

  // Obtiene recordatorios pendientes
  private async getPendingReminders(): Promise<any[]> {
    const pendingAlerts = await db
      .select({
        alert: alerts,
        contact: contacts,
      })
      .from(alerts)
      .leftJoin(contacts, eq(alerts.contactId, contacts.id))
      .where(eq(alerts.isDismissed, false))
      .orderBy(desc(alerts.createdAt))
      .limit(10);

    return pendingAlerts.map(({ alert, contact }) => ({
      tipo: alert.type,
      mensaje: alert.message,
      contacto: contact?.name,
      fechaVencimiento: alert.dueDate,
    }));
  }

  // Limpia el historial de conversación
  clearHistory(): void {
    this.conversationHistory = [];
  }
}

export const conversationalAgent = new ConversationalAgent();
