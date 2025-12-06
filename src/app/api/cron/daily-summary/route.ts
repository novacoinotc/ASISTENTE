import { NextRequest, NextResponse } from 'next/server';
import { reminderEngine } from '@/lib/ai/reminder-engine';
import { brain } from '@/lib/ai/brain';

// Este endpoint debería ser llamado por un cron job (ej: Vercel Cron)
// para enviar el resumen diario automáticamente

export async function GET(request: NextRequest) {
  try {
    // Verificar autorización (token secreto)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generar resumen diario
    const summary = await reminderEngine.generateAndSendDailySummary();

    // Generar resumen con IA
    const aiSummary = await brain.generateDailySummary();

    // Si hay número de WhatsApp configurado, enviar
    const ownerPhone = process.env.OWNER_WHATSAPP_NUMBER;

    if (ownerPhone) {
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

      if (phoneNumberId && accessToken) {
        // Enviar resumen por WhatsApp
        await fetch(
          `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: ownerPhone,
              type: 'text',
              text: { body: aiSummary },
            }),
          }
        );
      }
    }

    // Guardar recordatorios generados
    const reminders = await reminderEngine.generateSmartReminders();
    await reminderEngine.saveReminders(reminders);

    return NextResponse.json({
      success: true,
      summary,
      aiSummary,
      remindersGenerated: reminders.length,
    });
  } catch (error) {
    console.error('Error in daily summary cron:', error);
    return NextResponse.json(
      { error: 'Error generating daily summary' },
      { status: 500 }
    );
  }
}

// Configuración para Vercel Cron
export const dynamic = 'force-dynamic';
