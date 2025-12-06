"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  Wallet,
  Settings,
  MessageSquare,
  Menu,
  X,
  PlusCircle,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Transacciones", href: "/dashboard/transactions", icon: ArrowLeftRight },
  { name: "Contactos", href: "/dashboard/contacts", icon: Users },
  { name: "Saldos", href: "/dashboard/balances", icon: Wallet },
  { name: "WhatsApp", href: "/dashboard/whatsapp", icon: Smartphone },
  { name: "Mensajes", href: "/dashboard/messages", icon: MessageSquare },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <span className="font-bold">Asistente</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-slate-100 rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <Link href="/dashboard/transactions/new">
            <Button className="w-full" size="sm">
              <PlusCircle className="h-4 w-4 mr-2" />
              Nueva transacción
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b flex items-center px-4 gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 hover:bg-slate-100 rounded-md"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          <Link href="/dashboard/transactions/new">
            <Button size="sm" className="hidden sm:flex">
              <PlusCircle className="h-4 w-4 mr-2" />
              Nueva transacción
            </Button>
          </Link>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
