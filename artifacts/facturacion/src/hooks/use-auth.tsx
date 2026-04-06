import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { useLocation } from "wouter";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  defaultCompanyId: number | null;
  companyAccess: {
    companyId: number;
    modules: string[];
  }[];
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null; // AÑADIMOS EL USUARIO AQUÍ
  login: (token: string, userData?: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    !!localStorage.getItem("token"),
  );
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Para no mostrar el layout hasta validar
  const [, setLocation] = useLocation();

  // Función para pedir los datos del usuario al backend
  const fetchUser = async (token: string) => {
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsAuthenticated(true);
      } else {
        // Si el token falló o expiró
        logout();
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Efecto que se ejecuta al recargar la página
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetchUser(token);
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (token: string, userData?: User) => {
    localStorage.setItem("token", token);
    setIsAuthenticated(true);
    if (userData) {
      setUser(userData);
    } else {
      fetchUser(token); // Si el login no devolvió el user, lo pedimos
    }
    setLocation("/");
  };

  const logout = () => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
    setUser(null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, user, login, logout }}
    >
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
