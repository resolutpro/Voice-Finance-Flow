import { useState } from "react";
import { useListTasks, useCreateTask } from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, Button, Badge, Modal, Input, Label } from "@/components/shared-ui";
import { Plus, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function TasksPage() {
  const { activeCompanyId } = useCompany();
  const { data: tasks, isLoading } = useListTasks(activeCompanyId ? { companyId: activeCompanyId } : undefined);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();

  const handleNewTask = () => {
    if (!activeCompanyId) {
      toast({ title: "Selecciona una empresa", description: "Debes seleccionar una empresa específica para crear una tarea.", variant: "destructive" });
      return;
    }
    setIsCreateOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">Tareas Operativas</h2>
          <p className="text-muted-foreground">Seguimiento de acciones pendientes</p>
        </div>
        <Button onClick={handleNewTask} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Nueva Tarea
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" /> Pendientes
          </h3>
          {tasks?.filter(t => t.status === 'pending').map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
          {tasks?.filter(t => t.status === 'pending').length === 0 && (
            <div className="text-center p-6 border border-dashed border-border rounded-xl text-muted-foreground text-sm">No hay tareas pendientes</div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-primary" /> En Proceso
          </h3>
          {tasks?.filter(t => t.status === 'in_progress').map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
          {tasks?.filter(t => t.status === 'in_progress').length === 0 && (
            <div className="text-center p-6 border border-dashed border-border rounded-xl text-muted-foreground text-sm">No hay tareas en proceso</div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Completadas
          </h3>
          {tasks?.filter(t => t.status === 'completed').map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
          {tasks?.filter(t => t.status === 'completed').length === 0 && (
            <div className="text-center p-6 border border-dashed border-border rounded-xl text-muted-foreground text-sm">No hay tareas completadas</div>
          )}
        </div>
      </div>

      <CreateTaskModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} companyId={activeCompanyId || undefined} />
    </div>
  );
}

interface TaskItem {
  id: number;
  title: string;
  description?: string | null;
  priority?: string | null;
  status: string;
}

function TaskCard({ task }: { task: TaskItem }) {
  return (
    <Card className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98]">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px] uppercase">
            {task.priority || 'Normal'}
          </Badge>
        </div>
        <h4 className="font-medium text-foreground mb-1">{task.title}</h4>
        {task.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{task.description}</p>}
      </CardContent>
    </Card>
  );
}

function CreateTaskModal({ isOpen, onClose, companyId }: { isOpen: boolean, onClose: () => void, companyId?: number }) {
  const [title, setTitle] = useState("");
  const createMutation = useCreateTask();
  const queryClient = useQueryClient();

  const handleSubmit = () => {
    if(!title) return;
    createMutation.mutate({
      data: { title, companyId, status: 'pending', priority: 'normal' }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        setTitle("");
        onClose();
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crear Tarea">
      <div className="space-y-4">
        <div>
          <Label>Título de la Tarea</Label>
          <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Revisar facturación Q1" />
        </div>
        <div className="flex justify-end pt-4">
          <Button onClick={handleSubmit} isLoading={createMutation.isPending}>Guardar Tarea</Button>
        </div>
      </div>
    </Modal>
  );
}
