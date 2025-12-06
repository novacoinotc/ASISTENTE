import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, contacts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ApiResponse, TransactionWithContact } from '@/types';

// GET - Obtener una transacción por ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);

    const result = await db
      .select({
        transaction: transactions,
        contact: contacts,
      })
      .from(transactions)
      .leftJoin(contacts, eq(transactions.contactId, contacts.id))
      .where(eq(transactions.id, id))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Transacción no encontrada',
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<TransactionWithContact>>({
      success: true,
      data: {
        ...result[0].transaction,
        contact: result[0].contact,
      },
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al obtener transacción',
    }, { status: 500 });
  }
}

// PUT - Actualizar transacción
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();

    const updated = await db
      .update(transactions)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Transacción no encontrada',
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<typeof updated[0]>>({
      success: true,
      data: updated[0],
      message: 'Transacción actualizada',
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al actualizar transacción',
    }, { status: 500 });
  }
}

// DELETE - Eliminar transacción
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);

    const deleted = await db
      .delete(transactions)
      .where(eq(transactions.id, id))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Transacción no encontrada',
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: 'Transacción eliminada',
    });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al eliminar transacción',
    }, { status: 500 });
  }
}
