import { pgTable, serial, text, timestamp, decimal, integer, boolean, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const transactionTypeEnum = pgEnum('transaction_type', [
  'income',      // Entrada de dinero
  'expense',     // Salida de dinero
  'loan_given',  // Préstamo otorgado (me deben)
  'loan_received', // Préstamo recibido (yo debo)
  'loan_payment_received', // Pago recibido de préstamo
  'loan_payment_made',     // Pago hecho de préstamo
  'transfer',    // Transferencia entre cuentas propias
]);

export const businessCategoryEnum = pgEnum('business_category', [
  'banco',           // Operaciones bancarias
  'despacho_fiscal', // Despacho contable/fiscal
  'crypto',          // Criptomonedas
  'divisas',         // Compra/venta de divisas
  'efectivo',        // Operaciones en efectivo
  'prestamos',       // Préstamos personales
  'soluciones_financieras', // Soluciones financieras
  'internacional',   // Transacciones internacionales
  'otro',            // Otros
]);

export const currencyEnum = pgEnum('currency', [
  'MXN',  // Peso mexicano
  'USD',  // Dólar americano
  'EUR',  // Euro
  'USDT', // Tether
  'BTC',  // Bitcoin
  'ETH',  // Ethereum
  'OTHER', // Otras
]);

export const transactionStatusEnum = pgEnum('transaction_status', [
  'completed',  // Completada
  'pending',    // Pendiente
  'cancelled',  // Cancelada
]);

// Tabla de contactos (personas/entidades)
export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  company: text('company'),
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  phoneIdx: uniqueIndex('contacts_phone_unique').on(table.phone),
}));

// Tabla de transacciones
export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),

  // Tipo y categoría
  type: transactionTypeEnum('type').notNull(),
  category: businessCategoryEnum('category').notNull(),
  status: transactionStatusEnum('status').default('completed'),

  // Montos
  amount: decimal('amount', { precision: 18, scale: 2 }).notNull(),
  currency: currencyEnum('currency').default('MXN'),
  exchangeRate: decimal('exchange_rate', { precision: 12, scale: 6 }),
  amountInMxn: decimal('amount_in_mxn', { precision: 18, scale: 2 }),

  // Relaciones
  contactId: integer('contact_id').references(() => contacts.id),
  relatedTransactionId: integer('related_transaction_id'),

  // Descripción
  description: text('description').notNull(),
  originalMessage: text('original_message'), // Mensaje original de WhatsApp
  reference: text('reference'), // Referencia bancaria o de la operación

  // Fechas
  transactionDate: timestamp('transaction_date').defaultNow(),
  dueDate: timestamp('due_date'), // Fecha de vencimiento para préstamos
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Tabla de saldos por contacto (vista agregada, se actualiza con triggers)
export const contactBalances = pgTable('contact_balances', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').references(() => contacts.id).notNull(),
  currency: currencyEnum('currency').default('MXN'),

  // Saldos
  theyOweMe: decimal('they_owe_me', { precision: 18, scale: 2 }).default('0'), // Lo que me deben
  iOweThem: decimal('i_owe_them', { precision: 18, scale: 2 }).default('0'),   // Lo que yo debo
  netBalance: decimal('net_balance', { precision: 18, scale: 2 }).default('0'), // Balance neto

  lastTransactionAt: timestamp('last_transaction_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Tabla de resúmenes diarios
export const dailySummaries = pgTable('daily_summaries', {
  id: serial('id').primaryKey(),
  summaryDate: timestamp('summary_date').notNull(),

  // Totales del día
  totalIncome: decimal('total_income', { precision: 18, scale: 2 }).default('0'),
  totalExpense: decimal('total_expense', { precision: 18, scale: 2 }).default('0'),
  totalLoansGiven: decimal('total_loans_given', { precision: 18, scale: 2 }).default('0'),
  totalLoansReceived: decimal('total_loans_received', { precision: 18, scale: 2 }).default('0'),
  totalCollected: decimal('total_collected', { precision: 18, scale: 2 }).default('0'),
  totalPaid: decimal('total_paid', { precision: 18, scale: 2 }).default('0'),

  // Contadores
  transactionCount: integer('transaction_count').default(0),

  // Resumen en texto generado por IA
  aiSummary: text('ai_summary'),

  // Por categoría (JSON)
  byCategory: text('by_category'), // JSON con desglose por categoría

  createdAt: timestamp('created_at').defaultNow(),
});

// Tabla de alertas/recordatorios
export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').references(() => contacts.id),
  transactionId: integer('transaction_id').references(() => transactions.id),

  type: text('type').notNull(), // 'payment_due', 'collection_reminder', 'balance_alert'
  message: text('message').notNull(),

  isRead: boolean('is_read').default(false),
  isDismissed: boolean('is_dismissed').default(false),

  dueDate: timestamp('due_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Tabla de mensajes de WhatsApp (log)
export const whatsappMessages = pgTable('whatsapp_messages', {
  id: serial('id').primaryKey(),
  messageId: text('message_id').unique(),
  from: text('from').notNull(),
  body: text('body').notNull(),

  // Resultado del procesamiento
  wasProcessed: boolean('was_processed').default(false),
  extractedTransactionId: integer('extracted_transaction_id').references(() => transactions.id),
  processingNotes: text('processing_notes'),

  receivedAt: timestamp('received_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});

// Relaciones
export const contactsRelations = relations(contacts, ({ many }) => ({
  transactions: many(transactions),
  balances: many(contactBalances),
  alerts: many(alerts),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  contact: one(contacts, {
    fields: [transactions.contactId],
    references: [contacts.id],
  }),
}));

export const contactBalancesRelations = relations(contactBalances, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactBalances.contactId],
    references: [contacts.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  contact: one(contacts, {
    fields: [alerts.contactId],
    references: [contacts.id],
  }),
  transaction: one(transactions, {
    fields: [alerts.transactionId],
    references: [transactions.id],
  }),
}));
