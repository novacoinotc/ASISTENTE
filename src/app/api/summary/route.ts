import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, contacts, contactBalances, dailySummaries } from '@/db/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { ApiResponse, DashboardMetrics, BusinessCategory } from '@/types';
import { startOfDay, endOfDay, startOfWeek, startOfMonth, format } from 'date-fns';

// GET - Obtener métricas del dashboard
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const date = dateParam ? new Date(dateParam) : new Date();

    const todayStart = startOfDay(date);
    const todayEnd = endOfDay(date);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const monthStart = startOfMonth(date);

    // Obtener transacciones de hoy
    const todayTransactions = await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.transactionDate, todayStart),
          lte(transactions.transactionDate, todayEnd)
        )
      );

    // Calcular métricas de hoy
    let totalIncome = 0;
    let totalExpense = 0;
    const byCategory: Record<BusinessCategory, { income: number; expense: number; count: number }> = {
      banco: { income: 0, expense: 0, count: 0 },
      despacho_fiscal: { income: 0, expense: 0, count: 0 },
      crypto: { income: 0, expense: 0, count: 0 },
      divisas: { income: 0, expense: 0, count: 0 },
      efectivo: { income: 0, expense: 0, count: 0 },
      prestamos: { income: 0, expense: 0, count: 0 },
      soluciones_financieras: { income: 0, expense: 0, count: 0 },
      internacional: { income: 0, expense: 0, count: 0 },
      otro: { income: 0, expense: 0, count: 0 },
    };

    for (const tx of todayTransactions) {
      const amount = parseFloat(tx.amount);
      const cat = tx.category as BusinessCategory;

      byCategory[cat].count++;

      if (tx.type === 'income' || tx.type === 'loan_payment_received') {
        totalIncome += amount;
        byCategory[cat].income += amount;
      } else if (tx.type === 'expense' || tx.type === 'loan_payment_made') {
        totalExpense += amount;
        byCategory[cat].expense += amount;
      }
    }

    // Contar transacciones por período
    const weekTransactionsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(gte(transactions.transactionDate, weekStart));

    const monthTransactionsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(gte(transactions.transactionDate, monthStart));

    // Obtener totales de saldos pendientes
    const balances = await db
      .select({
        totalOwedToMe: sql<number>`COALESCE(SUM(CAST(${contactBalances.theyOweMe} AS DECIMAL)), 0)`,
        totalIOwe: sql<number>`COALESCE(SUM(CAST(${contactBalances.iOweThem} AS DECIMAL)), 0)`,
      })
      .from(contactBalances)
      .where(eq(contactBalances.currency, 'MXN'));

    const totalOwedToMe = balances[0]?.totalOwedToMe || 0;
    const totalIOwe = balances[0]?.totalIOwe || 0;

    const metrics: DashboardMetrics = {
      totalIncome,
      totalExpense,
      netFlow: totalIncome - totalExpense,
      totalOwedToMe: Number(totalOwedToMe),
      totalIOwe: Number(totalIOwe),
      netLoanBalance: Number(totalOwedToMe) - Number(totalIOwe),
      todayTransactions: todayTransactions.length,
      weekTransactions: weekTransactionsCount[0]?.count || 0,
      monthTransactions: monthTransactionsCount[0]?.count || 0,
      byCategory,
    };

    return NextResponse.json<ApiResponse<DashboardMetrics>>({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al obtener resumen',
    }, { status: 500 });
  }
}

// POST - Generar resumen diario
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date: dateParam } = body;
    const date = dateParam ? new Date(dateParam) : new Date();

    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // Obtener todas las transacciones del día
    const dayTransactions = await db
      .select({
        transaction: transactions,
        contact: contacts,
      })
      .from(transactions)
      .leftJoin(contacts, eq(transactions.contactId, contacts.id))
      .where(
        and(
          gte(transactions.transactionDate, dayStart),
          lte(transactions.transactionDate, dayEnd)
        )
      )
      .orderBy(desc(transactions.transactionDate));

    // Calcular totales
    let totalIncome = 0;
    let totalExpense = 0;
    let totalLoansGiven = 0;
    let totalLoansReceived = 0;
    let totalCollected = 0;
    let totalPaid = 0;
    const byCategoryTotals: Record<string, number> = {};

    for (const { transaction: tx } of dayTransactions) {
      const amount = parseFloat(tx.amount);

      // Acumular por categoría
      byCategoryTotals[tx.category] = (byCategoryTotals[tx.category] || 0) + amount;

      // Acumular por tipo
      switch (tx.type) {
        case 'income':
          totalIncome += amount;
          break;
        case 'expense':
          totalExpense += amount;
          break;
        case 'loan_given':
          totalLoansGiven += amount;
          break;
        case 'loan_received':
          totalLoansReceived += amount;
          break;
        case 'loan_payment_received':
          totalCollected += amount;
          break;
        case 'loan_payment_made':
          totalPaid += amount;
          break;
      }
    }

    // Generar resumen en texto
    const aiSummary = generateDailySummaryText({
      date,
      transactionCount: dayTransactions.length,
      totalIncome,
      totalExpense,
      totalLoansGiven,
      totalLoansReceived,
      totalCollected,
      totalPaid,
      transactions: dayTransactions,
    });

    // Guardar resumen en BD
    const existing = await db
      .select()
      .from(dailySummaries)
      .where(
        and(
          gte(dailySummaries.summaryDate, dayStart),
          lte(dailySummaries.summaryDate, dayEnd)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(dailySummaries)
        .set({
          totalIncome: totalIncome.toString(),
          totalExpense: totalExpense.toString(),
          totalLoansGiven: totalLoansGiven.toString(),
          totalLoansReceived: totalLoansReceived.toString(),
          totalCollected: totalCollected.toString(),
          totalPaid: totalPaid.toString(),
          transactionCount: dayTransactions.length,
          aiSummary,
          byCategory: JSON.stringify(byCategoryTotals),
        })
        .where(eq(dailySummaries.id, existing[0].id));
    } else {
      await db
        .insert(dailySummaries)
        .values({
          summaryDate: dayStart,
          totalIncome: totalIncome.toString(),
          totalExpense: totalExpense.toString(),
          totalLoansGiven: totalLoansGiven.toString(),
          totalLoansReceived: totalLoansReceived.toString(),
          totalCollected: totalCollected.toString(),
          totalPaid: totalPaid.toString(),
          transactionCount: dayTransactions.length,
          aiSummary,
          byCategory: JSON.stringify(byCategoryTotals),
        });
    }

    return NextResponse.json<ApiResponse<{ summary: string }>>({
      success: true,
      data: { summary: aiSummary },
      message: 'Resumen generado exitosamente',
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al generar resumen',
    }, { status: 500 });
  }
}

function generateDailySummaryText(data: {
  date: Date;
  transactionCount: number;
  totalIncome: number;
  totalExpense: number;
  totalLoansGiven: number;
  totalLoansReceived: number;
  totalCollected: number;
  totalPaid: number;
  transactions: any[];
}): string {
  const dateStr = format(data.date, 'dd/MM/yyyy');
  const netFlow = data.totalIncome - data.totalExpense + data.totalCollected - data.totalPaid;

  let summary = `📊 RESUMEN DEL DÍA - ${dateStr}\n\n`;
  summary += `📈 Transacciones: ${data.transactionCount}\n\n`;

  summary += `💰 FLUJO DE EFECTIVO:\n`;
  summary += `   Ingresos: $${data.totalIncome.toLocaleString()}\n`;
  summary += `   Gastos: $${data.totalExpense.toLocaleString()}\n`;
  summary += `   Flujo neto: $${netFlow.toLocaleString()}\n\n`;

  if (data.totalLoansGiven > 0 || data.totalLoansReceived > 0) {
    summary += `🤝 PRÉSTAMOS:\n`;
    if (data.totalLoansGiven > 0) {
      summary += `   Prestado hoy: $${data.totalLoansGiven.toLocaleString()}\n`;
    }
    if (data.totalLoansReceived > 0) {
      summary += `   Recibido en préstamo: $${data.totalLoansReceived.toLocaleString()}\n`;
    }
  }

  if (data.totalCollected > 0 || data.totalPaid > 0) {
    summary += `\n💳 COBRANZA:\n`;
    if (data.totalCollected > 0) {
      summary += `   Cobrado: $${data.totalCollected.toLocaleString()}\n`;
    }
    if (data.totalPaid > 0) {
      summary += `   Pagado: $${data.totalPaid.toLocaleString()}\n`;
    }
  }

  // Listar operaciones principales
  if (data.transactions.length > 0) {
    summary += `\n📝 OPERACIONES DEL DÍA:\n`;
    for (const { transaction, contact } of data.transactions.slice(0, 10)) {
      const amount = parseFloat(transaction.amount).toLocaleString();
      const contactName = contact?.name || 'Sin contacto';
      summary += `   • ${transaction.description.slice(0, 40)}... - $${amount} (${contactName})\n`;
    }
    if (data.transactions.length > 10) {
      summary += `   ... y ${data.transactions.length - 10} más\n`;
    }
  }

  return summary;
}
