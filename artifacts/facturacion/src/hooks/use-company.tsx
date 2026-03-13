import React, { createContext, useContext, useState, ReactNode } from 'react';

interface CompanyContextType {
  activeCompanyId: number | null;
  setActiveCompanyId: (id: number | null) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  // null means "All / Consolidated"
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);

  return (
    <CompanyContext.Provider value={{ activeCompanyId, setActiveCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
