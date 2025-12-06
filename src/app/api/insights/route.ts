import { NextRequest, NextResponse } from 'next/server';
import { learningSystem } from '@/lib/ai/learning-system';
import { reminderEngine } from '@/lib/ai/reminder-engine';
import { brain } from '@/lib/ai/brain';
import { ApiResponse } from '@/types';

// GET - Obtener insights y predicciones
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    const data: any = {};

    if (type === 'all' || type === 'insights') {
      data.insights = await learningSystem.generateInsights();
    }

    if (type === 'all' || type === 'patterns') {
      data.patterns = await learningSystem.detectGlobalPatterns();
    }

    if (type === 'all' || type === 'predictions') {
      data.predictions = await learningSystem.predictUpcomingTransactions();
    }

    if (type === 'all' || type === 'summary') {
      data.dailySummary = await brain.generateDailySummary();
    }

    return NextResponse.json<ApiResponse<typeof data>>({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error generating insights:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al generar insights',
    }, { status: 500 });
  }
}

// POST - Analizar contacto específico
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId } = body;

    if (!contactId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Se requiere contactId',
      }, { status: 400 });
    }

    const profile = await learningSystem.analyzeContactBehavior(contactId);

    if (!profile) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Contacto no encontrado',
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<typeof profile>>({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Error analyzing contact:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Error al analizar contacto',
    }, { status: 500 });
  }
}
