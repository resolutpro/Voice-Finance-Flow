import { createContext, useContext, useState, ReactNode } from "react";
import { useLocation } from "wouter";

interface AuthContextType {
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // En un caso real, aquí comprobarías si hay un token JWT en localStorage
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    !!localStorage.getItem("token"),
  );
  const [, setLocation] = useLocation();

  const login = (token: string) => {
    localStorage.setItem("token", token);
    setIsAuthenticated(true);
    setLocation("/"); // Redirige al Dashboard tras loguearse
  };

  const logout = () => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return context;
}
