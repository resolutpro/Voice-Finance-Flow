import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { Company } from "@api-zod/generated"; // Ajusta la ruta a tus tipos

interface CompanyContextType {
  activeCompanyId: number | null;
  activeCompany: Company | null;
  setActiveCompanyId: (id: number | null) => void;
  companies: Company[]; // Lista de empresas cargadas
  setCompanies: (companies: Company[]) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  const activeCompany = companies.find((c) => c.id === activeCompanyId) || null;

  // Efecto para inyectar el color de la empresa como variable CSS global
  useEffect(() => {
    if (activeCompany?.themeColor) {
      // Modificamos la variable CSS principal (ajusta '--primary' según tu tema de Tailwind/shadcn)
      document.documentElement.style.setProperty(
        "--primary",
        activeCompany.themeColor,
      );
    } else {
      // Restaurar el color por defecto si no hay empresa o no tiene color
      document.documentElement.style.removeProperty("--primary");
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
