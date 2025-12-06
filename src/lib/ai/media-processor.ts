import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface MediaProcessingResult {
  success: boolean;
  type: 'image' | 'audio' | 'document';
  extractedText: string;
  structuredData?: {
    amounts?: { value: number; currency: string; context: string }[];
    dates?: { date: string; context: string }[];
    people?: { name: string; role: string }[];
    references?: string[];
    type?: string; // 'comprobante', 'factura', 'cotizacion', 'contrato', etc.
  };
  confidence: number;
  rawAnalysis?: string;
}

// Procesa imágenes usando GPT-4 Vision
export async function processImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  context?: string
): Promise<MediaProcessingResult> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'system',
          content: `Eres un experto en extraer información financiera de imágenes.
Analiza la imagen y extrae TODA la información relevante.

Si es un comprobante de transferencia, extrae:
- Monto exacto
- Fecha y hora
- Cuenta origen y destino
- Referencia/folio
- Concepto
- Banco emisor y receptor

Si es una factura, extrae:
- Total
- Subtotal e IVA
- Fecha
- RFC emisor y receptor
- Conceptos
- Folio fiscal

Si es una cotización, extrae:
- Productos/servicios
- Precios
- Total
- Validez
- Condiciones de pago

Responde en JSON con esta estructura:
{
  "type": "comprobante|factura|cotizacion|contrato|otro",
  "extractedText": "Todo el texto visible",
  "amounts": [{"value": 1000.00, "currency": "MXN", "context": "Total de la factura"}],
  "dates": [{"date": "2024-01-15", "context": "Fecha de emisión"}],
  "people": [{"name": "Juan Pérez", "role": "emisor"}],
  "references": ["ABC123456"],
  "summary": "Resumen en español de lo que es el documento"
}`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: context || 'Analiza esta imagen y extrae toda la información financiera.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content || '';

    // Intentar parsear como JSON
    try {
      const parsed = JSON.parse(content);
      return {
        success: true,
        type: 'image',
        extractedText: parsed.extractedText || content,
        structuredData: {
          amounts: parsed.amounts,
          dates: parsed.dates,
          people: parsed.people,
          references: parsed.references,
          type: parsed.type,
        },
        confidence: 0.9,
        rawAnalysis: parsed.summary,
      };
    } catch {
      return {
        success: true,
        type: 'image',
        extractedText: content,
        confidence: 0.7,
        rawAnalysis: content,
      };
    }
  } catch (error) {
    console.error('Error processing image:', error);
    return {
      success: false,
      type: 'image',
      extractedText: '',
      confidence: 0,
    };
  }
}

// Transcribe audio usando Whisper
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string = 'audio/ogg'
): Promise<MediaProcessingResult> {
  try {
    // Crear un File-like object para la API
    const audioFile = new File([audioBuffer], 'audio.ogg', { type: mimeType });

    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'es',
      response_format: 'verbose_json',
    });

    const transcription = response.text;

    // Ahora analizar el contenido de la transcripción
    const analysisResponse = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `Analiza esta transcripción de audio y extrae información financiera.
Busca: montos de dinero, nombres de personas, fechas, compromisos de pago, deudas mencionadas.

Responde en JSON:
{
  "amounts": [{"value": 1000, "currency": "MXN", "context": "lo que mencionó"}],
  "dates": [{"date": "2024-01-15", "context": "para cuando"}],
  "people": [{"name": "nombre", "role": "cliente|proveedor|otro"}],
  "commitments": ["compromiso detectado"],
  "summary": "Resumen de lo que se habló"
}`,
        },
        {
          role: 'user',
          content: `Transcripción del audio:\n"${transcription}"`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const analysis = JSON.parse(analysisResponse.choices[0].message.content || '{}');

    return {
      success: true,
      type: 'audio',
      extractedText: transcription,
      structuredData: {
        amounts: analysis.amounts,
        dates: analysis.dates,
        people: analysis.people,
      },
      confidence: 0.85,
      rawAnalysis: analysis.summary,
    };
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return {
      success: false,
      type: 'audio',
      extractedText: '',
      confidence: 0,
    };
  }
}

// Procesa documentos PDF (extrae texto e imágenes)
export async function processDocument(
  documentBase64: string,
  filename: string
): Promise<MediaProcessingResult> {
  try {
    // Para PDFs, usamos Vision si el PDF fue convertido a imagen
    // O podemos usar un servicio de OCR externo

    // Por ahora, si el PDF fue convertido a imagen(s), procesamos cada página
    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'system',
          content: `Analiza este documento y extrae toda la información financiera.
Si es un estado de cuenta, extrae saldos, movimientos, fechas.
Si es un contrato, extrae partes involucradas, montos, fechas, condiciones.
Si es una cotización, extrae productos, precios, condiciones.

Responde en JSON con la información estructurada.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Documento: ${filename}. Analiza y extrae toda la información.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${documentBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 3000,
    });

    const content = response.choices[0].message.content || '';

    try {
      const parsed = JSON.parse(content);
      return {
        success: true,
        type: 'document',
        extractedText: parsed.extractedText || content,
        structuredData: parsed,
        confidence: 0.85,
        rawAnalysis: parsed.summary,
      };
    } catch {
      return {
        success: true,
        type: 'document',
        extractedText: content,
        confidence: 0.7,
        rawAnalysis: content,
      };
    }
  } catch (error) {
    console.error('Error processing document:', error);
    return {
      success: false,
      type: 'document',
      extractedText: '',
      confidence: 0,
    };
  }
}

// Analiza una conversación completa de WhatsApp
export async function analyzeConversation(
  messages: { sender: string; text: string; timestamp: Date }[]
): Promise<{
  transactions: any[];
  commitments: any[];
  pendingItems: any[];
  summary: string;
}> {
  try {
    const conversationText = messages
      .map((m) => `[${m.sender}]: ${m.text}`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `Analiza esta conversación de WhatsApp y extrae TODA la información financiera.

Busca:
1. Transacciones mencionadas (préstamos, pagos, ventas, compras)
2. Compromisos de pago o cobro
3. Deudas pendientes
4. Acuerdos de negocio
5. Fechas importantes

Responde en JSON:
{
  "transactions": [
    {
      "type": "loan_given|loan_received|income|expense|payment",
      "amount": 1000,
      "currency": "MXN",
      "person": "nombre",
      "description": "contexto",
      "date": "fecha si se menciona"
    }
  ],
  "commitments": [
    {
      "type": "payment|collection|meeting",
      "description": "qué se comprometió",
      "person": "quién",
      "dueDate": "para cuándo",
      "amount": 1000
    }
  ],
  "pendingItems": [
    {
      "description": "algo que quedó pendiente",
      "person": "con quién",
      "urgency": "low|medium|high"
    }
  ],
  "summary": "Resumen de la conversación en términos financieros"
}`,
        },
        {
          role: 'user',
          content: `CONVERSACIÓN:\n${conversationText}`,
        },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    return {
      transactions: result.transactions || [],
      commitments: result.commitments || [],
      pendingItems: result.pendingItems || [],
      summary: result.summary || '',
    };
  } catch (error) {
    console.error('Error analyzing conversation:', error);
    return {
      transactions: [],
      commitments: [],
      pendingItems: [],
      summary: 'Error al analizar la conversación',
    };
  }
}

// Detecta el tipo de contenido multimedia
export function detectMediaType(
  mimeType: string
): 'image' | 'audio' | 'document' | 'unknown' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet')
  ) {
    return 'document';
  }
  return 'unknown';
}
