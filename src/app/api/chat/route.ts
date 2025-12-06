import { NextRequest, NextResponse } from 'next/server';
import { conversationalAgent } from '@/lib/ai/conversational-agent';
import { brain } from '@/lib/ai/brain';
import { ApiResponse } from '@/types';

// POST - Chat con el asistente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, mode = 'chat' } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Se requiere un mensaje de texto',
      }, { status: 400 });
    }

    let response: string;

    if (mode === 'analyze') {
      // Modo análisis completo (para transacciones)
      const analysis = await brain.analyze({
        type: 'text',
        content: message,
      });

      return NextResponse.json<ApiResponse<{
        response: string;
        analysis: typeof analysis;
      }>>({
        success: true,
        data: {
          response: analysis.response_to_user || analysis.analysis.summary,
          analysis,
        },
      });
    } else {
      // Modo chat simple (para preguntas)
      response = await conversationalAgent.chat(message);

      return NextResponse.json<ApiResponse<{ response: string }>>({
        success: true,
        data: { response },
      });
    }
  } catch (error) {
    console.error('Error in chat:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al procesar el mensaje',
    }, { status: 500 });
  }
}

// DELETE - Limpiar historial de conversación
export async function DELETE() {
  try {
    conversationalAgent.clearHistory();

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: 'Historial de conversación limpiado',
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al limpiar historial',
    }, { status: 500 });
  }
}
