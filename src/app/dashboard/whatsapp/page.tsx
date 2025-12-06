"use client";

import { useEffect, useState, useRef } from "react";
import {
  Smartphone,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle,
  Loader2,
  MessageSquare,
  AlertCircle,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { io, Socket } from "socket.io-client";

interface MessageEvent {
  chatId: string;
  chatName: string;
  isFromMe: boolean;
  hasFinancialContent: boolean;
  summary: string;
  timestamp: string;
}

interface TransactionEvent {
  transaction: any;
  contactName: string;
  message: string;
}

export default function WhatsAppPage() {
  const [connected, setConnected] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentMessages, setRecentMessages] = useState<MessageEvent[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const WHATSAPP_SERVICE_URL = process.env.NEXT_PUBLIC_WHATSAPP_SERVICE_URL || "http://localhost:3001";

  useEffect(() => {
    // Conectar a Socket.IO
    const socket = io(WHATSAPP_SERVICE_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Conectado al servicio WhatsApp");
      setLoading(false);
    });

    socket.on("disconnect", () => {
      console.log("Desconectado del servicio WhatsApp");
    });

    socket.on("status", (status: { connected: boolean; hasQR: boolean; qr?: string }) => {
      setConnected(status.connected);
      if (status.qr) {
        setQrCode(status.qr);
      } else if (status.connected) {
        setQrCode(null);
      }
      setLoading(false);
    });

    socket.on("message-analyzed", (event: MessageEvent) => {
      setRecentMessages((prev) => [event, ...prev].slice(0, 20));
    });

    socket.on("new-transaction", (event: TransactionEvent) => {
      setRecentTransactions((prev) => [event, ...prev].slice(0, 10));
    });

    socket.on("connect_error", (err) => {
      console.error("Error de conexión:", err);
      setError("No se pudo conectar al servicio de WhatsApp. Asegúrate de que esté corriendo.");
      setLoading(false);
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, [WHATSAPP_SERVICE_URL]);

  const refreshStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${WHATSAPP_SERVICE_URL}/api/status`);
      const data = await res.json();
      setConnected(data.connected);

      if (!data.connected) {
        const qrRes = await fetch(`${WHATSAPP_SERVICE_URL}/api/qr`);
        const qrData = await qrRes.json();
        if (qrData.qr) {
          setQrCode(qrData.qr);
        }
      }
    } catch (err) {
      setError("Error al obtener estado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">WhatsApp</h1>
        <p className="text-muted-foreground">
          Conexión y monitoreo en tiempo real
        </p>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <div>
                <p className="font-medium">Error de conexión</p>
                <p className="text-sm">{error}</p>
                <p className="text-sm mt-2">
                  Ejecuta: <code className="bg-red-100 px-2 py-1 rounded">npm run whatsapp</code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Estado de Conexión */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Estado de Conexión
            </CardTitle>
            <CardDescription>
              {connected
                ? "WhatsApp está conectado y monitoreando mensajes"
                : "Escanea el QR para conectar"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Conectando al servicio...</p>
              </div>
            ) : connected ? (
              <div className="flex flex-col items-center py-8">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <Badge variant="success" className="text-lg px-4 py-2">
                  <Wifi className="h-4 w-4 mr-2" />
                  Conectado
                </Badge>
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  La IA está analizando todos los mensajes
                  <br />
                  en tiempo real
                </p>
              </div>
            ) : qrCode ? (
              <div className="flex flex-col items-center">
                <div className="border-4 border-primary rounded-lg p-2 bg-white">
                  <img
                    src={qrCode}
                    alt="QR Code"
                    className="w-64 h-64"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  1. Abre WhatsApp en tu teléfono
                  <br />
                  2. Ve a Configuración {">"} Dispositivos vinculados
                  <br />
                  3. Escanea este código QR
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={refreshStatus}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualizar
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8">
                <div className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center mb-4">
                  <WifiOff className="h-10 w-10 text-yellow-600" />
                </div>
                <Badge variant="warning" className="text-lg px-4 py-2">
                  Desconectado
                </Badge>
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Esperando código QR...
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={refreshStatus}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reintentar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instrucciones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Cómo Funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">1</span>
              </div>
              <div>
                <p className="font-medium">Escanea el QR</p>
                <p className="text-sm text-muted-foreground">
                  Vincula tu WhatsApp como si fuera WhatsApp Web
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">2</span>
              </div>
              <div>
                <p className="font-medium">La IA lee todo</p>
                <p className="text-sm text-muted-foreground">
                  Analiza mensajes, imágenes, audios y documentos automáticamente
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">3</span>
              </div>
              <div>
                <p className="font-medium">Registra transacciones</p>
                <p className="text-sm text-muted-foreground">
                  Detecta montos, préstamos, pagos y los guarda automáticamente
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">4</span>
              </div>
              <div>
                <p className="font-medium">Crea recordatorios</p>
                <p className="text-sm text-muted-foreground">
                  Detecta compromisos de pago y te recuerda cobrar
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Nota:</strong> Tu WhatsApp sigue funcionando normal en tu teléfono.
                La IA solo observa y organiza, no interfiere con tus conversaciones.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actividad en Tiempo Real */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mensajes Recientes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Mensajes Analizados
            </CardTitle>
            <CardDescription>
              Últimos mensajes procesados por la IA
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentMessages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Los mensajes aparecerán aquí en tiempo real</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {recentMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg ${
                      msg.hasFinancialContent
                        ? "bg-green-50 border border-green-200"
                        : "bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{msg.chatName}</span>
                      <Badge
                        variant={msg.hasFinancialContent ? "success" : "secondary"}
                        className="text-xs"
                      >
                        {msg.hasFinancialContent ? "Financiero" : "Normal"}
                      </Badge>
                    </div>
                    {msg.summary && (
                      <p className="text-sm text-muted-foreground">{msg.summary}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {msg.isFromMe ? "Enviado" : "Recibido"} •{" "}
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transacciones Detectadas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-600" />
              Transacciones Detectadas
            </CardTitle>
            <CardDescription>
              Operaciones registradas automáticamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Las transacciones detectadas aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {recentTransactions.map((tx, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-green-50 border border-green-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        {tx.contactName || "Sin contacto"}
                      </span>
                      <span className="font-bold text-green-600">
                        ${parseFloat(tx.transaction.amount).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tx.transaction.description}
                    </p>
                    <Badge variant="outline" className="text-xs mt-2">
                      {tx.transaction.type}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comando para iniciar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Iniciar servicio de WhatsApp</p>
              <p className="text-sm text-muted-foreground">
                Ejecuta este comando en una terminal separada
              </p>
            </div>
            <code className="bg-slate-100 px-4 py-2 rounded-lg font-mono text-sm">
              npm run whatsapp
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
