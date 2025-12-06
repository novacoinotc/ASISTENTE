import { NextRequest, NextResponse } from 'next/server';
import { smartParse, generateTransactionSummary } from '@/lib/transaction-parser';
import { ApiResponse, ParsedTransaction } from '@/types';

// POST - Parsear mensaje de texto a transacción
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Se requiere un mensaje de texto',
      }, { status: 400 });
    }

    // Parsear el mensaje
    const parsed = await smartParse(message);

    if (!parsed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'No se pudo interpretar el mensaje como una transacción',
      }, { status: 422 });
    }

    // Generar resumen
    const summary = generateTransactionSummary(parsed);

    return NextResponse.json<ApiResponse<{ parsed: ParsedTransaction; summary: string }>>({
      success: true,
      data: {
        parsed,
        summary,
      },
    });
  } catch (error) {
    console.error('Error parsing message:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al procesar el mensaje',
    }, { status: 500 });
  }
}
