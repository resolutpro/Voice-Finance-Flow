import { useState, useMemo } from "react";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useListProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from "@workspace/api-client-react";
import { useCompany } from "@/hooks/use-company";
import { Card, Button, Modal, Input, Label } from "@/components/shared-ui";
import {
  Plus,
  Edit3,
  Trash2,
  Folder,
  Users,
  AlertCircle,
  Filter,
  CornerDownRight,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function TasksPage() {
  const { activeCompanyId } = useCompany();

  const { data: tasks, isLoading: isLoadingTasks } = useListTasks(
    activeCompanyId ? { companyId: activeCompanyId } : undefined,
  );
  const { data: projects, isLoading: isLoadingProjects } = useListProjects(
    activeCompanyId ? { companyId: activeCompanyId } : undefined,
  );

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  const [taskToEdit, setTaskToEdit] = useState<any>(null);
  const [projectToEdit, setProjectToEdit] = useState<any>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { toast } = useToast();
  const deleteMutation = useDeleteTask();
  const deleteProjectMutation = useDeleteProject();
  const queryClient = useQueryClient();

  const handleOpenTaskModal = (task = null) => {
    if (!activeCompanyId)
      return toast({ title: "Selecciona una empresa", variant: "destructive" });
    setTaskToEdit(task);
    setIsTaskModalOpen(true);
  };

  const handleOpenProjectModal = (project = null) => {
    if (!activeCompanyId)
      return toast({ title: "Selecciona una empresa", variant: "destructive" });
    setProjectToEdit(project);
    setIsProjectModalOpen(true);
  };

  const handleDeleteTask = (id: number) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar esta tarea?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
            toast({ title: "Tarea eliminada" });
          },
        },
      );
    }
  };

  const handleDeleteProject = (id: number) => {
    if (
      window.confirm(
        "Al eliminar el proyecto podrías dejar tareas huérfanas. ¿Continuar?",
      )
    ) {
      deleteProjectMutation.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
            toast({ title: "Proyecto eliminado" });
          },
        },
      );
    }
  };

  // Agrupación híbrida: Proyectos siempre visibles, Tareas generales separadas
  const { projectGroups, generalTasks } = useMemo(() => {
    const pGroups = (projects || [])
      .map((p) => {
        const pTasks = (tasks || []).filter(
          (t) => t.relatedType === "project" && t.relatedId === p.id,
        );
        const filteredPTasks =
          statusFilter === "all"
            ? pTasks
            : pTasks.filter((t) => t.status === statusFilter);

        // Mostrar el proyecto si el filtro está en "Todos", o si su estado coincide, o si tiene tareas que coinciden
        const show =
          statusFilter === "all" ||
          p.status === statusFilter ||
          filteredPTasks.length > 0;

        return { project: p, tasks: filteredPTasks, show };
      })
      .filter((g) => g.show);

    const gTasks = (tasks || []).filter(
      (t) =>
        !t.relatedType ||
        t.relatedType !== "project" ||
        !(projects || []).find((p) => p.id === t.relatedId),
    );
    const filteredGTasks =
      statusFilter === "all"
        ? gTasks
        : gTasks.filter((t) => t.status === statusFilter);

    return { projectGroups: pGroups, generalTasks: filteredGTasks };
  }, [tasks, projects, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">
            Control Operativo
          </h2>
          <p className="text-muted-foreground">
            Gestión de proyectos y seguimiento de tareas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenProjectModal()}
            className="gap-2 bg-background"
          >
            <Folder className="w-4 h-4" /> Nuevo Proyecto
          </Button>
          <Button
            onClick={() => handleOpenTaskModal()}
            className="gap-2 shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" /> Nueva Tarea
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b border-border bg-muted/10 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Label className="whitespace-nowrap mb-0">Filtrar estado:</Label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <option value="all">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_curso">En Curso</option>
              <option value="bloqueada">Bloqueada</option>
              <option value="hecha">Hecha</option>
              <option value="revisada">Revisada</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
              <tr>
                <th className="px-6 py-4 font-medium">Nombre / Descripción</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium">Responsable</th>
                <th className="px-6 py-4 font-medium">Fecha Objetivo</th>
                <th className="px-6 py-4 font-medium">
                  Observaciones / Bloqueos
                </th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {/* TAREAS GENERALES (Sin Proyecto) */}
              {generalTasks.length > 0 && (
                <optgroup className="contents">
                  <tr className="bg-muted/10 border-b border-border">
                    <td
                      colSpan={6}
                      className="px-6 py-3 font-semibold text-muted-foreground"
                    >
                      Tareas Generales (Sin Proyecto)
                    </td>
                  </tr>
                  {generalTasks.map((task) => (
                    <tr
                      key={`task-${task.id}`}
                      className="border-b border-border hover:bg-muted/10 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-foreground">
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {task.description}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          {task.assignee || "-"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="px-6 py-4">
                        <ObservationsDisplay text={task.observations} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ActionButtons
                          onEdit={() => handleOpenTaskModal(task)}
                          onDelete={() => handleDeleteTask(task.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </optgroup>
              )}

              {/* GRUPOS DE PROYECTOS */}
              {projectGroups.map((group) => (
                <optgroup key={`proj-${group.project.id}`} className="contents">
                  {/* Fila Padre: Datos del Proyecto */}
                  <tr className="bg-primary/5 hover:bg-primary/10 transition-colors border-b border-border/50 shadow-sm">
                    <td className="px-6 py-4 font-semibold text-primary">
                      <div className="flex items-center gap-2">
                        <Folder className="w-5 h-5" />
                        <span>{group.project.name}</span>
                      </div>
                      {group.project.description && (
                        <p className="text-xs font-normal text-muted-foreground mt-1 line-clamp-1 ml-7">
                          {group.project.description}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={group.project.status} />
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {group.project.assignee || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-muted-foreground">
                      {group.project.dueDate
                        ? new Date(group.project.dueDate).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <ObservationsDisplay text={group.project.observations} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ActionButtons
                        onEdit={() => handleOpenProjectModal(group.project)}
                        onDelete={() => handleDeleteProject(group.project.id)}
                      />
                    </td>
                  </tr>

                  {/* Tareas del Proyecto (Anidadas) */}
                  {group.tasks.length === 0 ? (
                    <tr className="border-b border-border">
                      <td
                        colSpan={6}
                        className="px-6 py-3 pl-14 text-sm text-muted-foreground/60 italic"
                      >
                        Sin tareas asignadas a este proyecto.
                      </td>
                    </tr>
                  ) : (
                    group.tasks.map((task) => (
                      <tr
                        key={`task-${task.id}`}
                        className="border-b border-border hover:bg-muted/10 transition-colors"
                      >
                        <td className="px-6 py-3 pl-12 flex items-start gap-2">
                          <CornerDownRight className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium text-sm text-foreground">
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                {task.description}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <StatusBadge status={task.status} />
                        </td>
                        <td className="px-6 py-3 text-sm text-muted-foreground">
                          {task.assignee ? (
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              {task.assignee}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm text-muted-foreground">
                          {task.dueDate
                            ? new Date(task.dueDate).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="px-6 py-3">
                          <ObservationsDisplay text={task.observations} />
                        </td>
                        <td className="px-6 py-3 text-right">
                          <ActionButtons
                            onEdit={() => handleOpenTaskModal(task)}
                            onDelete={() => handleDeleteTask(task.id)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </optgroup>
              ))}

              {!isLoadingTasks &&
                !isLoadingProjects &&
                generalTasks.length === 0 &&
                projectGroups.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-muted-foreground border-b border-border"
                    >
                      No hay proyectos ni tareas para mostrar con los filtros
                      actuales.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </Card>

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskToEdit(null);
        }}
        companyId={activeCompanyId || undefined}
        task={taskToEdit}
        projects={projects || []}
      />
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => {
          setIsProjectModalOpen(false);
          setProjectToEdit(null);
        }}
        companyId={activeCompanyId || undefined}
        project={projectToEdit}
      />
    </div>
  );
}

// Subcomponente: Observaciones
function ObservationsDisplay({ text }: { text?: string | null }) {
  if (!text) return <span className="text-muted-foreground/50 text-xs">-</span>;
  return (
    <div className="flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400 max-w-[200px]">
      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span className="line-clamp-2" title={text}>
        {text}
      </span>
    </div>
  );
}

// Subcomponente: Botones de Acción
function ActionButtons({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={onEdit}
        className="h-8 px-2 text-muted-foreground hover:text-foreground"
      >
        <Edit3 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="h-8 px-2 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// Subcomponente: Badge de Estado
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; classes: string }> = {
    pendiente: {
      label: "Pendiente",
      classes: "bg-gray-100 text-gray-700 border-gray-200",
    },
    en_curso: {
      label: "En Curso",
      classes: "bg-blue-100 text-blue-700 border-blue-200",
    },
    bloqueada: {
      label: "Bloqueada",
      classes: "bg-red-100 text-red-700 border-red-200",
    },
    hecha: {
      label: "Hecha",
      classes: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    revisada: {
      label: "Revisada",
      classes: "bg-purple-100 text-purple-700 border-purple-200",
    },
  };
  const config = statusConfig[status] || statusConfig["pendiente"];
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wider ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

// Modal Crear/Editar Tarea
function TaskModal({
  isOpen,
  onClose,
  companyId,
  task,
  projects,
}: {
  isOpen: boolean;
  onClose: () => void;
  companyId?: number;
  task?: any;
  projects: any[];
}) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assignee: "",
    projectId: "",
    dueDate: "",
    status: "pendiente",
    observations: "",
  });
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const queryClient = useQueryClient();

  useMemo(() => {
    if (task) {
      setFormData({
        title: task.title || "",
        description: task.description || "",
        assignee: task.assignee || "",
        projectId:
          task.relatedType === "project" && task.relatedId
            ? String(task.relatedId)
            : "",
        dueDate: task.dueDate
          ? new Date(task.dueDate).toISOString().split("T")[0]
          : "",
        status: task.status || "pendiente",
        observations: task.observations || "",
      });
    } else {
      setFormData({
        title: "",
        description: "",
        assignee: "",
        projectId: "",
        dueDate: "",
        status: "pendiente",
        observations: "",
      });
    }
  }, [task, isOpen]);

  const handleSubmit = () => {
    if (!formData.title) return;
    const payload = {
      title: formData.title,
      description: formData.description,
      assignee: formData.assignee,
      dueDate: formData.dueDate || undefined,
      status: formData.status,
      observations: formData.observations,
      relatedType: formData.projectId ? "project" : undefined,
      relatedId: formData.projectId ? parseInt(formData.projectId) : undefined,
      companyId,
      priority: "normal",
    };
    const opts = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        onClose();
      },
    };
    if (task) updateMutation.mutate({ id: task.id, data: payload }, opts);
    else createMutation.mutate({ data: payload }, opts);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task ? "Modificar Tarea" : "Nueva Tarea"}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Título</Label>
            <Input
              autoFocus
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Asociar a Proyecto</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={formData.projectId}
              onChange={(e) =>
                setFormData({ ...formData, projectId: e.target.value })
              }
            >
              <option value="">-- Sin Proyecto (General) --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Responsable</Label>
            <Input
              value={formData.assignee}
              onChange={(e) =>
                setFormData({ ...formData, assignee: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Fecha Objetivo</Label>
            <Input
              type="date"
              value={formData.dueDate}
              onChange={(e) =>
                setFormData({ ...formData, dueDate: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Estado</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
            >
              <option value="pendiente">Pendiente</option>
              <option value="en_curso">En Curso</option>
              <option value="bloqueada">Bloqueada</option>
              <option value="hecha">Hecha</option>
              <option value="revisada">Revisada</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Observaciones / Bloqueos</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={formData.observations}
              onChange={(e) =>
                setFormData({ ...formData, observations: e.target.value })
              }
            />
          </div>
        </div>
        <div className="flex justify-end pt-4 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createMutation.isPending || updateMutation.isPending}
          >
            {task ? "Guardar" : "Crear"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Modal Crear/Editar Proyecto
function ProjectModal({
  isOpen,
  onClose,
  companyId,
  project,
}: {
  isOpen: boolean;
  onClose: () => void;
  companyId?: number;
  project?: any;
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    assignee: "",
    dueDate: "",
    status: "pendiente",
    observations: "",
  });
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const queryClient = useQueryClient();

  useMemo(() => {
    if (project) {
      setFormData({
        name: project.name || "",
        description: project.description || "",
        assignee: project.assignee || "",
        dueDate: project.dueDate
          ? new Date(project.dueDate).toISOString().split("T")[0]
          : "",
        status: project.status || "pendiente",
        observations: project.observations || "",
      });
    } else {
      setFormData({
        name: "",
        description: "",
        assignee: "",
        dueDate: "",
        status: "pendiente",
        observations: "",
      });
    }
  }, [project, isOpen]);

  const handleSubmit = () => {
    if (!formData.name || !companyId) return;
    const payload = {
      companyId,
      name: formData.name,
      description: formData.description || undefined,
      assignee: formData.assignee,
      dueDate: formData.dueDate || undefined,
      status: formData.status,
      observations: formData.observations,
      active: true,
    };
    const opts = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        onClose();
      },
    };
    if (project) updateMutation.mutate({ id: project.id, data: payload }, opts);
    else createMutation.mutate({ data: payload }, opts);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={project ? "Modificar Proyecto" : "Nuevo Proyecto"}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Nombre del Proyecto</Label>
            <Input
              autoFocus
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Responsable</Label>
            <Input
              value={formData.assignee}
              onChange={(e) =>
                setFormData({ ...formData, assignee: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Fecha Objetivo</Label>
            <Input
              type="date"
              value={formData.dueDate}
              onChange={(e) =>
                setFormData({ ...formData, dueDate: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Estado General</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
            >
              <option value="pendiente">Pendiente</option>
              <option value="en_curso">En Curso</option>
              <option value="bloqueada">Bloqueada</option>
              <option value="hecha">Hecha</option>
              <option value="revisada">Revisada</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Descripción (Opcional)</Label>
            <Input
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>
          <div className="md:col-span-2">
            <Label>Observaciones / Bloqueos</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={formData.observations}
              onChange={(e) =>
                setFormData({ ...formData, observations: e.target.value })
              }
            />
          </div>
        </div>
        <div className="flex justify-end pt-4 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createMutation.isPending || updateMutation.isPending}
            disabled={!formData.name}
          >
            {project ? "Guardar" : "Crear"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
