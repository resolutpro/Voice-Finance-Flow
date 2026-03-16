import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { CompanyProvider } from "@/hooks/use-company";
import { AuthProvider, useAuth } from "@/hooks/use-auth"; // Importamos el contexto
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

const queryClient = new QueryClient();

// Componente para proteger las rutas privadas
const ProtectedRoute = ({ component: Component, ...rest }: any) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component {...rest} />;
};

function Router() {
  const { isAuthenticated } = useAuth();

  return (
    <Switch>
      {/* Rutas Públicas (Sin Layout) */}
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      {/* Rutas Privadas (Con Layout). Nota: Le quitamos el path="/:rest*" */}
      <Route>
        {isAuthenticated ? (
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/invoices" component={InvoicesPage} />
              <Route path="/purchases" component={PurchasesPage} />
              <Route path="/treasury" component={TreasuryPage} />
              <Route path="/forecast" component={ForecastPage} />
              <Route path="/tasks" component={TasksPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        ) : (
          <Redirect to="/login" />
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <CompanyProvider>
            <TooltipProvider>
              <Router />
              <Toaster />
            </TooltipProvider>
          </CompanyProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
