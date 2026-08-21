import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X, Plus, User, Copy, Check, ExternalLink, TrendingUp, Users, ChartBar, CheckCircle, XCircle, AlertCircle, Trash2, Car, ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils.js';
import { Button, toast } from '@platform/ui';
import {
  useInstructor, useUpdateInstructor, useArchiveInstructor, useInstructorBookingLogs,
  useInstructorCertifications, useCreateInstructorCertification, useDeleteInstructorCertification,
  useInstructorAvailabilityRules, useCreateAvailabilityRule, useDeleteAvailabilityRule, useUpdateAvailabilityRule,
  useInstructorTimeOff, useCreateTimeOff, useUpdateTimeOffStatus,
  useInstructorVehicleAssignments, useAssignVehicle, useUnassignVehicle,
} from '../hooks/useInstructors.js';
import type {
  InstructorLogFilter, InstructorCertification,
  InstructorAvailabilityRule, InstructorTimeOff, TimeOffStatus,
  InstructorVehicleAssignment,
} from '../hooks/useInstructors.js';
import { useVehicles } from '@modules/resources/hooks/useVehicles.js';
import type { Vehicle } from '@modules/resources/hooks/useVehicles.js';
import { useGenerateInstructorPortalToken } from '@modules/instructor-portal/hooks/useInstructorPortal.js';
import { formatDateTime, computeCertStatus } from '../lib/instructorUtils.js';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'oversikt' | 'schema' | 'utbildning' | 'prestanda' | 'loggar' | 'installningar';

const TABS: { key: Tab; label: string }[] = [
  { key: 'oversikt',      label: 'Översikt' },
  { key: 'schema',        label: 'Schema' },
  { key: 'utbildning',    label: 'Utbildningsbehörigheter' },
  { key: 'prestanda',     label: 'Prestanda' },
  { key: 'loggar',        label: 'Loggar' },
  { key: 'installningar', label: 'Inställningar' },
];

const TEACHING_CATEGORIES = [
  { key: 'B',       label: 'B – Personbil' },
  { key: 'A',       label: 'A – Motorcykel' },
  { key: 'A1',      label: 'A1 – Lätt motorcykel' },
  { key: 'A2',      label: 'A2 – Mellankategori motorcykel' },
  { key: 'AM',      label: 'AM – Moped' },
  { key: 'B96',     label: 'B96 – Personbil med lätt släp' },
  { key: 'BE',      label: 'BE – Personbil med tungt släp' },
  { key: 'C',       label: 'C – Tung lastbil' },
  { key: 'C1',      label: 'C1 – Medeltung lastbil' },
  { key: 'CE',      label: 'CE – Tung lastbil med tungt släp' },
  { key: 'D',       label: 'D – Buss' },
  { key: 'DE',      label: 'DE – Buss med tungt släp' },
  { key: 'Traktor', label: 'Traktor' },
  { key: 'YKB-C',   label: 'YKB-C – Yrkeskompetensbevis för godstransport' },
  { key: 'YKB-D',   label: 'YKB-D – Yrkeskompetensbevis för persontransport' },
];

const CERT_TYPE_OPTIONS = [
  { key: 'ADI',                    label: 'ADI – Approved Driving Instructor (brittisk certifiering)' },
  { key: 'first_aid',              label: 'Första hjälpen' },
  { key: 'risk_education_teacher', label: 'Riskettan/Risktvåan lärarbehörighet' },
  { key: 'other',                  label: 'Övrigt' },
];

const LANGUAGE_OPTIONS = [
  'Svenska', 'English', 'Arabic', 'Somali', 'Kurdish',
  'Turkish', 'Persian', 'Polish', 'Spanish', 'French',
];

const LOG_FILTER_OPTIONS: { label: string; value: InstructorLogFilter }[] = [
  { label: 'Visa alla loggar', value: 'all' },
  { label: 'Inbokade',         value: 'booked' },
  { label: 'Avbokade',         value: 'cancelled' },
];

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-md bg-white p-5 mb-4">
      {title && (
        <h2 className="text-[#1a7dc4] font-semibold text-base mb-4">{title}</h2>
      )}
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-gray-500 mb-1">{children}</label>;
}

function TextField({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full border border-gray-300 rounded px-3 py-2 text-sm',
          readOnly ? 'bg-gray-50 text-gray-600 cursor-default' : 'bg-white focus:outline-none focus:ring-1 focus:ring-blue-400',
        )}
      />
    </div>
  );
}

function SaveButton({ onClick, loading, label = 'Spara' }: { onClick: () => void; loading?: boolean; label?: string }) {
  return (
    <div className="flex justify-end mt-4">
      <button
        onClick={onClick}
        disabled={loading}
        className="bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white rounded-full px-6 py-2 text-sm font-semibold flex items-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {label}
      </button>
    </div>
  );
}

// ─── Översikt tab ─────────────────────────────────────────────────────────────

function OversiktTab({
  instructor,
  onSave,
  saving,
}: {
  instructor: NonNullable<ReturnType<typeof useInstructor>['data']>;
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [firstName,    setFirstName]    = useState(instructor.first_name);
  const [lastName,     setLastName]     = useState(instructor.last_name);
  const [email,        setEmail]        = useState(instructor.email);
  const [phone,        setPhone]        = useState(instructor.phone ?? '');
  const [languages,    setLanguages]    = useState<string[]>(instructor.languages_spoken ?? []);
  const [langSearch,   setLangSearch]   = useState('');
  const [presentation, setPresentation] = useState(instructor.bio ?? '');
  const [addressLine1, setAddressLine1] = useState(instructor.address_line1 ?? '');
  const [postalCode,   setPostalCode]   = useState(instructor.postal_code ?? '');
  const [city,         setCity]         = useState(instructor.city ?? '');
  const [sortOrder,    setSortOrder]    = useState(String(instructor.sort_order));
  const { organization } = useSession();
  const [inBooking,    setInBooking]    = useState(instructor.show_in_booking);
  const [inEcommerce,  setInEcommerce]  = useState(instructor.show_in_ecommerce);
  const [onWebsite,    setOnWebsite]    = useState(instructor.show_on_website);

  // Emergency contact
  const [nextFirstName, setNextFirstName] = useState(instructor.emergency_contact_first_name ?? '');
  const [nextLastName,  setNextLastName]  = useState(instructor.emergency_contact_last_name ?? '');
  const [nextEmail,     setNextEmail]     = useState(instructor.emergency_contact_email ?? '');
  const [nextPhone,     setNextPhone]     = useState(instructor.emergency_contact_phone ?? '');

  // Sync if instructor prop changes
  useEffect(() => {
    setFirstName(instructor.first_name);
    setLastName(instructor.last_name);
    setEmail(instructor.email);
    setPhone(instructor.phone ?? '');
    setLanguages(instructor.languages_spoken ?? []);
    setPresentation(instructor.bio ?? '');
    setAddressLine1(instructor.address_line1 ?? '');
    setPostalCode(instructor.postal_code ?? '');
    setCity(instructor.city ?? '');
    setSortOrder(String(instructor.sort_order));
    setInBooking(instructor.show_in_booking);
    setInEcommerce(instructor.show_in_ecommerce);
    setOnWebsite(instructor.show_on_website);
    setNextFirstName(instructor.emergency_contact_first_name ?? '');
    setNextLastName(instructor.emergency_contact_last_name ?? '');
    setNextEmail(instructor.emergency_contact_email ?? '');
    setNextPhone(instructor.emergency_contact_phone ?? '');
  }, [instructor]);

  function removeLanguage(lang: string) {
    setLanguages((prev) => prev.filter((l) => l !== lang));
  }

  function addLanguage(lang: string) {
    if (!languages.includes(lang)) {
      setLanguages((prev) => [...prev, lang]);
    }
    setLangSearch('');
  }

  const filteredLangs = LANGUAGE_OPTIONS.filter(
    (l) => !languages.includes(l) && l.toLowerCase().includes(langSearch.toLowerCase()),
  );

  return (
    <>
      {/* Personlig information */}
      <SectionCard title="Personlig information">
        <div className="flex gap-5 mb-4">
          {/* Avatar */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-10 h-10 text-gray-400" />
            </div>
            <button className="text-xs text-blue-500 hover:underline whitespace-nowrap">
              Byt profilbild
            </button>
          </div>

          {/* Personnummer + Titel */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              label="Personnummer"
              value={instructor.personnummer_last4 ? `******-${instructor.personnummer_last4}` : ''}
              readOnly
              placeholder="Ej registrerat"
            />
            <TextField
              label="Titel"
              value="Trafikklärare"
              readOnly
            />
          </div>
        </div>

        {/* Name row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <TextField label="Förnamn" value={firstName} onChange={setFirstName} />
          <TextField label="Efternamn" value={lastName} onChange={setLastName} />
          <TextField label="Smeknamn (visas publikt)" value={firstName} readOnly />
        </div>

        {/* Contact row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <TextField label="E-post" value={email} onChange={setEmail} />
          <TextField label="Telefonnummer" value={phone} onChange={setPhone} placeholder="Ej registrerat" />
        </div>

        {/* Address row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <TextField label="Adress" value={addressLine1} onChange={setAddressLine1} placeholder="Ej registrerat" />
          <TextField label="Postnummer" value={postalCode} onChange={setPostalCode} placeholder="Ej registrerat" />
          <TextField label="Stad" value={city} onChange={setCity} placeholder="Ej registrerat" />
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <TextField label="Personal skapad" value={formatDateTime(instructor.created_at)} readOnly />
          <TextField label="Senaste aktivitet" value={formatDateTime(instructor.updated_at)} readOnly />
          <div>
            <FieldLabel>Sorteringsordning</FieldLabel>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Visibility checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-1">
          {[
            { label: 'Visa i bokningsschema', checked: inBooking, set: setInBooking },
            { label: 'Visa i e-handel och elevbokning', checked: inEcommerce, set: setInEcommerce },
            { label: 'Visa på hemsidan', checked: onWebsite, set: setOnWebsite },
          ].map(({ label, checked, set }) => (
            <label key={label} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => set(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>

        <SaveButton
          loading={saving}
          onClick={() =>
            onSave({
              first_name: firstName,
              last_name: lastName,
              email,
              phone: phone || null,
              address_line1: addressLine1 || null,
              postal_code: postalCode || null,
              city: city || null,
              sort_order: parseInt(sortOrder, 10) || 0,
              show_in_booking: inBooking,
              show_in_ecommerce: inEcommerce,
              show_on_website: onWebsite,
            })
          }
        />
      </SectionCard>

      {/* Talade språk */}
      <SectionCard title="Talade språk">
        <div className="flex flex-wrap gap-2 mb-3">
          {languages.map((lang) => (
            <span
              key={lang}
              className="flex items-center gap-1 bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm font-medium"
            >
              {lang}
              <button onClick={() => removeLanguage(lang)} className="hover:text-blue-600 ml-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        <div className="relative">
          <input
            type="text"
            value={langSearch}
            onChange={(e) => setLangSearch(e.target.value)}
            placeholder="Sök efter språk..."
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {langSearch && filteredLangs.length > 0 && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-md max-h-40 overflow-y-auto">
              {filteredLangs.map((lang) => (
                <button
                  key={lang}
                  onClick={() => addLanguage(lang)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                >
                  {lang}
                </button>
              ))}
            </div>
          )}
        </div>

        <SaveButton
          loading={saving}
          onClick={() => onSave({ languages_spoken: languages })}
        />
      </SectionCard>

      {/* Presentation */}
      <SectionCard title={`Presentation till ${organization?.name ?? 'trafikskolan'}`}>
        <textarea
          value={presentation}
          onChange={(e) => setPresentation(e.target.value)}
          rows={4}
          placeholder="Skriv en kort presentation..."
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <SaveButton
          loading={saving}
          onClick={() => onSave({ bio: presentation || null })}
        />
      </SectionCard>

      {/* Anhöriga personer */}
      <SectionCard title="Anhöriga personer">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TextField label="Förnamn"       value={nextFirstName} onChange={setNextFirstName} placeholder="" />
          <TextField label="Efternamn"     value={nextLastName}  onChange={setNextLastName}  placeholder="" />
          <TextField label="E-postadress"  value={nextEmail}     onChange={setNextEmail}     placeholder="" />
          <TextField label="Telefonnummer" value={nextPhone}     onChange={setNextPhone}     placeholder="" />
        </div>
        <SaveButton
          loading={saving}
          onClick={() =>
            onSave({
              emergency_contact_first_name: nextFirstName || null,
              emergency_contact_last_name: nextLastName || null,
              emergency_contact_email: nextEmail || null,
              emergency_contact_phone: nextPhone || null,
            })
          }
        />
      </SectionCard>

      {/* Favoritfordon */}
      <FavoritfordonSection />
    </>
  );
}

function FavoritfordonSection() {
  return (
    <SectionCard title="Favoritfordon">
      <div className="flex flex-col items-center justify-center py-6 gap-2">
        <Car className="w-8 h-8 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">Kommer snart</p>
        <p className="text-xs text-gray-400 text-center max-w-xs">
          Prioriterade fordon för automatisk fördelning — aktiveras i en framtida version.
        </p>
      </div>
    </SectionCard>
  );
}

// ─── Schema tab ───────────────────────────────────────────────────────────────

function SchemaTab({
  instructor,
}: {
  instructor: NonNullable<ReturnType<typeof useInstructor>['data']>;
}) {
  return (
    <>
      <SectionCard title="Loggar">
        <p className="text-sm text-gray-400">Denna personal har inga loggar.</p>
      </SectionCard>

      <AvailabilityRulesSection
        instructorId={instructor.id}
        organizationId={instructor.organization_id}
      />

      <TimeOffSection
        instructorId={instructor.id}
        organizationId={instructor.organization_id}
      />

      <VehicleAssignmentsSection
        instructorId={instructor.id}
        organizationId={instructor.organization_id}
      />
    </>
  );
}

// ─── Availability rules section ───────────────────────────────────────────────

const DAY_NAMES_SV = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];

function AvailabilityRulesSection({
  instructorId,
  organizationId,
}: {
  instructorId: string;
  organizationId: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [showAdd,          setShowAdd]          = useState(false);
  const [newDay,           setNewDay]           = useState('1');
  const [newStart,         setNewStart]         = useState('09:00');
  const [newEnd,           setNewEnd]           = useState('17:00');
  const [newEffectiveFrom, setNewEffectiveFrom] = useState(today);
  const [newEffectiveUntil,setNewEffectiveUntil]= useState('');
  const [newDuration,      setNewDuration]      = useState('60');
  const [newNotes,         setNewNotes]         = useState('');

  const { data: rules = [], isLoading } = useInstructorAvailabilityRules(instructorId);
  const createMutation = useCreateAvailabilityRule();
  const deleteMutation = useDeleteAvailabilityRule();
  const toggleMutation = useUpdateAvailabilityRule();

  const sorted = [...rules].sort((a: InstructorAvailabilityRule, b: InstructorAvailabilityRule) => {
    const order = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun
    return order.indexOf(a.day_of_week) - order.indexOf(b.day_of_week);
  });

  function handleAdd() {
    createMutation.mutate(
      {
        instructorId,
        organizationId,
        input: {
          day_of_week:           parseInt(newDay),
          start_time:            newStart,
          end_time:              newEnd,
          effective_from:        newEffectiveFrom,
          effective_until:       newEffectiveUntil || null,
          slot_duration_minutes: parseInt(newDuration),
          notes:                 newNotes || null,
        },
      },
      {
        onSuccess: () => {
          setShowAdd(false);
          setNewDay('1');
          setNewStart('09:00');
          setNewEnd('17:00');
          setNewEffectiveFrom(today);
          setNewEffectiveUntil('');
          setNewDuration('60');
          setNewNotes('');
        },
      },
    );
  }

  return (
    <SectionCard title="Veckovisa tillgänglighetsregler">
      {isLoading ? (
        <p className="text-sm text-gray-400">Laddar...</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">Inga regler inlagda.</p>
      ) : (
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="pb-2 pr-4 font-medium">Dag</th>
                <th className="pb-2 pr-4 font-medium">Start</th>
                <th className="pb-2 pr-4 font-medium">Slut</th>
                <th className="pb-2 pr-4 font-medium">Lektionstid</th>
                <th className="pb-2 pr-4 font-medium">Aktiv från</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((rule: InstructorAvailabilityRule) => (
                <tr key={rule.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-4 font-medium">{DAY_NAMES_SV[rule.day_of_week]}</td>
                  <td className="py-2 pr-4">{rule.start_time.slice(0, 5)}</td>
                  <td className="py-2 pr-4">{rule.end_time.slice(0, 5)}</td>
                  <td className="py-2 pr-4">{rule.slot_duration_minutes} min</td>
                  <td className="py-2 pr-4">{rule.effective_from}</td>
                  <td className="py-2 pr-4">
                    <span className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                    )}>
                      {rule.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleMutation.mutate({ ruleId: rule.id, instructorId, isActive: !rule.is_active })}
                        disabled={toggleMutation.isPending}
                        className="text-xs text-blue-500 hover:underline disabled:opacity-50"
                      >
                        {rule.is_active ? 'Inaktivera' : 'Aktivera'}
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate({ ruleId: rule.id, instructorId })}
                        disabled={deleteMutation.isPending}
                        className="text-red-400 hover:text-red-600 disabled:opacity-50"
                        aria-label="Ta bort regel"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700"
        >
          <Plus size={14} />
          Lägg till regel
        </button>
      ) : (
        <div className="border border-gray-200 rounded-md p-4 bg-gray-50 mt-2">
          <p className="text-sm font-medium text-gray-700 mb-3">Ny tillgänglighetsregel</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <FieldLabel>Veckodag</FieldLabel>
              <select
                value={newDay}
                onChange={(e) => setNewDay(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              >
                {DAY_NAMES_SV.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Starttid</FieldLabel>
              <input
                type="time"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <FieldLabel>Sluttid</FieldLabel>
              <input
                type="time"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <FieldLabel>Lektionstid (min)</FieldLabel>
              <select
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              >
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
              </select>
            </div>
            <div>
              <FieldLabel>Aktiv från</FieldLabel>
              <input
                type="date"
                value={newEffectiveFrom}
                onChange={(e) => setNewEffectiveFrom(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <FieldLabel>Aktiv till (valfritt)</FieldLabel>
              <input
                type="date"
                value={newEffectiveUntil}
                onChange={(e) => setNewEffectiveUntil(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="mb-3">
            <FieldLabel>Anteckningar (valfritt)</FieldLabel>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Frivillig anteckning..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={createMutation.isPending || !newStart || !newEnd || !newEffectiveFrom}
              className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded px-4 py-2 text-sm font-medium"
            >
              {createMutation.isPending ? 'Sparar...' : 'Spara regel'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="border border-gray-300 rounded px-4 py-2 text-sm hover:bg-gray-100"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Time-off section ──────────────────────────────────────────────────────────

const TIME_OFF_TYPE_LABELS: Record<string, string> = {
  vacation:       'Semester',
  sickness:       'Sjukskrivning',
  training:       'Utbildning',
  public_holiday: 'Helgdag',
  emergency:      'Akut frånvaro',
  other:          'Övrigt',
};

const TIME_OFF_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Väntar',    cls: 'bg-amber-100 text-amber-700' },
  approved:  { label: 'Godkänd',   cls: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Avvisad',   cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Avbokad',   cls: 'bg-gray-100 text-gray-500' },
};

function TimeOffSection({
  instructorId,
  organizationId,
}: {
  instructorId: string;
  organizationId: string;
}) {
  const [showAdd,      setShowAdd]      = useState(false);
  const [newType,      setNewType]      = useState<TimeOffStatus | string>('vacation');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate,   setNewEndDate]   = useState('');
  const [newIsFullDay, setNewIsFullDay] = useState(true);
  const [newReason,    setNewReason]    = useState('');

  const { data: timeOffs = [], isLoading } = useInstructorTimeOff(instructorId);
  const createMutation = useCreateTimeOff();
  const updateMutation = useUpdateTimeOffStatus();

  const sorted = [...timeOffs].sort(
    (a: InstructorTimeOff, b: InstructorTimeOff) =>
      new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
  );

  function handleAdd() {
    if (!newStartDate || !newEndDate) return;
    createMutation.mutate(
      {
        instructorId,
        organizationId,
        input: {
          time_off_type: newType as InstructorTimeOff['time_off_type'],
          starts_at:     `${newStartDate}T00:00:00Z`,
          ends_at:       `${newEndDate}T23:59:59Z`,
          is_full_day:   newIsFullDay,
          reason:        newReason || null,
        },
      },
      {
        onSuccess: () => {
          setShowAdd(false);
          setNewType('vacation');
          setNewStartDate('');
          setNewEndDate('');
          setNewIsFullDay(true);
          setNewReason('');
        },
      },
    );
  }

  return (
    <SectionCard title="Ledighetsansökningar">
      {isLoading ? (
        <p className="text-sm text-gray-400">Laddar...</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">Inga ledighetsansökningar.</p>
      ) : (
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="pb-2 pr-4 font-medium">Typ</th>
                <th className="pb-2 pr-4 font-medium">Startdatum</th>
                <th className="pb-2 pr-4 font-medium">Slutdatum</th>
                <th className="pb-2 pr-4 font-medium">Heldag</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((to: InstructorTimeOff) => {
                const statusInfo = TIME_OFF_STATUS_MAP[to.status] ?? { label: to.status, cls: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={to.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {TIME_OFF_TYPE_LABELS[to.time_off_type] ?? to.time_off_type}
                    </td>
                    <td className="py-2 pr-4">
                      {new Date(to.starts_at).toLocaleDateString('sv-SE')}
                    </td>
                    <td className="py-2 pr-4">
                      {new Date(to.ends_at).toLocaleDateString('sv-SE')}
                    </td>
                    <td className="py-2 pr-4">{to.is_full_day ? 'Ja' : 'Nej'}</td>
                    <td className="py-2 pr-4">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusInfo.cls)}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="py-2 space-x-3">
                      {to.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updateMutation.mutate({
                              timeOffId:    to.id,
                              instructorId,
                              status:       'approved',
                            })}
                            disabled={updateMutation.isPending}
                            className="text-xs text-green-600 hover:text-green-700 hover:underline disabled:opacity-50"
                          >
                            Godkänn
                          </button>
                          <button
                            onClick={() => updateMutation.mutate({
                              timeOffId:    to.id,
                              instructorId,
                              status:       'rejected',
                            })}
                            disabled={updateMutation.isPending}
                            className="text-xs text-gray-400 hover:text-gray-600 hover:underline disabled:opacity-50"
                          >
                            Neka
                          </button>
                          <button
                            onClick={() => updateMutation.mutate({
                              timeOffId:    to.id,
                              instructorId,
                              status:       'cancelled',
                            })}
                            disabled={updateMutation.isPending}
                            className="text-xs text-red-400 hover:text-red-600 hover:underline disabled:opacity-50"
                          >
                            Avboka
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700"
        >
          <Plus size={14} />
          Ansök om ledighet
        </button>
      ) : (
        <div className="border border-gray-200 rounded-md p-4 bg-gray-50 mt-2">
          <p className="text-sm font-medium text-gray-700 mb-3">Ny ledighetsansökan</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <FieldLabel>Ledighetstyp</FieldLabel>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              >
                {Object.entries(TIME_OFF_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsFullDay}
                  onChange={(e) => setNewIsFullDay(e.target.checked)}
                  className="w-4 h-4 accent-blue-500"
                />
                <span className="text-sm text-gray-700">Heldag</span>
              </label>
            </div>
            <div>
              <FieldLabel>Startdatum</FieldLabel>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <FieldLabel>Slutdatum</FieldLabel>
              <input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="mb-3">
            <FieldLabel>Anledning (valfritt)</FieldLabel>
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Frivillig beskrivning..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={createMutation.isPending || !newStartDate || !newEndDate}
              className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded px-4 py-2 text-sm font-medium"
            >
              {createMutation.isPending ? 'Sparar...' : 'Skicka ansökan'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="border border-gray-300 rounded px-4 py-2 text-sm hover:bg-gray-100"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Vehicle assignments section ──────────────────────────────────────────────

function VehicleAssignmentsSection({
  instructorId,
  organizationId,
}: {
  instructorId: string;
  organizationId: string;
}) {
  const [showAdd,       setShowAdd]       = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);
  const [newVehicleId,  setNewVehicleId]  = useState('');
  const [newIsPrimary,  setNewIsPrimary]  = useState(false);
  const [newNotes,      setNewNotes]      = useState('');
  const [conflictError, setConflictError] = useState('');

  const { data: assignments = [], isLoading } = useInstructorVehicleAssignments(instructorId);
  const { data: vehicles = [] }               = useVehicles();
  const assignMutation   = useAssignVehicle();
  const unassignMutation = useUnassignVehicle();

  const active  = assignments.filter((a: InstructorVehicleAssignment) => a.unassigned_at === null);
  const history = assignments.filter((a: InstructorVehicleAssignment) => a.unassigned_at !== null);

  const vehicleMap = Object.fromEntries(vehicles.map((v: Vehicle) => [v.id, v]));

  const availableVehicles = vehicles.filter((v: Vehicle) => v.operational_status !== 'decommissioned');

  function handleAssign() {
    if (!newVehicleId) return;
    const alreadyActive = active.some((a: InstructorVehicleAssignment) => a.vehicle_id === newVehicleId);
    if (alreadyActive) {
      setConflictError('Detta fordon är redan aktivt tilldelat till denna instruktör.');
      return;
    }
    setConflictError('');
    assignMutation.mutate(
      {
        instructorId,
        organizationId,
        input: { vehicle_id: newVehicleId, is_primary: newIsPrimary, notes: newNotes || null },
      },
      {
        onSuccess: () => {
          setShowAdd(false);
          setNewVehicleId('');
          setNewIsPrimary(false);
          setNewNotes('');
          setConflictError('');
        },
      },
    );
  }

  function handleUnassign(assignment: InstructorVehicleAssignment) {
    const v = vehicleMap[assignment.vehicle_id];
    const label = v ? `${v.registration_number} – ${v.make} ${v.model}` : 'fordonet';
    if (!confirm(`Avsluta tilldelning av ${label}?`)) return;
    unassignMutation.mutate({ assignmentId: assignment.id, instructorId });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <SectionCard title="Fordonstilldelningar">
      {isLoading ? (
        <p className="text-sm text-gray-400">Laddar...</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">Inga aktiva tilldelningar.</p>
      ) : (
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="pb-2 pr-4 font-medium">Reg.nr</th>
                <th className="pb-2 pr-4 font-medium">Märke / Modell</th>
                <th className="pb-2 pr-4 font-medium">Kategori</th>
                <th className="pb-2 pr-4 font-medium">Primär</th>
                <th className="pb-2 pr-4 font-medium">Tilldelad</th>
                <th className="pb-2 pr-4 font-medium">Anteckning</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {active.map((a: InstructorVehicleAssignment) => {
                const v = vehicleMap[a.vehicle_id];
                return (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4 font-mono font-semibold text-gray-800 text-xs">
                      {v?.registration_number ?? '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {v ? `${v.make} ${v.model}` : a.vehicle_id.slice(0, 8)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-500">
                      {v?.teaching_categories?.join(', ') ?? '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {a.is_primary ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Primär
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{formatDate(a.assigned_at)}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500 max-w-[120px] truncate">
                      {a.notes ?? '—'}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => handleUnassign(a)}
                        disabled={unassignMutation.isPending}
                        className="text-xs text-red-400 hover:text-red-600 hover:underline disabled:opacity-50"
                        title="Avsluta tilldelning"
                      >
                        Avsluta
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {history.length > 0 && (
        <button
          onClick={() => setShowHistory((h) => !h)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-3"
        >
          <Car size={12} />
          {showHistory ? 'Dölj historik' : `Visa historik (${history.length})`}
        </button>
      )}

      {showHistory && history.length > 0 && (
        <div className="overflow-x-auto mb-3 opacity-60">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="pb-2 pr-4 font-medium">Reg.nr</th>
                <th className="pb-2 pr-4 font-medium">Märke / Modell</th>
                <th className="pb-2 pr-4 font-medium">Tilldelad</th>
                <th className="pb-2 font-medium">Avslutad</th>
              </tr>
            </thead>
            <tbody>
              {history.map((a: InstructorVehicleAssignment) => {
                const v = vehicleMap[a.vehicle_id];
                return (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-gray-600">
                      {v?.registration_number ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">
                      {v ? `${v.make} ${v.model}` : a.vehicle_id.slice(0, 8)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-400">{formatDate(a.assigned_at)}</td>
                    <td className="py-2 text-xs text-gray-400">
                      {a.unassigned_at ? formatDate(a.unassigned_at) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {conflictError && (
        <p className="text-xs text-red-500 mb-2">{conflictError}</p>
      )}

      {!showAdd ? (
        <button
          onClick={() => { setShowAdd(true); setConflictError(''); }}
          className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700"
        >
          <Plus size={14} />
          Tilldela fordon
        </button>
      ) : (
        <div className="border border-gray-200 rounded-md p-4 bg-gray-50 mt-2">
          <p className="text-sm font-medium text-gray-700 mb-3">Tilldela fordon</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div className="sm:col-span-2">
              <FieldLabel>Fordon</FieldLabel>
              <select
                value={newVehicleId}
                onChange={(e) => { setNewVehicleId(e.target.value); setConflictError(''); }}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">Välj fordon…</option>
                {availableVehicles.map((v: Vehicle) => (
                  <option key={v.id} value={v.id}>
                    {v.registration_number} – {v.make} {v.model} ({v.teaching_categories.join(', ')})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <FieldLabel>Anteckning (valfritt)</FieldLabel>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Frivillig anteckning..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newIsPrimary}
                onChange={(e) => setNewIsPrimary(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-gray-700">Markera som primärt fordon</span>
            </label>
          </div>
          {conflictError && (
            <p className="text-xs text-red-500 mb-2">{conflictError}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAssign}
              disabled={assignMutation.isPending || !newVehicleId}
              className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded px-4 py-2 text-sm font-medium"
            >
              {assignMutation.isPending ? 'Sparar...' : 'Tilldela'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setConflictError(''); }}
              className="border border-gray-300 rounded px-4 py-2 text-sm hover:bg-gray-100"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Utbildningsbehörigheter tab ──────────────────────────────────────────────

function CertStatusBadge({ expiresAt }: { expiresAt: string | null }) {
  const status = computeCertStatus(expiresAt);
  const MAP: Record<string, { label: string; cls: string }> = {
    active:        { label: 'Aktiv',         cls: 'bg-green-100 text-green-700' },
    expiring_soon: { label: 'Upphör snart',  cls: 'bg-amber-100 text-amber-700' },
    expired:       { label: 'Utgången',      cls: 'bg-red-100 text-red-700' },
    suspended:     { label: 'Suspenderad',   cls: 'bg-gray-100 text-gray-500' },
    revoked:       { label: 'Återkallad',    cls: 'bg-red-200 text-red-800' },
  };
  const { label, cls } = MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', cls)}>
      {label}
    </span>
  );
}

function CertificationsSection({
  instructorId,
  organizationId,
}: {
  instructorId: string;
  organizationId: string;
}) {
  const { data: certs = [], isLoading: certLoading } = useInstructorCertifications(instructorId);
  const createMutation = useCreateInstructorCertification();
  const deleteMutation = useDeleteInstructorCertification();

  const [showForm,     setShowForm]     = useState(false);
  const [certType,     setCertType]     = useState('ADI');
  const [certAuth,     setCertAuth]     = useState('');
  const [certNumber,   setCertNumber]   = useState('');
  const [certIssuedAt, setCertIssuedAt] = useState('');
  const [certExpires,  setCertExpires]  = useState('');
  const [certNotes,    setCertNotes]    = useState('');

  function resetForm() {
    setCertType('ADI');
    setCertAuth('');
    setCertNumber('');
    setCertIssuedAt('');
    setCertExpires('');
    setCertNotes('');
  }

  function handleSaveCert() {
    if (!certIssuedAt) return;
    createMutation.mutate(
      {
        instructorId,
        organizationId,
        input: {
          certification_type:  certType,
          issuing_authority:   certAuth   || null,
          certificate_number:  certNumber || null,
          issued_at:           certIssuedAt,
          expires_at:          certExpires || null,
          notes:               certNotes   || null,
        },
      },
      {
        onSuccess: () => {
          setShowForm(false);
          resetForm();
        },
      }
    );
  }

  function handleDelete(cert: InstructorCertification) {
    deleteMutation.mutate({ certificationId: cert.id, instructorId });
  }

  return (
    <SectionCard title="Behörighetsintyg">
      {certLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      ) : certs.length === 0 && !showForm ? (
        <p className="text-sm text-gray-400 mb-3">Inga intyg registrerade.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {certs.map((cert) => (
            <div key={cert.id} className="border border-gray-200 rounded-md p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">
                    {CERT_TYPE_OPTIONS.find((o) => o.key === cert.certification_type)?.label ?? cert.certification_type}
                  </span>
                  <CertStatusBadge expiresAt={cert.expires_at} />
                </div>
                {cert.certificate_number && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Nr: {cert.certificate_number}
                    {cert.issuing_authority ? ` · ${cert.issuing_authority}` : ''}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  Utfärdad: {cert.issued_at}
                  {cert.expires_at ? ` · Upphör: ${cert.expires_at}` : ' · Ej tidsbegränsat'}
                </p>
                {cert.notes && (
                  <p className="text-xs text-gray-500 mt-0.5 italic">{cert.notes}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(cert)}
                disabled={deleteMutation.isPending}
                className="text-red-400 hover:text-red-600 shrink-0 p-1 disabled:opacity-50"
                title="Ta bort intyg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="border border-blue-200 rounded-md p-4 bg-blue-50/60 space-y-3">
          <p className="text-sm font-semibold text-blue-800 mb-1">Lägg till intyg</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Typ</FieldLabel>
              <select
                value={certType}
                onChange={(e) => setCertType(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              >
                {CERT_TYPE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Utfärdande myndighet</FieldLabel>
              <input
                type="text"
                value={certAuth}
                onChange={(e) => setCertAuth(e.target.value)}
                placeholder="T.ex. Transportstyrelsen"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Intygnummer</FieldLabel>
            <input
              type="text"
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              placeholder="Valfritt referensnummer"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Utfärdat *</FieldLabel>
              <input
                type="date"
                value={certIssuedAt}
                onChange={(e) => setCertIssuedAt(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
            </div>
            <div>
              <FieldLabel>Upphör (lämna tomt om ej tidsbegränsat)</FieldLabel>
              <input
                type="date"
                value={certExpires}
                onChange={(e) => setCertExpires(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Anteckningar</FieldLabel>
            <textarea
              value={certNotes}
              onChange={(e) => setCertNotes(e.target.value)}
              rows={2}
              placeholder="Valfria anteckningar..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="border border-gray-300 text-gray-600 rounded-full px-4 py-2 text-sm hover:bg-gray-50"
            >
              Avbryt
            </button>
            <button
              onClick={handleSaveCert}
              disabled={!certIssuedAt || createMutation.isPending}
              className="bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white rounded-full px-5 py-2 text-sm font-semibold flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Spara intyg
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-700 font-medium"
        >
          <Plus className="w-4 h-4" />
          Lägg till intyg
        </button>
      )}
    </SectionCard>
  );
}

function UtbildningTab({
  instructor,
  onSave,
  saving,
}: {
  instructor: NonNullable<ReturnType<typeof useInstructor>['data']>;
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [selected,     setSelected]     = useState<string[]>(instructor.teaching_categories ?? []);
  const [adiNumber,    setAdiNumber]    = useState(instructor.adi_number ?? '');
  const [adiValidUntil, setAdiValidUntil] = useState(instructor.adi_valid_until ?? '');

  useEffect(() => {
    setSelected(instructor.teaching_categories ?? []);
    setAdiNumber(instructor.adi_number ?? '');
    setAdiValidUntil(instructor.adi_valid_until ?? '');
  }, [instructor]);

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const adiStatus = adiValidUntil ? computeCertStatus(adiValidUntil) : null;

  return (
    <>
      {/* Teaching categories */}
      <SectionCard title="">
        <h2 className="text-[#1a7dc4] font-semibold text-base mb-1">
          Utbildningsbehörigheter för {instructor.first_name} {instructor.last_name}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Välj vilka utbildningsbehörigheter som {instructor.first_name} {instructor.last_name} kan utbilda på.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 mb-4">
          {TEACHING_CATEGORIES.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={() => toggle(key)}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>

        <SaveButton
          loading={saving}
          onClick={() => onSave({ teaching_categories: selected })}
        />
      </SectionCard>

      {/* Godkännande/certifiering — internt referens-/certifikatnummer, inte
          ett officiellt Transportstyrelsen-nummer (se InstructorForm.tsx för
          bakgrund; DB-kolumnerna adi_number/adi_valid_until är oförändrade). */}
      <SectionCard title="Godkännande / certifiering">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <FieldLabel>Godkännande-/certifikatnummer</FieldLabel>
            <input
              type="text"
              value={adiNumber}
              onChange={(e) => setAdiNumber(e.target.value)}
              placeholder="Valfritt internt referensnummer"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <FieldLabel>Giltigt till</FieldLabel>
            <input
              type="date"
              value={adiValidUntil}
              onChange={(e) => setAdiValidUntil(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {adiStatus !== null && (
          <div className="flex items-center gap-2 mb-3">
            <CertStatusBadge expiresAt={adiValidUntil} />
            {adiStatus === 'expired' && (
              <p className="text-xs text-red-600">Godkännandet/certifieringen har löpt ut. Förnya omedelbart.</p>
            )}
            {adiStatus === 'expiring_soon' && (
              <p className="text-xs text-amber-600">Godkännandet/certifieringen upphör inom 60 dagar.</p>
            )}
          </div>
        )}

        <SaveButton
          loading={saving}
          onClick={() =>
            onSave({
              adi_number:    adiNumber    || null,
              adi_valid_until: adiValidUntil || null,
            })
          }
        />
      </SectionCard>

      {/* Certifications */}
      <CertificationsSection
        instructorId={instructor.id}
        organizationId={instructor.organization_id}
      />
    </>
  );
}

// ─── Loggar tab ───────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const MAP: Record<string, string> = {
    confirmed:   'bg-blue-100 text-blue-700',
    reserved:    'bg-blue-100 text-blue-700',
    completed:   'bg-green-100 text-green-700',
    cancelled:   'bg-red-100 text-red-700',
    no_show:     'bg-orange-100 text-orange-700',
    rescheduled: 'bg-purple-100 text-purple-700',
  };
  const LABELS: Record<string, string> = {
    confirmed: 'Bekräftad', reserved: 'Reserverad', completed: 'Genomförd',
    cancelled: 'Avbokad',  no_show: 'Uteblev',     rescheduled: 'Ombokas',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', MAP[status] ?? 'bg-gray-100 text-gray-600')}>
      {LABELS[status] ?? status}
    </span>
  );
}

function formatLogDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function LoggarTab({ instructorId }: { instructorId: string }) {
  const [filter, setFilter] = useState<InstructorLogFilter>('all');
  const [page,   setPage]   = useState(1);
  const perPage = 50;

  const { data, isLoading, isError } = useInstructorBookingLogs(instructorId, { filter, page, per_page: perPage });

  const entries = data?.data ?? [];
  const total   = data?.meta.total ?? 0;
  const pages   = Math.max(1, Math.ceil(total / perPage));

  function handleFilterChange(v: InstructorLogFilter) {
    setFilter(v);
    setPage(1);
  }

  return (
    <>
      <SectionCard title="">
        <h2 className="text-[#1a7dc4] font-semibold text-sm mb-3">Filtrera bokningsloggar</h2>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value as InstructorLogFilter)}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
          >
            {LOG_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </SectionCard>

      <SectionCard title="Bokningsloggar">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : isError ? (
          <p className="text-sm text-red-500 py-2">Kunde inte hämta loggar.</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Inga loggar hittades.</p>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {entries.map((log) => (
                <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{log.handelse}</span>
                      {statusBadge(log.status)}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{log.tillfalle}</p>
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap shrink-0 sm:ml-4 sm:mt-0.5">
                    {formatLogDate(log.datum)}
                  </span>
                </div>
              ))}
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Visar {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} av {total} loggar
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-7 h-7 rounded border border-gray-300 text-sm flex items-center justify-center disabled:opacity-40 hover:bg-gray-50"
                  >
                    ‹
                  </button>
                  {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'w-7 h-7 rounded border text-sm flex items-center justify-center',
                        p === page
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : 'border-gray-300 hover:bg-gray-50',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="w-7 h-7 rounded border border-gray-300 text-sm flex items-center justify-center disabled:opacity-40 hover:bg-gray-50"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </>
  );
}

// ─── Prestanda tab ────────────────────────────────────────────────────────────

interface InstructorPerfStats {
  total:          number;
  completed:      number;
  noShow:         number;
  cancelled:      number;
  utilization:    number;
  uniqueStudents: number;
  avgRating:      number | null;
}

function useInstructorPerformance(instructorId: string, days = 90) {
  return useQuery<InstructorPerfStats>({
    queryKey: ['instructor-perf', instructorId, days],
    queryFn: async () => {
      const from = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data: slotsRaw, error } = await supabase
        .from('lesson_slots')
        .select('id, max_bookings, current_bookings, status')
        .eq('instructor_id', instructorId)
        .gte('starts_at', from);
      const slots = slotsRaw as Array<{ id: string; max_bookings: number; current_bookings: number; status: string }> | null;
      if (error) throw new Error(error.message);

      const { data: bookings, error: bErr } = await supabase
        .from('lesson_bookings')
        .select('id, student_id, status, attendance_status, performance_rating')
        .in('slot_id', (slots ?? []).map(s => s.id));
      if (bErr) throw new Error(bErr.message);

      const rows = (bookings ?? []) as Array<{
        id: string; student_id: string; status: string;
        attendance_status: string | null; performance_rating: number | null;
      }>;

      const total      = rows.length;
      const completed  = rows.filter(b => b.attendance_status === 'attended' || b.status === 'completed').length;
      const noShow     = rows.filter(b => b.attendance_status === 'no_show').length;
      const cancelled  = rows.filter(b => b.status === 'cancelled').length;
      const utilization = slots && slots.length > 0
        ? Math.round(slots.reduce((s, sl) => s + (sl.current_bookings / Math.max(sl.max_bookings, 1)), 0) / slots.length * 100)
        : 0;
      const uniqueStudents = new Set(rows.map(b => b.student_id).filter(Boolean)).size;

      const ratings = rows
        .filter(b => b.performance_rating !== null && b.performance_rating > 0)
        .map(b => b.performance_rating as number);
      const avgRating = ratings.length > 0
        ? Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length * 10) / 10
        : null;

      return { total, completed, noShow, cancelled, utilization, uniqueStudents, avgRating };
    },
    enabled: !!instructorId,
    staleTime: 60_000,
  });
}

function PreststandaKpi({ label, value, icon: Icon, cls }: { label: string; value: string | number; icon: React.ElementType; cls: string }) {
  return (
    <div className="border border-gray-200 rounded-md bg-white p-4">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', cls)}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function PrestandardTab({ instructorId }: { instructorId: string }) {
  const { data: stats, isLoading } = useInstructorPerformance(instructorId);

  const completionRate = stats && stats.total > 0
    ? Math.round(stats.completed / stats.total * 100)
    : null;
  const noShowRate = stats && stats.total > 0
    ? Math.round(stats.noShow / stats.total * 100)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">Prestandaöversikt</h2>
        <p className="text-sm text-gray-500">Senaste 90 dagarna</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1,2,3,4,5,6,7].map(n => <div key={n} className="h-24 bg-gray-100 rounded-md animate-pulse" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <PreststandaKpi label="Bokningar totalt"   value={stats.total}                          icon={ChartBar}    cls="bg-blue-50 text-blue-600" />
          <PreststandaKpi label="Genomförda"         value={stats.completed}                       icon={CheckCircle}  cls="bg-green-50 text-green-600" />
          <PreststandaKpi label="Genomförandegrad"   value={completionRate !== null ? `${completionRate}%` : '–'} icon={TrendingUp} cls="bg-primary/10 text-primary" />
          <PreststandaKpi label="Uteblivna elever"   value={stats.noShow}                          icon={XCircle}      cls="bg-red-50 text-red-600" />
          <PreststandaKpi label="Uteblivandeprocent" value={noShowRate !== null ? `${noShowRate}%` : '–'} icon={AlertCircle} cls="bg-amber-50 text-amber-600" />
          <PreststandaKpi label="Unika elever"       value={stats.uniqueStudents}                  icon={Users}        cls="bg-purple-50 text-purple-600" />
          <PreststandaKpi
            label="Snittbetyg (elever)"
            value={stats.avgRating !== null ? `${stats.avgRating}/5` : 'Ej betygsatt'}
            icon={TrendingUp}
            cls="bg-amber-50 text-amber-600"
          />
        </div>
      ) : null}

      {stats && (
        <div className="border border-gray-200 rounded-md bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Platsutnyttjande</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${stats.utilization}%` }}
              />
            </div>
            <span className="text-sm font-bold text-gray-900 tabular-nums">{stats.utilization}%</span>
          </div>
          <p className="text-xs text-gray-500">
            Genomsnittligt antal bokade platser av tillgängliga platser per pass.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Inställningar tab ────────────────────────────────────────────────────────

function InstallningarTab({
  instructorId,
  instructorName,
  onBlock,
  onDelete,
  blocking,
  deleting,
}: {
  instructorId:   string;
  instructorName: string;
  onBlock: () => void;
  onDelete: () => void;
  blocking: boolean;
  deleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [portalUrl,     setPortalUrl]     = useState<string | null>(null);
  const [copied,        setCopied]        = useState(false);
  const generateToken = useGenerateInstructorPortalToken();

  function handleGenerateLink() {
    generateToken.mutate(instructorId, {
      onSuccess: (result) => setPortalUrl(result.url),
    });
  }

  function handleCopy() {
    if (!portalUrl) return;
    void navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {/* Instructor portal link */}
      <SectionCard title="Lärarportal — Inloggningslänk">
        <p className="text-sm text-gray-600 mb-4">
          Generera en personlig inloggningslänk för lärarportalen. Länken är giltig i 30 dagar.
          Skicka den till läraren via SMS eller e-post.
        </p>

        {portalUrl ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Portallänk genererad</p>
            <p className="text-sm text-blue-900 font-mono break-all mb-3">{portalUrl}</p>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-full px-4 py-2 text-sm font-semibold transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Kopierad!' : 'Kopiera'}
              </button>
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-full px-4 py-2 text-sm font-semibold transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Öppna
              </a>
              <button
                onClick={() => setPortalUrl(null)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
              >
                Stäng
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            onClick={handleGenerateLink}
            disabled={generateToken.isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-full px-5 py-2 text-sm font-semibold flex items-center gap-2"
          >
            {generateToken.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {portalUrl ? 'Generera ny länk' : 'Generera portallänk'}
          </button>
        </div>
        {generateToken.isError && (
          <p className="text-xs text-red-600 mt-2 text-right">
            {generateToken.error instanceof Error ? generateToken.error.message : 'Kunde inte generera länk'}
          </p>
        )}
      </SectionCard>

      {/* Password reset — only relevant if this instructor also has a staff
          login account. That account is managed separately under Inställningar
          → Användare, which already has a real, working password-reset flow
          (invite/resend, forced reset) — this page has no reliable way to
          look up which auth account, if any, belongs to this instructor, so
          it points there rather than duplicating a control it can't back. */}
      <SectionCard title="Lösenord">
        <p className="text-sm text-gray-600">
          Om den här läraren även har ett personalkonto för inloggning i Trafikcloud hanteras
          lösenord under{' '}
          <Link to="/settings/users" className="text-blue-600 hover:underline font-medium">
            Inställningar → Användare
          </Link>
          .
        </p>
      </SectionCard>

      {/* Block */}
      <SectionCard title="Blockera personal">
        <p className="text-sm text-gray-600 mb-4">
          Här har du möjlighet att blockera och avblockera medarbetaren så att den inte längre kan logga in.
        </p>
        <div className="flex justify-end">
          <button
            onClick={onBlock}
            disabled={blocking}
            className="bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-full px-5 py-2 text-sm font-semibold flex items-center gap-2"
          >
            {blocking && <Loader2 className="w-4 h-4 animate-spin" />}
            Blockera personal
          </button>
        </div>
      </SectionCard>

      {/* Delete */}
      <SectionCard title="Ta bort personal">
        <p className="text-sm text-gray-600 mb-4">
          Här har du möjlighet att ta bort medarbetaren så att den inte längre syns bland dina aktiva medarbetare.
        </p>
        {confirmDelete ? (
          <div className="border border-red-200 bg-red-50 rounded p-4 mb-4">
            <p className="text-sm text-red-700 font-medium mb-3">
              Är du säker på att du vill ta bort {instructorName}? Detta kan inte ångras.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="border border-gray-300 text-gray-700 rounded-full px-4 py-2 text-sm hover:bg-gray-50"
              >
                Avbryt
              </button>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-full px-5 py-2 text-sm font-semibold flex items-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Bekräfta borttagning
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              onClick={() => setConfirmDelete(true)}
              className="bg-red-500 hover:bg-red-600 text-white rounded-full px-5 py-2 text-sm font-semibold"
            >
              Ta bort personal
            </button>
          </div>
        )}
      </SectionCard>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── InstructorDetailContent ───────────────────────────────────────────────────
//
// Route-agnostic instructor detail: all tabs, fields, mutations, and business
// logic from the original InstructorDetailPage, with the id and "leave this
// view" behavior lifted to props instead of useParams()/hardcoded navigate().
//
// Two consumers:
//   - InstructorDetailPage (standalone /instructors/:id route) wraps this in
//     PageLayout/PageHeader with breadcrumbs and passes onBack = navigate('/instructors').
//   - The Personal workspace renders this directly in its content area and
//     passes onBack = close the in-workspace detail state (no navigation).
//
// Do not add routing concerns (useParams, useNavigate, hardcoded paths) back
// into this component — that defeats the point of the split.

export interface InstructorDetailContentProps {
  instructorId: string;
  /** Called after "back", after a delete completes, or when the instructor can't be found. */
  onBack: () => void;
}

export function InstructorDetailContent({ instructorId, onBack }: InstructorDetailContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('oversikt');

  const { data: instructor, isLoading, error } = useInstructor(instructorId || null);

  const updateMutation  = useUpdateInstructor();
  const archiveMutation = useArchiveInstructor();

  const saving   = updateMutation.isPending;
  const blocking = updateMutation.isPending;
  const deleting = archiveMutation.isPending;

  function handleSave(patch: Record<string, unknown>) {
    if (!instructor) return;
    updateMutation.mutate(
      { id: instructor.id, input: patch as Parameters<typeof updateMutation.mutate>[0]['input'] },
      {
        onSuccess: () => toast({ title: 'Ändringarna sparade' }),
        onError: (e) => toast({
          title: 'Kunde inte spara ändringarna',
          description: e instanceof Error ? e.message : undefined,
          variant: 'destructive',
        }),
      },
    );
  }

  function handleBlock() {
    if (!instructor) return;
    updateMutation.mutate({ id: instructor.id, input: { employment_type: 'inactive' } });
  }

  function handleDelete() {
    if (!instructor) return;
    archiveMutation.mutate(instructor.id, {
      onSuccess: () => onBack(),
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !instructor) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-sm text-muted-foreground">
          {error ? 'Det gick inte att hämta läraruppgifterna.' : 'Läraren hittades inte.'}
        </p>
        <Button variant="outline" onClick={onBack}>
          Tillbaka till personallistan
        </Button>
      </div>
    );
  }

  const fullName = `${instructor.first_name} ${instructor.last_name}`;

  return (
    <div>
      {/* Detail header — replaces the standalone route's breadcrumb trail with
          an in-place "back" affordance so the caller's own shell stays visible. */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Tillbaka
        </button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-lg font-semibold text-foreground truncate">{fullName}</h2>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-5 -mx-0">
        <div className="flex overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'oversikt' && (
        <OversiktTab instructor={instructor} onSave={handleSave} saving={saving} />
      )}
      {activeTab === 'schema' && (
        <SchemaTab instructor={instructor} />
      )}
      {activeTab === 'utbildning' && (
        <UtbildningTab instructor={instructor} onSave={handleSave} saving={saving} />
      )}
      {activeTab === 'prestanda' && (
        <PrestandardTab instructorId={instructor.id} />
      )}
      {activeTab === 'loggar' && (
        <LoggarTab instructorId={instructor.id} />
      )}
      {activeTab === 'installningar' && (
        <InstallningarTab
          instructorId={instructor.id}
          instructorName={fullName}
          onBlock={handleBlock}
          onDelete={handleDelete}
          blocking={blocking}
          deleting={deleting}
        />
      )}
    </div>
  );
}
