import { NextRequest, NextResponse } from 'next/server';
import { processImage, transcribeAudio, processDocument, detectMediaType } from '@/lib/ai/media-processor';
import { brain } from '@/lib/ai/brain';
import { ApiResponse } from '@/types';

// POST - Procesar archivo multimedia
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const context = formData.get('context') as string | null;

    if (!file) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Se requiere un archivo',
      }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type;
    const mediaType = detectMediaType(mimeType);

    let result;

    switch (mediaType) {
      case 'image':
        result = await processImage(base64, mimeType, context || undefined);
        break;

      case 'audio':
        result = await transcribeAudio(Buffer.from(arrayBuffer), mimeType);
        break;

      case 'document':
        result = await processDocument(base64, file.name);
        break;

      default:
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: `Tipo de archivo no soportado: ${mimeType}`,
        }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Error al procesar el archivo',
      }, { status: 500 });
    }

    // Analizar el contenido extraído con el cerebro
    const analysis = await brain.analyze({
      type: mediaType === 'audio' ? 'audio' : mediaType === 'document' ? 'document' : 'image',
      content: result.extractedText,
      metadata: {
        filename: file.name,
        mimeType,
      },
    });

    return NextResponse.json<ApiResponse<{
      mediaResult: typeof result;
      analysis: typeof analysis;
    }>>({
      success: true,
      data: {
        mediaResult: result,
        analysis,
      },
    });
  } catch (error) {
    console.error('Error processing media:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al procesar el archivo',
    }, { status: 500 });
  }
}
