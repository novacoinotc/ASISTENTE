"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Search,
  Filter,
  PlusCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatCurrency,
  getCategoryIcon,
  getCategoryName,
  getTransactionTypeName,
  getTransactionColor,
} from "@/lib/utils";
import { TransactionWithContact } from "@/types";

const categories = [
  { value: "all", label: "Todas las categorías" },
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
  { value: "all", label: "Todos los tipos" },
  { value: "income", label: "Ingreso" },
  { value: "expense", label: "Gasto" },
  { value: "loan_given", label: "Préstamo otorgado" },
  { value: "loan_received", label: "Préstamo recibido" },
  { value: "loan_payment_received", label: "Cobro de préstamo" },
  { value: "loan_payment_made", label: "Pago de préstamo" },
  { value: "transfer", label: "Transferencia" },
];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchTransactions();
  }, [category, type, page]);

  async function fetchTransactions() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", limit.toString());
      params.set("offset", (page * limit).toString());

      if (category !== "all") params.set("category", category);
      if (type !== "all") params.set("type", type);
      if (search) params.set("search", search);

      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();

      if (data.success) {
        setTransactions(data.data);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    fetchTransactions();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Transacciones</h1>
          <p className="text-muted-foreground">
            Historial de todas tus operaciones
          </p>
        </div>
        <Link href="/dashboard/transactions/new">
          <Button>
            <PlusCircle className="h-4 w-4 mr-2" />
            Nueva transacción
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar transacciones..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="secondary">
                Buscar
              </Button>
            </form>

            <div className="flex gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tipo" />
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
          </div>
        </CardContent>
      </Card>

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {loading ? "Cargando..." : `${transactions.length} transacciones`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No se encontraron transacciones
              </p>
              <Link href="/dashboard/transactions/new">
                <Button>Registrar primera transacción</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <Link
                  key={tx.id}
                  href={`/dashboard/transactions/${tx.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">
                        {getCategoryIcon(tx.category)}
                      </span>
                      <div>
                        <p className="font-medium">{tx.description}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{tx.contact?.name || "Sin contacto"}</span>
                          <span>•</span>
                          <span>{getCategoryName(tx.category)}</span>
                          <span>•</span>
                          <span>
                            {tx.transactionDate
                              ? format(new Date(tx.transactionDate), "d MMM yyyy", {
                                  locale: es,
                                })
                              : "Sin fecha"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-lg font-semibold ${
                          tx.type === "income" ||
                          tx.type === "loan_payment_received"
                            ? "text-green-600"
                            : tx.type === "expense" ||
                              tx.type === "loan_payment_made"
                            ? "text-red-600"
                            : "text-orange-600"
                        }`}
                      >
                        {tx.type === "income" ||
                        tx.type === "loan_payment_received"
                          ? "+"
                          : tx.type === "expense" ||
                            tx.type === "loan_payment_made"
                          ? "-"
                          : ""}
                        {formatCurrency(tx.amount, tx.currency || "MXN")}
                      </p>
                      <Badge
                        variant={
                          tx.status === "completed"
                            ? "success"
                            : tx.status === "pending"
                            ? "warning"
                            : "secondary"
                        }
                      >
                        {getTransactionTypeName(tx.type)}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {transactions.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page + 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={transactions.length < limit}
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
