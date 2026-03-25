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
import { useState } from "react";

export default function RegisterPage() {
  const { login } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Leer el parámetro ?token= de la URL
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const inviteToken = params.get("token");

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}api/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            password,
            token: inviteToken,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Error al registrarse");
        return;
      }

      const data = await response.json();
      login(data.token);
    } catch (err) {
      setError("Error de conexión con el servidor");
      console.error(err);
    } finally {
      setLoading(false);
    }
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
            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-3 rounded">
                {error}
              </div>
            )}
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Nombre completo
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Juan Pérez"
                required
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="hola@empresa.com"
                required
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                Contraseña
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? "Registrando..." : "Registrarse"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
