"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, getCategoryIcon, getTransactionTypeName } from "@/lib/utils";
import { ParsedTransaction } from "@/types";

const categories = [
  { value: "banco", label: "Banco" },
  { value: "despacho_fiscal", label: "Despacho Fiscal" },
  { value: "crypto", label: "Crypto" },
  { value: "divisas", label: "Divisas" },
  { value: "efectivo", label: "Efectivo" },
  { value: "prestamos", label: "Préstamos" },
  { value: "soluciones_financieras", label: "Soluciones Financieras" },
  { value: "internacional", label: "Internacional" },
  { value: "otro", label: "Otro" },
];

const types = [
  { value: "income", label: "Ingreso" },
  { value: "expense", label: "Gasto" },
  { value: "loan_given", label: "Préstamo otorgado" },
  { value: "loan_received", label: "Préstamo recibido" },
  { value: "loan_payment_received", label: "Cobro de préstamo" },
  { value: "loan_payment_made", label: "Pago de préstamo" },
  { value: "transfer", label: "Transferencia" },
];

const currencies = [
  { value: "MXN", label: "Peso Mexicano (MXN)" },
  { value: "USD", label: "Dólar (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "USDT", label: "Tether (USDT)" },
  { value: "BTC", label: "Bitcoin (BTC)" },
  { value: "ETH", label: "Ethereum (ETH)" },
];

export default function NewTransactionPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"natural" | "manual">("natural");
  const [naturalInput, setNaturalInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedTransaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state for manual mode
  const [formData, setFormData] = useState({
    type: "income",
    category: "otro",
    amount: "",
    currency: "MXN",
    contactName: "",
    description: "",
    reference: "",
  });

  async function handleParse() {
    if (!naturalInput.trim()) return;

    try {
      setParsing(true);
      setError(null);

      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: naturalInput }),
      });

      const data = await res.json();

      if (data.success) {
        setParsed(data.data.parsed);
      } else {
        setError(data.error || "No se pudo interpretar el mensaje");
      }
    } catch (err) {
      setError("Error al procesar el mensaje");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);

      const transactionData =
        mode === "natural" && parsed
          ? {
              type: parsed.type,
              category: parsed.category,
              amount: parsed.amount,
              currency: parsed.currency,
              contactName: parsed.contactName,
              description: parsed.description,
              originalMessage: naturalInput,
              status: parsed.status,
              dueDate: parsed.dueDate,
              reference: parsed.reference,
            }
          : {
              type: formData.type,
              category: formData.category,
              amount: parseFloat(formData.amount),
              currency: formData.currency,
              contactName: formData.contactName || undefined,
              description: formData.description,
              reference: formData.reference || undefined,
              status: "completed",
            };

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transactionData),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push("/dashboard/transactions");
        }, 1500);
      } else {
        setError(data.error || "Error al guardar la transacción");
      }
    } catch (err) {
      setError("Error al guardar la transacción");
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <CheckCircle className="h-16 w-16 text-green-600" />
        <h2 className="text-2xl font-bold">Transacción guardada</h2>
        <p className="text-muted-foreground">Redirigiendo...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/transactions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Nueva Transacción</h1>
          <p className="text-muted-foreground">
            Registra una nueva operación financiera
          </p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === "natural" ? "default" : "outline"}
          onClick={() => setMode("natural")}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Lenguaje Natural
        </Button>
        <Button
          variant={mode === "manual" ? "default" : "outline"}
          onClick={() => setMode("manual")}
        >
          Formulario Manual
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      {mode === "natural" ? (
        <Card>
          <CardHeader>
            <CardTitle>Describe tu transacción</CardTitle>
            <CardDescription>
              Escribe como hablas normalmente. La IA interpretará tu mensaje.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tu mensaje</Label>
              <Textarea
                placeholder="Ej: Le presté 50mil a Juan para que cierre su operación"
                value={naturalInput}
                onChange={(e) => setNaturalInput(e.target.value)}
                rows={4}
              />
            </div>

            <Button
              onClick={handleParse}
              disabled={!naturalInput.trim() || parsing}
              className="w-full"
            >
              {parsing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Interpretando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Interpretar mensaje
                </>
              )}
            </Button>

            {parsed && (
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Transacción interpretada</h4>
                  <Badge variant={parsed.confidence > 0.7 ? "success" : "warning"}>
                    {Math.round(parsed.confidence * 100)}% confianza
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Tipo</p>
                    <p className="font-medium">
                      {getTransactionTypeName(parsed.type)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Categoría</p>
                    <p className="font-medium">
                      {getCategoryIcon(parsed.category)}{" "}
                      {parsed.category}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Monto</p>
                    <p className="font-medium text-lg">
                      {formatCurrency(parsed.amount, parsed.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Contacto</p>
                    <p className="font-medium">
                      {parsed.contactName || "Sin contacto"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-muted-foreground text-sm">Descripción</p>
                  <p className="font-medium">{parsed.description}</p>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Guardar transacción
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Examples */}
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">
                Ejemplos de mensajes:
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Le presté 50mil a Juan",
                  "Me pagó Carlos los 20k",
                  "Vendí 5000 dólares a 17.80",
                  "Compré 2 BTC a Roberto",
                ].map((example) => (
                  <Button
                    key={example}
                    variant="outline"
                    size="sm"
                    onClick={() => setNaturalInput(example)}
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Formulario de Transacción</CardTitle>
            <CardDescription>
              Ingresa los datos manualmente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) =>
                    setFormData({ ...formData, type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) =>
                    setFormData({ ...formData, category: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) =>
                    setFormData({ ...formData, currency: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Contacto (opcional)</Label>
              <Input
                placeholder="Nombre de la persona o empresa"
                value={formData.contactName}
                onChange={(e) =>
                  setFormData({ ...formData, contactName: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                placeholder="Describe la operación..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Referencia (opcional)</Label>
              <Input
                placeholder="Número de referencia, folio, etc."
                value={formData.reference}
                onChange={(e) =>
                  setFormData({ ...formData, reference: e.target.value })
                }
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !formData.amount ||
                !formData.description
              }
              className="w-full"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Guardar transacción
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
