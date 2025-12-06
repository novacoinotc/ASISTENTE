import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatear moneda
export function formatCurrency(
  amount: number | string,
  currency: string = 'MXN'
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  const currencyFormats: Record<string, { locale: string; currency: string }> = {
    MXN: { locale: 'es-MX', currency: 'MXN' },
    USD: { locale: 'en-US', currency: 'USD' },
    EUR: { locale: 'de-DE', currency: 'EUR' },
    USDT: { locale: 'en-US', currency: 'USD' },
    BTC: { locale: 'en-US', currency: 'BTC' },
    ETH: { locale: 'en-US', currency: 'ETH' },
  };

  const format = currencyFormats[currency] || currencyFormats.MXN;

  if (currency === 'BTC' || currency === 'ETH') {
    return `${num.toFixed(8)} ${currency}`;
  }

  return new Intl.NumberFormat(format.locale, {
    style: 'currency',
    currency: format.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// Formatear fecha
export function formatDate(date: Date | string, format: 'short' | 'long' | 'relative' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (format === 'relative') {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;
    if (days < 30) return `Hace ${Math.floor(days / 7)} semanas`;
    return `Hace ${Math.floor(days / 30)} meses`;
  }

  if (format === 'long') {
    return d.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  return d.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// Obtener color por tipo de transacción
export function getTransactionColor(type: string): string {
  const colors: Record<string, string> = {
    income: 'text-green-600 bg-green-50',
    expense: 'text-red-600 bg-red-50',
    loan_given: 'text-orange-600 bg-orange-50',
    loan_received: 'text-blue-600 bg-blue-50',
    loan_payment_received: 'text-emerald-600 bg-emerald-50',
    loan_payment_made: 'text-purple-600 bg-purple-50',
    transfer: 'text-gray-600 bg-gray-50',
  };
  return colors[type] || 'text-gray-600 bg-gray-50';
}

// Obtener icono por categoría
export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    banco: '🏦',
    despacho_fiscal: '📊',
    crypto: '₿',
    divisas: '💱',
    efectivo: '💵',
    prestamos: '🤝',
    soluciones_financieras: '📈',
    internacional: '🌍',
    otro: '📁',
  };
  return icons[category] || '📁';
}

// Obtener nombre legible de categoría
export function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    banco: 'Banco',
    despacho_fiscal: 'Despacho Fiscal',
    crypto: 'Crypto',
    divisas: 'Divisas',
    efectivo: 'Efectivo',
    prestamos: 'Préstamos',
    soluciones_financieras: 'Soluciones Financieras',
    internacional: 'Internacional',
    otro: 'Otro',
  };
  return names[category] || category;
}

// Obtener nombre legible de tipo de transacción
export function getTransactionTypeName(type: string): string {
  const names: Record<string, string> = {
    income: 'Ingreso',
    expense: 'Gasto',
    loan_given: 'Préstamo otorgado',
    loan_received: 'Préstamo recibido',
    loan_payment_received: 'Cobro de préstamo',
    loan_payment_made: 'Pago de préstamo',
    transfer: 'Transferencia',
  };
  return names[type] || type;
}

// Calcular si el saldo es positivo o negativo desde la perspectiva del usuario
export function getBalanceDirection(theyOweMe: number, iOweThem: number): {
  direction: 'positive' | 'negative' | 'neutral';
  amount: number;
  label: string;
} {
  const net = theyOweMe - iOweThem;

  if (net > 0) {
    return {
      direction: 'positive',
      amount: net,
      label: 'Te deben',
    };
  } else if (net < 0) {
    return {
      direction: 'negative',
      amount: Math.abs(net),
      label: 'Debes',
    };
  }

  return {
    direction: 'neutral',
    amount: 0,
    label: 'Sin saldo',
  };
}

// Generar iniciales de un nombre
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Truncar texto
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + '...';
}
