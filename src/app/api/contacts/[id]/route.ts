import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { contacts, contactBalances, transactions } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { ApiResponse, ContactWithBalance, TransactionWithContact } from '@/types';

// GET - Obtener un contacto con su historial
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);

    // Obtener contacto con saldos
    const contactResult = await db
      .select({
        contact: contacts,
        balance: contactBalances,
      })
      .from(contacts)
      .leftJoin(
        contactBalances,
        and(
          eq(contactBalances.contactId, contacts.id),
          eq(contactBalances.currency, 'MXN')
        )
      )
      .where(eq(contacts.id, id))
      .limit(1);

    if (contactResult.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Contacto no encontrado',
      }, { status: 404 });
    }

    // Obtener historial de transacciones
    const transactionHistory = await db
      .select()
      .from(transactions)
      .where(eq(transactions.contactId, id))
      .orderBy(desc(transactions.transactionDate))
      .limit(50);

    // Obtener todos los saldos en diferentes monedas
    const allBalances = await db
      .select()
      .from(contactBalances)
      .where(eq(contactBalances.contactId, id));

    const contact: ContactWithBalance = {
      ...contactResult[0].contact,
      balance: contactResult[0].balance || undefined,
    };

    return NextResponse.json<ApiResponse<{
      contact: ContactWithBalance;
      transactions: typeof transactionHistory;
      allBalances: typeof allBalances;
    }>>({
      success: true,
      data: {
        contact,
        transactions: transactionHistory,
        allBalances,
      },
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al obtener contacto',
    }, { status: 500 });
  }
}

// PUT - Actualizar contacto
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();

    const updated = await db
      .update(contacts)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Contacto no encontrado',
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<typeof updated[0]>>({
      success: true,
      data: updated[0],
      message: 'Contacto actualizado',
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al actualizar contacto',
    }, { status: 500 });
  }
}

// DELETE - Desactivar contacto (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);

    const updated = await db
      .update(contacts)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Contacto no encontrado',
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: 'Contacto desactivado',
    });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al eliminar contacto',
    }, { status: 500 });
  }
}
