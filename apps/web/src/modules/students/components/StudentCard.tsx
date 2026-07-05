import { useNavigate } from 'react-router-dom';
import { ChevronRight, Car, Mail, Phone } from 'lucide-react';
import type { Student } from '../hooks/useStudents.js';
import { StudentStatusBadge } from './StudentStatusBadge.js';
import { cn } from '@/lib/utils.js';

function getInitials(first: string, last: string): string {
  const f = first.charAt(0);
  const l = last.charAt(0);
  return `${f}${l}`.toUpperCase();
}

interface StudentCardProps {
  student:   Student;
  onClick?:  () => void;
  variant?:  'full' | 'compact';
  className?: string | undefined;
}

export function StudentCard({
  student,
  onClick,
  variant = 'full',
  className,
}: StudentCardProps) {
  const navigate = useNavigate();
  const initials = getInitials(student.first_name, student.last_name);

  function handleClick() {
    if (onClick) {
      onClick();
    } else {
      navigate(`/students/${student.id}`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 w-full p-3 rounded-lg border border-border bg-card text-left',
        'hover:border-primary/30 hover:bg-accent/10 transition-all duration-150',
        className,
      )}
    >
      {/* Avatar with initials */}
      <div
        aria-hidden="true"
        className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"
      >
        <span className="text-xs font-semibold text-primary">{initials}</span>
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {student.first_name} {student.last_name}
          </span>
          <StudentStatusBadge status={student.status} />
        </div>

        {variant === 'full' && (
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {student.target_licence_category && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Car className="w-3 h-3" />
                {student.target_licence_category.toUpperCase()}
              </span>
            )}
            {student.email && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[180px]">
                <Mail className="w-3 h-3 shrink-0" />
                {student.email}
              </span>
            )}
            {student.phone && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="w-3 h-3 shrink-0" />
                {student.phone}
              </span>
            )}
          </div>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </button>
  );
}
