// src/components/layout.tsx
import { ReactNode } from "react";
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
} from "lucide-react";
import { useCompany } from "@/hooks/use-company";
import { useListCompanies, useSeedData } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { VoiceAssistant } from "./voice-assistant";
import { Select } from "./shared-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Facturas", icon: FileText },
  { href: "/purchases", label: "Compras", icon: ShoppingBag },
  { href: "/treasury", label: "Tesorería", icon: Landmark },
  { href: "/forecast", label: "Previsión", icon: TrendingUp },
  { href: "/tasks", label: "Tareas", icon: CheckSquare },
  // Asegúrate de tener el enlace a settings
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

  // 1. Buscamos la empresa activa
  const activeCompany = companies?.find((c) => c.id === activeCompanyId);

  // 2. Extraemos sus propiedades estéticas (manejando el caso en que no exista)
  const dynamicLogo = activeCompany?.logo || null;
  const dynamicColor = (activeCompany as any)?.themeColor || undefined; // Color por defecto si es undefined

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar - Hidden on small screens, full height on md+ */}
      <aside className="w-full md:w-64 bg-card border-r border-border flex-shrink-0 md:h-screen md:sticky md:top-0 z-10 hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border/50">
          <div className="flex items-center gap-2">
            {/* Si hay logo, lo mostramos, si no, mostramos el icono por defecto */}
            {dynamicLogo ? (
              <img
                src={dynamicLogo}
                alt="Logo"
                className="w-8 h-8 object-contain"
              />
            ) : (
              <Landmark
                className="w-6 h-6"
                style={{ color: dynamicColor || "var(--primary)" }}
              />
            )}

            <span
              className="font-display font-bold text-xl tracking-tight"
              style={{ color: dynamicColor || "inherit" }}
            >
              {activeCompany ? activeCompany.name : "FinanzasPro"}
            </span>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-1">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10" // Mantenemos un fondo genérico
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                // Aplicamos el color del texto dinámicamente si está activo
                style={
                  isActive ? { color: dynamicColor || "var(--primary)" } : {}
                }
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-border/50">
          <button
            onClick={handleSeed}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Generar datos Demo
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-card/80 backdrop-blur-md border-b border-border/50 sticky top-0 z-10 px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 text-muted-foreground">
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="font-display font-semibold text-lg hidden sm:block">
              {navItems.find(
                (n) =>
                  n.href === location ||
                  (n.href !== "/" && location.startsWith(n.href)),
              )?.label || "App"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-2 py-1 border border-border/50">
              <Building2 className="w-4 h-4 text-muted-foreground ml-2 hidden sm:block" />
              <Select
                className="h-8 border-none bg-transparent shadow-none focus:ring-0 w-[180px] font-medium"
                value={activeCompanyId || ""}
                onChange={(e) =>
                  setActiveCompanyId(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">Sin empresa</option>
                {companies?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <button className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
              <Bell className="w-5 h-5" />
            </button>

            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold border-2 border-white shadow-sm"
              // Usamos el color dinámico como fondo del avatar
              style={{ backgroundColor: dynamicColor || "var(--primary)" }}
            >
              JS
            </div>
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
