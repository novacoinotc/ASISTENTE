import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { whatsappMessages, transactions, contacts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { smartParse } from '@/lib/transaction-parser';
import { WhatsAppWebhookPayload } from '@/types';

// GET - Verificación del webhook (requerido por Meta)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verificado correctamente');
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST - Recibir mensajes de WhatsApp
export async function POST(request: NextRequest) {
  try {
    const body: WhatsAppWebhookPayload = await request.json();

    // Verificar que es un mensaje válido
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' });
    }

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const messages = change.value.messages || [];

        for (const message of messages) {
          if (message.type !== 'text') continue;

          const messageBody = message.text?.body;
          if (!messageBody) continue;

          // Guardar mensaje en la BD
          const savedMessage = await db
            .insert(whatsappMessages)
            .values({
              messageId: message.id,
              from: message.from,
              body: messageBody,
              receivedAt: new Date(parseInt(message.timestamp) * 1000),
            })
            .returning();

          // Intentar parsear como transacción
          const parsed = await smartParse(messageBody);

          if (parsed && parsed.confidence >= 0.6) {
            // Buscar o crear contacto basado en el número
            let contactId: number | null = null;

            if (parsed.contactName) {
              const existingContact = await db
                .select()
                .from(contacts)
                .where(eq(contacts.name, parsed.contactName))
                .limit(1);

              if (existingContact.length > 0) {
                contactId = existingContact[0].id;
              } else {
                const newContact = await db
                  .insert(contacts)
                  .values({ name: parsed.contactName })
                  .returning();
                contactId = newContact[0].id;
              }
            }

            // Crear transacción
            const newTransaction = await db
              .insert(transactions)
              .values({
                type: parsed.type,
                category: parsed.category,
                amount: parsed.amount.toString(),
                currency: parsed.currency,
                contactId,
                description: parsed.description,
                originalMessage: messageBody,
                status: parsed.status,
                dueDate: parsed.dueDate,
                reference: parsed.reference,
              })
              .returning();

            // Actualizar el mensaje como procesado
            await db
              .update(whatsappMessages)
              .set({
                wasProcessed: true,
                extractedTransactionId: newTransaction[0].id,
                processedAt: new Date(),
              })
              .where(eq(whatsappMessages.id, savedMessage[0].id));

            // Opcional: Enviar confirmación por WhatsApp
            await sendWhatsAppConfirmation(
              message.from,
              parsed,
              newTransaction[0].id
            );
          } else {
            // Mensaje no reconocido como transacción
            await db
              .update(whatsappMessages)
              .set({
                wasProcessed: true,
                processingNotes: 'No se reconoció como transacción',
                processedAt: new Date(),
              })
              .where(eq(whatsappMessages.id, savedMessage[0].id));
          }
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}

// Enviar confirmación por WhatsApp
async function sendWhatsAppConfirmation(
  to: string,
  parsed: any,
  transactionId: number
) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.log('WhatsApp API no configurada, saltando confirmación');
    return;
  }

  const typeNames: Record<string, string> = {
    income: '💰 Ingreso',
    expense: '💸 Gasto',
    loan_given: '🤝 Préstamo otorgado',
    loan_received: '📥 Préstamo recibido',
    loan_payment_received: '✅ Cobro de préstamo',
    loan_payment_made: '💳 Pago de préstamo',
    transfer: '🔄 Transferencia',
  };

  const message = `✅ Transacción registrada (#${transactionId})

${typeNames[parsed.type] || parsed.type}
💵 Monto: $${parsed.amount.toLocaleString()} ${parsed.currency}
${parsed.contactName ? `👤 Contacto: ${parsed.contactName}` : ''}
📝 ${parsed.description}

Para ver más detalles, visita tu dashboard.`;

  try {
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
          to,
          type: 'text',
          text: { body: message },
        }),
      }
    );
  } catch (error) {
    console.error('Error sending WhatsApp confirmation:', error);
  }
}
