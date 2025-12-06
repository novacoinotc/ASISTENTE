"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, getCategoryIcon, getCategoryName, getTransactionTypeName } from "@/lib/utils";
import { DashboardMetrics, TransactionWithContact } from "@/types";

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        // Fetch metrics and recent transactions in parallel
        const [metricsRes, transactionsRes] = await Promise.all([
          fetch("/api/summary"),
          fetch("/api/transactions?limit=10"),
        ]);

        if (!metricsRes.ok || !transactionsRes.ok) {
          throw new Error("Error al cargar datos");
        }

        const metricsData = await metricsRes.json();
        const transactionsData = await transactionsRes.json();

        if (metricsData.success) {
          setMetrics(metricsData.data);
        }

        if (transactionsData.success) {
          setRecentTransactions(transactionsData.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium">Error al cargar el dashboard</p>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={() => window.location.reload()}>Reintentar</Button>
      </div>
    );
  }

  // Default metrics if API hasn't been called yet
  const displayMetrics = metrics || {
    totalIncome: 0,
    totalExpense: 0,
    netFlow: 0,
    totalOwedToMe: 0,
    totalIOwe: 0,
    netLoanBalance: 0,
    todayTransactions: 0,
    weekTransactions: 0,
    monthTransactions: 0,
    byCategory: {},
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Resumen de tus operaciones financieras
        </p>
      </div>

      {/* Main metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Hoy</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(displayMetrics.totalIncome)}
            </div>
            <p className="text-xs text-muted-foreground">
              {displayMetrics.todayTransactions} transacciones hoy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gastos Hoy</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(displayMetrics.totalExpense)}
            </div>
            <p className="text-xs text-muted-foreground">
              Flujo neto: {formatCurrency(displayMetrics.netFlow)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Me Deben</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(displayMetrics.totalOwedToMe)}
            </div>
            <p className="text-xs text-muted-foreground">
              Préstamos pendientes de cobro
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Debo</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(displayMetrics.totalIOwe)}
            </div>
            <p className="text-xs text-muted-foreground">
              Balance: {formatCurrency(displayMetrics.netLoanBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Two column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Transactions */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Transacciones Recientes</CardTitle>
              <CardDescription>
                Últimas {recentTransactions.length} operaciones
              </CardDescription>
            </div>
            <Link href="/dashboard/transactions">
              <Button variant="outline" size="sm">
                Ver todas
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No hay transacciones registradas</p>
                <Link href="/dashboard/transactions/new">
                  <Button variant="link">Registrar primera transacción</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {recentTransactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {getCategoryIcon(tx.category)}
                      </span>
                      <div>
                        <p className="font-medium text-sm line-clamp-1">
                          {tx.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.contact?.name || "Sin contacto"} •{" "}
                          {getCategoryName(tx.category)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
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
                          : "-"}
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
                        className="text-xs"
                      >
                        {getTransactionTypeName(tx.type)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions & Stats */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Estadísticas por Categoría</CardTitle>
            <CardDescription>Distribución de operaciones hoy</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(displayMetrics.byCategory || {}).map(
                ([category, data]) => {
                  if (data.count === 0) return null;
                  return (
                    <div
                      key={category}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">
                          {getCategoryIcon(category)}
                        </span>
                        <div>
                          <p className="font-medium text-sm">
                            {getCategoryName(category)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {data.count} operaciones
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {data.income > 0 && (
                          <p className="text-sm text-green-600">
                            +{formatCurrency(data.income)}
                          </p>
                        )}
                        {data.expense > 0 && (
                          <p className="text-sm text-red-600">
                            -{formatCurrency(data.expense)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }
              )}

              {Object.keys(displayMetrics.byCategory || {}).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Sin operaciones por categoría hoy</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t">
              <h4 className="font-semibold mb-3">Acciones Rápidas</h4>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/dashboard/transactions/new">
                  <Button variant="outline" className="w-full" size="sm">
                    Nueva transacción
                  </Button>
                </Link>
                <Link href="/dashboard/contacts">
                  <Button variant="outline" className="w-full" size="sm">
                    Ver contactos
                  </Button>
                </Link>
                <Link href="/dashboard/balances">
                  <Button variant="outline" className="w-full" size="sm">
                    Ver saldos
                  </Button>
                </Link>
                <Link href="/dashboard/messages">
                  <Button variant="outline" className="w-full" size="sm">
                    Ver mensajes
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen de Actividad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-slate-50">
              <p className="text-3xl font-bold">{displayMetrics.todayTransactions}</p>
              <p className="text-sm text-muted-foreground">Hoy</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50">
              <p className="text-3xl font-bold">{displayMetrics.weekTransactions}</p>
              <p className="text-sm text-muted-foreground">Esta semana</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50">
              <p className="text-3xl font-bold">{displayMetrics.monthTransactions}</p>
              <p className="text-sm text-muted-foreground">Este mes</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
