import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, X, Plus, User, Copy, Check, ExternalLink, TrendingUp, Users, ChartBar, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { useInstructor, useUpdateInstructor, useArchiveInstructor, useInstructorBookingLogs } from '../hooks/useInstructors.js';
import type { InstructorLogFilter } from '../hooks/useInstructors.js';
import { useGenerateInstructorPortalToken } from '@modules/instructor-portal/hooks/useInstructorPortal.js';
import { formatDateTime } from '../lib/instructorUtils.js';
import { supabase } from '@core/api/supabase.js';

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
  { key: 'B',     label: 'B - Personbil' },
  { key: 'C',     label: 'C - Tung lastbil' },
  { key: 'CE',    label: 'CE - Tung lastbil med tungt släp' },
  { key: 'D',     label: 'D - Buss' },
  { key: 'YKB-C', label: 'YKB-C - Yrkeskompetensbevis för godstransport' },
  { key: 'YKB-D', label: 'YKB-D - Yrkeskompetensbevis för persontransport' },
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
  const [presentation, setPresentation] = useState('');
  const [sortOrder,    setSortOrder]    = useState('0');
  const [inBooking,    setInBooking]    = useState(true);
  const [inEcommerce,  setInEcommerce]  = useState(false);
  const [onWebsite,    setOnWebsite]    = useState(true);

  // Emergency contact (local state only)
  const [nextFirstName, setNextFirstName] = useState('');
  const [nextLastName,  setNextLastName]  = useState('');
  const [nextEmail,     setNextEmail]     = useState('');
  const [nextPhone,     setNextPhone]     = useState('');

  // Sync if instructor prop changes
  useEffect(() => {
    setFirstName(instructor.first_name);
    setLastName(instructor.last_name);
    setEmail(instructor.email);
    setPhone(instructor.phone ?? '');
    setLanguages(instructor.languages_spoken ?? []);
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
          <TextField label="Adress" value="" onChange={() => {}} placeholder="Ej registrerat" />
          <TextField label="Postnummer" value="" onChange={() => {}} placeholder="Ej registrerat" />
          <TextField label="Stad" value="" onChange={() => {}} placeholder="Ej registrerat" />
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
      <SectionCard title="Presentation till Teoricentralen">
        <textarea
          value={presentation}
          onChange={(e) => setPresentation(e.target.value)}
          rows={4}
          placeholder="Skriv en kort presentation..."
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <SaveButton loading={false} onClick={() => {}} />
      </SectionCard>

      {/* Anhöriga personer */}
      <SectionCard title="Anhöriga personer">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TextField label="Förnamn"       value={nextFirstName} onChange={setNextFirstName} placeholder="" />
          <TextField label="Efternamn"     value={nextLastName}  onChange={setNextLastName}  placeholder="" />
          <TextField label="E-postadress"  value={nextEmail}     onChange={setNextEmail}     placeholder="" />
          <TextField label="Telefonnummer" value={nextPhone}     onChange={setNextPhone}     placeholder="" />
        </div>
        <SaveButton loading={false} onClick={() => {}} />
      </SectionCard>

      {/* Favoritfordon */}
      <FavoritfordonSection />
    </>
  );
}

function FavoritfordonSection() {
  const [selected, setSelected] = useState('');
  const [vehicles, setVehicles] = useState<{ id: string; type: string; name: string; desc: string; order: number }[]>([]);

  return (
    <SectionCard title="Favoritfordon">
      <p className="text-sm text-gray-600 mb-3">
        Favoritfordon är de fordon som kommer att prioriteras att bokas när ett fordon allokeras till denna läraren.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm flex-1 max-w-xs focus:outline-none"
        >
          <option value="">Välj fordon</option>
        </select>
        <button className="bg-blue-500 hover:bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium flex items-center gap-1">
          <Plus className="w-4 h-4" />
          Lägg till
        </button>
      </div>

      {vehicles.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Inga favoritfordon tillagda.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="pb-2 pr-4">Typ</th>
              <th className="pb-2 pr-4">Namn</th>
              <th className="pb-2 pr-4">Beskrivning</th>
              <th className="pb-2 pr-4">Sorteringsordning</th>
              <th className="pb-2">Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{v.type}</td>
                <td className="py-2 pr-4 text-blue-500">{v.name}</td>
                <td className="py-2 pr-4">{v.desc}</td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    defaultValue={v.order}
                    className="w-16 border border-gray-300 rounded px-2 py-1"
                  />
                </td>
                <td className="py-2">
                  <button
                    onClick={() => setVehicles((prev) => prev.filter((x) => x.id !== v.id))}
                    className="bg-red-500 hover:bg-red-600 text-white rounded-full px-3 py-1 text-xs font-medium"
                  >
                    Radera
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {vehicles.length > 0 && (
        <div className="flex justify-end mt-3">
          <button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-5 py-2 text-sm font-semibold">
            Spara ordning
          </button>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Schema tab ───────────────────────────────────────────────────────────────

function SchemaTab() {
  const [template,      setTemplate]     = useState('');
  const [startDate,     setStartDate]    = useState('');
  const [endDate,       setEndDate]      = useState('');
  const [noOverwrite,   setNoOverwrite]  = useState(false);
  const [allowOverlap,  setAllowOverlap] = useState(false);

  return (
    <>
      <SectionCard title="Generera schema">
        <p className="text-sm text-gray-600 mb-4">
          Välj en schemamall som du vill använda när du lägger ett schema till denna lärare.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <FieldLabel>Välj schemamall</FieldLabel>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">Välj en schemamall</option>
            </select>
          </div>
          <div>
            <FieldLabel>Välj startdatum</FieldLabel>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div>
            <FieldLabel>Välj slutdatum</FieldLabel>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={noOverwrite}
              onChange={(e) => setNoOverwrite(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Skriv inte över schemalagda tidsluckor</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Markera denna om du vill att befintliga obokade tider INTE ska skrivas över när du genererar ett nytt schema.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowOverlap}
              onChange={(e) => setAllowOverlap(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Tillåt överlappande tidsluckor</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Markera denna om du vill att befintliga tidsluckor ska överlappa med nya tidsluckor när du genererar ett nytt schema.
              </p>
            </div>
          </label>
        </div>

        <div className="flex justify-end">
          <button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-6 py-2 text-sm font-semibold">
            Generera
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Loggar">
        <p className="text-sm text-gray-400">Denna personal har inga loggar.</p>
      </SectionCard>
    </>
  );
}

// ─── Utbildningsbehörigheter tab ──────────────────────────────────────────────

function UtbildningTab({
  instructor,
  onSave,
  saving,
}: {
  instructor: NonNullable<ReturnType<typeof useInstructor>['data']>;
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(instructor.teaching_categories ?? []);

  useEffect(() => {
    setSelected(instructor.teaching_categories ?? []);
  }, [instructor]);

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <SectionCard title="">
      <h2 className="text-[#1a7dc4] font-semibold text-base mb-1">
        Utbildningsbehörigheter för {instructor.first_name} {instructor.last_name}
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Välj vilka utbildningsbehörigheter som {instructor.first_name} {instructor.last_name} kan utbilda på.
      </p>

      <div className="space-y-3 mb-4">
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

      {/* Generate new password */}
      <SectionCard title="Generera nytt lösenord">
        <p className="text-sm text-gray-600 mb-4">
          Generera ett nytt lösenord och skicka ut det via e-post.
        </p>
        <div className="flex justify-end gap-2">
          <button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-5 py-2 text-sm font-semibold">
            Skicka e-post
          </button>
          <button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-5 py-2 text-sm font-semibold">
            Skicka SMS
          </button>
        </div>
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

export function InstructorDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('oversikt');

  const { data: instructor, isLoading, error } = useInstructor(id ?? null);

  const updateMutation  = useUpdateInstructor();
  const archiveMutation = useArchiveInstructor();

  const saving   = updateMutation.isPending;
  const blocking = updateMutation.isPending;
  const deleting = archiveMutation.isPending;

  function handleSave(patch: Record<string, unknown>) {
    if (!instructor) return;
    updateMutation.mutate({ id: instructor.id, input: patch as Parameters<typeof updateMutation.mutate>[0]['input'] });
  }

  function handleBlock() {
    if (!instructor) return;
    updateMutation.mutate({ id: instructor.id, input: { employment_type: 'inactive' } });
  }

  function handleDelete() {
    if (!instructor) return;
    archiveMutation.mutate(instructor.id, {
      onSuccess: () => navigate('/instructors'),
    });
  }

  if (isLoading) {
    return (
      <PageLayout>
        <PageHeader
          title="Laddar lärare..."
          breadcrumbs={[
            { label: 'Hem' },
            { label: 'Personal', href: '/instructors' },
          ]}
        />
        <PageContent>
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </PageContent>
      </PageLayout>
    );
  }

  if (error || !instructor) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <p className="text-sm text-muted-foreground">
            {error ? 'Det gick inte att hämta läraruppgifterna.' : 'Läraren hittades inte.'}
          </p>
          <button
            onClick={() => navigate('/instructors')}
            className="border border-gray-300 rounded px-4 py-2 text-sm hover:bg-gray-50"
          >
            Tillbaka till personallistan
          </button>
        </div>
      </PageLayout>
    );
  }

  const fullName = `${instructor.first_name} ${instructor.last_name}`;
  const tabLabel = TABS.find((t) => t.key === activeTab)?.label ?? '';

  return (
    <PageLayout>
      {/* Breadcrumbs */}
      <PageHeader
        title={fullName}
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Personal', href: '/instructors' },
          { label: fullName },
          { label: tabLabel },
        ]}
      />

      <PageContent>
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
          <SchemaTab />
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
      </PageContent>
    </PageLayout>
  );
}
