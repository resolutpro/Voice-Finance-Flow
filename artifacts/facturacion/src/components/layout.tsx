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
  Menu,
  Repeat,
  ShieldAlert,
  BarChart,
  Calculator,
  ChevronLeft,
} from "lucide-react";
import { useCompany } from "@/hooks/use-company";
import { useListCompanies, useSeedData } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { VoiceAssistant } from "./voice-assistant";
import { Select, Avatar, AvatarFallback } from "./shared-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { UserAvatarMenu } from "./user-avatar-menu";
import { useAuth } from "@/hooks/use-auth";

// Añadimos moduleId a todos los items para la lógica de permisos
const navItems = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    moduleId: "dashboard",
  },
  {
    href: "/invoices",
    label: "Facturación",
    icon: FileText,
    moduleId: "invoices",
  },
  {
    label: "Gastos recurrentes",
    href: "/compromisos",
    icon: Repeat,
    variant: "ghost",
    moduleId: "compromisos",
  },
  {
    href: "/purchases",
    label: "Compras",
    icon: ShoppingBag,
    moduleId: "purchases",
  },
  {
    href: "/treasury",
    label: "Tesorería",
    icon: Landmark,
    moduleId: "treasury",
  },
  {
    label: "Control de Cartera",
    href: "/debt-control",
    icon: ShieldAlert,
    moduleId: "debt_control",
  },
  {
    href: "/forecast",
    label: "Previsión",
    icon: TrendingUp,
    moduleId: "forecast",
  },
  {
    href: "/contabilidad",
    label: "Contabilidad",
    icon: Calculator,
    moduleId: "accounting",
  },
  { href: "/tasks", label: "Tareas", icon: CheckSquare, moduleId: "tasks" },
  {
    label: "Informes y Exportación",
    href: "/informes",
    icon: BarChart,
    moduleId: "reports",
  },
  {
    href: "/settings",
    label: "Configuración",
    icon: Building2,
    moduleId: "settings",
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { activeCompanyId, setActiveCompanyId } = useCompany();
  const { data: companies } = useListCompanies();
  const seedMutation = useSeedData();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

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
  const themeColor = activeCompany?.themeColor;

  // Lógica de Permisos
  const hasAccessToModule = (moduleId?: string) => {
    // Si aún no carga el usuario, no mostramos el menú de momento
    if (!user) return false;

    // 1. Si es ADMIN, tiene acceso total y global a todo.
    if (user.role?.toLowerCase() === "admin") return true;

    // 2. El dashboard es público para todos los logueados
    if (moduleId === "dashboard") return true;

    // 3. Si no hay empresa seleccionada, no pueden ver módulos específicos
    if (!activeCompanyId) return false;

    // 4. Verificamos si tiene acceso a ESTA empresa en concreto
    const companyAccess = user.companyAccess?.find(
      (acc: any) => String(acc.companyId) === String(activeCompanyId),
    );

    // Si no está autorizado para esta empresa, no ve nada.
    if (!companyAccess || !companyAccess.modules) return false;

    // 5. Verificamos si el módulo que intenta renderizar está en su array de permitidos
    return companyAccess.modules.includes(moduleId);
  };

  // Filtramos la navegación según permisos
  const filteredNavItems = navItems.filter((item) =>
    hasAccessToModule(item.moduleId),
  );

  // TAREA 3: Inyección del color de la marca en el background del header.
  // Usamos el 'themeColor' guardado en la DB como un tintado suave (opacidad 10/255 -> ~4%).
  return (
    <div
      className="min-h-screen bg-background flex flex-col md:flex-row transition-colors duration-500 ease-in-out"
      style={themeColor ? { backgroundColor: themeColor } : undefined}
    >
      {/* Sidebar */}
      <aside
        className={cn(
          "md:bg-white border-r border-border flex-shrink-0 md:h-screen md:sticky md:top-0 z-10 hidden md:flex flex-col transition-all duration-300 overflow-hidden",
          sidebarCollapsed ? "md:w-0" : "md:w-64",
        )}
      >
        <div className="h-20 flex items-center px-6 border-b border-border/50 relative overflow-hidden bg-white justify-center">
          <div
            className={cn(
              "flex items-center gap-3 relative z-10",
              sidebarCollapsed ? "w-full justify-center" : "w-full",
            )}
          >
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm border flex items-center justify-center p-1 shrink-0">
              {dynamicLogo ? (
                <img
                  src={dynamicLogo}
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <Landmark className="w-7 h-7 text-primary" />
              )}
            </div>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-1 mt-2">
          {/* Mapeamos SOLO los módulos permitidos */}
          {filteredNavItems.map((item) => {
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
                {!sidebarCollapsed && item.label}
              </Link>
            );
          })}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header TAREA 3: Inyectamos el tintado de color en la sección izquierda del header */}
        <header className="h-16 bg-white backdrop-blur-md border-b border-border/50 sticky top-0 z-10 px-4 md:px-8 flex items-center justify-between">
          {/* SECCIÓN IZQUIERDA: Usamos bg-white que ahora funcionará perfecto con tu HEX */}
          <div className="flex items-center gap-4 flex-1 h-full px-2 bg-white transition-colors">
            <button
              className="md:hidden p-2 text-muted-foreground"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <button
              className="hidden md:block p-2 text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <ChevronLeft
                className={cn(
                  "w-6 h-6 transition-transform duration-300",
                  sidebarCollapsed && "rotate-180",
                )}
              />
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
                  : filteredNavItems.find(
                      // Cambiado a filteredNavItems
                      (n) =>
                        n.href === location ||
                        (n.href !== "/" && location.startsWith(n.href)),
                    )?.label || "App"}
              </h1>
            </div>
          </div>

          {/* SECCIÓN DERECHA: Controles */}
          <div className="hidden md:flex items-center gap-4 pl-4 border-l">
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

            {/* TAREA 1: Reemplazamos el placeholder US por el nuevo Menú de Usuario interactivo */}
            <UserAvatarMenu />
          </div>
        </header>

        {/* Mobile Sidebar */}
        {sidebarOpen && (
          <nav className="md:hidden bg-white border-b border-border">
            <div className="p-4 space-y-1">
              {/* Mapeamos SOLO los módulos permitidos también en mobile */}
              {filteredNavItems.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
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
          </nav>
        )}

        {/* Page Content */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </div>
      </main>

      <VoiceAssistant />
    </div>
  );
}
