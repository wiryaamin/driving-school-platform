import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin, ChevronRight, Plus, Pencil, Trash2, Star,
} from 'lucide-react';
import {
  Button, Skeleton, Switch, Label, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { GoogleLocationMap } from '@shared/components/GoogleLocationMap.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface DayHours {
  open:   string;
  close:  string;
  closed: boolean;
}

type BusinessHours = Record<DayKey, DayHours>;

interface BranchSettings {
  business_hours?: BusinessHours;
}

interface LocationRow {
  id:              string;
  organization_id: string;
  name:            string;
  address_line1:   string;
  address_line2:   string | null;
  postal_code:     string;
  city:            string;
  county:          string | null;
  phone:           string | null;
  email:           string | null;
  is_primary:      boolean;
  status:          'active' | 'inactive' | 'archived';
  settings:        BranchSettings;
}

interface FormFields {
  name:           string;
  address_line1:  string;
  address_line2:  string;
  postal_code:    string;
  city:           string;
  county:         string;
  phone:          string;
  email:          string;
  is_primary:     boolean;
  status:         'active' | 'inactive';
  business_hours: BusinessHours;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Måndag',
  tue: 'Tisdag',
  wed: 'Onsdag',
  thu: 'Torsdag',
  fri: 'Fredag',
  sat: 'Lördag',
  sun: 'Söndag',
};

const DEFAULT_HOURS: BusinessHours = {
  mon: { open: '08:00', close: '17:00', closed: false },
  tue: { open: '08:00', close: '17:00', closed: false },
  wed: { open: '08:00', close: '17:00', closed: false },
  thu: { open: '08:00', close: '17:00', closed: false },
  fri: { open: '08:00', close: '17:00', closed: false },
  sat: { open: '09:00', close: '14:00', closed: true  },
  sun: { open: '09:00', close: '14:00', closed: true  },
};

// ─── Form utilities ───────────────────────────────────────────────────────────

function cloneHours(): BusinessHours {
  return {
    mon: { ...DEFAULT_HOURS.mon },
    tue: { ...DEFAULT_HOURS.tue },
    wed: { ...DEFAULT_HOURS.wed },
    thu: { ...DEFAULT_HOURS.thu },
    fri: { ...DEFAULT_HOURS.fri },
    sat: { ...DEFAULT_HOURS.sat },
    sun: { ...DEFAULT_HOURS.sun },
  };
}

function emptyForm(): FormFields {
  return {
    name:           '',
    address_line1:  '',
    address_line2:  '',
    postal_code:    '',
    city:           '',
    county:         '',
    phone:          '',
    email:          '',
    is_primary:     false,
    status:         'active',
    business_hours: cloneHours(),
  };
}

function locationToForm(loc: LocationRow): FormFields {
  const stored = loc.settings.business_hours;
  return {
    name:           loc.name,
    address_line1:  loc.address_line1,
    address_line2:  loc.address_line2 ?? '',
    postal_code:    loc.postal_code,
    city:           loc.city,
    county:         loc.county ?? '',
    phone:          loc.phone ?? '',
    email:          loc.email ?? '',
    is_primary:     loc.is_primary,
    status:         loc.status === 'archived' ? 'inactive' : loc.status,
    business_hours: {
      mon: { ...(stored?.mon ?? DEFAULT_HOURS.mon) },
      tue: { ...(stored?.tue ?? DEFAULT_HOURS.tue) },
      wed: { ...(stored?.wed ?? DEFAULT_HOURS.wed) },
      thu: { ...(stored?.thu ?? DEFAULT_HOURS.thu) },
      fri: { ...(stored?.fri ?? DEFAULT_HOURS.fri) },
      sat: { ...(stored?.sat ?? DEFAULT_HOURS.sat) },
      sun: { ...(stored?.sun ?? DEFAULT_HOURS.sun) },
    },
  };
}

function validateForm(f: FormFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim())          e['name']          = 'Namn krävs.';
  if (!f.address_line1.trim()) e['address_line1']  = 'Gatuadress krävs.';
  if (!f.postal_code.trim()) {
    e['postal_code'] = 'Postnummer krävs.';
  } else if (!/^\d{3}\s?\d{2}$/.test(f.postal_code.trim())) {
    e['postal_code'] = 'Ogiltigt format. Ange postnummer som XXXXX (t.ex. 11122 eller 111 22).';
  }
  if (!f.city.trim()) e['city'] = 'Ort krävs.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    e['email'] = 'Ange en giltig e-postadress.';
  return e;
}

// ─── LocationsSettingsPage ────────────────────────────────────────────────────

export function LocationsSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [form,      setForm]      = useState<FormFields>(emptyForm);
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data: locations = [], isLoading } = useQuery<LocationRow[]>({
    queryKey: ['settings-locations', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('organization_locations')
        .select('id, organization_id, name, address_line1, address_line2, postal_code, city, county, phone, email, is_primary, status, settings')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })
        .order('name');
      return (data ?? []) as LocationRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const deletingBranch = locations.find(l => l.id === deleteId);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createBranch = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      if (form.is_primary) {
        await supabase
          .from('organization_locations')
          .update({ is_primary: false } as never)
          .eq('organization_id', orgId)
          .eq('is_primary', true)
          .is('deleted_at', null);
      }
      const { error } = await supabase
        .from('organization_locations')
        .insert({
          organization_id: orgId,
          name:            form.name.trim(),
          address_line1:   form.address_line1.trim(),
          address_line2:   form.address_line2.trim() || null,
          postal_code:     form.postal_code.trim(),
          city:            form.city.trim(),
          county:          form.county.trim() || null,
          country:         'SE',
          phone:           form.phone.trim() || null,
          email:           form.email.trim() || null,
          is_primary:      form.is_primary,
          status:          form.status,
          settings:        { business_hours: form.business_hours },
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-locations', orgId] });
      setSheetOpen(false);
      toast({ title: 'Filial skapad' });
    },
    onError: () => toast({ title: 'Fel vid skapande av filial', variant: 'destructive' }),
  });

  const updateBranch = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingId) return;
      if (form.is_primary) {
        await supabase
          .from('organization_locations')
          .update({ is_primary: false } as never)
          .eq('organization_id', orgId)
          .eq('is_primary', true)
          .neq('id', editingId)
          .is('deleted_at', null);
      }
      const { error } = await supabase
        .from('organization_locations')
        .update({
          name:          form.name.trim(),
          address_line1: form.address_line1.trim(),
          address_line2: form.address_line2.trim() || null,
          postal_code:   form.postal_code.trim(),
          city:          form.city.trim(),
          county:        form.county.trim() || null,
          phone:         form.phone.trim() || null,
          email:         form.email.trim() || null,
          is_primary:    form.is_primary,
          status:        form.status,
          settings:      { business_hours: form.business_hours },
        } as never)
        .eq('id', editingId)
        .eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-locations', orgId] });
      setSheetOpen(false);
      toast({ title: 'Filial uppdaterad' });
    },
    onError: () => toast({ title: 'Fel vid uppdatering av filial', variant: 'destructive' }),
  });

  const deleteBranch = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) return;
      const { error } = await supabase
        .from('organization_locations')
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', id)
        .eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-locations', orgId] });
      setDeleteId(null);
      toast({ title: 'Filial borttagen' });
    },
    onError: () => toast({ title: 'Fel vid borttagning', variant: 'destructive' }),
  });

  const setPrimary = useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) return;
      await supabase
        .from('organization_locations')
        .update({ is_primary: false } as never)
        .eq('organization_id', orgId)
        .eq('is_primary', true)
        .is('deleted_at', null);
      const { error } = await supabase
        .from('organization_locations')
        .update({ is_primary: true } as never)
        .eq('id', id)
        .eq('organization_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-locations', orgId] });
      toast({ title: 'Standardfilial uppdaterad' });
    },
    onError: () => toast({ title: 'Fel vid uppdatering', variant: 'destructive' }),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openCreate() {
    setForm(emptyForm());
    setErrors({});
    setEditingId(null);
    setSheetOpen(true);
  }

  function openEdit(loc: LocationRow) {
    setForm(locationToForm(loc));
    setErrors({});
    setEditingId(loc.id);
    setSheetOpen(true);
  }

  function setField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key as string] !== undefined) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  }

  function updateDay(day: DayKey, patch: Partial<DayHours>) {
    setForm(prev => {
      const current = prev.business_hours[day] ?? DEFAULT_HOURS.mon;
      return {
        ...prev,
        business_hours: {
          ...prev.business_hours,
          [day]: { ...current, ...patch },
        },
      };
    });
  }

  function handleSave() {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    if (editingId) updateBranch.mutate();
    else           createBranch.mutate();
  }

  const isPending = createBranch.isPending || updateBranch.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PermissionGate permission={Permissions.ADMIN_LOCATION_MANAGE}>
    <div className="max-w-2xl space-y-4">

      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav aria-label="Brödsmulor" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground transition-colors">Inställningar</Link>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span className="text-foreground font-medium">Platser</span>
        </nav>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
          Ny filial
        </Button>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <MapPin className="w-7 h-7 text-green-700 dark:text-green-400" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Platser</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hantera verksamhetens filialer, adresser och öppettider.
          </p>
        </div>
      </div>

      {/* Branch list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : locations.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 flex flex-col items-center gap-3">
          <MapPin className="w-8 h-8 text-muted-foreground/40" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Inga filialer har skapats ännu.</p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Skapa första filialen
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {locations.map(loc => (
            <BranchListItem
              key={loc.id}
              location={loc}
              onEdit={() => openEdit(loc)}
              onDelete={() => setDeleteId(loc.id)}
              onSetPrimary={() => setPrimary.mutate(loc.id)}
              isSettingPrimary={setPrimary.isPending}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="w-full sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0">

          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 pr-12">
            <DialogTitle>{editingId ? 'Redigera filial' : 'Ny filial'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Uppdatera filialens uppgifter nedan.'
                : 'Lägg till en ny filial för er verksamhet.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* Grunduppgifter */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">
                Grunduppgifter
              </h3>

              <Field id="name" label="Filialnamn *" error={errors['name']}>
                <Input
                  id="name"
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="t.ex. Huvudkontor, Södermalm"
                  className={cn(errors['name'] && 'border-destructive')}
                />
              </Field>

              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Status</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {form.status === 'active' ? 'Filialen är aktiv' : 'Filialen är inaktiv'}
                  </p>
                </div>
                <Switch
                  checked={form.status === 'active'}
                  onCheckedChange={v => setField('status', v ? 'active' : 'inactive')}
                  aria-label="Filialstatus aktiv/inaktiv"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Standardfilial</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Används som förvald filial i bokningar och rapporter
                  </p>
                </div>
                <Switch
                  checked={form.is_primary}
                  onCheckedChange={v => setField('is_primary', v)}
                  aria-label="Sätt som standardfilial"
                />
              </div>
            </section>

            {/* Adress */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">
                Adress
              </h3>

              <Field id="address_line1" label="Gatuadress *" error={errors['address_line1']}>
                <Input
                  id="address_line1"
                  value={form.address_line1}
                  onChange={e => setField('address_line1', e.target.value)}
                  placeholder="t.ex. Storgatan 1"
                  className={cn(errors['address_line1'] && 'border-destructive')}
                />
              </Field>

              <Field id="address_line2" label="Adressrad 2 (valfri)">
                <Input
                  id="address_line2"
                  value={form.address_line2}
                  onChange={e => setField('address_line2', e.target.value)}
                  placeholder="t.ex. lgh 1101, c/o Namn"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field id="postal_code" label="Postnummer *" error={errors['postal_code']}>
                  <Input
                    id="postal_code"
                    value={form.postal_code}
                    onChange={e => setField('postal_code', e.target.value)}
                    placeholder="11122"
                    maxLength={6}
                    className={cn(errors['postal_code'] && 'border-destructive')}
                  />
                </Field>
                <Field id="city" label="Ort *" error={errors['city']}>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={e => setField('city', e.target.value)}
                    placeholder="Stockholm"
                    className={cn(errors['city'] && 'border-destructive')}
                  />
                </Field>
              </div>

              <Field id="county" label="Län (valfri)">
                <Input
                  id="county"
                  value={form.county}
                  onChange={e => setField('county', e.target.value)}
                  placeholder="t.ex. Stockholms län"
                />
              </Field>

              <GoogleLocationMap
                addressLine1={form.address_line1}
                postalCode={form.postal_code}
                city={form.city}
              />
            </section>

            {/* Kontaktuppgifter */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">
                Kontaktuppgifter
              </h3>

              <Field id="phone" label="Telefon">
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={e => setField('phone', e.target.value)}
                  placeholder="+46 8 123 456 78"
                />
              </Field>

              <Field id="email" label="E-postadress" error={errors['email']}>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={e => setField('email', e.target.value)}
                  placeholder="filial@trafikskola.se"
                  className={cn(errors['email'] && 'border-destructive')}
                />
              </Field>
            </section>

            {/* Öppettider */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">
                Öppettider
              </h3>
              <div className="space-y-0.5">
                {DAY_KEYS.map(day => {
                  const h = form.business_hours[day] ?? DEFAULT_HOURS.mon;
                  const label = DAY_LABELS[day] ?? day;
                  return (
                    <div key={day} className="flex items-center gap-3 py-2">
                      <span className="w-[72px] text-sm text-foreground shrink-0">{label}</span>
                      <Switch
                        id={`bh-${day}`}
                        checked={!h.closed}
                        onCheckedChange={open => updateDay(day, { closed: !open })}
                        aria-label={`${label} öppen`}
                      />
                      {h.closed ? (
                        <span className="text-sm text-muted-foreground">Stängd</span>
                      ) : (
                        <div className="flex items-center gap-2 ml-1">
                          <input
                            type="time"
                            value={h.open}
                            onChange={e => updateDay(day, { open: e.target.value })}
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            aria-label={`${label} öppnar`}
                          />
                          <span className="text-sm text-muted-foreground" aria-hidden="true">–</span>
                          <input
                            type="time"
                            value={h.close}
                            onChange={e => updateDay(day, { close: e.target.value })}
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            aria-label={`${label} stänger`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isPending}>
              Avbryt
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Sparar…' : editingId ? 'Spara ändringar' : 'Skapa filial'}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort filial</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort{' '}
              <strong>{deletingBranch?.name ?? 'filialen'}</strong>?{' '}
              Åtgärden kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleteBranch.isPending}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              disabled={deleteBranch.isPending}
              onClick={() => { if (deleteId) deleteBranch.mutate(deleteId); }}
            >
              {deleteBranch.isPending ? 'Tar bort…' : 'Ta bort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </PermissionGate>
  );
}

// ─── BranchListItem ───────────────────────────────────────────────────────────

function BranchListItem({
  location,
  onEdit,
  onDelete,
  onSetPrimary,
  isSettingPrimary,
}: {
  location:         LocationRow;
  onEdit:           () => void;
  onDelete:         () => void;
  onSetPrimary:     () => void;
  isSettingPrimary: boolean;
}) {
  const isActive = location.status === 'active';
  const parts: string[] = [location.address_line1];
  if (location.postal_code) parts.push(location.postal_code);
  if (location.city)        parts.push(location.city);
  const address = parts.join(', ');

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{location.name}</span>
          {location.is_primary && (
            <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary leading-none">
              Standard
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded leading-none',
              isActive
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-100  text-red-600  dark:bg-red-900/30  dark:text-red-400'
            )}
          >
            {isActive ? 'Aktiv' : 'Inaktiv'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{address}</p>
        {location.phone !== null && location.phone !== '' && (
          <p className="text-xs text-muted-foreground">{location.phone}</p>
        )}
        {location.email !== null && location.email !== '' && (
          <p className="text-xs text-muted-foreground">{location.email}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        {!location.is_primary && (
          <button
            type="button"
            title="Sätt som standardfilial"
            aria-label={`Sätt ${location.name} som standardfilial`}
            onClick={onSetPrimary}
            disabled={isSettingPrimary}
            className="p-1.5 rounded-md text-muted-foreground hover:text-amber-500 hover:bg-accent transition-colors disabled:opacity-40"
          >
            <Star className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          title="Redigera filial"
          aria-label={`Redigera ${location.name}`}
          onClick={onEdit}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Pencil className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Ta bort filial"
          aria-label={`Ta bort ${location.name}`}
          onClick={onDelete}
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  id,
  label,
  error,
  children,
}: {
  id:       string;
  label:    string;
  error?:   string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error !== undefined && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
