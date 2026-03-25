import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Link, useSearch } from "wouter"; // Usamos useSearch para leer la URL

export default function RegisterPage() {
  const { login } = useAuth();

  // Leer el parámetro ?token= de la URL
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const inviteToken = params.get("token");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Aquí enviarás el token al backend junto con los datos
    /*
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: e.target.name.value,
        email: e.target.email.value,
        password: e.target.password.value,
        token: inviteToken // ¡Crucial!
      })
    });
    */

    login("token-temporal-de-prueba");
  };

  // Si alguien entra a /register sin un token válido, le bloqueamos la vista
  if (!inviteToken) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center text-destructive">
            <CardTitle>Acceso Restringido</CardTitle>
            <CardDescription>
              El registro en esta plataforma es únicamente por invitación. Por
              favor, solicita un enlace válido a tu administrador.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Si hay token, mostramos el formulario normal
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Crear Cuenta</CardTitle>
          <CardDescription>
            Completa tu registro para tu espacio de facturación
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="grid gap-4">
            {/* ... inputs de nombre, email y contraseña idénticos a los tuyos ... */}
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Nombre completo
              </label>
              <Input id="name" type="text" placeholder="Juan Pérez" required />
            </div>
            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="hola@empresa.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                Contraseña
              </label>
              <Input id="password" type="password" required />
            </div>

            <Button type="submit" className="w-full mt-2">
              Registrarse
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
