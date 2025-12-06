import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts, contacts } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { reminderEngine } from '@/lib/ai/reminder-engine';
import { ApiResponse } from '@/types';

// GET - Obtener recordatorios inteligentes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const autoGenerate = searchParams.get('autoGenerate') === 'true';

    if (autoGenerate) {
      // Generar recordatorios inteligentes basados en el estado actual
      const smartReminders = await reminderEngine.generateSmartReminders();

      return NextResponse.json<ApiResponse<typeof smartReminders>>({
        success: true,
        data: smartReminders,
      });
    }

    // Obtener recordatorios guardados de la BD
    const savedReminders = await db
      .select({
        alert: alerts,
        contact: contacts,
      })
      .from(alerts)
      .leftJoin(contacts, eq(alerts.contactId, contacts.id))
      .where(eq(alerts.isDismissed, false))
      .orderBy(desc(alerts.createdAt))
      .limit(50);

    return NextResponse.json<ApiResponse<typeof savedReminders>>({
      success: true,
      data: savedReminders,
    });
  } catch (error) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al obtener recordatorios',
    }, { status: 500 });
  }
}

// POST - Crear recordatorio manual
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, message, contactId, dueDate } = body;

    if (!message) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Se requiere un mensaje',
      }, { status: 400 });
    }

    const newAlert = await db
      .insert(alerts)
      .values({
        type: type || 'reminder',
        message,
        contactId,
        dueDate: dueDate ? new Date(dueDate) : null,
      })
      .returning();

    return NextResponse.json<ApiResponse<typeof newAlert[0]>>({
      success: true,
      data: newAlert[0],
      message: 'Recordatorio creado',
    });
  } catch (error) {
    console.error('Error creating reminder:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al crear recordatorio',
    }, { status: 500 });
  }
}

// PUT - Marcar recordatorio como leído/descartado
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, isRead, isDismissed } = body;

    if (!id) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Se requiere ID del recordatorio',
      }, { status: 400 });
    }

    const updated = await db
      .update(alerts)
      .set({
        isRead: isRead !== undefined ? isRead : undefined,
        isDismissed: isDismissed !== undefined ? isDismissed : undefined,
      })
      .where(eq(alerts.id, id))
      .returning();

    return NextResponse.json<ApiResponse<typeof updated[0]>>({
      success: true,
      data: updated[0],
    });
  } catch (error) {
    console.error('Error updating reminder:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al actualizar recordatorio',
    }, { status: 500 });
  }
}
