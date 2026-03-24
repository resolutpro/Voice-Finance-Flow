// artifacts/facturacion/src/components/layout.tsx
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FileText,
  ShoppingBag,
  Landmark,
  TrendingUp,
  CheckSquare,
  Building2,
  Bell,
  Menu,
  Repeat,
  ShieldAlert,
  BarChart,
  Calculator,
} from "lucide-react";
import { useCompany } from "@/hooks/use-company";
import { useListCompanies, useSeedData } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { VoiceAssistant } from "./voice-assistant";
// Importamos el nuevo componente de Menú de Usuario
import { Select, Avatar, AvatarFallback } from "./shared-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
// IMPORTAR EL NUEVO COMPONENTE
import { UserAvatarMenu } from "./user-avatar-menu";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Facturación", icon: FileText },
  {
    label: "Gastos recurrentes",
    href: "/compromisos",
    icon: Repeat,
    variant: "ghost",
  },
  { href: "/purchases", label: "Compras", icon: ShoppingBag },
  { href: "/treasury", label: "Tesorería", icon: Landmark },
  {
    label: "Control de Cartera", // O "Deuda y Riesgo"
    href: "/debt-control",
    icon: ShieldAlert,
  },

  { href: "/forecast", label: "Previsión", icon: TrendingUp },
  { href: "/contabilidad", label: "Contabilidad", icon: Calculator },

  { href: "/tasks", label: "Tareas", icon: CheckSquare },
  {
    label: "Informes y Exportación",
    href: "/informes",
    icon: BarChart,
  },
  { href: "/settings", label: "Configuración", icon: Building2 },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { activeCompanyId, setActiveCompanyId } = useCompany();
  const { data: companies } = useListCompanies();
  const seedMutation = useSeedData();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSeed = () => {
    seedMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({
          title: "Datos generados",
          description: "Datos de demostración creados con éxito.",
        });
      },
    });
  };

  const activeCompany = companies?.find((c) => c.id === activeCompanyId);
  const dynamicLogo = activeCompany?.logo || null;

  // TAREA 3: Inyección del color de la marca en el background del header.
  // Usamos el 'themeColor' guardado en la DB como un tintado suave (opacidad 10/255 -> ~4%).
  // Inyección del color de la marca en el background del header.

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row border-t-[6px] border-primary transition-colors duration-500">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-card border-r border-border flex-shrink-0 md:h-screen md:sticky md:top-0 z-10 hidden md:flex flex-col">
        <div className="h-20 flex items-center px-6 border-b border-border/50 relative overflow-hidden bg-primary/5">
          <div className="flex items-center gap-3 relative z-10 w-full">
            <div className="w-10 h-10 rounded-xl bg-white shadow-sm border flex items-center justify-center p-1 shrink-0">
              {dynamicLogo ? (
                <img
                  src={dynamicLogo}
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <Landmark className="w-6 h-6 text-primary" />
              )}
            </div>
            <span className="font-display font-bold text-lg tracking-tight truncate text-foreground">
              {activeCompany ? activeCompany.name : "FinanzasPro"}
            </span>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-1 mt-2">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 relative group",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-md"></div>
                )}
                <item.icon
                  className={cn(
                    "w-5 h-5",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header TAREA 3: Inyectamos el tintado de color en la sección izquierda del header */}
        <header className="h-16 bg-card/80 backdrop-blur-md border-b border-border/50 sticky top-0 z-10 px-4 md:px-8 flex items-center justify-between">
          {/* SECCIÓN IZQUIERDA: Usamos bg-primary/5 que ahora funcionará perfecto con tu HEX */}
          <div className="flex items-center gap-4 flex-1 h-full px-2 bg-primary/5 border-b-2 border-primary/20 transition-colors">
            <button className="md:hidden p-2 text-muted-foreground">
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              {dynamicLogo && (
                <div className="w-8 h-8 rounded-lg bg-white shadow-sm border flex items-center justify-center p-1 shrink-0">
                  <img
                    src={dynamicLogo}
                    alt="Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <h1 className="font-display font-semibold text-xl hidden sm:block text-primary truncate max-w-sm">
                {activeCompany
                  ? activeCompany.name
                  : navItems.find(
                      (n) =>
                        n.href === location ||
                        (n.href !== "/" && location.startsWith(n.href)),
                    )?.label || "App"}
              </h1>
            </div>
          </div>

          {/* SECCIÓN DERECHA: Controles */}
          <div className="flex items-center gap-4 pl-4 border-l">
            {/* TAREA 2: Selector de empresa más prominente y con ancho suficiente para el nombre completo */}
            <div className="flex items-center gap-2 bg-primary/10 rounded-xl px-2 py-1 border border-primary/20 transition-colors">
              <Building2 className="w-4 h-4 text-primary ml-2 hidden sm:block" />
              <Select
                // Aumentamos el ancho a w-[240px] o más si es necesario para mostrar el nombre completo.
                className="h-8 border-none bg-transparent shadow-none focus:ring-0 w-[240px] font-semibold text-primary"
                value={activeCompanyId || ""}
                // En el frontend, React prefiere que usemos un valor de tipo 'string' para los options.
                // Aquí, el onChange convertirá el valor de vuelta a número para `setActiveCompanyId`.
                onChange={(e) =>
                  setActiveCompanyId(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">Sin empresa</option>
                {companies?.map((c) => (
                  // Usamos `Number(c.id)` para la validación estricta de Zod si es necesario
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <button className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
              <Bell className="w-5 h-5" />
            </button>

            {/* TAREA 1: Reemplazamos el placeholder US por el nuevo Menú de Usuario interactivo */}
            <UserAvatarMenu />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </div>
      </main>

      <VoiceAssistant />
    </div>
  );
}
