import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  contacts,
  transactions,
  contactBalances,
  dailySummaries,
  alerts,
  whatsappMessages,
} from '@/db/schema';

// Tipos de modelo (SELECT)
export type Contact = InferSelectModel<typeof contacts>;
export type Transaction = InferSelectModel<typeof transactions>;
export type ContactBalance = InferSelectModel<typeof contactBalances>;
export type DailySummary = InferSelectModel<typeof dailySummaries>;
export type Alert = InferSelectModel<typeof alerts>;
export type WhatsappMessage = InferSelectModel<typeof whatsappMessages>;

// Tipos para INSERT
export type NewContact = InferInsertModel<typeof contacts>;
export type NewTransaction = InferInsertModel<typeof transactions>;
export type NewContactBalance = InferInsertModel<typeof contactBalances>;
export type NewDailySummary = InferInsertModel<typeof dailySummaries>;
export type NewAlert = InferInsertModel<typeof alerts>;
export type NewWhatsappMessage = InferInsertModel<typeof whatsappMessages>;

// Tipos para el parser de transacciones
export type TransactionType =
  | 'income'
  | 'expense'
  | 'loan_given'
  | 'loan_received'
  | 'loan_payment_received'
  | 'loan_payment_made'
  | 'transfer';

export type BusinessCategory =
  | 'banco'
  | 'despacho_fiscal'
  | 'crypto'
  | 'divisas'
  | 'efectivo'
  | 'prestamos'
  | 'soluciones_financieras'
  | 'internacional'
  | 'otro';

export type Currency = 'MXN' | 'USD' | 'EUR' | 'USDT' | 'BTC' | 'ETH' | 'OTHER';

export type TransactionStatus = 'completed' | 'pending' | 'cancelled';

// Resultado del parser de IA
export interface ParsedTransaction {
  type: TransactionType;
  category: BusinessCategory;
  amount: number;
  currency: Currency;
  contactName?: string;
  description: string;
  status: TransactionStatus;
  dueDate?: Date;
  reference?: string;
  confidence: number; // 0-1, qué tan seguro está el parser
}

// Para el dashboard
export interface DashboardMetrics {
  // Totales
  totalIncome: number;
  totalExpense: number;
  netFlow: number;

  // Préstamos
  totalOwedToMe: number;   // Total que me deben
  totalIOwe: number;        // Total que debo
  netLoanBalance: number;

  // Por período
  todayTransactions: number;
  weekTransactions: number;
  monthTransactions: number;

  // Por categoría
  byCategory: Record<BusinessCategory, {
    income: number;
    expense: number;
    count: number;
  }>;
}

// Contacto con su saldo
export interface ContactWithBalance extends Contact {
  balance?: ContactBalance;
  totalTransactions?: number;
}

// Transacción con contacto incluido
export interface TransactionWithContact extends Transaction {
  contact?: Contact | null;
}

// Respuesta del API
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Para el resumen diario
export interface DailySummaryData {
  date: Date;
  totalIncome: number;
  totalExpense: number;
  totalLoansGiven: number;
  totalLoansReceived: number;
  totalCollected: number;
  totalPaid: number;
  transactionCount: number;
  pendingCollections: {
    contact: Contact;
    amount: number;
    dueDate?: Date;
  }[];
  byCategory: Record<BusinessCategory, number>;
  topContacts: {
    contact: Contact;
    totalVolume: number;
  }[];
}

// Filtros para búsqueda de transacciones
export interface TransactionFilters {
  startDate?: Date;
  endDate?: Date;
  type?: TransactionType;
  category?: BusinessCategory;
  contactId?: number;
  status?: TransactionStatus;
  currency?: Currency;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

// Para el webhook de WhatsApp
export interface WhatsAppWebhookPayload {
  object: string;
  entry: {
    id: string;
    changes: {
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: {
          profile: { name: string };
          wa_id: string;
        }[];
        messages?: {
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }[];
      };
      field: string;
    }[];
  }[];
}
