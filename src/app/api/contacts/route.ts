import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { contacts, contactBalances, transactions } from '@/db/schema';
import { eq, desc, like, sql, and } from 'drizzle-orm';
import { ApiResponse, Contact, ContactWithBalance, NewContact } from '@/types';

// GET - Obtener todos los contactos con sus saldos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const withBalance = searchParams.get('withBalance') !== 'false';
    const onlyWithBalance = searchParams.get('onlyWithBalance') === 'true';

    // Construir condición where
    const whereCondition = search
      ? and(eq(contacts.isActive, true), like(contacts.name, `%${search}%`))
      : eq(contacts.isActive, true);

    const result = await db
      .select({
        contact: contacts,
        balance: contactBalances,
        transactionCount: sql<number>`(
          SELECT COUNT(*) FROM ${transactions}
          WHERE ${transactions.contactId} = ${contacts.id}
        )`,
      })
      .from(contacts)
      .leftJoin(
        contactBalances,
        and(
          eq(contactBalances.contactId, contacts.id),
          eq(contactBalances.currency, 'MXN')
        )
      )
      .where(whereCondition)
      .orderBy(desc(contacts.updatedAt));

    // Filtrar y formatear
    let contactsWithBalance: ContactWithBalance[] = result.map(row => ({
      ...row.contact,
      balance: row.balance || undefined,
      totalTransactions: row.transactionCount,
    }));

    // Filtrar solo los que tienen saldo pendiente
    if (onlyWithBalance) {
      contactsWithBalance = contactsWithBalance.filter(c => {
        if (!c.balance) return false;
        const net = parseFloat(c.balance.netBalance || '0');
        return net !== 0;
      });
    }

    return NextResponse.json<ApiResponse<ContactWithBalance[]>>({
      success: true,
      data: contactsWithBalance,
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al obtener contactos',
    }, { status: 500 });
  }
}

// POST - Crear nuevo contacto
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, email, company, notes } = body;

    if (!name) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'El nombre es requerido',
      }, { status: 400 });
    }

    const newContact: NewContact = {
      name,
      phone,
      email,
      company,
      notes,
    };

    const inserted = await db
      .insert(contacts)
      .values(newContact)
      .returning();

    return NextResponse.json<ApiResponse<Contact>>({
      success: true,
      data: inserted[0],
      message: 'Contacto creado exitosamente',
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al crear contacto',
    }, { status: 500 });
  }
}
