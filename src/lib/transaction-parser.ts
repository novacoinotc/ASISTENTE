import OpenAI from 'openai';
import { ParsedTransaction, TransactionType, BusinessCategory, Currency } from '@/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `Eres un asistente experto en finanzas que ayuda a interpretar transacciones financieras a partir de mensajes en lenguaje natural.

Tu trabajo es extraer la información de transacciones de mensajes informales en español y estructurarla.

CONTEXTO DEL USUARIO:
- Maneja múltiples negocios: banco, despacho fiscal, crypto, divisas, efectivo, préstamos, soluciones financieras, transacciones internacionales
- Los mensajes pueden ser muy informales y coloquiales
- Usa su liquidez personal para financiar operaciones de clientes
- Hace préstamos personales frecuentemente
- Trabaja con múltiples monedas

TIPOS DE TRANSACCIÓN:
- income: Dinero que entra (ventas, cobros, pagos recibidos)
- expense: Dinero que sale (gastos, compras, pagos hechos)
- loan_given: Préstamo que él otorga a alguien (alguien le va a deber)
- loan_received: Préstamo que él recibe de alguien (él va a deber)
- loan_payment_received: Cuando alguien le paga un préstamo que él dio
- loan_payment_made: Cuando él paga un préstamo que recibió
- transfer: Movimiento entre sus propias cuentas

CATEGORÍAS DE NEGOCIO:
- banco: Operaciones bancarias, transferencias SPEI, depósitos
- despacho_fiscal: Servicios contables, declaraciones, honorarios del despacho
- crypto: Bitcoin, Ethereum, USDT, compra/venta de criptomonedas
- divisas: Cambio de dólares, euros, compra/venta de moneda extranjera
- efectivo: Operaciones en cash, retiros, depósitos en efectivo
- prestamos: Préstamos personales, financiamiento
- soluciones_financieras: Productos financieros, inversiones, seguros
- internacional: Transferencias internacionales, wire transfers
- otro: Cuando no encaja en ninguna categoría

MONEDAS:
- MXN: Pesos mexicanos (default)
- USD: Dólares
- EUR: Euros
- USDT: Tether (stablecoin)
- BTC: Bitcoin
- ETH: Ethereum
- OTHER: Otra moneda

INSTRUCCIONES:
1. Analiza el mensaje cuidadosamente
2. Identifica el tipo de transacción
3. Extrae el monto y la moneda
4. Identifica si hay una persona/empresa involucrada
5. Determina la categoría de negocio
6. Si menciona una fecha futura de pago, incluye dueDate
7. Calcula tu nivel de confianza (0-1)

EJEMPLOS DE INTERPRETACIÓN:

"Le presté 50mil a Juan para que cierre su operación"
→ tipo: loan_given, monto: 50000, moneda: MXN, contacto: Juan, categoría: prestamos

"Me pagó Carlos los 20k que le presté la semana pasada"
→ tipo: loan_payment_received, monto: 20000, moneda: MXN, contacto: Carlos, categoría: prestamos

"Vendí 5000 dólares a 17.80"
→ tipo: income, monto: 89000 (5000*17.80), moneda: MXN, categoría: divisas

"Compré 2 BTC a Roberto"
→ tipo: expense, monto: 2, moneda: BTC, contacto: Roberto, categoría: crypto

"Transferí 100k a la cuenta del despacho"
→ tipo: transfer, monto: 100000, moneda: MXN, categoría: despacho_fiscal

"Me debe María 15mil del cambio de ayer, me paga el viernes"
→ tipo: loan_given, monto: 15000, moneda: MXN, contacto: María, categoría: divisas, dueDate: viernes

Responde SOLO con un objeto JSON válido con esta estructura:
{
  "type": "tipo_de_transaccion",
  "category": "categoria",
  "amount": numero,
  "currency": "MONEDA",
  "contactName": "nombre o null",
  "description": "descripción clara de la operación",
  "status": "completed o pending",
  "dueDate": "fecha ISO o null",
  "reference": "referencia si la hay o null",
  "confidence": numero_entre_0_y_1
}`;

export async function parseTransaction(message: string): Promise<ParsedTransaction | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as ParsedTransaction;

    // Validar campos requeridos
    if (!parsed.type || !parsed.category || parsed.amount === undefined) {
      console.error('Campos requeridos faltantes en respuesta del parser');
      return null;
    }

    // Asegurar valores por defecto
    return {
      ...parsed,
      currency: parsed.currency || 'MXN',
      status: parsed.status || 'completed',
      confidence: parsed.confidence || 0.5,
    };
  } catch (error) {
    console.error('Error al parsear transacción:', error);
    return null;
  }
}

// Parser simple sin IA para casos básicos (ahorra tokens)
export function parseTransactionSimple(message: string): ParsedTransaction | null {
  const msg = message.toLowerCase().trim();

  // Patrones comunes
  const amountMatch = msg.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(mil|k|pesos|mxn|usd|dolares|euros|eur|btc|eth|usdt)?/i);
  if (!amountMatch) return null;

  let amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  const unitHint = amountMatch[2]?.toLowerCase();

  // Multiplicadores
  if (unitHint === 'mil' || unitHint === 'k') {
    amount *= 1000;
  }

  // Detectar moneda
  let currency: Currency = 'MXN';
  if (msg.includes('dolar') || msg.includes('usd') || msg.includes('dll')) currency = 'USD';
  if (msg.includes('euro') || msg.includes('eur')) currency = 'EUR';
  if (msg.includes('btc') || msg.includes('bitcoin')) currency = 'BTC';
  if (msg.includes('eth') || msg.includes('ethereum')) currency = 'ETH';
  if (msg.includes('usdt') || msg.includes('tether')) currency = 'USDT';

  // Detectar tipo
  let type: TransactionType = 'income';
  if (msg.includes('prest') && (msg.includes(' a ') || msg.includes('le '))) {
    type = 'loan_given';
  } else if (msg.includes('prest') && (msg.includes('me ') || msg.includes('recibi'))) {
    type = 'loan_received';
  } else if (msg.includes('me pag') || msg.includes('cobr')) {
    type = msg.includes('prest') ? 'loan_payment_received' : 'income';
  } else if (msg.includes('pagu') || msg.includes('gast') || msg.includes('compr')) {
    type = msg.includes('prest') ? 'loan_payment_made' : 'expense';
  } else if (msg.includes('transfer') && msg.includes('cuenta')) {
    type = 'transfer';
  }

  // Detectar categoría
  let category: BusinessCategory = 'otro';
  if (msg.includes('crypto') || msg.includes('btc') || msg.includes('bitcoin') || msg.includes('eth')) {
    category = 'crypto';
  } else if (msg.includes('dolar') || msg.includes('euro') || msg.includes('cambio') || msg.includes('divisa')) {
    category = 'divisas';
  } else if (msg.includes('prest') || msg.includes('financi')) {
    category = 'prestamos';
  } else if (msg.includes('banco') || msg.includes('spei') || msg.includes('transfer')) {
    category = 'banco';
  } else if (msg.includes('efectivo') || msg.includes('cash') || msg.includes('billete')) {
    category = 'efectivo';
  } else if (msg.includes('despacho') || msg.includes('fiscal') || msg.includes('contab')) {
    category = 'despacho_fiscal';
  } else if (msg.includes('internacion') || msg.includes('wire') || msg.includes('swift')) {
    category = 'internacional';
  }

  // Extraer nombre de contacto (muy básico)
  const namePatterns = [
    /(?:a|de|con|para)\s+([A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)?)/,
    /([A-Z][a-záéíóúñ]+)\s+(?:me|le|nos)/,
  ];

  let contactName: string | undefined;
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      contactName = match[1];
      break;
    }
  }

  return {
    type,
    category,
    amount,
    currency,
    contactName,
    description: message,
    status: 'completed',
    confidence: 0.6, // Parser simple tiene menor confianza
  };
}

// Función que decide qué parser usar
export async function smartParse(message: string): Promise<ParsedTransaction | null> {
  // Primero intentar con parser simple
  const simpleResult = parseTransactionSimple(message);

  // Si el parser simple tiene alta confianza, usarlo
  if (simpleResult && simpleResult.confidence >= 0.8) {
    return simpleResult;
  }

  // Si hay API key de OpenAI, usar el parser avanzado
  if (process.env.OPENAI_API_KEY) {
    const aiResult = await parseTransaction(message);
    if (aiResult) return aiResult;
  }

  // Fallback al resultado simple
  return simpleResult;
}

// Generar descripción amigable de la transacción
export function generateTransactionSummary(parsed: ParsedTransaction): string {
  const typeDescriptions: Record<TransactionType, string> = {
    income: 'Ingreso',
    expense: 'Gasto',
    loan_given: 'Préstamo otorgado',
    loan_received: 'Préstamo recibido',
    loan_payment_received: 'Cobro de préstamo',
    loan_payment_made: 'Pago de préstamo',
    transfer: 'Transferencia',
  };

  let summary = `${typeDescriptions[parsed.type]}: $${parsed.amount.toLocaleString()} ${parsed.currency}`;

  if (parsed.contactName) {
    if (parsed.type === 'loan_given' || parsed.type === 'expense') {
      summary += ` a ${parsed.contactName}`;
    } else {
      summary += ` de ${parsed.contactName}`;
    }
  }

  return summary;
}
