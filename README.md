# Asistente Financiero

Sistema inteligente de tracking de transacciones financieras para negocios múltiples. Diseñado para personas que manejan varias líneas de negocio (banco, crypto, divisas, préstamos, etc.) y necesitan un control preciso de quien les debe y a quien deben.

## Características

- **Parser de Lenguaje Natural**: Registra transacciones escribiendo mensajes informales como "Le presté 50mil a Juan"
- **Control de Saldos**: Sabe exactamente cuánto te deben y a quién debes
- **Multi-Categoría**: Organiza por tipo de negocio (banco, crypto, divisas, préstamos, etc.)
- **Multi-Moneda**: Soporta MXN, USD, EUR, USDT, BTC, ETH
- **Integración WhatsApp**: Recibe mensajes y registra transacciones automáticamente
- **Resúmenes Diarios**: Genera resúmenes automáticos de actividad
- **Dashboard en Tiempo Real**: Visualiza métricas y flujos de efectivo

## Stack Tecnológico

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Base de Datos**: PostgreSQL con Neon
- **ORM**: Drizzle ORM
- **IA**: OpenAI GPT-4 para procesamiento de lenguaje natural
- **UI**: shadcn/ui, Radix UI, Lucide Icons

## Requisitos

- Node.js 18+
- Cuenta en [Neon](https://neon.tech) (base de datos PostgreSQL)
- API Key de [OpenAI](https://platform.openai.com) (opcional, para parser avanzado)
- Cuenta de WhatsApp Business API (opcional, para integración)

## Instalación

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd ASISTENTE
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo de ejemplo y configura tus credenciales:

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

```env
# Base de datos Neon PostgreSQL (REQUERIDO)
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require

# OpenAI API Key (OPCIONAL - para parser avanzado de IA)
OPENAI_API_KEY=sk-xxx

# WhatsApp Business API (OPCIONAL)
WHATSAPP_VERIFY_TOKEN=tu_token_de_verificacion
WHATSAPP_ACCESS_TOKEN=tu_access_token
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id

# URL base de la aplicación
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Configurar la base de datos

```bash
# Generar migraciones
npm run db:generate

# Aplicar migraciones a la base de datos
npm run db:push
```

### 5. Iniciar el servidor de desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Despliegue en Vercel

### 1. Conectar con Vercel

```bash
npx vercel
```

### 2. Configurar variables de entorno en Vercel

Ve a la configuración del proyecto en Vercel y agrega las mismas variables de entorno.

### 3. Desplegar

```bash
npx vercel --prod
```

## Uso

### Dashboard

El dashboard principal muestra:
- Ingresos y gastos del día
- Préstamos pendientes (quién te debe y a quién debes)
- Transacciones recientes
- Estadísticas por categoría

### Registrar Transacciones

#### Opción 1: Lenguaje Natural

Escribe mensajes informales como:
- "Le presté 50mil a Juan para que cierre su operación"
- "Me pagó Carlos los 20k que le presté"
- "Vendí 5000 dólares a 17.80"
- "Compré 2 BTC a Roberto"
- "Me debe María 15mil del cambio de ayer"

#### Opción 2: Formulario Manual

Completa los campos del formulario con:
- Tipo de transacción
- Categoría de negocio
- Monto y moneda
- Contacto (opcional)
- Descripción

### Tipos de Transacción

| Tipo | Descripción |
|------|-------------|
| Ingreso | Dinero que entra (ventas, cobros) |
| Gasto | Dinero que sale (compras, pagos) |
| Préstamo otorgado | Dinero que prestas (te van a deber) |
| Préstamo recibido | Dinero que te prestan (vas a deber) |
| Cobro de préstamo | Cuando te pagan un préstamo que diste |
| Pago de préstamo | Cuando pagas un préstamo que recibiste |
| Transferencia | Movimiento entre tus propias cuentas |

### Categorías de Negocio

- Banco
- Despacho Fiscal
- Crypto
- Divisas
- Efectivo
- Préstamos
- Soluciones Financieras
- Internacional
- Otro

### Integración con WhatsApp

1. Configura una cuenta de WhatsApp Business API
2. Agrega las credenciales en las variables de entorno
3. Configura el webhook URL: `https://tu-dominio.vercel.app/api/webhook/whatsapp`
4. Los mensajes recibidos serán procesados automáticamente

## API Endpoints

### Transacciones

- `GET /api/transactions` - Listar transacciones con filtros
- `POST /api/transactions` - Crear nueva transacción
- `GET /api/transactions/:id` - Obtener transacción específica
- `PUT /api/transactions/:id` - Actualizar transacción
- `DELETE /api/transactions/:id` - Eliminar transacción

### Contactos

- `GET /api/contacts` - Listar contactos con saldos
- `POST /api/contacts` - Crear nuevo contacto
- `GET /api/contacts/:id` - Obtener contacto con historial
- `PUT /api/contacts/:id` - Actualizar contacto
- `DELETE /api/contacts/:id` - Desactivar contacto

### Saldos

- `GET /api/balances` - Resumen de saldos pendientes
- `POST /api/balances` - Ajustar saldo manualmente

### Parser

- `POST /api/parse` - Interpretar mensaje de texto

### Resúmenes

- `GET /api/summary` - Métricas del dashboard
- `POST /api/summary` - Generar resumen diario

### WhatsApp

- `GET /api/webhook/whatsapp` - Verificación del webhook
- `POST /api/webhook/whatsapp` - Recibir mensajes

## Estructura del Proyecto

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── transactions/  # CRUD de transacciones
│   │   ├── contacts/      # CRUD de contactos
│   │   ├── balances/      # Gestión de saldos
│   │   ├── parse/         # Parser de lenguaje natural
│   │   ├── summary/       # Resúmenes y métricas
│   │   └── webhook/       # Webhooks (WhatsApp)
│   ├── dashboard/         # Páginas del dashboard
│   │   ├── transactions/  # Lista y nueva transacción
│   │   ├── contacts/      # Lista de contactos
│   │   ├── balances/      # Vista de saldos
│   │   └── messages/      # Configuración y pruebas
│   └── page.tsx           # Landing page
├── components/            # Componentes React
│   └── ui/               # Componentes de UI (shadcn)
├── db/                    # Base de datos
│   ├── schema.ts         # Esquema Drizzle
│   └── index.ts          # Conexión a Neon
├── lib/                   # Utilidades
│   ├── utils.ts          # Funciones helper
│   └── transaction-parser.ts  # Parser de IA
└── types/                 # Tipos TypeScript
    └── index.ts          # Definiciones de tipos
```

## Licencia

MIT
