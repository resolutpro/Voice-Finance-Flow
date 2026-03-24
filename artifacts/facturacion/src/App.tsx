// artifacts/facturacion/src/App.tsx
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { CompanyProvider } from "@/hooks/use-company";
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
          <Route path="/" component={Dashboard} />
          <Route path="/invoices" component={InvoicesPage} />
          <Route path="/purchases" component={PurchasesPage} />
          <Route path="/treasury" component={TreasuryPage} />
          <Route path="/forecast" component={ForecastPage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/compromisos" component={RecurringCommitments} />
          <Route path="/debt-control" component={DebtControlPage} />
          <Route path="/informes" component={ReportsPage} />
          <Route path="/contabilidad" component={AccountingPage} />
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
