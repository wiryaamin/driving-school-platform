import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@platform/ui';

interface Phrase {
  id:   number;
  text: string;
}

const INITIAL_PHRASES: Phrase[] = [
  { id: 1, text: 'Bra jobbat idag! Vi ses nästa gång.' },
  { id: 2, text: 'Kom ihåg att öva på backning inför nästa lektion.' },
  { id: 3, text: 'Glöm inte att ta med körkortsbeviset.' },
];

// ─── GemensammaFraserPage ─────────────────────────────────────────────────────

export function GemensammaFraserPage() {
  const [phrases,    setPhrases]    = useState<Phrase[]>(INITIAL_PHRASES);
  const [showForm,   setShowForm]   = useState(false);
  const [editId,     setEditId]     = useState<number | null>(null);
  const [draftText,  setDraftText]  = useState('');

  function openCreate() {
    setEditId(null);
    setDraftText('');
    setShowForm(true);
  }

  function openEdit(p: Phrase) {
    setEditId(p.id);
    setDraftText(p.text);
    setShowForm(true);
  }

  function save() {
    if (!draftText.trim()) return;
    if (editId != null) {
      setPhrases(prev => prev.map(p => p.id === editId ? { ...p, text: draftText.trim() } : p));
    } else {
      setPhrases(prev => [...prev, { id: Date.now(), text: draftText.trim() }]);
    }
    setShowForm(false);
    setDraftText('');
    setEditId(null);
  }

  function remove(id: number) {
    setPhrases(prev => prev.filter(p => p.id !== id));
  }

  return (
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + action */}
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
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={openCreate}>
            Skapa fras
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-500 flex items-center justify-center shrink-0">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">Gemensamma fraser</h1>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
            Fraser som visas som snabbval för alla lärare när de kommunicerar med elever.
            Snabbar upp återkommande meddelanden och säkerställer en konsekvent kommunikation.
          </p>
        </div>
      </div>

      {/* Create/edit form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            {editId != null ? 'Redigera fras' : 'Ny fras'}
          </h2>
          <textarea
            autoFocus
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="Skriv frasen här..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none
                       focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-xs text-muted-foreground">{draftText.length}/200 tecken</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Avbryt</Button>
            <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={save}>
              Spara
            </Button>
          </div>
        </div>
      )}

      {/* Phrase list */}
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
              <button
                type="button"
                onClick={() => openEdit(p)}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
