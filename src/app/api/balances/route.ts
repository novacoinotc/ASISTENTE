import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { contacts, contactBalances, transactions } from '@/db/schema';
import { eq, desc, sql, and, gt, lt } from 'drizzle-orm';
import { ApiResponse } from '@/types';

// GET - Obtener resumen de saldos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const currency = searchParams.get('currency') || 'MXN';

    // Obtener todos los saldos con información del contacto
    const balances = await db
      .select({
        contact: contacts,
        balance: contactBalances,
      })
      .from(contactBalances)
      .innerJoin(contacts, eq(contactBalances.contactId, contacts.id))
      .where(
        and(
          eq(contactBalances.currency, currency as any),
          eq(contacts.isActive, true)
        )
      )
      .orderBy(desc(sql`ABS(${contactBalances.netBalance})`));

    // Calcular totales
    let totalOwedToMe = 0;
    let totalIOwe = 0;
    const debtors: typeof balances = [];
    const creditors: typeof balances = [];

    for (const row of balances) {
      const net = parseFloat(row.balance.netBalance || '0');
      const theyOwe = parseFloat(row.balance.theyOweMe || '0');
      const iOwe = parseFloat(row.balance.iOweThem || '0');

      totalOwedToMe += theyOwe;
      totalIOwe += iOwe;

      if (net > 0) {
        debtors.push(row);
      } else if (net < 0) {
        creditors.push(row);
      }
    }

    return NextResponse.json<ApiResponse<{
      summary: {
        totalOwedToMe: number;
        totalIOwe: number;
        netBalance: number;
        debtorsCount: number;
        creditorsCount: number;
      };
      debtors: typeof debtors;
      creditors: typeof creditors;
    }>>({
      success: true,
      data: {
        summary: {
          totalOwedToMe,
          totalIOwe,
          netBalance: totalOwedToMe - totalIOwe,
          debtorsCount: debtors.length,
          creditorsCount: creditors.length,
        },
        debtors,
        creditors,
      },
    });
  } catch (error) {
    console.error('Error fetching balances:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al obtener saldos',
    }, { status: 500 });
  }
}

// POST - Ajustar saldo manualmente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId, currency = 'MXN', theyOweMe, iOweThem, reason } = body;

    if (!contactId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Se requiere contactId',
      }, { status: 400 });
    }

    // Buscar saldo existente
    const existing = await db
      .select()
      .from(contactBalances)
      .where(
        and(
          eq(contactBalances.contactId, contactId),
          eq(contactBalances.currency, currency)
        )
      )
      .limit(1);

    const newTheyOweMe = theyOweMe !== undefined ? theyOweMe : (existing[0]?.theyOweMe || 0);
    const newIOweThem = iOweThem !== undefined ? iOweThem : (existing[0]?.iOweThem || 0);
    const netBalance = parseFloat(newTheyOweMe) - parseFloat(newIOweThem);

    if (existing.length > 0) {
      await db
        .update(contactBalances)
        .set({
          theyOweMe: newTheyOweMe.toString(),
          iOweThem: newIOweThem.toString(),
          netBalance: netBalance.toString(),
          updatedAt: new Date(),
        })
        .where(eq(contactBalances.id, existing[0].id));
    } else {
      await db
        .insert(contactBalances)
        .values({
          contactId,
          currency,
          theyOweMe: newTheyOweMe.toString(),
          iOweThem: newIOweThem.toString(),
          netBalance: netBalance.toString(),
        });
    }

    // Registrar el ajuste como transacción si hay razón
    if (reason) {
      // Crear transacción de ajuste
      await db
        .insert(transactions)
        .values({
          type: 'transfer',
          category: 'otro',
          amount: Math.abs(netBalance).toString(),
          currency,
          contactId,
          description: `Ajuste manual: ${reason}`,
          status: 'completed',
        });
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: 'Saldo ajustado correctamente',
    });
  } catch (error) {
    console.error('Error adjusting balance:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al ajustar saldo',
    }, { status: 500 });
  }
}
