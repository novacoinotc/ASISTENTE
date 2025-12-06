import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, contacts, contactBalances } from '@/db/schema';
import { eq, desc, and, gte, lte, like, sql } from 'drizzle-orm';
import { ApiResponse, TransactionWithContact, NewTransaction, TransactionFilters } from '@/types';

// GET - Obtener transacciones con filtros
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parsear filtros
    const filters: TransactionFilters = {
      startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
      endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      type: searchParams.get('type') as TransactionFilters['type'],
      category: searchParams.get('category') as TransactionFilters['category'],
      contactId: searchParams.get('contactId') ? parseInt(searchParams.get('contactId')!) : undefined,
      status: searchParams.get('status') as TransactionFilters['status'],
      search: searchParams.get('search') || undefined,
    };

    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Construir condiciones
    const conditions = [];

    if (filters.startDate) {
      conditions.push(gte(transactions.transactionDate, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(transactions.transactionDate, filters.endDate));
    }
    if (filters.type) {
      conditions.push(eq(transactions.type, filters.type));
    }
    if (filters.category) {
      conditions.push(eq(transactions.category, filters.category));
    }
    if (filters.contactId) {
      conditions.push(eq(transactions.contactId, filters.contactId));
    }
    if (filters.status) {
      conditions.push(eq(transactions.status, filters.status));
    }
    if (filters.search) {
      conditions.push(like(transactions.description, `%${filters.search}%`));
    }

    // Ejecutar query
    const result = await db
      .select({
        transaction: transactions,
        contact: contacts,
      })
      .from(transactions)
      .leftJoin(contacts, eq(transactions.contactId, contacts.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transactions.transactionDate))
      .limit(limit)
      .offset(offset);

    // Formatear respuesta
    const transactionsWithContacts: TransactionWithContact[] = result.map(row => ({
      ...row.transaction,
      contact: row.contact,
    }));

    return NextResponse.json<ApiResponse<TransactionWithContact[]>>({
      success: true,
      data: transactionsWithContacts,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al obtener transacciones',
    }, { status: 500 });
  }
}

// POST - Crear nueva transacción
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      type,
      category,
      amount,
      currency = 'MXN',
      contactId,
      contactName, // Para crear contacto si no existe
      description,
      originalMessage,
      reference,
      status = 'completed',
      transactionDate,
      dueDate,
      exchangeRate,
    } = body;

    // Validar campos requeridos
    if (!type || !category || !amount || !description) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Faltan campos requeridos: type, category, amount, description',
      }, { status: 400 });
    }

    let resolvedContactId = contactId;

    // Si se proporciona nombre de contacto pero no ID, buscar o crear
    if (!contactId && contactName) {
      const existingContact = await db
        .select()
        .from(contacts)
        .where(eq(contacts.name, contactName))
        .limit(1);

      if (existingContact.length > 0) {
        resolvedContactId = existingContact[0].id;
      } else {
        // Crear nuevo contacto
        const newContact = await db
          .insert(contacts)
          .values({ name: contactName })
          .returning();
        resolvedContactId = newContact[0].id;
      }
    }

    // Calcular monto en MXN si hay tipo de cambio
    let amountInMxn = null;
    if (exchangeRate && currency !== 'MXN') {
      amountInMxn = parseFloat(amount) * parseFloat(exchangeRate);
    }

    // Crear transacción
    const newTransaction: NewTransaction = {
      type,
      category,
      amount: amount.toString(),
      currency,
      contactId: resolvedContactId,
      description,
      originalMessage,
      reference,
      status,
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      exchangeRate: exchangeRate?.toString(),
      amountInMxn: amountInMxn?.toString(),
    };

    const inserted = await db
      .insert(transactions)
      .values(newTransaction)
      .returning();

    // Actualizar saldos si hay contacto
    if (resolvedContactId) {
      await updateContactBalance(resolvedContactId, type, parseFloat(amount), currency);
    }

    // Obtener transacción con contacto
    const result = await db
      .select({
        transaction: transactions,
        contact: contacts,
      })
      .from(transactions)
      .leftJoin(contacts, eq(transactions.contactId, contacts.id))
      .where(eq(transactions.id, inserted[0].id))
      .limit(1);

    return NextResponse.json<ApiResponse<TransactionWithContact>>({
      success: true,
      data: {
        ...result[0].transaction,
        contact: result[0].contact,
      },
      message: 'Transacción creada exitosamente',
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al crear transacción',
    }, { status: 500 });
  }
}

// Función auxiliar para actualizar saldos
async function updateContactBalance(
  contactId: number,
  type: string,
  amount: number,
  currency: string
) {
  try {
    // Buscar balance existente
    const existingBalance = await db
      .select()
      .from(contactBalances)
      .where(
        and(
          eq(contactBalances.contactId, contactId),
          eq(contactBalances.currency, currency as any)
        )
      )
      .limit(1);

    let theyOweMe = 0;
    let iOweThem = 0;

    if (existingBalance.length > 0) {
      theyOweMe = parseFloat(existingBalance[0].theyOweMe || '0');
      iOweThem = parseFloat(existingBalance[0].iOweThem || '0');
    }

    // Actualizar según tipo de transacción
    switch (type) {
      case 'loan_given':
        theyOweMe += amount;
        break;
      case 'loan_received':
        iOweThem += amount;
        break;
      case 'loan_payment_received':
        theyOweMe = Math.max(0, theyOweMe - amount);
        break;
      case 'loan_payment_made':
        iOweThem = Math.max(0, iOweThem - amount);
        break;
    }

    const netBalance = theyOweMe - iOweThem;

    if (existingBalance.length > 0) {
      await db
        .update(contactBalances)
        .set({
          theyOweMe: theyOweMe.toString(),
          iOweThem: iOweThem.toString(),
          netBalance: netBalance.toString(),
          lastTransactionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contactBalances.id, existingBalance[0].id));
    } else {
      await db
        .insert(contactBalances)
        .values({
          contactId,
          currency: currency as any,
          theyOweMe: theyOweMe.toString(),
          iOweThem: iOweThem.toString(),
          netBalance: netBalance.toString(),
          lastTransactionAt: new Date(),
        });
    }
  } catch (error) {
    console.error('Error updating contact balance:', error);
  }
}
