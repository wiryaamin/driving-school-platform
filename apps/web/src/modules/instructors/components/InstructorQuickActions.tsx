import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil, Eye, UserX, Calendar } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useArchiveInstructor } from '../hooks/useInstructors.js';
import type { Instructor } from '../hooks/useInstructors.js';

interface InstructorQuickActionsProps {
  instructor: Instructor;
  onEdit?:    (instructor: Instructor) => void;
}

export function InstructorQuickActions({ instructor, onEdit }: InstructorQuickActionsProps) {
  const navigate = useNavigate();
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const archiveMutation = useArchiveInstructor();

  function handleArchive() {
    archiveMutation.mutate(instructor.id, {
      onSuccess: () => setArchiveDialogOpen(false),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <span className="sr-only">Öppna meny</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Åtgärder</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => navigate(`/instructors/${instructor.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            Visa profil
          </DropdownMenuItem>

          <PermissionGate permission={Permissions.INSTRUCTORS_UPDATE}>
            <DropdownMenuItem onClick={() => onEdit?.(instructor)}>
              <Pencil className="mr-2 h-4 w-4" />
              Redigera lärare
            </DropdownMenuItem>
          </PermissionGate>

          <DropdownMenuItem
            onClick={() => navigate(`/scheduling?instructor_id=${instructor.id}`)}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Visa schema
          </DropdownMenuItem>

          <PermissionGate permission={Permissions.INSTRUCTORS_DELETE}>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setArchiveDialogOpen(true)}
            >
              <UserX className="mr-2 h-4 w-4" />
              Avaktivera lärare
            </DropdownMenuItem>
          </PermissionGate>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avaktivera lärare</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill avaktivera{' '}
              <strong>{instructor.first_name} {instructor.last_name}</strong>?
              Läraren tas bort från aktiva listor men all historik bevaras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveDialogOpen(false)}
              disabled={archiveMutation.isPending}
            >
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? 'Avaktiverar...' : 'Avaktivera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
