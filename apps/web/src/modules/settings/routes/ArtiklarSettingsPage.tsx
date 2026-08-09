import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, Pencil } from 'lucide-react';
import {
  Button, Skeleton, Label, Input, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type ArticleType = 'product' | 'service' | 'fee';

interface Article {
  id:              string;
  article_number:  string;
  name:            string;
  price_incl_vat:  number;
  vat_percent:     number;
  article_type:    ArticleType;
  lesson_type:     string | null;
  is_active:       boolean;
  sort_order:      number;
}

interface FormFields {
  article_number: string;
  name:           string;
  price_incl_vat: string;
  vat_percent:    string;
  article_type:   ArticleType;
  lesson_type:    string;
  is_active:       boolean;
  sort_order:      number;
}

const TYPE_LABELS: Record<ArticleType, string> = {
  product: 'Vara', service: 'Tjänst', fee: 'Avgift',
};

function emptyForm(): FormFields {
  return { article_number: '', name: '', price_incl_vat: '', vat_percent: '25', article_type: 'product', lesson_type: '', is_active: true, sort_order: 0 };
}

function articleToForm(a: Article): FormFields {
  return {
    article_number: a.article_number, name: a.name,
    price_incl_vat: String(a.price_incl_vat), vat_percent: String(a.vat_percent),
    article_type: a.article_type, lesson_type: a.lesson_type ?? '',
    is_active: a.is_active, sort_order: a.sort_order,
  };
}

// ─── ArtiklarSettingsPage ─────────────────────────────────────────────────────

export function ArtiklarSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [tab,       setTab]       = useState<'active' | 'inactive'>('active');
  const [search,    setSearch]    = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState<FormFields>(emptyForm);
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  const { data: articles = [], isLoading } = useQuery<Article[]>({
    queryKey: ['settings-articles', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('articles')
        .select('id, article_number, name, price_incl_vat, vat_percent, article_type, lesson_type, is_active, sort_order')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Article[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  const visible = articles.filter(a => {
    if (tab === 'active'   && !a.is_active) return false;
    if (tab === 'inactive' &&  a.is_active) return false;
    const q = search.toLowerCase();
    if (q && !a.name.toLowerCase().includes(q) && !a.article_number.toLowerCase().includes(q)) return false;
    return true;
  });

  function fmtPrice(p: number) { return `${p.toLocaleString('sv-SE')} kr`; }

  function invalidate() { void qc.invalidateQueries({ queryKey: ['settings-articles', orgId] }); }

  const createArticle = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error } = await supabase.from('articles').insert({
        organization_id: orgId,
        article_number:  form.article_number.trim(),
        name:            form.name.trim(),
        price_incl_vat:  Number(form.price_incl_vat) || 0,
        vat_percent:     Number(form.vat_percent) || 0,
        article_type:    form.article_type,
        lesson_type:     form.lesson_type.trim() || null,
        is_active:       form.is_active,
        sort_order:      form.sort_order,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Artikel skapad' }); },
    onError: () => toast({ title: 'Fel vid skapande', variant: 'destructive' }),
  });

  const updateArticle = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingId) return;
      const { error } = await supabase.from('articles').update({
        article_number:  form.article_number.trim(),
        name:            form.name.trim(),
        price_incl_vat:  Number(form.price_incl_vat) || 0,
        vat_percent:     Number(form.vat_percent) || 0,
        article_type:    form.article_type,
        lesson_type:     form.lesson_type.trim() || null,
        is_active:       form.is_active,
        sort_order:      form.sort_order,
      } as never).eq('id', editingId).eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Artikel uppdaterad' }); },
    onError: () => toast({ title: 'Fel vid uppdatering', variant: 'destructive' }),
  });

  function openCreate() { setForm(emptyForm()); setErrors({}); setEditingId(null); setSheetOpen(true); }
  function openEdit(a: Article) { setForm(articleToForm(a)); setErrors({}); setEditingId(a.id); setSheetOpen(true); }

  function handleSave() {
    const errs: Record<string, string> = {};
    if (!form.article_number.trim()) errs['article_number'] = 'Artikelnummer krävs.';
    if (!form.name.trim()) errs['name'] = 'Namn krävs.';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (editingId) updateArticle.mutate();
    else           createArticle.mutate();
  }

  const isPending = createArticle.isPending || updateArticle.isPending;

  return (
    <PermissionGate permission={Permissions.FINANCE_PACKAGE_READ}>
    <div className="max-w-4xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/finance/accounts" className="hover:text-foreground">Ekonomi</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Artiklar</span>
        </nav>
        <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Skapa artikel
          </Button>
        </PermissionGate>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {(['active', 'inactive'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            {t === 'active' ? 'Aktiva artiklar' : 'Inaktiva artiklar'}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Sök efter namn eller artikelnummer"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Artikelnummer', 'Internt namn', 'Pris inkl. moms', 'Moms (%)', 'Artikeltyp', 'Lektionstyp', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {articles.length === 0 ? 'Inga artiklar har skapats ännu.' : 'Inga artiklar matchade sökningen.'}
                  </td>
                </tr>
              ) : (
                visible.map(a => (
                  <tr key={a.id} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono">{a.article_number}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{a.name}</td>
                    <td className="px-4 py-2.5">{fmtPrice(a.price_incl_vat)}</td>
                    <td className="px-4 py-2.5">{a.vat_percent} %</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{TYPE_LABELS[a.article_type]}</td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[160px]">{a.lesson_type ?? ''}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" title="Redigera" onClick={() => openEdit(a)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 pr-12">
            <DialogTitle>{editingId ? 'Redigera artikel' : 'Ny artikel'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Uppdatera artikelns uppgifter.' : 'Lägg till en ny säljbar artikel.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="art_number">Artikelnummer *</Label>
                <Input id="art_number" value={form.article_number} onChange={e => setForm(f => ({ ...f, article_number: e.target.value }))} placeholder="t.ex. 100" />
                {errors['article_number'] && <p className="text-xs text-destructive">{errors['article_number']}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art_type">Artikeltyp</Label>
                <Select value={form.article_type} onValueChange={v => setForm(f => ({ ...f, article_type: v as ArticleType }))}>
                  <SelectTrigger id="art_type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(TYPE_LABELS) as [ArticleType, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art_name">Namn *</Label>
              <Input id="art_name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="t.ex. Uppkörningsavgift" />
              {errors['name'] && <p className="text-xs text-destructive">{errors['name']}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="art_price">Pris inkl. moms (kr)</Label>
                <Input id="art_price" type="number" min={0} value={form.price_incl_vat} onChange={e => setForm(f => ({ ...f, price_incl_vat: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art_vat">Moms (%)</Label>
                <Input id="art_vat" type="number" min={0} max={100} value={form.vat_percent} onChange={e => setForm(f => ({ ...f, vat_percent: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art_lesson">Lektionstyp (valfri anteckning)</Label>
              <Input id="art_lesson" value={form.lesson_type} onChange={e => setForm(f => ({ ...f, lesson_type: e.target.value }))} placeholder="t.ex. Riskettan" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art_order">Sorteringsordning</Label>
              <Input id="art_order" type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium text-foreground">Aktiv</p>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isPending}>Avbryt</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Sparar…' : editingId ? 'Spara ändringar' : 'Skapa artikel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  );
}
