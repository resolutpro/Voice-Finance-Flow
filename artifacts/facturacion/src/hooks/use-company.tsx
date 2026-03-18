import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { Company } from "@api-zod/generated";

interface CompanyContextType {
  activeCompanyId: number | null;
  activeCompany: Company | null;
  setActiveCompanyId: (id: number | null) => void;
  companies: Company[];
  setCompanies: (companies: Company[]) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  const activeCompany = companies.find((c) => c.id === activeCompanyId) || null;

  // Efecto para inyectar el color EXACTO de la empresa
  useEffect(() => {
    const root = document.documentElement;

    if (activeCompany?.themeColor) {
      // Al sobreescribir '--color-primary' directamente, evitamos el problema del hsl()
      // Tailwind v4 utilizará este HEX puro para todo, incluso para calcular fondos como bg-primary/10
      root.style.setProperty("--color-primary", activeCompany.themeColor);
    } else {
      // Restauramos el color por defecto borrando nuestra inyección
      root.style.removeProperty("--color-primary");
    }
  }, [activeCompany]);

  return (
    <CompanyContext.Provider
      value={{
        activeCompanyId,
        activeCompany,
        setActiveCompanyId,
        companies,
        setCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
}
