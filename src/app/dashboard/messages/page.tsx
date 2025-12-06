"use client";

import { useState } from "react";
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, getTransactionTypeName, getCategoryIcon } from "@/lib/utils";

export default function MessagesPage() {
  const [testMessage, setTestMessage] = useState("");
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    if (!testMessage.trim()) return;

    try {
      setParsing(true);
      setError(null);
      setResult(null);

      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || "No se pudo interpretar el mensaje");
      }
    } catch (err) {
      setError("Error al procesar el mensaje");
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Mensajes</h1>
        <p className="text-muted-foreground">
          Prueba el procesamiento de mensajes y configura WhatsApp
        </p>
      </div>

      {/* Test Parser */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Probar Parser de Mensajes
          </CardTitle>
          <CardDescription>
            Escribe un mensaje como si lo enviaras por WhatsApp para ver cómo lo interpreta la IA
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Ej: Le presté 50mil a Juan para que cierre su operación"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            rows={3}
          />

          <div className="flex flex-wrap gap-2">
            <p className="text-sm text-muted-foreground w-full mb-1">
              Ejemplos rápidos:
            </p>
            {[
              "Le presté 50mil a Juan para su operación",
              "Me pagó Carlos los 20k que le presté",
              "Vendí 5000 dólares a 17.80",
              "Compré 2 BTC a Roberto",
              "Me debe María 15mil del cambio de ayer",
              "Transferí 100k a la cuenta del despacho",
            ].map((example) => (
              <Button
                key={example}
                variant="outline"
                size="sm"
                onClick={() => setTestMessage(example)}
              >
                {example.slice(0, 30)}...
              </Button>
            ))}
          </div>

          <Button
            onClick={handleTest}
            disabled={!testMessage.trim() || parsing}
            className="w-full"
          >
            {parsing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Interpretando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Probar interpretación
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg">
              <XCircle className="h-5 w-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {result && (
            <div className="p-4 bg-green-50 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h4 className="font-semibold text-green-800">
                    Mensaje interpretado correctamente
                  </h4>
                </div>
                <Badge
                  variant={result.parsed.confidence > 0.7 ? "success" : "warning"}
                >
                  {Math.round(result.parsed.confidence * 100)}% confianza
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="p-3 bg-white rounded-lg">
                  <p className="text-muted-foreground mb-1">Tipo</p>
                  <p className="font-semibold">
                    {getTransactionTypeName(result.parsed.type)}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <p className="text-muted-foreground mb-1">Categoría</p>
                  <p className="font-semibold">
                    {getCategoryIcon(result.parsed.category)}{" "}
                    {result.parsed.category}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <p className="text-muted-foreground mb-1">Monto</p>
                  <p className="font-semibold text-lg">
                    {formatCurrency(result.parsed.amount, result.parsed.currency)}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <p className="text-muted-foreground mb-1">Contacto</p>
                  <p className="font-semibold">
                    {result.parsed.contactName || "Sin contacto"}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-white rounded-lg">
                <p className="text-muted-foreground text-sm mb-1">
                  Descripción generada
                </p>
                <p className="font-medium">{result.parsed.description}</p>
              </div>

              <div className="p-3 bg-white rounded-lg">
                <p className="text-muted-foreground text-sm mb-1">Resumen</p>
                <p className="font-medium text-primary">{result.summary}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* WhatsApp Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Configuración de WhatsApp
          </CardTitle>
          <CardDescription>
            Conecta tu cuenta de WhatsApp Business para recibir transacciones automáticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <h4 className="font-semibold mb-2">Pasos para configurar WhatsApp:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>
                Crea una cuenta en{" "}
                <a
                  href="https://developers.facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Meta for Developers
                </a>
              </li>
              <li>Configura una aplicación con WhatsApp Business API</li>
              <li>Obtén tu número de teléfono y tokens de acceso</li>
              <li>
                Configura el webhook con la URL:
                <code className="block mt-1 p-2 bg-white rounded text-xs">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/webhook/whatsapp`
                    : "https://tu-dominio.vercel.app/api/webhook/whatsapp"}
                </code>
              </li>
              <li>
                Agrega las variables de entorno en tu archivo .env:
                <code className="block mt-1 p-2 bg-white rounded text-xs whitespace-pre">
{`WHATSAPP_VERIFY_TOKEN=tu_token_secreto
WHATSAPP_ACCESS_TOKEN=tu_access_token
WHATSAPP_PHONE_NUMBER_ID=tu_phone_id`}
                </code>
              </li>
            </ol>
          </div>

          <div className="flex items-center gap-2 p-4 bg-yellow-50 text-yellow-800 rounded-lg">
            <Clock className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">
              La integración con WhatsApp requiere una cuenta de WhatsApp Business API.
              Para uso personal, puedes usar el dashboard para registrar transacciones manualmente.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle>Cómo funciona el procesamiento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-semibold mb-2">1. Recibe mensaje</h4>
              <p className="text-sm text-muted-foreground">
                El sistema recibe mensajes de WhatsApp o del dashboard
              </p>
            </div>

            <div className="p-4 border rounded-lg text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-semibold mb-2">2. Interpreta con IA</h4>
              <p className="text-sm text-muted-foreground">
                La IA analiza el mensaje y extrae tipo, monto, contacto y categoría
              </p>
            </div>

            <div className="p-4 border rounded-lg text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-semibold mb-2">3. Registra automático</h4>
              <p className="text-sm text-muted-foreground">
                La transacción se guarda y actualiza los saldos correspondientes
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
