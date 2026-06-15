import { useState, useMemo } from 'react';
import { Bell, Plus, Archive, RotateCcw, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import {
  Button, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@platform/ui';
import { useWatchlist } from '../hooks/useWatchlist.js';
import type { WatchlistItem, WatchlistType } from '../hooks/useWatchlist.js';
import { cn } from '@/lib/utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<WatchlistType, string> = {
  student: 'Elev',
  payment: 'Betalning',
  exam:    'Examinationsmoment',
  other:   'Övrigt',
};

const TYPE_COLORS: Record<WatchlistType, string> = {
  student: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  payment: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  exam:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  other:   'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Add dialog ───────────────────────────────────────────────────────────────

interface AddDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (subject: string, type: WatchlistType, note: string) => void;
}

function AddDialog({ open, onClose, onSave }: AddDialogProps) {
  const [subject, setSubject] = useState('');
  const [type,    setType]    = useState<WatchlistType>('student');
  const [note,    setNote]    = useState('');

  function handleSave() {
    if (!subject.trim()) return;
    onSave(subject.trim(), type, note.trim());
    setSubject('');
    setType('student');
    setNote('');
    onClose();
  }

  function handleClose() {
    setSubject('');
    setType('student');
    setNote('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ny bevakning</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="wb-subject">Ämne</Label>
            <Input
              id="wb-subject"
              placeholder="Vad ska bevakas?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wb-type">Typ</Label>
            <Select value={type} onValueChange={(v) => setType(v as WatchlistType)}>
              <SelectTrigger id="wb-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Elev</SelectItem>
                <SelectItem value="payment">Betalning</SelectItem>
                <SelectItem value="exam">Examinationsmoment</SelectItem>
                <SelectItem value="other">Övrigt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wb-note">Anteckning</Label>
            <Textarea
              id="wb-note"
              placeholder="Beskriv anledningen till bevakningen..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Avbryt</Button>
          <Button onClick={handleSave} disabled={!subject.trim()}>Spara</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildActiveColumns(
  onArchive: (id: string) => void,
): ColumnDef<WatchlistItem>[] {
  return [
    {
      id: 'subject',
      header: 'Ämne',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <Bell className="w-3 h-3 text-primary" />
          </div>
          <span className="text-sm font-medium text-foreground">{row.original.subject}</span>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Typ',
      cell: ({ row }) => (
        <span className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
          TYPE_COLORS[row.original.type],
        )}>
          {TYPE_LABELS[row.original.type]}
        </span>
      ),
      size: 160,
      enableSorting: false,
    },
    {
      id: 'note',
      header: 'Anteckning',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground line-clamp-1">
          {row.original.note || '—'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'created_at',
      header: 'Datum',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(row.original.created_at)}
        </span>
      ),
      size: 120,
      enableSorting: false,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={() => onArchive(row.original.id)}
          title="Avklara bevakning"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
        >
          <Archive className="w-3.5 h-3.5" />
          Avklara
        </button>
      ),
      size: 100,
      enableSorting: false,
    },
  ];
}

function buildArchivedColumns(
  onRestore: (id: string) => void,
  onDelete:  (id: string) => void,
): ColumnDef<WatchlistItem>[] {
  return [
    {
      id: 'subject',
      header: 'Ämne',
      cell: ({ row }) => (
        <span className="text-sm font-medium text-foreground/70">{row.original.subject}</span>
      ),
    },
    {
      id: 'type',
      header: 'Typ',
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {TYPE_LABELS[row.original.type]}
        </span>
      ),
      size: 160,
      enableSorting: false,
    },
    {
      id: 'note',
      header: 'Anteckning',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground/70 line-clamp-1">
          {row.original.note || '—'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'created_at',
      header: 'Tillagd',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(row.original.created_at)}
        </span>
      ),
      size: 110,
      enableSorting: false,
    },
    {
      id: 'archived_at',
      header: 'Avklarad',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {row.original.archived_at ? formatDate(row.original.archived_at) : '—'}
        </span>
      ),
      size: 110,
      enableSorting: false,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRestore(row.original.id)}
            title="Återaktivera"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-accent"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(row.original.id)}
            title="Ta bort"
            className="flex items-center gap-1 text-xs text-destructive/60 hover:text-destructive transition-colors px-1.5 py-1 rounded hover:bg-destructive/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
      size: 80,
      enableSorting: false,
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type WatchTab = 'active' | 'archived';

export function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<WatchTab>('active');
  const [addOpen,   setAddOpen]   = useState(false);

  const { activeItems, archivedItems, addItem, archiveItem, restoreItem, deleteItem } =
    useWatchlist();

  const activeCols   = useMemo(() => buildActiveColumns(archiveItem),          [archiveItem]);
  const archivedCols = useMemo(() => buildArchivedColumns(restoreItem, deleteItem), [restoreItem, deleteItem]);

  return (
    <div className="max-w-screen-2xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between pb-3">
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Bevakningar</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">
            {activeTab === 'active' ? 'Aktiva bevakningar' : 'Avkladade bevakningar'}
          </span>
        </nav>
        <button className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Tab bar + action */}
      <div className="flex items-end border-b border-border mb-5">
        {([
          { key: 'active',   label: 'Aktiva bevakningar',    count: activeItems.length   },
          { key: 'archived', label: 'Avkladade bevakningar', count: archivedItems.length },
        ] as { key: WatchTab; label: string; count: number }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
              activeTab === tab.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold',
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}

        <div className="ml-auto pb-1">
          <Button
            size="sm"
            className="border-0 bg-green-600 text-white hover:bg-green-700"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Ny bevakning
          </Button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'active' && (
        <div className="overflow-x-auto">
          <DataTable
            columns={activeCols}
            data={activeItems}
            isLoading={false}
            emptyMessage="Inga bevakningar hittades."
            defaultPageSize={25}
          />
        </div>
      )}

      {activeTab === 'archived' && (
        <div className="overflow-x-auto">
          <DataTable
            columns={archivedCols}
            data={archivedItems}
            isLoading={false}
            emptyMessage="Inga bevakningar hittades."
            defaultPageSize={25}
          />
        </div>
      )}

      {/* Add dialog */}
      <AddDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={(subject, type, note) => addItem({ subject, type, note })}
      />
    </div>
  );
}
