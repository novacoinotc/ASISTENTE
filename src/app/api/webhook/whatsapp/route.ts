import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { whatsappMessages, transactions, contacts, alerts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { brain, MessageContext } from '@/lib/ai/brain';
import { processImage, transcribeAudio, processDocument, detectMediaType } from '@/lib/ai/media-processor';
import { conversationalAgent } from '@/lib/ai/conversational-agent';
import { reminderEngine } from '@/lib/ai/reminder-engine';

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

// POST - Recibir mensajes de WhatsApp (texto, imagen, audio, documento)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Verificar que es un mensaje válido
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' });
    }

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const messages = change.value.messages || [];
        const contactInfo = change.value.contacts?.[0];

        for (const message of messages) {
          await processWhatsAppMessage(message, contactInfo);
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}

async function processWhatsAppMessage(message: any, contactInfo?: any) {
  const senderPhone = message.from;
  const senderName = contactInfo?.profile?.name || senderPhone;
  const timestamp = new Date(parseInt(message.timestamp) * 1000);

  let messageContent: MessageContext | null = null;
  let rawContent = '';

  try {
    // Procesar según tipo de mensaje
    switch (message.type) {
      case 'text':
        rawContent = message.text?.body || '';
        messageContent = {
          type: 'text',
          content: rawContent,
          sender: senderName,
          timestamp,
        };
        break;

      case 'image':
        // Descargar y procesar imagen
        const imageData = await downloadWhatsAppMedia(message.image.id);
        if (imageData) {
          const imageResult = await processImage(
            imageData.base64,
            imageData.mimeType,
            message.image.caption
          );
          rawContent = imageResult.rawAnalysis || imageResult.extractedText;
          messageContent = {
            type: 'image',
            content: rawContent,
            sender: senderName,
            timestamp,
            metadata: {
              mimeType: imageData.mimeType,
            },
          };
        }
        break;

      case 'audio':
        // Transcribir audio
        const audioData = await downloadWhatsAppMedia(message.audio.id);
        if (audioData) {
          const audioResult = await transcribeAudio(
            Buffer.from(audioData.base64, 'base64'),
            audioData.mimeType
          );
          rawContent = audioResult.extractedText;
          messageContent = {
            type: 'audio',
            content: rawContent,
            sender: senderName,
            timestamp,
          };
        }
        break;

      case 'document':
        // Procesar documento (PDF, etc.)
        const docData = await downloadWhatsAppMedia(message.document.id);
        if (docData) {
          const docResult = await processDocument(
            docData.base64,
            message.document.filename
          );
          rawContent = docResult.rawAnalysis || docResult.extractedText;
          messageContent = {
            type: 'document',
            content: rawContent,
            sender: senderName,
            timestamp,
            metadata: {
              filename: message.document.filename,
              mimeType: docData.mimeType,
            },
          };
        }
        break;

      case 'voice':
        // Las notas de voz también se transcriben
        const voiceData = await downloadWhatsAppMedia(message.voice.id);
        if (voiceData) {
          const voiceResult = await transcribeAudio(
            Buffer.from(voiceData.base64, 'base64'),
            'audio/ogg'
          );
          rawContent = voiceResult.extractedText;
          messageContent = {
            type: 'audio',
            content: rawContent,
            sender: senderName,
            timestamp,
          };
        }
        break;

      default:
        console.log(`Tipo de mensaje no soportado: ${message.type}`);
        return;
    }

    if (!messageContent || !rawContent) {
      console.log('No se pudo extraer contenido del mensaje');
      return;
    }

    // Guardar mensaje en BD
    const savedMessage = await db
      .insert(whatsappMessages)
      .values({
        messageId: message.id,
        from: senderPhone,
        body: rawContent,
        receivedAt: timestamp,
      })
      .returning();

    // Analizar con el cerebro de IA
    const analysis = await brain.analyze(messageContent);

    // Procesar según el análisis
    if (analysis.understood) {
      // Si detectó transacciones, ya fueron creadas por el brain
      if (analysis.extracted_data.transactions?.length) {
        await db
          .update(whatsappMessages)
          .set({
            wasProcessed: true,
            processingNotes: `${analysis.extracted_data.transactions.length} transacción(es) detectada(s)`,
            processedAt: new Date(),
          })
          .where(eq(whatsappMessages.id, savedMessage[0].id));

        // Enviar confirmación
        await sendWhatsAppMessage(senderPhone, analysis.response_to_user ||
          `✅ Registrado: ${analysis.analysis.summary}`);
      }

      // Si detectó recordatorios, también fueron creados
      if (analysis.extracted_data.reminders?.length) {
        await sendWhatsAppMessage(senderPhone,
          `📅 Recordatorio creado: ${analysis.extracted_data.reminders[0].message || 'Pendiente registrado'}`);
      }

      // Si hay una respuesta que dar
      if (analysis.response_to_user && analysis.type === 'question') {
        await sendWhatsAppMessage(senderPhone, analysis.response_to_user);
      }

      // Guardar aprendizajes
      if (analysis.learning?.new_pattern) {
        console.log('Nuevo patrón detectado:', analysis.learning.new_pattern);
      }

    } else {
      // Si no se entendió como transacción, quizá es una pregunta
      // Usar el agente conversacional
      if (isQuestion(rawContent)) {
        const response = await conversationalAgent.chat(rawContent);
        await sendWhatsAppMessage(senderPhone, response);
      }

      await db
        .update(whatsappMessages)
        .set({
          wasProcessed: true,
          processingNotes: 'Mensaje procesado, sin transacción detectada',
          processedAt: new Date(),
        })
        .where(eq(whatsappMessages.id, savedMessage[0].id));
    }

  } catch (error) {
    console.error('Error processing message:', error);
  }
}

// Descargar media de WhatsApp
async function downloadWhatsAppMedia(mediaId: string): Promise<{
  base64: string;
  mimeType: string;
} | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!accessToken) {
    console.log('WhatsApp API no configurada');
    return null;
  }

  try {
    // Primero obtener la URL del media
    const mediaInfoRes = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const mediaInfo = await mediaInfoRes.json();

    if (!mediaInfo.url) {
      console.error('No se pudo obtener URL del media');
      return null;
    }

    // Descargar el archivo
    const mediaRes = await fetch(mediaInfo.url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const arrayBuffer = await mediaRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return {
      base64,
      mimeType: mediaInfo.mime_type || 'application/octet-stream',
    };
  } catch (error) {
    console.error('Error downloading WhatsApp media:', error);
    return null;
  }
}

// Enviar mensaje por WhatsApp
async function sendWhatsAppMessage(to: string, message: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.log('WhatsApp API no configurada, mensaje no enviado:', message);
    return;
  }

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
    console.error('Error sending WhatsApp message:', error);
  }
}

// Detectar si es una pregunta
function isQuestion(text: string): boolean {
  const questionPatterns = [
    /\?$/,
    /^(cuánto|cuanto|cuantos|cuántos|cuál|cual|qué|que|cómo|como|dónde|donde|quién|quien|por qué|por que)/i,
    /^(dame|dime|muéstrame|muestrame|necesito|quiero saber)/i,
    /^(hay|tiene|tengo|están|estan)/i,
    /(resumen|reporte|informe|balance|saldo)/i,
  ];

  return questionPatterns.some(pattern => pattern.test(text.trim()));
}

// Función interna para enviar resumen diario (usada por /api/cron/daily-summary)
async function sendDailySummary(phoneNumber: string) {
  const summary = await reminderEngine.generateAndSendDailySummary();
  await sendWhatsAppMessage(phoneNumber, summary);
}
