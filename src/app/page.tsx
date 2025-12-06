import Link from "next/link";
import { ArrowRight, MessageSquare, BarChart3, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Asistente Financiero</span>
          </div>
          <Link href="/dashboard">
            <Button>
              Ir al Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Tu Asistente Financiero
          <br />
          <span className="text-primary">Inteligente</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Controla todas tus transacciones financieras en un solo lugar.
          Registra operaciones desde WhatsApp, lleva el control de quien te debe
          y a quien debes, y obtiene resúmenes diarios automáticos.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/dashboard">
            <Button size="lg">
              Comenzar ahora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <Link href="/dashboard/transactions">
            <Button size="lg" variant="outline">
              Ver transacciones
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Todo lo que necesitas para controlar tus finanzas
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <MessageSquare className="h-10 w-10 text-primary mb-2" />
              <CardTitle>WhatsApp Integrado</CardTitle>
              <CardDescription>
                Registra transacciones enviando mensajes de texto natural.
                La IA interpreta y categoriza automáticamente.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <BarChart3 className="h-10 w-10 text-primary mb-2" />
              <CardTitle>Dashboard en Tiempo Real</CardTitle>
              <CardDescription>
                Visualiza tus flujos de efectivo, préstamos pendientes
                y métricas clave al instante.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Users className="h-10 w-10 text-primary mb-2" />
              <CardTitle>Control de Saldos</CardTitle>
              <CardDescription>
                Sabe exactamente cuánto te deben y a quién debes.
                Nunca más olvides cobrar.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Wallet className="h-10 w-10 text-primary mb-2" />
              <CardTitle>Multi-Negocio</CardTitle>
              <CardDescription>
                Categoriza por tipo: banco, crypto, divisas, préstamos,
                despacho fiscal y más.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Example Messages */}
      <section className="container mx-auto px-4 py-16 bg-white rounded-xl shadow-sm">
        <h2 className="text-3xl font-bold text-center mb-8">
          Escribe como hablas normalmente
        </h2>
        <p className="text-center text-muted-foreground mb-8">
          La IA entiende mensajes informales y los convierte en registros precisos
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {[
            "Le presté 50mil a Juan para que cierre su operación",
            "Me pagó Carlos los 20k que le presté",
            "Vendí 5000 dólares a 17.80",
            "Compré 2 BTC a Roberto",
            "Me debe María 15mil del cambio de ayer",
            "Transferí 100k a la cuenta del despacho",
          ].map((message, i) => (
            <div
              key={i}
              className="bg-green-50 rounded-2xl rounded-bl-none p-4 text-sm"
            >
              {message}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Ordena tus finanzas hoy mismo
        </h2>
        <p className="text-muted-foreground mb-8">
          Deja de perder dinero por olvidos. Ten siempre los números claros.
        </p>
        <Link href="/dashboard">
          <Button size="lg">
            Empezar gratis
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>Asistente Financiero - Control inteligente de transacciones</p>
        </div>
      </footer>
    </main>
  );
}
