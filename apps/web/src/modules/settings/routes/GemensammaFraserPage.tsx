import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MessageSquare, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

interface Phrase { id: string; text: string; }

export function GemensammaFraserPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [phrases,   setPhrases]   = useState<Phrase[]>([]);
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-common-phrases', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      return ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!orgSettings) return;
    const saved = orgSettings['common_phrases'];
    if (Array.isArray(saved)) setPhrases(saved as Phrase[]);
  }, [orgSettings]);

  const saveMut = useMutation({
    mutationFn: async (next: Phrase[]) => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        settings: { ...(orgSettings ?? {}), common_phrases: next },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      toast({ title: 'Sparat' });
      void qc.invalidateQueries({ queryKey: ['org-settings-common-phrases', orgId] });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  function openCreate() { setEditId(null); setDraftText(''); setShowForm(true); }

  function openEdit(p: Phrase) { setEditId(p.id); setDraftText(p.text); setShowForm(true); }

  function save() {
    if (!draftText.trim()) return;
    let next: Phrase[];
    if (editId != null) {
      next = phrases.map(p => p.id === editId ? { ...p, text: draftText.trim() } : p);
    } else {
      next = [...phrases, { id: crypto.randomUUID(), text: draftText.trim() }];
    }
    setPhrases(next);
    saveMut.mutate(next);
    setShowForm(false);
    setDraftText('');
    setEditId(null);
  }

  function remove(id: string) {
    const next = phrases.filter(p => p.id !== id);
    setPhrases(next);
    saveMut.mutate(next);
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/communication/config" className="hover:text-foreground">Kommunikation</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Gemensamma fraser</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" onClick={openCreate}>
            Skapa fras
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-500 flex items-center justify-center shrink-0">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">Gemensamma fraser</h1>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
            En referenslista med korta fraser för lärare att kopiera vid manuell kommunikation med elever.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-amber-800 dark:text-amber-300">
          <p className="font-medium">Fraserna infogas inte automatiskt som snabbval i meddelanderutan</p>
          <p className="text-xs leading-relaxed">
            De sparas här som en referenslista att kopiera manuellt. För mallar som går att välja direkt vid
            utskick — gå till{' '}
            <Link to="/communication/templates" className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200">
              Notismallar
            </Link>
            .
          </p>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{editId != null ? 'Redigera fras' : 'Ny fras'}</h2>
          <textarea
            autoFocus
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="Skriv frasen här..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-xs text-muted-foreground">{draftText.length}/200 tecken</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Avbryt</Button>
            <Button size="sm" onClick={save} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Sparar…' : 'Spara'}
            </Button>
          </div>
        </div>
      )}

      {phrases.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 flex flex-col items-center gap-3 text-center">
          <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Inga gemensamma fraser har skapats ännu.</p>
          <Button size="sm" variant="outline" onClick={openCreate}>Skapa din första fras</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {phrases.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/20 transition-colors">
              <p className="flex-1 text-sm text-foreground">{p.text}</p>
              <button type="button" onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => remove(p.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
