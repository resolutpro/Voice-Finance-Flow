import { useState } from "react";
import { Plus, MoreHorizontal, ShieldOff, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// Ajusta estas importaciones a tus hooks reales autogenerados
import {
  useGetAuthorizedUsers,
  useDeleteAuthorizedUsersUserId,
} from "@workspace/api-client-react";
import { UserAccessModal } from "./user-access-modal";


export function AuthorizedUsersPanel() {
  const { data: users, isLoading, refetch } = useGetAuthorizedUsers();
  const { mutateAsync: revokeAccess } = useDeleteAuthorizedUsersUserId();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  const handleOpenCreate = () => {
    setSelectedUser(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleRevoke = async (userId: string) => {
    if (
      confirm("¿Estás seguro de que deseas revocar el acceso a este usuario?")
    ) {
      await revokeAccess({ userId });
      refetch(); // Recargamos la lista
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Usuarios Autorizados</CardTitle>
          <CardDescription>
            Gestiona quién tiene acceso a tus empresas y qué módulos pueden ver.
          </CardDescription>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Invitar Usuario
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando usuarios...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Empresas Asignadas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center py-4 text-muted-foreground"
                  >
                    No hay usuarios autorizados todavía.
                  </TableCell>
                </TableRow>
              ) : (
                users?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.companyAccess.length} empresa(s)
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleOpenEdit(user)}
                          >
                            <Edit2 className="mr-2 h-4 w-4" />
                            Editar Permisos
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRevoke(user.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <ShieldOff className="mr-2 h-4 w-4" />
                            Revocar Acceso
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Modal de Creación/Edición */}
      <UserAccessModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={selectedUser}
        onSuccess={refetch}
      />
    </Card>
  );
}
