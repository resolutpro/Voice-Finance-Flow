import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// AÑADIMOS useCompany AQUÍ
import { CompanyProvider, useCompany } from "@/hooks/use-company";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";

// Páginas de auth
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";

// Páginas de la app
import Dashboard from "@/pages/dashboard";
import InvoicesPage from "@/pages/invoices";
import PurchasesPage from "@/pages/purchases";
import TreasuryPage from "@/pages/treasury";
import ForecastPage from "@/pages/forecast";
import TasksPage from "@/pages/tasks";
import NotFound from "@/pages/not-found";
import SettingsPage from "@/pages/settings";
import RecurringCommitments from "@/pages/recurring-commitments";
import DebtControlPage from "./pages/debt-control";
import ReportsPage from "@/pages/informes";
import AccountingPage from "@/pages/contabilidad";

const queryClient = new QueryClient();

// COMPONENTE NUEVO: Guardián de Módulos
// COMPONENTE NUEVO: Guardián de Módulos
function ModuleGuard({
  children,
  requiredModule,
}: {
  children: React.ReactNode;
  requiredModule: string;
}) {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();

  // CORRECCIÓN 2: Validamos si el rol es "admin"
  if (user?.role === "admin" || requiredModule === "dashboard") {
    return <>{children}</>;
  }

  let hasAccess = false;

  if (activeCompanyId && user?.companyAccess) {
    const access = user.companyAccess.find(
      (acc: any) => String(acc.companyId) === String(activeCompanyId),
    );
    if (access && access.modules.includes(requiredModule)) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

// Este componente envuelve de forma segura toda el área privada
function PrivateApp() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return (
    <CompanyProvider>
      <Layout>
        <Switch>
          <Route path="/">
            <ModuleGuard requiredModule="dashboard">
              <Dashboard />
            </ModuleGuard>
          </Route>
          <Route path="/invoices">
            <ModuleGuard requiredModule="invoices">
              <InvoicesPage />
            </ModuleGuard>
          </Route>
          <Route path="/purchases">
            <ModuleGuard requiredModule="purchases">
              <PurchasesPage />
            </ModuleGuard>
          </Route>
          <Route path="/treasury">
            <ModuleGuard requiredModule="treasury">
              <TreasuryPage />
            </ModuleGuard>
          </Route>
          <Route path="/forecast">
            <ModuleGuard requiredModule="forecast">
              <ForecastPage />
            </ModuleGuard>
          </Route>
          <Route path="/tasks">
            <ModuleGuard requiredModule="tasks">
              <TasksPage />
            </ModuleGuard>
          </Route>
          <Route path="/settings">
            <ModuleGuard requiredModule="settings">
              <SettingsPage />
            </ModuleGuard>
          </Route>
          <Route path="/compromisos">
            <ModuleGuard requiredModule="compromisos">
              <RecurringCommitments />
            </ModuleGuard>
          </Route>
          <Route path="/debt-control">
            <ModuleGuard requiredModule="debt_control">
              <DebtControlPage />
            </ModuleGuard>
          </Route>
          <Route path="/informes">
            <ModuleGuard requiredModule="reports">
              <ReportsPage />
            </ModuleGuard>
          </Route>
          <Route path="/contabilidad">
            <ModuleGuard requiredModule="accounting">
              <AccountingPage />
            </ModuleGuard>
          </Route>
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </CompanyProvider>
  );
}

function Router() {
  return (
    <Switch>
      {/* Rutas Públicas */}
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      {/* Ruta Privada: Derivamos toda la lógica a un sub-componente seguro */}
      <Route>
        <PrivateApp />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
