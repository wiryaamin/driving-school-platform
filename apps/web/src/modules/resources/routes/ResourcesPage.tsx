import { useState, useEffect, useMemo } from 'react';
import {
  Plus, MapPin, Wrench, AlertCircle, CheckCircle2, Car, Trash2,
  ChevronDown, AlertTriangle, History, ChartBar, Loader2,
  Shield, CalendarX, ClipboardCheck, RefreshCw,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { Skeleton, toast, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, ScrollArea } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useVehicles, useCreateVehicle, useUpdateVehicleStatus, useDeleteVehicle,
  useUpdateVehicle, getServiceStatus, getComplianceStatus,
} from '../hooks/useVehicles.js';
import {
  useVehicleServiceRecords, useCreateServiceRecord, useDeleteServiceRecord,
  SERVICE_TYPE_LABELS,
} from '../hooks/useVehicleService.js';
import type { ServiceType, CreateServiceRecordInput } from '../hooks/useVehicleService.js';
import {
  useVehicleInspections, useCreateInspection,
  INSPECTION_TYPE_LABELS, INSPECTION_RESULT_LABELS,
} from '../hooks/useVehicleInspections.js';
import type { InspectionType, InspectionResult, CreateInspectionInput } from '../hooks/useVehicleInspections.js';
import {
  useVehicleMaintenanceRecords, useCreateMaintenanceRecord, useUpdateMaintenanceStatus,
  MAINTENANCE_TYPE_LABELS, MAINTENANCE_STATUS_LABELS,
} from '../hooks/useVehicleMaintenance.js';
import type { MaintenanceRecordType, MaintenanceStatus, CreateMaintenanceInput } from '../hooks/useVehicleMaintenance.js';
import {
  useLocations, useCreateLocation, useDeleteLocation, formatLocationAddress,
} from '@modules/scheduling/hooks/useLocations.js';
import { cn } from '@/lib/utils.js';
import type { Vehicle, CreateVehicleInput } from '../hooks/useVehicles.js';
import type { CreateLocationInput } from '@modules/scheduling/hooks/useLocations.js';

// ─── Label maps ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<Vehicle['operational_status'], string> = {
  available:      'Tillgänglig',
  in_use:         'I körning',
  maintenance:    'I underhåll',
  inspection_due: 'Besiktning',
  inactive:       'Inaktiv',
  decommissioned: 'Ur drift',
};

const STATUS_CLS: Record<Vehicle['operational_status'], string> = {
  available:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  in_use:         'bg-blue-100    text-blue-700    dark:bg-blue-900/30    dark:text-blue-400',
  maintenance:    'bg-amber-100   text-amber-700   dark:bg-amber-900/30   dark:text-amber-400',
  inspection_due: 'bg-orange-100  text-orange-700  dark:bg-orange-900/30  dark:text-orange-400',
  inactive:       'bg-gray-100    text-gray-600    dark:bg-gray-900/30    dark:text-gray-400',
  decommissioned: 'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
};

const SERVICE_STATUS_CLS = {
  ok:      'bg-emerald-100 text-emerald-700',
  soon:    'bg-amber-100   text-amber-700',
  overdue: 'bg-red-100     text-red-700',
};

const SERVICE_STATUS_LABEL = {
  ok:      'OK',
  soon:    'Snart',
  overdue: 'Förfallen',
};

const TRANSMISSION_LABEL: Record<string, string> = { manual: 'Manuell', automatic: 'Automat' };
const OWNERSHIP_LABEL:    Record<string, string> = { owned: 'Ägs', leased: 'Leasad', rented: 'Hyrd' };
const FUEL_LABEL:         Record<string, string> = { gasoline: 'Bensin', diesel: 'Diesel', electric: 'El', hybrid: 'Hybrid', plugin_hybrid: 'Plug-in hybrid', ethanol: 'Etanol', gas: 'Gas' };

const INSPECTION_RESULT_CLS: Record<InspectionResult, string> = {
  passed:              'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  failed:              'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
  passed_with_remarks: 'bg-amber-100   text-amber-700   dark:bg-amber-900/30   dark:text-amber-400',
  deferred:            'bg-gray-100    text-gray-600    dark:bg-gray-900/30    dark:text-gray-400',
};

const MAINTENANCE_STATUS_CLS: Record<MaintenanceStatus, string> = {
  scheduled:   'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-400',
  in_progress: 'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-400',
  completed:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled:   'bg-gray-100   text-gray-600   dark:bg-gray-900/30   dark:text-gray-400',
};

const ALL_CATEGORIES = ['B', 'A', 'A1', 'A2', 'AM', 'C', 'C1', 'D', 'D1', 'BE', 'CE'];
const CURRENT_YEAR   = new Date().getFullYear();
const nextYear       = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
const DEFAULT_EXPIRY = nextYear.toISOString().slice(0, 10);

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';
const selectCls = inputCls + ' appearance-none pr-8';

// ─── Service status badge ─────────────────────────────────────────────────────

function ServiceStatusBadge({ date }: { date: string | null }) {
  if (!date) return null;
  const status = getServiceStatus(date);
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap',
      SERVICE_STATUS_CLS[status],
    )}>
      {status === 'overdue' && <AlertTriangle className="w-2.5 h-2.5" />}
      {SERVICE_STATUS_LABEL[status]} · {new Date(`${date}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
    </span>
  );
}

// ─── Vehicle status badge ─────────────────────────────────────────────────────

function VehicleStatusBadge({ status }: { status: Vehicle['operational_status'] }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap',
      STATUS_CLS[status],
    )}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ─── Compliance alert banner ──────────────────────────────────────────────────

function ComplianceAlertBanner({ vehicles }: { vehicles: Vehicle[] }) {
  type AlertItem = { label: string; vehicles: string[] };
  const alerts: AlertItem[] = [];

  const serviceOverdue = vehicles.filter(v => getServiceStatus(v.next_service_date) === 'overdue');
  const serviceSoon    = vehicles.filter(v => getServiceStatus(v.next_service_date) === 'soon');
  const inspOverdue    = vehicles.filter(v => getComplianceStatus(v.next_inspection_due_at) === 'overdue');
  const inspSoon       = vehicles.filter(v => getComplianceStatus(v.next_inspection_due_at) === 'soon');
  const insOverdue     = vehicles.filter(v => getComplianceStatus(v.insurance_expires_at) === 'overdue');
  const insSoon        = vehicles.filter(v => getComplianceStatus(v.insurance_expires_at) === 'soon');
  const regOverdue     = vehicles.filter(v => getComplianceStatus(v.registration_expires_at) === 'overdue');
  const regSoon        = vehicles.filter(v => getComplianceStatus(v.registration_expires_at) === 'soon');

  const names = (vs: Vehicle[]) => vs.map(v => v.registration_number).join(', ');

  if (serviceOverdue.length) alerts.push({ label: `Service förfallen: ${names(serviceOverdue)}`, vehicles: serviceOverdue.map(v => v.id) });
  if (serviceSoon.length)    alerts.push({ label: `Service snart: ${names(serviceSoon)}`, vehicles: serviceSoon.map(v => v.id) });
  if (inspOverdue.length)    alerts.push({ label: `Besiktning förfallen: ${names(inspOverdue)}`, vehicles: inspOverdue.map(v => v.id) });
  if (inspSoon.length)       alerts.push({ label: `Besiktning snart: ${names(inspSoon)}`, vehicles: inspSoon.map(v => v.id) });
  if (insOverdue.length)     alerts.push({ label: `Försäkring utgången: ${names(insOverdue)}`, vehicles: insOverdue.map(v => v.id) });
  if (insSoon.length)        alerts.push({ label: `Försäkring utgår snart: ${names(insSoon)}`, vehicles: insSoon.map(v => v.id) });
  if (regOverdue.length)     alerts.push({ label: `Registrering utgången: ${names(regOverdue)}`, vehicles: regOverdue.map(v => v.id) });
  if (regSoon.length)        alerts.push({ label: `Registrering utgår snart: ${names(regSoon)}`, vehicles: regSoon.map(v => v.id) });

  if (alerts.length === 0) return null;

  const hasOverdue = serviceOverdue.length > 0 || inspOverdue.length > 0 || insOverdue.length > 0 || regOverdue.length > 0;

  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-3 rounded-xl border text-sm mb-4',
      hasOverdue
        ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300'
        : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300',
    )}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {alerts.map((a, i) => (
          <p key={i} className={i === 0 ? 'font-semibold' : 'text-xs opacity-80'}>{a.label}</p>
        ))}
      </div>
    </div>
  );
}

// ─── Vehicle form sheet ───────────────────────────────────────────────────────

const EMPTY_VEHICLE: CreateVehicleInput = {
  registration_number:    '',
  make:                   '',
  model:                  '',
  model_year:             CURRENT_YEAR,
  color:                  '',
  transmission:           'manual',
  has_dual_controls:      true,
  fuel_type:              'gasoline',
  seats:                  5,
  teaching_categories:    ['B'],
  ownership_type:         'owned',
  operational_status:     'available',
  registration_expires_at: DEFAULT_EXPIRY,
  insurance_expires_at:   DEFAULT_EXPIRY,
};

function VehicleFormSheet({
  open,
  onClose,
}: {
  open:    boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateVehicleInput>(EMPTY_VEHICLE);
  const create = useCreateVehicle();

  function set<K extends keyof CreateVehicleInput>(k: K, v: CreateVehicleInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleCategory(cat: string) {
    setForm((f) => ({
      ...f,
      teaching_categories: f.teaching_categories.includes(cat)
        ? f.teaching_categories.filter((c) => c !== cat)
        : [...f.teaching_categories, cat],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.registration_number.trim() || !form.make.trim() || !form.model.trim()) return;
    try {
      await create.mutateAsync({
        ...form,
        registration_number: form.registration_number.trim().toUpperCase(),
        make:  form.make.trim(),
        model: form.model.trim(),
        color: form.color?.trim() || undefined,
      });
      toast({ title: 'Fordon registrerat' });
      setForm(EMPTY_VEHICLE);
      onClose();
    } catch (err) {
      toast({ title: 'Kunde inte registrera fordonet', variant: 'destructive',
        description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !create.isPending) { setForm(EMPTY_VEHICLE); onClose(); } }} aria-describedby={undefined}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle>Registrera fordon</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Fyll i fordonsuppgifterna nedan</p>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <form id="vehicle-form" onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">

            <Field label="Registreringsnummer" required>
              <input
                className={inputCls + ' uppercase placeholder:normal-case font-mono tracking-wider'}
                placeholder="ABC123"
                value={form.registration_number}
                onChange={(e) => set('registration_number', e.target.value)}
                maxLength={10}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Märke" required>
                <input className={inputCls} placeholder="Volvo" value={form.make}
                  onChange={(e) => set('make', e.target.value)} required />
              </Field>
              <Field label="Modell" required>
                <input className={inputCls} placeholder="V60" value={form.model}
                  onChange={(e) => set('model', e.target.value)} required />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Årsmodell" required>
                <input className={inputCls} type="number" min={1990} max={CURRENT_YEAR + 1}
                  value={form.model_year} onChange={(e) => set('model_year', Number(e.target.value))} required />
              </Field>
              <Field label="Färg">
                <input className={inputCls} placeholder="Svart" value={form.color ?? ''}
                  onChange={(e) => set('color', e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Växellåda" required>
                <div className="relative">
                  <select className={selectCls} value={form.transmission}
                    onChange={(e) => set('transmission', e.target.value as 'manual' | 'automatic')}>
                    <option value="manual">Manuell</option>
                    <option value="automatic">Automat</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </Field>
              <Field label="Bränsle" required>
                <div className="relative">
                  <select className={selectCls} value={form.fuel_type}
                    onChange={(e) => set('fuel_type', e.target.value)}>
                    {Object.entries(FUEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Antal säten" required>
                <input className={inputCls} type="number" min={2} max={9}
                  value={form.seats} onChange={(e) => set('seats', Number(e.target.value))} required />
              </Field>
              <Field label="Ägandeform" required>
                <div className="relative">
                  <select className={selectCls} value={form.ownership_type}
                    onChange={(e) => set('ownership_type', e.target.value as CreateVehicleInput['ownership_type'])}>
                    {Object.entries(OWNERSHIP_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </Field>
            </div>

            <Field label="Driftstatus" required>
              <div className="relative">
                <select className={selectCls} value={form.operational_status}
                  onChange={(e) => set('operational_status', e.target.value as CreateVehicleInput['operational_status'])}>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Registrering giltig t.o.m." required>
                <input className={inputCls} type="date" value={form.registration_expires_at}
                  onChange={(e) => set('registration_expires_at', e.target.value)} required />
              </Field>
              <Field label="Försäkring giltig t.o.m." required>
                <input className={inputCls} type="date" value={form.insurance_expires_at}
                  onChange={(e) => set('insurance_expires_at', e.target.value)} required />
              </Field>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={form.has_dual_controls}
                onChange={(e) => set('has_dual_controls', e.target.checked)}
                className="w-4 h-4 rounded accent-primary" />
              <span className="text-sm text-foreground">Dubbelkontroll (elev + lärare)</span>
            </label>

            <Field label="Körkortskategorier" required>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {ALL_CATEGORIES.map((cat) => {
                  const active = form.teaching_categories.includes(cat);
                  return (
                    <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                      className={cn(
                        'px-2.5 py-1 rounded text-xs font-semibold border transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                      )}>
                      {cat}
                    </button>
                  );
                })}
              </div>
              {form.teaching_categories.length === 0 && (
                <p className="text-xs text-destructive mt-1">Välj minst en kategori</p>
              )}
            </Field>
          </form>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" type="button" onClick={onClose} disabled={create.isPending}>Avbryt</Button>
          <Button type="submit" form="vehicle-form" disabled={create.isPending || form.teaching_categories.length === 0}>
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Registrera fordon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Service record form sheet ────────────────────────────────────────────────

const SERVICE_TYPES: ServiceType[] = [
  'annual_service','oil_change','tires','brakes',
  'repair','inspection_prep','cleaning','other',
];

const EMPTY_SERVICE: Omit<CreateServiceRecordInput, 'vehicle_id'> = {
  service_type:      'annual_service',
  service_date:      new Date().toISOString().slice(0, 10),
  mileage_km:        null,
  cost_sek:          null,
  performed_by:      '',
  notes:             '',
  next_service_date: null,
};

function ServiceRecordSheet({
  open,
  vehicleId,
  vehicleName,
  onClose,
}: {
  open:        boolean;
  vehicleId:   string;
  vehicleName: string;
  onClose:     () => void;
}) {
  const [form, setForm] = useState(EMPTY_SERVICE);
  const create = useCreateServiceRecord();

  useEffect(() => {
    if (open) setForm(EMPTY_SERVICE);
  }, [open]);

  function set<K extends keyof typeof EMPTY_SERVICE>(k: K, v: typeof EMPTY_SERVICE[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        vehicle_id:        vehicleId,
        service_type:      form.service_type,
        service_date:      form.service_date,
        mileage_km:        form.mileage_km ?? undefined,
        cost_sek:          form.cost_sek ?? undefined,
        performed_by:      form.performed_by?.trim() || undefined,
        notes:             form.notes?.trim() || undefined,
        next_service_date: form.next_service_date || undefined,
      });
      toast({ title: 'Service registrerad' });
      onClose();
    } catch (err) {
      toast({ title: 'Kunde inte registrera service', variant: 'destructive',
        description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !create.isPending) onClose(); }} aria-describedby={undefined}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle>Registrera service</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{vehicleName}</p>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <form id="service-form" onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">

            <Field label="Servicetyp" required>
              <div className="relative">
                <select className={selectCls} value={form.service_type}
                  onChange={(e) => set('service_type', e.target.value as ServiceType)} required>
                  {SERVICE_TYPES.map(t => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </Field>

            <Field label="Servicedatum" required>
              <input className={inputCls} type="date" value={form.service_date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set('service_date', e.target.value)} required />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Mätarställning (km)">
                <input className={inputCls} type="number" min={0} placeholder="85000"
                  value={form.mileage_km ?? ''}
                  onChange={(e) => set('mileage_km', e.target.value ? Number(e.target.value) : null)} />
              </Field>
              <Field label="Kostnad (kr)">
                <input className={inputCls} type="number" min={0} step={0.01} placeholder="2500"
                  value={form.cost_sek ?? ''}
                  onChange={(e) => set('cost_sek', e.target.value ? Number(e.target.value) : null)} />
              </Field>
            </div>

            <Field label="Utförd av">
              <input className={inputCls} placeholder="Verkstad eller tekniker"
                value={form.performed_by ?? ''} onChange={(e) => set('performed_by', e.target.value)} />
            </Field>

            <Field label="Nästa service">
              <input className={inputCls} type="date" value={form.next_service_date ?? ''}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set('next_service_date', e.target.value || null)} />
            </Field>

            <Field label="Anteckningar">
              <textarea className={inputCls + ' h-20 resize-none py-2'}
                placeholder="Vad utfördes, reservdelar, garantinoteringar..."
                value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
            </Field>

          </form>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" type="button" onClick={onClose} disabled={create.isPending}>Avbryt</Button>
          <Button type="submit" form="service-form" disabled={create.isPending}>
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Spara service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Location form sheet ──────────────────────────────────────────────────────

const EMPTY_LOCATION: CreateLocationInput = {
  name:          '',
  address_line1: '',
  postal_code:   '',
  city:          '',
  is_primary:    false,
};

function LocationFormSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<CreateLocationInput>(EMPTY_LOCATION);
  const create = useCreateLocation();

  function set<K extends keyof CreateLocationInput>(k: K, v: CreateLocationInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.address_line1.trim()) return;
    try {
      await create.mutateAsync({
        name:          form.name.trim(),
        address_line1: form.address_line1.trim(),
        postal_code:   form.postal_code.trim(),
        city:          form.city.trim(),
        is_primary:    form.is_primary,
      });
      toast({ title: 'Plats registrerad' });
      setForm(EMPTY_LOCATION);
      onClose();
    } catch (err) {
      toast({ title: 'Kunde inte registrera platsen', variant: 'destructive',
        description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !create.isPending) { setForm(EMPTY_LOCATION); onClose(); } }} aria-describedby={undefined}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle>Registrera plats</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Lägg till en ny undervisningsplats</p>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <form id="location-form" onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">

            <Field label="Platsnamn" required>
              <input className={inputCls} placeholder="Körskolan Centrum" value={form.name}
                onChange={(e) => set('name', e.target.value)} required />
            </Field>

            <Field label="Gatuadress" required>
              <input className={inputCls} placeholder="Storgatan 12" value={form.address_line1}
                onChange={(e) => set('address_line1', e.target.value)} required />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Postnummer" required>
                <input className={inputCls} placeholder="123 45" value={form.postal_code}
                  onChange={(e) => set('postal_code', e.target.value)} required maxLength={6} />
              </Field>
              <Field label="Stad" required>
                <input className={inputCls} placeholder="Stockholm" value={form.city}
                  onChange={(e) => set('city', e.target.value)} required />
              </Field>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={form.is_primary}
                onChange={(e) => set('is_primary', e.target.checked)}
                className="w-4 h-4 rounded accent-primary" />
              <span className="text-sm text-foreground">Sätt som huvudadress</span>
            </label>

          </form>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" type="button" onClick={onClose} disabled={create.isPending}>Avbryt</Button>
          <Button type="submit" form="location-form" disabled={create.isPending}>
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Registrera plats
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fordon tab ───────────────────────────────────────────────────────────────

function FordanTab() {
  const { data: vehicles = [], isLoading, isError, refetch } = useVehicles();
  const updateStatus = useUpdateVehicleStatus();
  const remove       = useDeleteVehicle();
  const [pendingId,        setPendingId]        = useState<string | null>(null);
  const [showForm,         setShowForm]         = useState(false);
  const [serviceVehicleId, setServiceVehicleId] = useState<string | null>(null);

  const available     = vehicles.filter(v => v.operational_status === 'available').length;
  const inMaintenance = vehicles.filter(v => v.operational_status === 'maintenance' || v.operational_status === 'inspection_due').length;
  const outOfService  = vehicles.filter(v => v.operational_status === 'decommissioned' || v.operational_status === 'inactive').length;

  const activeServiceVehicle = vehicles.find(v => v.id === serviceVehicleId);

  async function handleStatusChange(v: Vehicle, status: Vehicle['operational_status']) {
    setPendingId(v.id);
    try {
      await updateStatus.mutateAsync({ id: v.id, operational_status: status });
      toast({ title: `${v.make} ${v.model} — ${STATUS_LABEL[status]}` });
    } catch {
      toast({ title: 'Kunde inte uppdatera status', variant: 'destructive' });
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(v: Vehicle) {
    if (!confirm(`Ta bort ${v.registration_number} – ${v.make} ${v.model}?`)) return;
    setPendingId(v.id);
    try {
      await remove.mutateAsync(v.id);
      toast({ title: 'Fordon borttaget' });
    } catch {
      toast({ title: 'Kunde inte ta bort fordonet', variant: 'destructive' });
    } finally {
      setPendingId(null);
    }
  }

  if (isError) {
    return (
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
        <span>Det gick inte att hämta fordon.</span>
        <button onClick={() => void refetch()} className="ml-4 shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline">
          Försök igen
        </button>
      </div>
    );
  }

  return (
    <>
      <VehicleFormSheet open={showForm} onClose={() => setShowForm(false)} />

      {activeServiceVehicle && (
        <ServiceRecordSheet
          open={serviceVehicleId !== null}
          vehicleId={activeServiceVehicle.id}
          vehicleName={`${activeServiceVehicle.registration_number} · ${activeServiceVehicle.make} ${activeServiceVehicle.model}`}
          onClose={() => setServiceVehicleId(null)}
        />
      )}

      <div className="space-y-4">

        {/* Compliance alert banner */}
        {!isLoading && <ComplianceAlertBanner vehicles={vehicles} />}

        {/* Stats + Add button row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-3 flex-1">
            {[
              { label: 'Totalt',       value: vehicles.length, color: 'text-foreground',  icon: Car },
              { label: 'Tillgängliga', value: available,       color: 'text-emerald-600', icon: CheckCircle2 },
              { label: 'I underhåll',  value: inMaintenance,  color: 'text-amber-600',   icon: Wrench },
              { label: 'Ur drift',     value: outOfService,   color: 'text-destructive',  icon: AlertCircle },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-border bg-card px-4 py-2.5 flex items-center gap-2.5 min-w-[110px]">
                <Icon className={cn('w-4 h-4 shrink-0', color)} />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-base font-bold text-foreground tabular-nums">
                    {isLoading ? '–' : value}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <PermissionGate permission={Permissions.VEHICLES_CREATE}>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Lägg till fordon
            </button>
          </PermissionGate>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Reg.nr</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Märke / Modell</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">År</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Växellåda</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Kategorier</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Compliance</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-3.5 w-full rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Car className="w-8 h-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Inga fordon registrerade.</p>
                        <PermissionGate permission={Permissions.VEHICLES_CREATE}>
                          <button
                            onClick={() => setShowForm(true)}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            + Lägg till ditt första fordon
                          </button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                ) : (
                  vehicles.map((v) => (
                    <tr
                      key={v.id}
                      className={cn(
                        'border-b border-border/50 last:border-0 transition-colors',
                        pendingId === v.id ? 'opacity-50' : 'hover:bg-muted/20',
                      )}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-foreground whitespace-nowrap">
                        {v.registration_number}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-foreground">{v.make}</span>
                        <span className="text-muted-foreground"> {v.model}</span>
                        {v.color && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground/60 capitalize">· {v.color}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{v.model_year}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                        {TRANSMISSION_LABEL[v.transmission] ?? v.transmission}
                        {v.has_dual_controls && (
                          <span className="ml-1.5 text-[10px] text-primary/70 font-medium">· Dubbel</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {v.teaching_categories.map((cat) => (
                            <span key={cat} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">{cat}</span>
                          ))}
                        </div>
                      </td>
                      {/* Operational status — inline dropdown (UPDATE-gated) */}
                      <td className="px-4 py-3">
                        <PermissionGate
                          permission={Permissions.VEHICLES_UPDATE}
                          fallback={<VehicleStatusBadge status={v.operational_status} />}
                        >
                          <div className="relative">
                            <select
                              value={v.operational_status}
                              onChange={(e) => void handleStatusChange(v, e.target.value as Vehicle['operational_status'])}
                              disabled={pendingId === v.id}
                              className={cn(
                                'appearance-none pl-2 pr-6 py-0.5 text-[10px] font-semibold rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40',
                                STATUS_CLS[v.operational_status],
                              )}
                            >
                              {Object.entries(STATUS_LABEL).map(([val, lbl]) => (
                                <option key={val} value={val}>{lbl}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" />
                          </div>
                        </PermissionGate>
                      </td>
                      {/* Compliance status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {v.next_service_date && (
                            <div className="flex items-center gap-1">
                              <Wrench className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                              <ServiceStatusBadge date={v.next_service_date} />
                            </div>
                          )}
                          {v.next_inspection_due_at && (
                            <div className="flex items-center gap-1">
                              <ClipboardCheck className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                              <ServiceStatusBadge date={v.next_inspection_due_at} />
                            </div>
                          )}
                          {!v.next_service_date && !v.next_inspection_due_at && (
                            <span className="text-[10px] text-muted-foreground/40">—</span>
                          )}
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <PermissionGate permission={Permissions.VEHICLES_UPDATE}>
                            <button
                              onClick={() => setServiceVehicleId(v.id)}
                              disabled={pendingId === v.id}
                              className="p-1 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30"
                              title="Registrera service"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                            </button>
                          </PermissionGate>
                          <PermissionGate permission={Permissions.VEHICLES_DELETE}>
                            <button
                              onClick={() => void handleDelete(v)}
                              disabled={pendingId === v.id}
                              className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
                              title="Ta bort fordon"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Underhåll tab ────────────────────────────────────────────────────────────

function UnderhallTab() {
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
  const { data: records = [], isLoading: recordsLoading } = useVehicleServiceRecords();
  const { data: maintRecords = [], isLoading: maintLoading } = useVehicleMaintenanceRecords();
  const deleteRecord   = useDeleteServiceRecord();
  const updateMaintStatus = useUpdateMaintenanceStatus();
  const [serviceVehicleId, setServiceVehicleId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [updatingMaintId, setUpdatingMaintId] = useState<string | null>(null);

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
  const isLoading  = vehiclesLoading || recordsLoading;

  async function handleMaintStatusChange(id: string, status: MaintenanceStatus) {
    setUpdatingMaintId(id);
    try {
      await updateMaintStatus.mutateAsync({
        id,
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
        started_at:   status === 'in_progress' ? new Date().toISOString() : null,
      });
      toast({ title: `Status uppdaterad: ${MAINTENANCE_STATUS_LABELS[status]}` });
    } catch {
      toast({ title: 'Kunde inte uppdatera status', variant: 'destructive' });
    } finally {
      setUpdatingMaintId(null);
    }
  }

  const activeServiceVehicle = vehicles.find(v => v.id === serviceVehicleId);

  async function handleDelete(id: string) {
    if (!confirm('Ta bort denna servicepost?')) return;
    setDeletingId(id);
    try {
      await deleteRecord.mutateAsync(id);
      toast({ title: 'Servicepost borttagen' });
    } catch {
      toast({ title: 'Kunde inte ta bort', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {activeServiceVehicle && (
        <ServiceRecordSheet
          open={serviceVehicleId !== null}
          vehicleId={activeServiceVehicle.id}
          vehicleName={`${activeServiceVehicle.registration_number} · ${activeServiceVehicle.make} ${activeServiceVehicle.model}`}
          onClose={() => setServiceVehicleId(null)}
        />
      )}

      <div className="space-y-4">

        {/* Quick-log bar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Servicehistorik för hela flottan</p>
          {vehicles.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Logga för:</span>
              <div className="relative">
                <select
                  className={selectCls + ' w-auto min-w-[140px] text-xs'}
                  value={serviceVehicleId ?? ''}
                  onChange={(e) => setServiceVehicleId(e.target.value || null)}
                >
                  <option value="">Välj fordon…</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.registration_number} · {v.make} {v.model}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <History className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Ingen servicehistorik registrerad.</p>
            {vehicles.length > 0 && (
              <button
                onClick={() => setServiceVehicleId(vehicles[0]?.id ?? null)}
                className="text-xs text-primary hover:underline font-medium"
              >
                + Logga första service
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Datum</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Fordon</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Typ</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Utförd av</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Mätarst.</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Kostnad</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Nästa service</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => {
                    const v = vehicleMap[r.vehicle_id];
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          'border-b border-border/50 last:border-0 transition-colors',
                          deletingId === r.id ? 'opacity-50' : 'hover:bg-muted/20',
                        )}
                      >
                        <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                          {new Date(`${r.service_date}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {v ? (
                            <span>
                              <span className="font-mono font-semibold text-foreground text-xs">{v.registration_number}</span>
                              <span className="text-muted-foreground text-xs"> · {v.make} {v.model}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                          {SERVICE_TYPE_LABELS[r.service_type] ?? r.service_type}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {r.performed_by ?? '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                          {r.mileage_km != null ? `${r.mileage_km.toLocaleString('sv-SE')} km` : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                          {r.cost_sek != null
                            ? new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(r.cost_sek)
                            : '—'
                          }
                        </td>
                        <td className="px-4 py-3">
                          <ServiceStatusBadge date={r.next_service_date} />
                          {!r.next_service_date && <span className="text-[10px] text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => void handleDelete(r.id)}
                            disabled={deletingId === r.id}
                            className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
                            title="Ta bort"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Planerat underhåll ─────────────────────────────────────────── */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Planerat underhåll</span>
              {maintRecords.length > 0 && (
                <span className="text-xs text-muted-foreground">({maintRecords.length})</span>
              )}
            </div>
            <button
              onClick={() => setShowMaintForm(true)}
              disabled={vehicles.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              Planera underhåll
            </button>
          </div>

          {maintLoading ? (
            <div className="space-y-2">
              {[1,2].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : maintRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CalendarX className="w-6 h-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Inget planerat underhåll.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Datum</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Fordon</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Titel</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Typ</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Verkstad</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintRecords.map(mr => {
                      const v = vehicleMap[mr.vehicle_id];
                      return (
                        <tr key={mr.id} className={cn(
                          'border-b border-border/50 last:border-0 transition-colors',
                          updatingMaintId === mr.id ? 'opacity-50' : 'hover:bg-muted/20',
                        )}>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                            {new Date(`${mr.scheduled_at}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {v ? (
                              <span className="font-mono font-semibold text-foreground text-xs">{v.registration_number}</span>
                            ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-foreground">{mr.title}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {MAINTENANCE_TYPE_LABELS[mr.record_type]}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {mr.service_provider ?? '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="relative">
                              <select
                                value={mr.status}
                                onChange={e => void handleMaintStatusChange(mr.id, e.target.value as MaintenanceStatus)}
                                disabled={updatingMaintId === mr.id || mr.status === 'completed' || mr.status === 'cancelled'}
                                className={cn(
                                  'appearance-none pl-2 pr-6 py-0.5 text-[10px] font-semibold rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40',
                                  MAINTENANCE_STATUS_CLS[mr.status],
                                )}
                              >
                                {(['scheduled','in_progress','completed','cancelled'] as MaintenanceStatus[]).map(s => (
                                  <option key={s} value={s}>{MAINTENANCE_STATUS_LABELS[s]}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>

      <MaintenanceFormDialog
        open={showMaintForm}
        vehicles={vehicles}
        onClose={() => setShowMaintForm(false)}
      />
    </>
  );
}

// ─── Maintenance form dialog ──────────────────────────────────────────────────

const MAINTENANCE_TYPES: MaintenanceRecordType[] = [
  'routine_service','repair','major_service','recall','tyre_change','other',
];

const EMPTY_MAINTENANCE: Omit<CreateMaintenanceInput, 'vehicle_id'> = {
  record_type:      'routine_service',
  title:            '',
  description:      null,
  scheduled_at:     new Date().toISOString().slice(0, 10),
  service_provider: '',
  cost_sek:         null,
};

function MaintenanceFormDialog({
  open,
  vehicles,
  onClose,
}: {
  open:     boolean;
  vehicles: Vehicle[];
  onClose:  () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [form, setForm] = useState(EMPTY_MAINTENANCE);
  const create = useCreateMaintenanceRecord();

  useEffect(() => {
    if (open) { setForm(EMPTY_MAINTENANCE); setVehicleId(vehicles[0]?.id ?? ''); }
  }, [open, vehicles]);

  function set<K extends keyof typeof EMPTY_MAINTENANCE>(k: K, v: typeof EMPTY_MAINTENANCE[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId || !form.title.trim()) return;
    try {
      await create.mutateAsync({
        vehicle_id:       vehicleId,
        record_type:      form.record_type,
        title:            form.title.trim(),
        description:      form.description ?? null,
        scheduled_at:     form.scheduled_at,
        service_provider: form.service_provider?.trim() || null,
        cost_sek:         form.cost_sek ?? null,
      });
      toast({ title: 'Underhåll planerat' });
      onClose();
    } catch (err) {
      toast({ title: 'Kunde inte spara', variant: 'destructive',
        description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !create.isPending) onClose(); }} aria-describedby={undefined}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle>Planerat underhåll</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Lägg till ett schemalagt underhållstillfälle</p>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          <form id="maint-form" onSubmit={e => void handleSubmit(e)} className="p-6 space-y-4">
            <Field label="Fordon" required>
              <div className="relative">
                <select className={selectCls} value={vehicleId} onChange={e => setVehicleId(e.target.value)} required>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.registration_number} · {v.make} {v.model}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </Field>
            <Field label="Typ" required>
              <div className="relative">
                <select className={selectCls} value={form.record_type} onChange={e => set('record_type', e.target.value as MaintenanceRecordType)}>
                  {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{MAINTENANCE_TYPE_LABELS[t]}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </Field>
            <Field label="Titel" required>
              <input className={inputCls} placeholder="t.ex. Oljebyte + filter" value={form.title}
                onChange={e => set('title', e.target.value)} required />
            </Field>
            <Field label="Planerat datum" required>
              <input className={inputCls} type="date" value={form.scheduled_at}
                onChange={e => set('scheduled_at', e.target.value)} required />
            </Field>
            <Field label="Verkstad">
              <input className={inputCls} placeholder="Namn på verkstad" value={form.service_provider ?? ''}
                onChange={e => set('service_provider', e.target.value)} />
            </Field>
            <Field label="Kostnad (kr)">
              <input className={inputCls} type="number" min={0} step={0.01} placeholder="2500"
                value={form.cost_sek ?? ''} onChange={e => set('cost_sek', e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </form>
        </ScrollArea>
        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" type="button" onClick={onClose} disabled={create.isPending}>Avbryt</Button>
          <Button type="submit" form="maint-form" disabled={create.isPending || !form.title.trim()}>
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Spara underhåll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Besiktning form dialog ───────────────────────────────────────────────────

const INSPECTION_TYPES: InspectionType[]   = ['besiktning','internal','insurance','other'];
const INSPECTION_RESULTS: InspectionResult[] = ['passed','failed','passed_with_remarks','deferred'];

const EMPTY_INSPECTION: Omit<CreateInspectionInput, 'vehicle_id'> = {
  inspection_type:    'besiktning',
  scheduled_at:       null,
  inspected_at:       new Date().toISOString().slice(0, 10),
  next_due_at:        (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 2); return d.toISOString().slice(0, 10); })(),
  result:             'passed',
  station_name:       '',
  certificate_number: '',
  remarks:            '',
};

function InspectionFormDialog({
  open,
  vehicles,
  defaultVehicleId,
  onClose,
}: {
  open:             boolean;
  vehicles:         Vehicle[];
  defaultVehicleId: string;
  onClose:          () => void;
}) {
  const [vehicleId, setVehicleId] = useState(defaultVehicleId);
  const [form, setForm] = useState(EMPTY_INSPECTION);
  const createInspection = useCreateInspection();
  const updateVehicle    = useUpdateVehicle();

  useEffect(() => {
    if (open) { setForm(EMPTY_INSPECTION); setVehicleId(defaultVehicleId); }
  }, [open, defaultVehicleId]);

  function set<K extends keyof typeof EMPTY_INSPECTION>(k: K, v: typeof EMPTY_INSPECTION[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return;
    try {
      await createInspection.mutateAsync({
        vehicle_id:         vehicleId,
        inspection_type:    form.inspection_type,
        scheduled_at:       form.scheduled_at || null,
        inspected_at:       form.inspected_at,
        next_due_at:        form.next_due_at,
        result:             form.result,
        station_name:       form.station_name?.trim() || null,
        certificate_number: form.certificate_number?.trim() || null,
        remarks:            form.remarks?.trim() || null,
      });
      // Sync vehicle's next_inspection_due_at and status
      const newStatus = form.result === 'failed' ? 'inspection_due' : 'available';
      await updateVehicle.mutateAsync({
        id: vehicleId,
        next_inspection_due_at: form.next_due_at,
        last_inspected_at:      form.inspected_at,
        operational_status:     newStatus,
      });
      toast({ title: 'Besiktning sparad' });
      onClose();
    } catch (err) {
      toast({ title: 'Kunde inte spara besiktning', variant: 'destructive',
        description: err instanceof Error ? err.message : undefined });
    }
  }

  const isPending = createInspection.isPending || updateVehicle.isPending;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isPending) onClose(); }} aria-describedby={undefined}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle>Logga besiktning</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Registrera besiktningsresultat och nästa besiktningsdatum</p>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          <form id="insp-form" onSubmit={e => void handleSubmit(e)} className="p-6 space-y-4">
            <Field label="Fordon" required>
              <div className="relative">
                <select className={selectCls} value={vehicleId} onChange={e => setVehicleId(e.target.value)} required>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.registration_number} · {v.make} {v.model}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </Field>
            <Field label="Typ" required>
              <div className="relative">
                <select className={selectCls} value={form.inspection_type} onChange={e => set('inspection_type', e.target.value as InspectionType)}>
                  {INSPECTION_TYPES.map(t => <option key={t} value={t}>{INSPECTION_TYPE_LABELS[t]}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Besiktningsdatum" required>
                <input className={inputCls} type="date" value={form.inspected_at}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => set('inspected_at', e.target.value)} required />
              </Field>
              <Field label="Nästa besiktning" required>
                <input className={inputCls} type="date" value={form.next_due_at}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => set('next_due_at', e.target.value)} required />
              </Field>
            </div>
            <Field label="Resultat" required>
              <div className="relative">
                <select className={selectCls} value={form.result} onChange={e => set('result', e.target.value as InspectionResult)}>
                  {INSPECTION_RESULTS.map(r => <option key={r} value={r}>{INSPECTION_RESULT_LABELS[r]}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </Field>
            <Field label="Station">
              <input className={inputCls} placeholder="Bilprovningen, Opus, Dekra…" value={form.station_name ?? ''}
                onChange={e => set('station_name', e.target.value)} />
            </Field>
            <Field label="Intygnummer">
              <input className={inputCls} placeholder="Besiktningsintygets nummer" value={form.certificate_number ?? ''}
                onChange={e => set('certificate_number', e.target.value)} />
            </Field>
            <Field label="Anmärkningar">
              <textarea className={inputCls + ' h-16 resize-none py-2'} placeholder="Eventuella anmärkningar…"
                value={form.remarks ?? ''} onChange={e => set('remarks', e.target.value)} />
            </Field>
          </form>
        </ScrollArea>
        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" type="button" onClick={onClose} disabled={isPending}>Avbryt</Button>
          <Button type="submit" form="insp-form" disabled={isPending}>
            {isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Spara besiktning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Besiktning tab ───────────────────────────────────────────────────────────

function BesiktningTab() {
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
  const { data: inspections = [], isLoading: inspLoading } = useVehicleInspections();
  const [filterVehicleId, setFilterVehicleId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
  const isLoading  = vehiclesLoading || inspLoading;

  const displayed = filterVehicleId
    ? inspections.filter(i => i.vehicle_id === filterVehicleId)
    : inspections;

  const defaultVehicleId = filterVehicleId || vehicles[0]?.id || '';

  return (
    <>
      <InspectionFormDialog
        open={showForm}
        vehicles={vehicles}
        defaultVehicleId={defaultVehicleId}
        onClose={() => setShowForm(false)}
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Visa:</span>
            <div className="relative">
              <select
                className={selectCls + ' w-auto min-w-[160px] text-xs'}
                value={filterVehicleId}
                onChange={e => setFilterVehicleId(e.target.value)}
              >
                <option value="">Alla fordon</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.registration_number} · {v.make} {v.model}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            disabled={vehicles.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            Logga besiktning
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Shield className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Inga besiktningar registrerade.</p>
            {vehicles.length > 0 && (
              <button onClick={() => setShowForm(true)} className="text-xs text-primary hover:underline font-medium">
                + Logga första besiktning
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Datum</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Fordon</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Typ</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Station</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Resultat</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Nästa besiktning</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Intygnr</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(insp => {
                    const v = vehicleMap[insp.vehicle_id];
                    return (
                      <tr key={insp.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap text-xs">
                          {new Date(`${insp.inspected_at}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {v ? (
                            <span>
                              <span className="font-mono font-semibold text-foreground text-xs">{v.registration_number}</span>
                              <span className="text-muted-foreground text-xs"> · {v.make} {v.model}</span>
                            </span>
                          ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {INSPECTION_TYPE_LABELS[insp.inspection_type]}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {insp.station_name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap',
                            INSPECTION_RESULT_CLS[insp.result],
                          )}>
                            {INSPECTION_RESULT_LABELS[insp.result]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ServiceStatusBadge date={insp.next_due_at.slice(0, 10)} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          {insp.certificate_number ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Platser tab ──────────────────────────────────────────────────────────────

function PlatserTab() {
  const { data: locations = [], isLoading, isError, refetch } = useLocations();
  const remove   = useDeleteLocation();
  const [showForm, setShowForm] = useState(false);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Ta bort platsen "${name}"?`)) return;
    try {
      await remove.mutateAsync(id);
      toast({ title: 'Plats borttagen' });
    } catch {
      toast({ title: 'Kunde inte ta bort platsen', variant: 'destructive' });
    }
  }

  if (isError) {
    return (
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
        <span>Det gick inte att hämta platser.</span>
        <button onClick={() => void refetch()} className="ml-4 shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline">
          Försök igen
        </button>
      </div>
    );
  }

  return (
    <>
      <LocationFormSheet open={showForm} onClose={() => setShowForm(false)} />

      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Lägg till plats
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <Skeleton className="h-4 w-2/3 rounded" />
                <Skeleton className="h-3.5 w-full rounded" />
                <Skeleton className="h-3.5 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : locations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <MapPin className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Inga platser registrerade.</p>
            <button onClick={() => setShowForm(true)} className="text-xs text-primary hover:underline font-medium">
              + Lägg till din första plats
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {locations.map((loc) => (
              <div key={loc.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {loc.is_primary && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        Huvudadress
                      </span>
                    )}
                    <button
                      onClick={() => void handleDelete(loc.id, loc.name)}
                      className="opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                      title="Ta bort plats"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{loc.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatLocationAddress(loc)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Utnyttjande tab (Gap 7) ──────────────────────────────────────────────────

function UtnyttjandeTab() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const { data: vehicles = [] } = useVehicles();

  const { data: slots } = useQuery({
    queryKey: ['vehicle-utilization', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data } = await supabase
        .from('lesson_slots')
        .select('vehicle_id, starts_at, ends_at, current_bookings, max_bookings')
        .eq('organization_id', orgId)
        .gte('starts_at', from);
      return (data ?? []) as Array<{ vehicle_id: string | null; starts_at: string; ends_at: string; current_bookings: number; max_bookings: number }>;
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });

  const rows = useMemo(() => {
    if (!slots) return [];
    return vehicles.map(v => {
      const vSlots = slots.filter(s => s.vehicle_id === v.id);
      const totalSlots    = vSlots.length;
      const totalCapacity = vSlots.reduce((s, sl) => s + sl.max_bookings, 0);
      const totalBooked   = vSlots.reduce((s, sl) => s + sl.current_bookings, 0);
      const utilization   = totalCapacity > 0 ? Math.round(totalBooked / totalCapacity * 100) : 0;
      return { v, totalSlots, totalBooked, totalCapacity, utilization };
    }).sort((a, b) => b.utilization - a.utilization);
  }, [vehicles, slots]);

  const unassigned = slots?.filter(s => !s.vehicle_id).length ?? 0;

  return (
    <div className="space-y-5 pt-4">
      {unassigned > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {unassigned} schemalagda pass saknar tilldelat fordon denna månad.
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <ChartBar className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Fordonsutnyttjande (senaste 30 dagarna)</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Fordon</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Pass</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Bokade/Max</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Utnyttjande</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Inga fordon registrerade.
                </td>
              </tr>
            ) : rows.map(({ v, totalSlots, totalBooked, totalCapacity, utilization }) => (
              <tr key={v.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{v.registration_number}</p>
                  <p className="text-xs text-muted-foreground">{v.make} {v.model}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  <VehicleStatusBadge status={v.operational_status} />
                </td>
                <td className="px-4 py-3 text-center text-foreground">{totalSlots}</td>
                <td className="px-4 py-3 text-center text-foreground">{totalBooked}/{totalCapacity}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          utilization >= 75 ? 'bg-green-500'
                          : utilization >= 40 ? 'bg-amber-400'
                          : 'bg-muted-foreground/40',
                        )}
                        style={{ width: `${utilization}%` }}
                      />
                    </div>
                    <span className={cn(
                      'text-xs font-bold tabular-nums w-8 text-right',
                      utilization >= 75 ? 'text-green-600 dark:text-green-400'
                      : utilization >= 40 ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground',
                    )}>
                      {utilization}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ResourcesPage ────────────────────────────────────────────────────────────

type ResTab = 'fordon' | 'underhall' | 'besiktning' | 'platser' | 'utnyttjande';

const TABS: { key: ResTab; label: string }[] = [
  { key: 'fordon',      label: 'Fordon'      },
  { key: 'underhall',   label: 'Underhåll'   },
  { key: 'besiktning',  label: 'Besiktning'  },
  { key: 'platser',     label: 'Platser'     },
  { key: 'utnyttjande', label: 'Utnyttjande' },
];

export function ResourcesPage() {
  const [tab, setTab] = useState<ResTab>('fordon');

  return (
    <PageLayout>
      <PageHeader
        title="Resurser"
        description="Registrera och hantera fordon, underhåll och undervisningsplatser"
        breadcrumbs={[{ label: 'Hem' }, { label: 'Resurser' }]}
      />

      <PageContent>

        {/* Tab bar */}
        <div className="border-b border-border -mt-2">
          <div className="flex gap-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  tab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/60',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'fordon'      && <FordanTab      />}
        {tab === 'underhall'   && <UnderhallTab   />}
        {tab === 'besiktning'  && <BesiktningTab  />}
        {tab === 'platser'     && <PlatserTab     />}
        {tab === 'utnyttjande' && <UtnyttjandeTab />}

      </PageContent>
    </PageLayout>
  );
}
