"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency, getInitials } from "@/lib/utils";

interface BalanceData {
  summary: {
    totalOwedToMe: number;
    totalIOwe: number;
    netBalance: number;
    debtorsCount: number;
    creditorsCount: number;
  };
  debtors: Array<{
    contact: { id: number; name: string };
    balance: { theyOweMe: string; iOweThem: string; netBalance: string };
  }>;
  creditors: Array<{
    contact: { id: number; name: string };
    balance: { theyOweMe: string; iOweThem: string; netBalance: string };
  }>;
}

export default function BalancesPage() {
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBalances() {
      try {
        setLoading(true);
        const res = await fetch("/api/balances");
        const result = await res.json();

        if (result.success) {
          setData(result.data);
        }
      } catch (error) {
        console.error("Error fetching balances:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchBalances();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const summary = data?.summary || {
    totalOwedToMe: 0,
    totalIOwe: 0,
    netBalance: 0,
    debtorsCount: 0,
    creditorsCount: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Saldos</h1>
        <p className="text-muted-foreground">
          Control de quien te debe y a quien debes
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-800">
              Te Deben
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ArrowDownRight className="h-6 w-6 text-orange-600" />
              <span className="text-3xl font-bold text-orange-600">
                {formatCurrency(summary.totalOwedToMe)}
              </span>
            </div>
            <p className="text-sm text-orange-700 mt-1">
              {summary.debtorsCount} personas te deben
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-800">
              Debes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-6 w-6 text-blue-600" />
              <span className="text-3xl font-bold text-blue-600">
                {formatCurrency(summary.totalIOwe)}
              </span>
            </div>
            <p className="text-sm text-blue-700 mt-1">
              Debes a {summary.creditorsCount} personas
            </p>
          </CardContent>
        </Card>

        <Card
          className={`${
            summary.netBalance >= 0
              ? "border-green-200 bg-green-50/50"
              : "border-red-200 bg-red-50/50"
          }`}
        >
          <CardHeader className="pb-2">
            <CardTitle
              className={`text-sm font-medium ${
                summary.netBalance >= 0 ? "text-green-800" : "text-red-800"
              }`}
            >
              Balance Neto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Wallet
                className={`h-6 w-6 ${
                  summary.netBalance >= 0 ? "text-green-600" : "text-red-600"
                }`}
              />
              <span
                className={`text-3xl font-bold ${
                  summary.netBalance >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {summary.netBalance >= 0 ? "+" : ""}
                {formatCurrency(summary.netBalance)}
              </span>
            </div>
            <p
              className={`text-sm mt-1 ${
                summary.netBalance >= 0 ? "text-green-700" : "text-red-700"
              }`}
            >
              {summary.netBalance >= 0
                ? "Balance positivo - te deben más de lo que debes"
                : "Balance negativo - debes más de lo que te deben"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Two column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Debtors (Te deben) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownRight className="h-5 w-5 text-orange-600" />
              Te Deben
            </CardTitle>
            <CardDescription>
              Personas que tienen saldo pendiente contigo
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data?.debtors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nadie te debe dinero</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data?.debtors.map((item) => (
                  <Link
                    key={item.contact.id}
                    href={`/dashboard/contacts/${item.contact.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-orange-200 text-orange-800 font-semibold">
                            {getInitials(item.contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{item.contact.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Saldo pendiente
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-orange-600">
                          {formatCurrency(item.balance.theyOweMe)}
                        </p>
                        <Badge variant="warning">Cobrar</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Creditors (Debes) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-blue-600" />
              Debes
            </CardTitle>
            <CardDescription>
              Personas a las que les debes dinero
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data?.creditors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No debes dinero a nadie</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data?.creditors.map((item) => (
                  <Link
                    key={item.contact.id}
                    href={`/dashboard/contacts/${item.contact.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-blue-200 text-blue-800 font-semibold">
                            {getInitials(item.contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{item.contact.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Por pagar
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-600">
                          {formatCurrency(item.balance.iOweThem)}
                        </p>
                        <Badge variant="info">Pagar</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
