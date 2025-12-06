"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Phone,
  Mail,
  Building,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Calendar,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  formatCurrency,
  formatDate,
  getInitials,
  getBalanceDirection,
  getTransactionTypeName,
  getCategoryIcon,
  getCategoryName,
} from "@/lib/utils";

interface Transaction {
  id: number;
  type: string;
  category: string;
  amount: string;
  currency: string;
  description: string | null;
  originalMessage: string | null;
  status: string;
  transactionDate: string;
  createdAt: string;
}

interface ContactBalance {
  id: number;
  contactId: number;
  currency: string;
  theyOweMe: string;
  iOweThem: string;
  netBalance: string;
  lastTransactionAt: string | null;
}

interface ContactData {
  contact: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    company: string | null;
    notes: string | null;
    isActive: boolean;
    createdAt: string;
    balance?: ContactBalance;
  };
  transactions: Transaction[];
  allBalances: ContactBalance[];
}

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ContactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchContact() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/contacts/${params.id}`);
        const result = await res.json();

        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || "Error al cargar contacto");
        }
      } catch (err) {
        console.error("Error fetching contact:", err);
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      fetchContact();
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{error || "Contacto no encontrado"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { contact, transactions, allBalances } = data;
  const theyOweMe = parseFloat(contact.balance?.theyOweMe || "0");
  const iOweThem = parseFloat(contact.balance?.iOweThem || "0");
  const balanceInfo = getBalanceDirection(theyOweMe, iOweThem);

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{contact.name}</h1>
          <p className="text-muted-foreground">Detalles del contacto</p>
        </div>
      </div>

      {/* Contact Info & Balance Summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contact Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                  {getInitials(contact.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle>{contact.name}</CardTitle>
                <CardDescription>
                  Miembro desde {formatDate(contact.createdAt)}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{contact.phone}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{contact.email}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span>{contact.company}</span>
              </div>
            )}
            {contact.notes && (
              <>
                <Separator />
                <p className="text-sm text-muted-foreground">{contact.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Balance Cards */}
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-800">
              Enviado (Te debe)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-6 w-6 text-orange-600" />
              <span className="text-2xl font-bold text-orange-600">
                {formatCurrency(theyOweMe)}
              </span>
            </div>
            <p className="text-sm text-orange-700 mt-1">
              Total que le has enviado
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-800">
              Recibido (Le debes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ArrowDownRight className="h-6 w-6 text-blue-600" />
              <span className="text-2xl font-bold text-blue-600">
                {formatCurrency(iOweThem)}
              </span>
            </div>
            <p className="text-sm text-blue-700 mt-1">
              Total que has recibido
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Net Balance */}
      <Card
        className={`${
          balanceInfo.direction === "positive"
            ? "border-orange-200 bg-orange-50/50"
            : balanceInfo.direction === "negative"
            ? "border-blue-200 bg-blue-50/50"
            : "border-gray-200 bg-gray-50/50"
        }`}
      >
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet
                className={`h-8 w-8 ${
                  balanceInfo.direction === "positive"
                    ? "text-orange-600"
                    : balanceInfo.direction === "negative"
                    ? "text-blue-600"
                    : "text-gray-600"
                }`}
              />
              <div>
                <p className="text-sm text-muted-foreground">Balance Neto</p>
                <p
                  className={`text-2xl font-bold ${
                    balanceInfo.direction === "positive"
                      ? "text-orange-600"
                      : balanceInfo.direction === "negative"
                      ? "text-blue-600"
                      : "text-gray-600"
                  }`}
                >
                  {balanceInfo.direction === "positive" ? "+" : balanceInfo.direction === "negative" ? "-" : ""}
                  {formatCurrency(balanceInfo.amount)}
                </p>
              </div>
            </div>
            <Badge
              variant={
                balanceInfo.direction === "positive"
                  ? "warning"
                  : balanceInfo.direction === "negative"
                  ? "info"
                  : "secondary"
              }
              className="text-base px-4 py-1"
            >
              {balanceInfo.label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Historial de Movimientos
          </CardTitle>
          <CardDescription>
            {transactions.length} transacciones registradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay movimientos registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => {
                const isExpense = tx.type === "expense" || tx.type === "loan_given" || tx.type === "loan_payment_made";
                const amount = parseFloat(tx.amount);

                return (
                  <div
                    key={tx.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      isExpense
                        ? "bg-orange-50/50 border-orange-100"
                        : "bg-blue-50/50 border-blue-100"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`p-2 rounded-full ${
                          isExpense ? "bg-orange-100" : "bg-blue-100"
                        }`}
                      >
                        {isExpense ? (
                          <ArrowUpRight className="h-5 w-5 text-orange-600" />
                        ) : (
                          <ArrowDownRight className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {getTransactionTypeName(tx.type)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {getCategoryIcon(tx.category)} {getCategoryName(tx.category)}
                          </Badge>
                        </div>
                        {tx.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {tx.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(tx.transactionDate || tx.createdAt, "long")}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-lg font-bold ${
                          isExpense ? "text-orange-600" : "text-blue-600"
                        }`}
                      >
                        {isExpense ? "-" : "+"}
                        {formatCurrency(amount, tx.currency)}
                      </p>
                      <Badge
                        variant={tx.status === "completed" ? "success" : "secondary"}
                        className="text-xs"
                      >
                        {tx.status === "completed" ? "Completado" : tx.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
