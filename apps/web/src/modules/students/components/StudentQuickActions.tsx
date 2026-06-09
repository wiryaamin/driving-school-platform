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
import { useArchiveStudent } from '../hooks/useStudents.js';
import type { Student } from '../hooks/useStudents.js';

interface StudentQuickActionsProps {
  student: Student;
  onEdit?: (student: Student) => void;
}

export function StudentQuickActions({ student, onEdit }: StudentQuickActionsProps) {
  const navigate = useNavigate();
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const archiveMutation = useArchiveStudent();

  function handleArchive() {
    archiveMutation.mutate(student.id, {
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

          <DropdownMenuItem onClick={() => navigate(`/students/${student.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            Visa profil
          </DropdownMenuItem>

          <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
            <DropdownMenuItem onClick={() => onEdit?.(student)}>
              <Pencil className="mr-2 h-4 w-4" />
              Redigera elev
            </DropdownMenuItem>
          </PermissionGate>

          <DropdownMenuItem
            onClick={() => navigate(`/scheduling?student_id=${student.id}`)}
            disabled
          >
            <Calendar className="mr-2 h-4 w-4" />
            Boka lektion
          </DropdownMenuItem>

          <PermissionGate permission={Permissions.STUDENTS_DELETE}>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setArchiveDialogOpen(true)}
            >
              <UserX className="mr-2 h-4 w-4" />
              Arkivera elev
            </DropdownMenuItem>
          </PermissionGate>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirm archive dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arkivera elev</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill arkivera{' '}
              <strong>{student.first_name} {student.last_name}</strong>?
              Eleven tas bort från aktiva listor men all historik bevaras.
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
              {archiveMutation.isPending ? 'Arkiverar...' : 'Arkivera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
