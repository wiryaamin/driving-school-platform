import { useState } from 'react';
import {
  Archive,
  BookOpen,
  ChevronRight,
  Edit3,
  Package,
  Plus,
  ShoppingBag,
  Tag,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  usePackageOfferings,
  usePackageCatalog,
  useStudentPackages,
  useCreateOffering,
  useUpdateOffering,
  useArchiveOffering,
  useCreateCatalogEntry,
  type PackageOffering,
  type PackageCatalogEntry,
  type StudentPackage,
  type LessonCategory,
  type PackageType,
  type CreateOfferingInput,
  type UpdateOfferingInput,
} from '../hooks/usePackages.js';
import { formatCurrency, formatDate } from '../lib/financeUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEK = (n: number, vat?: number) =>
  vat != null
    ? formatCurrency(n * (1 + vat), 'SEK')
    : formatCurrency(n, 'SEK');

const LESSON_CATEGORIES: { value: LessonCategory; label: string }[] = [
  { value: 'driving',  label: 'Körlektion' },
  { value: 'theory',   label: 'Teori' },
  { value: 'risk1',    label: 'Risk 1' },
  { value: 'risk2',    label: 'Risk 2' },
  { value: 'intro',    label: 'Introduktionslektion' },
  { value: 'other',    label: 'Övrigt' },
];

const PACKAGE_TYPES: { value: PackageType; label: string }[] = [
  { value: 'driving', label: 'Körpaket' },
  { value: 'theory',  label: 'Teoripaket' },
  { value: 'bundle',  label: 'Kombinationspaket' },
  { value: 'other',   label: 'Övrigt' },
];

function categoryLabel(c: string): string {
  return LESSON_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}
function typeLabel(t: string): string {
  return PACKAGE_TYPES.find((x) => x.value === t)?.label ?? t;
}
function vatPct(rate: number): string {
  return `${Math.round(rate * 100)} %`;
}

function StudentPkgStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:    { label: 'Aktiv',      cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
    exhausted: { label: 'Förbrukad',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400' },
    expired:   { label: 'Utgången',   cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
    cancelled: { label: 'Avbruten',   cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── Edit offering dialog ─────────────────────────────────────────────────────

function EditOfferingDialog({
  offering,
  onClose,
}: {
  offering: PackageOffering;
  onClose: () => void;
}) {
  const update = useUpdateOffering(offering.id);
  const [form, setForm] = useState<UpdateOfferingInput>({
    name:          offering.name,
    description:   offering.description ?? '',
    price:         offering.price,
    vat_rate:      offering.vat_rate,
    validity_days: offering.validity_days ?? undefined,
    sort_order:    offering.sort_order,
  });

  function set(field: keyof UpdateOfferingInput) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }
  function setNum(field: keyof UpdateOfferingInput) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value ? Number(e.target.value) : undefined }));
  }

  async function handleSave() {
    try {
      await update.mutateAsync({
        ...form,
        price:         Number(form.price),
        vat_rate:      Number(form.vat_rate),
        validity_days: form.validity_days ? Number(form.validity_days) : undefined,
        sort_order:    form.sort_order ? Number(form.sort_order) : undefined,
      });
      toast({ title: 'Erbjudande uppdaterat' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redigera erbjudande</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Namn</Label>
            <Input value={String(form.name ?? '')} onChange={set('name')} />
          </div>
          <div className="space-y-1.5">
            <Label>Beskrivning</Label>
            <Textarea rows={2} value={String(form.description ?? '')} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pris (ex. moms, kr)</Label>
              <Input type="number" min="0" step="0.01" value={String(form.price ?? '')} onChange={setNum('price')} />
            </div>
            <div className="space-y-1.5">
              <Label>Momssats</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={String(form.vat_rate ?? 0.25)}
                onChange={(e) => setForm((f) => ({ ...f, vat_rate: Number(e.target.value) }))}
              >
                <option value="0.25">25 %</option>
                <option value="0.12">12 %</option>
                <option value="0.06">6 %</option>
                <option value="0">0 %</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Giltighetstid (dagar)</Label>
              <Input type="number" min="0" placeholder="Obegränsad" value={String(form.validity_days ?? '')} onChange={setNum('validity_days')} />
            </div>
            <div className="space-y-1.5">
              <Label>Sorteringsordning</Label>
              <Input type="number" min="0" value={String(form.sort_order ?? 0)} onChange={setNum('sort_order')} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={update.isPending} onClick={() => void handleSave()}>Spara</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Archive dialog ───────────────────────────────────────────────────────────

function ArchiveDialog({ offering, onClose }: { offering: PackageOffering; onClose: () => void }) {
  const archive = useArchiveOffering(offering.id);

  async function handleArchive() {
    try {
      await archive.mutateAsync();
      toast({ title: 'Erbjudande arkiverat' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arkivera erbjudande</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          "{offering.name}" arkiveras och visas inte längre i katalogen.
          Befintliga elevköp påverkas inte.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button variant="destructive" disabled={archive.isPending} onClick={() => void handleArchive()}>
            <Archive className="w-3.5 h-3.5 mr-1.5" />
            Arkivera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create offering sheet ────────────────────────────────────────────────────

function CreateOfferingSheet({ onClose }: { onClose: () => void }) {
  const create = useCreateOffering();
  const { data: catalog = [] } = usePackageCatalog();

  const [form, setForm] = useState<CreateOfferingInput>({
    name:             '',
    lesson_category:  'driving',
    quantity:         10,
    price:            0,
    package_type:     'driving',
    vat_rate:         0.25,
    currency:         'SEK',
  });

  function set(field: keyof CreateOfferingInput) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }
  function setNum(field: keyof CreateOfferingInput) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: Number(e.target.value) }));
  }

  function prefillFromCatalog(entry: PackageCatalogEntry) {
    setForm({
      name:             entry.name,
      lesson_category:  entry.lesson_category,
      quantity:         entry.default_quantity,
      price:            entry.default_price,
      package_type:     entry.package_type,
      description:      entry.description ?? '',
      vat_rate:         entry.vat_rate,
      validity_days:    entry.validity_days ?? undefined,
      currency:         entry.currency,
      catalog_id:       entry.id,
    });
  }

  async function handleSubmit() {
    if (!form.name || !form.lesson_category || !form.quantity) return;
    try {
      await create.mutateAsync({
        ...form,
        description: (form.description as string | undefined)?.trim() || undefined,
      });
      toast({ title: 'Erbjudande skapat' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  const inclVat = form.price ? form.price * (1 + (form.vat_rate ?? 0.25)) : 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nytt paket / erbjudande</DialogTitle>
        </DialogHeader>

        {catalog.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Utgå från mall</p>
            <div className="flex flex-wrap gap-1.5">
              {catalog.map((entry) => (
                <button
                  key={entry.id}
                  className="text-xs px-2 py-1 rounded-md border border-input hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => prefillFromCatalog(entry)}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Namn</Label>
            <Input placeholder="t.ex. 10 körlektioner" value={form.name} onChange={set('name')} />
          </div>
          <div className="space-y-1.5">
            <Label>Beskrivning (valfri)</Label>
            <Textarea rows={2} value={String(form.description ?? '')} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.package_type} onChange={set('package_type')}>
                {PACKAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Lektionskategori</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.lesson_category} onChange={set('lesson_category')}>
                {LESSON_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Antal lektioner</Label>
              <Input type="number" min="1" value={form.quantity} onChange={setNum('quantity')} />
            </div>
            <div className="space-y-1.5">
              <Label>Pris (ex. moms, kr)</Label>
              <Input type="number" min="0" step="0.01" value={form.price} onChange={setNum('price')} />
            </div>
            <div className="space-y-1.5">
              <Label>Momssats</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={String(form.vat_rate ?? 0.25)}
                onChange={(e) => setForm((f) => ({ ...f, vat_rate: Number(e.target.value) }))}
              >
                <option value="0.25">25 %</option>
                <option value="0.12">12 %</option>
                <option value="0.06">6 %</option>
                <option value="0">0 %</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Giltighetstid (dagar)</Label>
              <Input type="number" min="0" placeholder="Obegränsad" value={String(form.validity_days ?? '')} onChange={setNum('validity_days')} />
            </div>
          </div>

          {/* Price preview */}
          {form.price > 0 && (
            <div className="border rounded-lg p-3 bg-muted/30 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pris ex. moms</span>
                <span className="font-mono">{formatCurrency(form.price, 'SEK')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Moms ({vatPct(form.vat_rate ?? 0.25)})</span>
                <span className="font-mono">{formatCurrency(form.price * (form.vat_rate ?? 0.25), 'SEK')}</span>
              </div>
              <div className="flex items-center justify-between font-semibold border-t pt-1 mt-1">
                <span>Pris inkl. moms</span>
                <span className="font-mono text-base">{formatCurrency(inclVat, 'SEK')}</span>
              </div>
              {form.quantity > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>Per lektion</span>
                  <span className="font-mono">{formatCurrency(form.price / form.quantity, 'SEK')} ex. moms</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              disabled={!form.name || !form.quantity || create.isPending}
              onClick={() => void handleSubmit()}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Skapa erbjudande
            </Button>
            <Button variant="outline" onClick={onClose}>Avbryt</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Offering card ────────────────────────────────────────────────────────────

function OfferingCard({ offering }: { offering: PackageOffering }) {
  const [editing,   setEditing]   = useState(false);
  const [archiving, setArchiving] = useState(false);
  const inclVat = offering.price * (1 + offering.vat_rate);

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold leading-tight">{offering.name}</CardTitle>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1.5">{categoryLabel(offering.lesson_category)}</Badge>
                <Badge variant="outline" className="text-[10px] px-1.5">{typeLabel(offering.package_type)}</Badge>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold font-mono">{formatCurrency(inclVat, 'SEK')}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(offering.price, 'SEK')} ex. moms</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-3">
          {offering.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{offering.description}</p>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Antal lektioner</p>
              <p className="font-semibold">{offering.quantity} st</p>
            </div>
            <div>
              <p className="text-muted-foreground">Per lektion</p>
              <p className="font-semibold font-mono">{formatCurrency(offering.price / offering.quantity, 'SEK')}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Moms</p>
              <p className="font-semibold">{vatPct(offering.vat_rate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Giltig</p>
              <p className="font-semibold">
                {offering.validity_days ? `${offering.validity_days} dagar` : 'Obegränsad'}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 pt-1 border-t">
            <PermissionGate permission={Permissions.FINANCE_PACKAGE_UPDATE}>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(true)}>
                <Edit3 className="w-3 h-3 mr-1" />
                Redigera
              </Button>
            </PermissionGate>
            <PermissionGate permission={Permissions.FINANCE_PACKAGE_ARCHIVE}>
              <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => setArchiving(true)}>
                <Archive className="w-3 h-3" />
              </Button>
            </PermissionGate>
          </div>
        </CardContent>
      </Card>
      {editing   && <EditOfferingDialog offering={offering} onClose={() => setEditing(false)} />}
      {archiving && <ArchiveDialog offering={offering} onClose={() => setArchiving(false)} />}
    </>
  );
}

// ─── Offerings tab ────────────────────────────────────────────────────────────

function OfferingsTab() {
  const [statusFilter,   setStatusFilter]   = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [creating,       setCreating]       = useState(false);

  const { data, isLoading } = usePackageOfferings({
    status:          statusFilter || undefined,
    lesson_category: categoryFilter || undefined,
  });
  const offerings = data?.data ?? [];
  const total     = data?.meta.total ?? 0;

  const activeCount = offerings.filter((o) => o.status === 'active').length;
  const totalRevPot = offerings
    .filter((o) => o.status === 'active')
    .reduce((s, o) => s + o.price * (1 + o.vat_rate), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="active">Aktiva</option>
            <option value="archived">Arkiverade</option>
            <option value="all">Alla</option>
          </select>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Alla kategorier</option>
            {LESSON_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {total > 0 && <span className="self-center text-xs text-muted-foreground">{total} erbjudanden</span>}
        </div>
        <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Nytt erbjudande
          </Button>
        </PermissionGate>
      </div>

      {/* KPI mini-row */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Aktiva erbjudanden</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{isLoading ? '…' : activeCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total listpriskorg</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold font-mono text-sm">{isLoading ? '…' : SEK(totalRevPot)}</p></CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : offerings.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <Package className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Inga paket</p>
          <p className="text-xs text-muted-foreground">Skapa erbjudanden som elever kan köpa.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {offerings.map((o) => <OfferingCard key={o.id} offering={o} />)}
        </div>
      )}

      {creating && <CreateOfferingSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

// ─── Catalog tab ──────────────────────────────────────────────────────────────

function CreateCatalogEntryDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateCatalogEntry();
  const [form, setForm] = useState({
    name:              '',
    lesson_category:   'driving' as LessonCategory,
    default_quantity:  10,
    default_price:     0,
    package_type:      'driving' as PackageType,
    description:       '',
    vat_rate:          0.25,
  });

  async function handleSubmit() {
    if (!form.name || !form.default_quantity) return;
    try {
      await create.mutateAsync({
        name:             form.name.trim(),
        lesson_category:  form.lesson_category,
        default_quantity: form.default_quantity,
        default_price:    form.default_price,
        package_type:     form.package_type,
        description:      form.description.trim() || undefined,
        vat_rate:         form.vat_rate,
      });
      toast({ title: 'Katalogpost skapad' });
      onClose();
    } catch (e) {
      toast({ title: 'Fel', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Lägg till i katalog</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Namn</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.lesson_category} onChange={(e) => setForm((f) => ({ ...f, lesson_category: e.target.value as LessonCategory }))}>
                {LESSON_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.package_type} onChange={(e) => setForm((f) => ({ ...f, package_type: e.target.value as PackageType }))}>
                {PACKAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Antal (standard)</Label>
              <Input type="number" min="1" value={form.default_quantity} onChange={(e) => setForm((f) => ({ ...f, default_quantity: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Pris ex. moms (standard)</Label>
              <Input type="number" min="0" step="0.01" value={form.default_price} onChange={(e) => setForm((f) => ({ ...f, default_price: Number(e.target.value) }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Avbryt</Button>
          <Button disabled={!form.name || create.isPending} onClick={() => void handleSubmit()}>Lägg till</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogTab() {
  const { data: catalog = [], isLoading } = usePackageCatalog();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Katalogmallen används som utgångspunkt när nya erbjudanden skapas.
        </p>
        <PermissionGate permission={Permissions.FINANCE_PACKAGE_CREATE}>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Lägg till
          </Button>
        </PermissionGate>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : catalog.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <BookOpen className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Tom katalog</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Namn</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Kategori</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Antal</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Standardpris</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Källa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {catalog.map((entry: PackageCatalogEntry) => (
                    <tr key={entry.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">{entry.name}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-xs">{categoryLabel(entry.lesson_category)}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">{entry.default_quantity}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(entry.default_price, 'SEK')}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {entry.organization_id ? 'Organisations-specifik' : 'Global mall'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {creating && <CreateCatalogEntryDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

// ─── Student purchases tab ────────────────────────────────────────────────────

function StudentPurchasesTab() {
  const { data, isLoading } = useStudentPackages();
  const packages = data?.data ?? [];
  const total    = data?.meta.total ?? 0;

  const activeCount    = packages.filter((p) => p.status === 'active').length;
  const exhaustedCount = packages.filter((p) => p.status === 'exhausted').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Aktiva köp</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{isLoading ? '…' : activeCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Förbrukade</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-muted-foreground">{isLoading ? '…' : exhaustedCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Totalt</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{isLoading ? '…' : total}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-3 space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : packages.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <ShoppingBag className="w-7 h-7 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Inga köpta paket</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Elev-ID</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Använt / Totalt</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Betalt</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Köpt</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Utgår</th>
                    <th className="w-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {packages.map((pkg: StudentPackage) => (
                    <tr key={pkg.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-mono text-xs">{pkg.student_id.slice(0, 8)}…</td>
                      <td className="px-4 py-2.5"><StudentPkgStatusBadge status={pkg.status} /></td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-semibold">{pkg.quantity_used}</span>
                        <span className="text-muted-foreground"> / {pkg.quantity_total}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(pkg.total_paid, pkg.currency)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(pkg.purchased_at)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {pkg.expires_at ? formatDate(pkg.expires_at) : '–'}
                      </td>
                      <td className="px-4 py-2.5"><ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function PackageCatalogPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Paketkatalog"
        description="Körerbjudanden, kurspaket och elevers paketköp"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Paketkatalog' },
        ]}
      />

      <PageContent>
        <PermissionGate permission={Permissions.FINANCE_PACKAGE_READ}>
          <Tabs defaultValue="offerings">
            <TabsList>
              <TabsTrigger value="offerings">
                <Package className="w-3.5 h-3.5 mr-1.5" />
                Erbjudanden
              </TabsTrigger>
              <TabsTrigger value="catalog">
                <Tag className="w-3.5 h-3.5 mr-1.5" />
                Katalog
              </TabsTrigger>
              <TabsTrigger value="purchases">
                <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />
                Elevköp
              </TabsTrigger>
            </TabsList>

            <TabsContent value="offerings" className="mt-5">
              <OfferingsTab />
            </TabsContent>
            <TabsContent value="catalog" className="mt-5">
              <CatalogTab />
            </TabsContent>
            <TabsContent value="purchases" className="mt-5">
              <StudentPurchasesTab />
            </TabsContent>
          </Tabs>
        </PermissionGate>
      </PageContent>
    </PageLayout>
  );
}
