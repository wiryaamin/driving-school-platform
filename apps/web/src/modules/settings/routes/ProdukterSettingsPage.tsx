import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Package, Plus, Pencil, Upload } from 'lucide-react';
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
//
// Backed by package_offerings (Phase 4A) — the platform's real, canonical
// sellable-offering domain, extended with presentation fields rather than a
// parallel `products` table (supabase/migrations/20260724000012).

type PackageType = 'driving' | 'theory' | 'risk1' | 'risk2' | 'intensive' | 'mixed' | 'custom';
type LessonCategory = 'driving' | 'theory' | 'risk1' | 'risk2' | 'simulator' | 'assessment' | 'intensive' | 'group_theory' | 'other';
type PackageStatus = 'draft' | 'active' | 'archived' | 'discontinued';

interface Offering {
  id:                string;
  name:              string;
  external_name:     string | null;
  package_type:      PackageType;
  lesson_category:   LessonCategory;
  quantity:          number;
  price:             number;
  vat_rate:          number;
  validity_days:     number | null;
  status:            PackageStatus;
  sort_order:        number;
  image_url:         string | null;
  ecommerce_active:  boolean;
}

interface FormFields {
  name:              string;
  external_name:     string;
  package_type:      PackageType;
  lesson_category:   LessonCategory;
  quantity:          number;
  price:             string;
  vat_rate:          string;
  validity_days:     string;
  status:            PackageStatus;
  sort_order:        number;
  image_url:         string;
  ecommerce_active:  boolean;
}

const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  driving: 'Körlektioner', theory: 'Teori', risk1: 'Riskettan', risk2: 'Risktvåan',
  intensive: 'Intensivkurs', mixed: 'Blandat paket', custom: 'Anpassat',
};

const LESSON_CATEGORY_LABELS: Record<LessonCategory, string> = {
  driving: 'Körlektion', theory: 'Teori', risk1: 'Riskettan', risk2: 'Risktvåan',
  simulator: 'Simulator', assessment: 'Bedömning', intensive: 'Intensivkurs',
  group_theory: 'Gruppteori', other: 'Övrigt',
};

const STATUS_LABELS: Record<PackageStatus, string> = {
  draft: 'Utkast', active: 'Aktiv', archived: 'Arkiverad', discontinued: 'Nedlagd',
};

function emptyForm(): FormFields {
  return {
    name: '', external_name: '', package_type: 'driving', lesson_category: 'driving',
    quantity: 1, price: '', vat_rate: '25', validity_days: '', status: 'active',
    sort_order: 0, image_url: '', ecommerce_active: false,
  };
}

function offeringToForm(o: Offering): FormFields {
  return {
    name: o.name, external_name: o.external_name ?? '', package_type: o.package_type,
    lesson_category: o.lesson_category, quantity: o.quantity, price: String(o.price),
    vat_rate: String(Math.round(o.vat_rate * 100)), validity_days: o.validity_days !== null ? String(o.validity_days) : '',
    status: o.status, sort_order: o.sort_order, image_url: o.image_url ?? '', ecommerce_active: o.ecommerce_active,
  };
}

// ─── ProdukterSettingsPage ────────────────────────────────────────────────────

export function ProdukterSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [tab,       setTab]       = useState<'active' | 'inactive'>('active');
  const [search,    setSearch]    = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState<FormFields>(emptyForm);
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const { data: offerings = [], isLoading } = useQuery<Offering[]>({
    queryKey: ['settings-package-offerings', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('package_offerings')
        .select('id, name, external_name, package_type, lesson_category, quantity, price, vat_rate, validity_days, status, sort_order, image_url, ecommerce_active')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Offering[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  const filtered = offerings.filter(o => {
    if (tab === 'active'   && o.status !== 'active') return false;
    if (tab === 'inactive' && o.status === 'active') return false;
    const q = search.toLowerCase();
    if (q && !o.name.toLowerCase().includes(q) && !(o.external_name ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  function fmtPrice(p: number) { return `${p.toLocaleString('sv-SE')} kr`; }

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['settings-package-offerings', orgId] });
    void qc.invalidateQueries({ queryKey: ['package-offerings'] }); // student-facing catalog cache, if any
  }

  const createOffering = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error } = await supabase.from('package_offerings').insert({
        organization_id: orgId,
        name:            form.name.trim(),
        external_name:   form.external_name.trim() || null,
        package_type:    form.package_type,
        lesson_category: form.lesson_category,
        quantity:        form.quantity,
        price:           Number(form.price) || 0,
        vat_rate:        (Number(form.vat_rate) || 0) / 100,
        validity_days:   form.validity_days.trim() ? Number(form.validity_days) : null,
        status:          form.status,
        sort_order:      form.sort_order,
        image_url:       form.image_url.trim() || null,
        ecommerce_active: form.ecommerce_active,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Produkt skapad' }); },
    onError: () => toast({ title: 'Fel vid skapande', variant: 'destructive' }),
  });

  const updateOffering = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingId) return;
      const { error } = await supabase.from('package_offerings').update({
        name:            form.name.trim(),
        external_name:   form.external_name.trim() || null,
        package_type:    form.package_type,
        lesson_category: form.lesson_category,
        quantity:        form.quantity,
        price:           Number(form.price) || 0,
        vat_rate:        (Number(form.vat_rate) || 0) / 100,
        validity_days:   form.validity_days.trim() ? Number(form.validity_days) : null,
        status:          form.status,
        sort_order:      form.sort_order,
        image_url:       form.image_url.trim() || null,
        ecommerce_active: form.ecommerce_active,
      } as never).eq('id', editingId).eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setSheetOpen(false); toast({ title: 'Produkt uppdaterad' }); },
    onError: () => toast({ title: 'Fel vid uppdatering', variant: 'destructive' }),
  });

  function openCreate() { setForm(emptyForm()); setErrors({}); setEditingId(null); setSheetOpen(true); }
  function openEdit(o: Offering) { setForm(offeringToForm(o)); setErrors({}); setEditingId(o.id); setSheetOpen(true); }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    setUploading(true);
    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png';
      const path = `${orgId}/products/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('org-branding').upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from('org-branding').getPublicUrl(path);
      setForm(f => ({ ...f, image_url: pub.publicUrl }));
    } catch {
      toast({ title: 'Fel vid uppladdning', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleSave() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs['name'] = 'Namn krävs.';
    if (form.quantity < 1) errs['quantity'] = 'Måste vara minst 1.';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (editingId) updateOffering.mutate();
    else           createOffering.mutate();
  }

  const isPending = createOffering.isPending || updateOffering.isPending;

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
          <span className="text-foreground">Produkter</span>
        </nav>
        <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Skapa produkt
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
            {t === 'active' ? 'Aktiva produkter' : 'Inaktiva produkter'}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Sök efter internt namn eller externt namn..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Bild</th>
                {['Internt namn', 'Externt namn', 'Kategori', 'Pris', 'Sorteringsordning', 'E-handel', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    {offerings.length === 0 ? 'Inga produkter har skapats ännu.' : 'Inga produkter matchade sökningen.'}
                  </td>
                </tr>
              ) : (
                filtered.map(o => (
                  <tr key={o.id} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-2.5">
                      {o.image_url ? (
                        <img src={o.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                          <Package className="w-4 h-4 text-primary" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{o.name}</td>
                    <td className="px-4 py-2.5 font-medium">{o.external_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{LESSON_CATEGORY_LABELS[o.lesson_category]}</td>
                    <td className="px-4 py-2.5">{fmtPrice(o.price)}</td>
                    <td className="px-4 py-2.5 text-center">{o.sort_order}</td>
                    <td className="px-4 py-2.5">
                      {o.ecommerce_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium whitespace-nowrap">
                          Aktiv i e-handel
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" title="Redigera" onClick={() => openEdit(o)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
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
        <DialogContent className="w-full sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 pr-12">
            <DialogTitle>{editingId ? 'Redigera produkt' : 'Ny produkt'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Uppdatera produktens uppgifter.' : 'Lägg till en ny säljbar produkt (paket).'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Bild</Label>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {form.image_url
                    ? <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                    : <Package className="w-6 h-6 text-muted-foreground/40" />}
                </div>
                <label className="flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border h-14 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors text-xs text-muted-foreground">
                  <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={e => void handleImageFile(e)} disabled={uploading} />
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Laddar upp…' : 'Välj bild'}
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod_name">Internt namn *</Label>
                <Input id="prod_name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="t.ex. Paket 10 lektioner" />
                {errors['name'] && <p className="text-xs text-destructive">{errors['name']}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod_ext_name">Externt namn</Label>
                <Input id="prod_ext_name" value={form.external_name} onChange={e => setForm(f => ({ ...f, external_name: e.target.value }))} placeholder="Visas för kunden" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod_type">Pakettyp</Label>
                <Select value={form.package_type} onValueChange={v => setForm(f => ({ ...f, package_type: v as PackageType }))}>
                  <SelectTrigger id="prod_type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PACKAGE_TYPE_LABELS) as [PackageType, string][]).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod_category">Lektionskategori</Label>
                <Select value={form.lesson_category} onValueChange={v => setForm(f => ({ ...f, lesson_category: v as LessonCategory }))}>
                  <SelectTrigger id="prod_category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(LESSON_CATEGORY_LABELS) as [LessonCategory, string][]).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod_qty">Antal krediter</Label>
                <Input id="prod_qty" type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
                {errors['quantity'] && <p className="text-xs text-destructive">{errors['quantity']}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod_price">Pris (kr)</Label>
                <Input id="prod_price" type="number" min={0} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod_vat">Moms (%)</Label>
                <Input id="prod_vat" type="number" min={0} max={100} value={form.vat_rate} onChange={e => setForm(f => ({ ...f, vat_rate: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod_validity">Giltighet (dagar, valfri)</Label>
                <Input id="prod_validity" type="number" min={1} value={form.validity_days} onChange={e => setForm(f => ({ ...f, validity_days: e.target.value }))} placeholder="Ingen gräns" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod_order">Sorteringsordning</Label>
                <Input id="prod_order" type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod_status">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as PackageStatus }))}>
                <SelectTrigger id="prod_status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(STATUS_LABELS) as [PackageStatus, string][]).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Aktiv i e-handel</p>
                <p className="text-xs text-muted-foreground mt-0.5">Synlig och köpbar i den publika webbutiken.</p>
              </div>
              <Switch checked={form.ecommerce_active} onCheckedChange={v => setForm(f => ({ ...f, ecommerce_active: v }))} />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isPending}>Avbryt</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Sparar…' : editingId ? 'Spara ändringar' : 'Skapa produkt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  );
}
