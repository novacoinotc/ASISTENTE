import { db } from '@/db';
import { contacts, transactions, contactBalances } from '@/db/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { addDays, getDay, getHours, format } from 'date-fns';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tabla para almacenar patrones aprendidos (la creamos en schema después)
export interface LearnedPattern {
  id: string;
  type: 'contact_behavior' | 'transaction_pattern' | 'time_pattern' | 'amount_pattern' | 'category_pattern';
  description: string;
  confidence: number;
  data: any;
  lastUpdated: Date;
  occurrences: number;
}

export interface ContactProfile {
  contactId: number;
  name: string;
  // Comportamiento de pago
  averagePaymentDelay: number; // Días promedio que tarda en pagar
  paymentReliability: number; // 0-1, qué tan confiable es
  preferredPaymentDay?: number; // Día de la semana que suele pagar
  typicalAmounts: number[]; // Montos típicos de transacciones
  // Patrones de comunicación
  activeHours?: number[]; // Horas en que suele comunicarse
  preferredCategory?: string; // Categoría más común
  // Historial
  totalTransactions: number;
  totalVolume: number;
  lastInteraction: Date;
  // Alertas
  riskLevel: 'low' | 'medium' | 'high';
  notes: string[];
}

export class LearningSystem {
  // Analiza el comportamiento de un contacto específico
  async analyzeContactBehavior(contactId: number): Promise<ContactProfile | null> {
    try {
      const contact = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);

      if (contact.length === 0) return null;

      // Obtener todas las transacciones del contacto
      const contactTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.contactId, contactId))
        .orderBy(desc(transactions.transactionDate));

      if (contactTransactions.length === 0) {
        return {
          contactId,
          name: contact[0].name,
          averagePaymentDelay: 0,
          paymentReliability: 0.5,
          typicalAmounts: [],
          totalTransactions: 0,
          totalVolume: 0,
          lastInteraction: new Date(),
          riskLevel: 'low',
          notes: ['Sin historial de transacciones'],
        };
      }

      // Calcular métricas
      const amounts = contactTransactions.map(t => parseFloat(t.amount));
      const totalVolume = amounts.reduce((a, b) => a + b, 0);

      // Detectar patrones de día/hora
      const transactionDays = contactTransactions
        .filter(t => t.transactionDate)
        .map(t => getDay(new Date(t.transactionDate!)));

      const transactionHours = contactTransactions
        .filter(t => t.transactionDate)
        .map(t => getHours(new Date(t.transactionDate!)));

      // Día más frecuente
      const dayFrequency: Record<number, number> = {};
      transactionDays.forEach(d => {
        dayFrequency[d] = (dayFrequency[d] || 0) + 1;
      });
      const preferredDay = Object.entries(dayFrequency)
        .sort((a, b) => b[1] - a[1])[0]?.[0];

      // Horas activas
      const hourFrequency: Record<number, number> = {};
      transactionHours.forEach(h => {
        hourFrequency[h] = (hourFrequency[h] || 0) + 1;
      });
      const activeHours = Object.entries(hourFrequency)
        .filter(([_, count]) => count > 1)
        .map(([hour]) => parseInt(hour));

      // Categoría más común
      const categoryFrequency: Record<string, number> = {};
      contactTransactions.forEach(t => {
        categoryFrequency[t.category] = (categoryFrequency[t.category] || 0) + 1;
      });
      const preferredCategory = Object.entries(categoryFrequency)
        .sort((a, b) => b[1] - a[1])[0]?.[0];

      // Calcular confiabilidad de pago
      // (basado en si hay préstamos y qué tan rápido los paga)
      const loansGiven = contactTransactions.filter(t => t.type === 'loan_given');
      const paymentsReceived = contactTransactions.filter(t => t.type === 'loan_payment_received');

      let paymentReliability = 0.5;
      if (loansGiven.length > 0) {
        const paidRatio = paymentsReceived.length / loansGiven.length;
        paymentReliability = Math.min(1, paidRatio);
      }

      // Obtener saldo pendiente
      const balance = await db
        .select()
        .from(contactBalances)
        .where(eq(contactBalances.contactId, contactId))
        .limit(1);

      const theyOweMe = parseFloat(balance[0]?.theyOweMe || '0');

      // Determinar nivel de riesgo
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      const notes: string[] = [];

      if (theyOweMe > 100000) {
        riskLevel = 'high';
        notes.push(`Deuda alta: $${theyOweMe.toLocaleString()}`);
      } else if (theyOweMe > 50000) {
        riskLevel = 'medium';
      }

      if (paymentReliability < 0.5) {
        riskLevel = riskLevel === 'low' ? 'medium' : 'high';
        notes.push('Historial de pagos inconsistente');
      }

      return {
        contactId,
        name: contact[0].name,
        averagePaymentDelay: 0, // TODO: calcular basado en fechas de préstamo vs pago
        paymentReliability,
        preferredPaymentDay: preferredDay ? parseInt(preferredDay) : undefined,
        typicalAmounts: amounts.slice(0, 5),
        activeHours,
        preferredCategory,
        totalTransactions: contactTransactions.length,
        totalVolume,
        lastInteraction: contactTransactions[0].transactionDate || new Date(),
        riskLevel,
        notes,
      };
    } catch (error) {
      console.error('Error analyzing contact behavior:', error);
      return null;
    }
  }

  // Detecta patrones globales en todas las transacciones
  async detectGlobalPatterns(): Promise<LearnedPattern[]> {
    const patterns: LearnedPattern[] = [];

    try {
      const lastMonth = addDays(new Date(), -30);

      const recentTransactions = await db
        .select({
          transaction: transactions,
          contact: contacts,
        })
        .from(transactions)
        .leftJoin(contacts, eq(transactions.contactId, contacts.id))
        .where(gte(transactions.createdAt, lastMonth))
        .orderBy(desc(transactions.createdAt));

      if (recentTransactions.length < 5) {
        return patterns;
      }

      // Usar IA para detectar patrones complejos
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `Eres un analista financiero experto en detectar patrones de comportamiento.
Analiza estas transacciones y encuentra patrones que puedan ayudar a:
1. Predecir cuándo alguien va a pagar
2. Identificar clientes que están demorando más de lo usual
3. Detectar categorías con más movimiento
4. Encontrar horas/días de mayor actividad
5. Identificar montos recurrentes

Responde en JSON:
{
  "patterns": [
    {
      "id": "unique_id",
      "type": "contact_behavior|transaction_pattern|time_pattern|amount_pattern|category_pattern",
      "description": "descripción clara del patrón",
      "confidence": 0.8,
      "insight": "qué significa este patrón para el negocio",
      "action": "qué acción tomar basado en este patrón",
      "data": {}
    }
  ],
  "recommendations": [
    "recomendación práctica basada en los patrones"
  ],
  "risks": [
    "riesgo potencial detectado"
  ]
}`,
          },
          {
            role: 'user',
            content: JSON.stringify(
              recentTransactions.map(({ transaction, contact }) => ({
                date: transaction.transactionDate,
                type: transaction.type,
                category: transaction.category,
                amount: transaction.amount,
                contact: contact?.name,
                status: transaction.status,
              })),
              null,
              2
            ),
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      for (const p of result.patterns || []) {
        patterns.push({
          id: p.id,
          type: p.type,
          description: p.description,
          confidence: p.confidence,
          data: {
            insight: p.insight,
            action: p.action,
            ...p.data,
          },
          lastUpdated: new Date(),
          occurrences: 1,
        });
      }
    } catch (error) {
      console.error('Error detecting global patterns:', error);
    }

    return patterns;
  }

  // Aprende de una nueva transacción
  async learnFromTransaction(transactionId: number): Promise<void> {
    try {
      const txResult = await db
        .select({
          transaction: transactions,
          contact: contacts,
        })
        .from(transactions)
        .leftJoin(contacts, eq(transactions.contactId, contacts.id))
        .where(eq(transactions.id, transactionId))
        .limit(1);

      if (txResult.length === 0) return;

      const { transaction, contact } = txResult[0];

      // Si hay contacto, actualizar su perfil
      if (contact) {
        await this.analyzeContactBehavior(contact.id);
      }

      // Verificar si esta transacción sigue algún patrón conocido
      // o si introduce uno nuevo
      // TODO: Implementar comparación con patrones existentes

    } catch (error) {
      console.error('Error learning from transaction:', error);
    }
  }

  // Genera insights personalizados basados en patrones aprendidos
  async generateInsights(): Promise<string[]> {
    const insights: string[] = [];

    try {
      // Obtener estadísticas generales
      const stats = await db
        .select({
          totalTransactions: sql<number>`COUNT(*)`,
          totalIncome: sql<number>`SUM(CASE WHEN type = 'income' THEN CAST(amount AS DECIMAL) ELSE 0 END)`,
          totalExpense: sql<number>`SUM(CASE WHEN type = 'expense' THEN CAST(amount AS DECIMAL) ELSE 0 END)`,
          avgTransactionAmount: sql<number>`AVG(CAST(amount AS DECIMAL))`,
        })
        .from(transactions)
        .where(gte(transactions.createdAt, addDays(new Date(), -30)));

      const s = stats[0];

      // Obtener contactos con saldos pendientes
      const pendingBalances = await db
        .select({
          contact: contacts,
          balance: contactBalances,
        })
        .from(contactBalances)
        .innerJoin(contacts, eq(contactBalances.contactId, contacts.id))
        .where(sql`CAST(${contactBalances.netBalance} AS DECIMAL) != 0`);

      // Generar insights con IA
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `Genera insights financieros concisos y accionables.
Cada insight debe ser:
1. Específico y basado en los datos
2. Accionable (qué puede hacer el usuario)
3. En primera persona y directo

Ejemplos:
- "Tienes $50,000 pendientes de cobro con Juan, sería bueno darle seguimiento"
- "Tu flujo de efectivo del mes está negativo, considera revisar gastos"
- "Carlos suele pagar los viernes, podrías contactarlo mañana"`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              estadisticas: {
                transaccionesTotales: s.totalTransactions,
                ingresoTotal: s.totalIncome,
                gastoTotal: s.totalExpense,
                promedioTransaccion: s.avgTransactionAmount,
              },
              saldosPendientes: pendingBalances.map(({ contact, balance }) => ({
                nombre: contact.name,
                meDeben: balance.theyOweMe,
                leDebo: balance.iOweThem,
              })),
            }),
          },
        ],
        temperature: 0.5,
      });

      const insightsText = response.choices[0].message.content || '';
      insights.push(...insightsText.split('\n').filter(i => i.trim()));

    } catch (error) {
      console.error('Error generating insights:', error);
    }

    return insights;
  }

  // Predice transacciones futuras basadas en patrones
  async predictUpcomingTransactions(): Promise<{
    type: string;
    contact?: string;
    estimatedAmount: number;
    expectedDate: Date;
    confidence: number;
    reason: string;
  }[]> {
    const predictions: any[] = [];

    try {
      // Obtener transacciones históricas
      const historicalData = await db
        .select({
          transaction: transactions,
          contact: contacts,
        })
        .from(transactions)
        .leftJoin(contacts, eq(transactions.contactId, contacts.id))
        .orderBy(desc(transactions.transactionDate))
        .limit(200);

      if (historicalData.length < 20) {
        return predictions;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `Analiza el historial de transacciones y predice qué transacciones podrían ocurrir en los próximos 7 días.
Busca patrones como:
- Pagos recurrentes
- Clientes que compran regularmente
- Cobros pendientes que deberían llegar
- Gastos fijos

Responde en JSON:
{
  "predictions": [
    {
      "type": "income|expense|collection|payment",
      "contact": "nombre si aplica",
      "estimatedAmount": 1000,
      "expectedDate": "2024-01-20",
      "confidence": 0.8,
      "reason": "por qué predices esto"
    }
  ]
}`,
          },
          {
            role: 'user',
            content: JSON.stringify(
              historicalData.map(({ transaction, contact }) => ({
                date: format(new Date(transaction.transactionDate || ''), 'yyyy-MM-dd'),
                dayOfWeek: getDay(new Date(transaction.transactionDate || '')),
                type: transaction.type,
                amount: transaction.amount,
                contact: contact?.name,
                category: transaction.category,
              }))
            ),
          },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      for (const p of result.predictions || []) {
        predictions.push({
          ...p,
          expectedDate: new Date(p.expectedDate),
        });
      }

    } catch (error) {
      console.error('Error predicting transactions:', error);
    }

    return predictions;
  }
}

export const learningSystem = new LearningSystem();
