"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Loader2,
  User,
  Phone,
  Mail,
  Building,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, getInitials, getBalanceDirection } from "@/lib/utils";
import { ContactWithBalance } from "@/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showOnlyWithBalance, setShowOnlyWithBalance] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    notes: "",
  });

  useEffect(() => {
    fetchContacts();
  }, [showOnlyWithBalance]);

  async function fetchContacts() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (showOnlyWithBalance) params.set("onlyWithBalance", "true");

      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();

      if (data.success) {
        setContacts(data.data);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateContact() {
    if (!newContact.name.trim()) return;

    try {
      setSaving(true);
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newContact),
      });

      const data = await res.json();

      if (data.success) {
        setDialogOpen(false);
        setNewContact({ name: "", phone: "", email: "", company: "", notes: "" });
        fetchContacts();
      }
    } catch (error) {
      console.error("Error creating contact:", error);
    } finally {
      setSaving(false);
    }
  }

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Contactos</h1>
          <p className="text-muted-foreground">
            Gestiona tus contactos y sus saldos
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo contacto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Contacto</DialogTitle>
              <DialogDescription>
                Agrega un nuevo contacto a tu lista
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  placeholder="Nombre completo"
                  value={newContact.name}
                  onChange={(e) =>
                    setNewContact({ ...newContact, name: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    placeholder="+52 123 456 7890"
                    value={newContact.phone}
                    onChange={(e) =>
                      setNewContact({ ...newContact, phone: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="email@ejemplo.com"
                    value={newContact.email}
                    onChange={(e) =>
                      setNewContact({ ...newContact, email: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input
                  placeholder="Nombre de la empresa"
                  value={newContact.company}
                  onChange={(e) =>
                    setNewContact({ ...newContact, company: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  placeholder="Notas adicionales..."
                  value={newContact.notes}
                  onChange={(e) =>
                    setNewContact({ ...newContact, notes: e.target.value })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateContact}
                disabled={!newContact.name.trim() || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Guardar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contactos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={showOnlyWithBalance ? "default" : "outline"}
              onClick={() => setShowOnlyWithBalance(!showOnlyWithBalance)}
            >
              {showOnlyWithBalance ? "Todos" : "Solo con saldo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Contacts List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {loading
              ? "Cargando..."
              : `${filteredContacts.length} contactos`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                No hay contactos registrados
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                Agregar primer contacto
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredContacts.map((contact) => {
                const theyOweMe = parseFloat(contact.balance?.theyOweMe || "0");
                const iOweThem = parseFloat(contact.balance?.iOweThem || "0");
                const balanceInfo = getBalanceDirection(theyOweMe, iOweThem);

                return (
                  <Link
                    key={contact.id}
                    href={`/dashboard/contacts/${contact.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {getInitials(contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold">{contact.name}</p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {contact.company && (
                              <span className="flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                {contact.company}
                              </span>
                            )}
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </span>
                            )}
                          </div>
                          {contact.totalTransactions !== undefined && (
                            <p className="text-xs text-muted-foreground">
                              {contact.totalTransactions} transacciones
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        {balanceInfo.direction !== "neutral" && (
                          <>
                            <div className="flex items-center gap-1 justify-end">
                              {balanceInfo.direction === "positive" ? (
                                <ArrowDownRight className="h-4 w-4 text-orange-600" />
                              ) : (
                                <ArrowUpRight className="h-4 w-4 text-blue-600" />
                              )}
                              <span
                                className={`font-semibold ${
                                  balanceInfo.direction === "positive"
                                    ? "text-orange-600"
                                    : "text-blue-600"
                                }`}
                              >
                                {formatCurrency(balanceInfo.amount)}
                              </span>
                            </div>
                            <Badge
                              variant={
                                balanceInfo.direction === "positive"
                                  ? "warning"
                                  : "info"
                              }
                            >
                              {balanceInfo.label}
                            </Badge>
                          </>
                        )}
                        {balanceInfo.direction === "neutral" && (
                          <Badge variant="secondary">Sin saldo</Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
