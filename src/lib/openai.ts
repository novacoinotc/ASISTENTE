import OpenAI from 'openai';

// Lazy initialization para evitar errores durante el build
let _openai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

// Para compatibilidad - proxy que inicializa lazy
export const openai = new Proxy({} as OpenAI, {
  get(_, prop) {
    return getOpenAI()[prop as keyof OpenAI];
  },
});
