// artifacts/facturacion/src/components/user-avatar-menu.tsx
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shared-ui";
import { LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth"; // <-- Importamos tu sistema de autenticación real

// Función utilitaria para calcular las iniciales
function getInitials(name: string | null | undefined): string {
  if (!name) return "US";
  const names = name.trim().split(" ");
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  return (names[0][0] + names[1][0]).toUpperCase();
}

export function UserAvatarMenu() {
  // Obtenemos el usuario real y la función de cierre de sesión desde tu hook
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Avatar className="w-10 h-10 border-2 border-background shadow-sm">
        <AvatarFallback>...</AvatarFallback>
      </Avatar>
    );
  }

  // Si por algún motivo no hay sesión, mostramos un genérico
  const currentUser = user || { name: "Usuario", email: "" };
  const initials = getInitials(currentUser.name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground font-semibold border-2 border-background shadow-sm bg-primary transition-colors cursor-pointer hover:ring-2 hover:ring-primary/20">
          <Avatar className="w-10 h-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem className="gap-2 cursor-default font-medium">
          <User className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold truncate">
              {currentUser.name}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {currentUser.email}
            </span>
          </div>
        </DropdownMenuItem>

        <div className="border-t my-1"></div>

        {/* Ejecutamos la función de tu hook para cerrar sesión real */}
        <DropdownMenuItem
          onClick={() => logout && logout()}
          className="text-destructive focus:text-destructive gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
