import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { CompanyProvider } from "@/hooks/use-company";
import { Layout } from "@/components/layout";

import Dashboard from "@/pages/dashboard";
import InvoicesPage from "@/pages/invoices";
import PurchasesPage from "@/pages/purchases";
import TreasuryPage from "@/pages/treasury";
import ForecastPage from "@/pages/forecast";
import TasksPage from "@/pages/tasks";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/invoices" component={InvoicesPage} />
        <Route path="/purchases" component={PurchasesPage} />
        <Route path="/treasury" component={TreasuryPage} />
        <Route path="/forecast" component={ForecastPage} />
        <Route path="/tasks" component={TasksPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CompanyProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </CompanyProvider>
    </QueryClientProvider>
  );
}

export default App;
