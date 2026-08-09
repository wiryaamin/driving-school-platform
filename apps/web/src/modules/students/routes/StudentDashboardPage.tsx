import { Link, useNavigate } from 'react-router-dom';
import {
  Users, UserCheck, Star, Archive, ChevronRight, Plus, Search, UserX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useStudentList } from '../hooks/useStudents.js';
import { cn } from '@/lib/utils.js';

// ─── Color helpers ────────────────────────────────────────────────────────────

type StatColor = 'blue' | 'green' | 'amber' | 'gray';

const ICON_BG: Record<StatColor, string> = {
  blue:  'bg-blue-100  text-blue-600  dark:bg-blue-900/30  dark:text-blue-400',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  gray:  'bg-gray-100  text-gray-500  dark:bg-gray-800     dark:text-gray-400',
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, to, isLoading,
}: {
  label:     string;
  value:     number;
  icon:      LucideIcon;
  color:     StatColor;
  to:        string;
  isLoading: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 p-4 rounded-xl border border-border bg-card',
        'hover:border-primary/30 hover:shadow-sm hover:bg-accent/10',
        'transition-all duration-150',
      )}
    >
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', ICON_BG[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground leading-none mb-1.5">{label}</p>
        {isLoading
          ? <div className="h-6 w-10 bg-muted rounded animate-pulse" />
          : (
            <p className="text-2xl font-semibold text-foreground tabular-nums leading-none">
              {value.toLocaleString('sv-SE')}
            </p>
          )
        }
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </Link>
  );
}

// ─── Quick link card ──────────────────────────────────────────────────────────

function QuickLink({
  label, description, to, icon: Icon,
}: {
  label:       string;
  description: string;
  to:          string;
  icon:        LucideIcon;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border border-border bg-card',
        'hover:border-primary/30 hover:shadow-sm hover:bg-accent/10',
        'transition-all duration-150',
      )}
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-medium text-foreground leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
    </Link>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function StudentWorkspaceEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center">
        <Users className="w-8 h-8 text-muted-foreground/40" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Inga kunder registrerade</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Lägg till din första kund för att komma igång med elevhanteringen.
        </p>
      </div>
      <PermissionGate permission={Permissions.STUDENTS_CREATE}>
        <Button
          onClick={onAdd}
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white border-0"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Lägg till kund
        </Button>
      </PermissionGate>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StudentDashboardPage() {
  const navigate = useNavigate();

  const allQ      = useStudentList({ per_page: 1 });
  const activeQ   = useStudentList({ status: 'active',   per_page: 1 });
  const leadQ     = useStudentList({ status: 'lead',     per_page: 1 });
  const archivedQ = useStudentList({ status: 'archived', per_page: 1 });

  const isEmpty = !allQ.isLoading && (allQ.data?.meta.total ?? 0) === 0;

  const stats: {
    label: string;
    value: number;
    icon: LucideIcon;
    color: StatColor;
    to: string;
    isLoading: boolean;
  }[] = [
    {
      label:     'Totalt',
      value:     allQ.data?.meta.total ?? 0,
      icon:      Users,
      color:     'blue',
      to:        '/students/list',
      isLoading: allQ.isLoading,
    },
    {
      label:     'Aktiva',
      value:     activeQ.data?.meta.total ?? 0,
      icon:      UserCheck,
      color:     'green',
      to:        '/students/list',
      isLoading: activeQ.isLoading,
    },
    {
      label:     'Nya',
      value:     leadQ.data?.meta.total ?? 0,
      icon:      Star,
      color:     'amber',
      to:        '/students/list',
      isLoading: leadQ.isLoading,
    },
    {
      label:     'Arkiverade',
      value:     archivedQ.data?.meta.total ?? 0,
      icon:      Archive,
      color:     'gray',
      to:        '/students/list',
      isLoading: archivedQ.isLoading,
    },
  ];

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <nav className="flex items-center gap-1.5 text-sm" aria-label="Brödsmulor">
          <span className="text-muted-foreground">Hem</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">Kunder & Elever</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline focus:outline-none">
          Ge feedback
        </button>
      </div>

      {/* ── Header + actions ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Kunder & Elever</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hantera dina elever och kunder
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/students/list')}
          >
            <Search className="w-4 h-4 mr-1.5" />
            Sök kunder
          </Button>
          <PermissionGate permission={Permissions.STUDENTS_CREATE}>
            <Button
              size="sm"
              onClick={() => navigate('/students/list?create=1')}
              className="bg-green-600 hover:bg-green-700 text-white border-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Ny kund
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* ── KPI stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* ── Empty state or quick links ──────────────────────────────────────── */}
      {isEmpty ? (
        <StudentWorkspaceEmptyState onAdd={() => navigate('/students/list?create=1')} />
      ) : (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Snabbåtkomst</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <QuickLink
              label="Alla kunder"
              description="Se och sök bland alla registrerade kunder"
              to="/students/list"
              icon={Users}
            />
            <QuickLink
              label="Inaktiva elever"
              description="Elever utan aktiva bokningar eller körkortstillstånd"
              to="/students/inactive"
              icon={UserX}
            />
            <QuickLink
              label="Sök kund"
              description="Sök snabbt på personnummer, namn eller e-post"
              to="/students/list"
              icon={Search}
            />
          </div>
        </section>
      )}

    </div>
  );
}
