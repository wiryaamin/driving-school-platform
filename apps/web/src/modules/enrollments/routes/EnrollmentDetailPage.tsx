import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Package, Tag, AlertCircle, CheckCircle2,
  Loader2, X, FileText, Clock, AlertTriangle, BookOpen, ChevronRight,
} from 'lucide-react';
import {
  useEnrollment,
  useApproveEnrollment,
  useRejectEnrollment,
  useConvertEnrollment,
  useUpdateEnrollmentNotes,
  useAssignPackage,
  useUpdateOnboardingStatus,
  useEnrollmentDuplicates,
  enrollmentStatusLabel,
  enrollmentStatusColor,
  onboardingStatusLabel,
  onboardingStatusColor,
  enrollmentEventLabel,
  enrollmentEventColor,
  type EnrollmentStatusType,
  type OnboardingStatusType,
} from '../hooks/useEnrollments.js';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatPrice(amount: number, currency = 'SEK'): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  title, message, onConfirm, onCancel, isPending,
  withReason = false, reasonLabel = 'Anledning',
}: {
  title: string; message: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
  withReason?: boolean;
  reasonLabel?: string;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-4">{message}</p>
        {withReason && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`${reasonLabel} (valfritt)`}
            rows={3}
            className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Bekräfta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
        {icon}{title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs font-medium text-gray-400 sm:w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value ?? '—'}</span>
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function TimelineSection({ events }: { events: Array<{ id: string; event_type: string; actor_email: string | null; metadata: Record<string, unknown>; created_at: string }> }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">Inga händelser registrerade.</p>
    );
  }

  return (
    <div className="relative pl-5">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-100" aria-hidden />
      <div className="space-y-1">
        {events.map((event) => (
          <div key={event.id} className="relative pb-4 last:pb-0">
            <div className={`absolute -left-3 top-1 w-3.5 h-3.5 rounded-full border-2 ${enrollmentEventColor(event.event_type)}`} />
            <div className="ml-1">
              <p className="text-sm font-medium text-gray-800">
                {enrollmentEventLabel(event.event_type)}
              </p>
              {event.actor_email && (
                <p className="text-xs text-gray-400">{event.actor_email}</p>
              )}
              {event.event_type === 'rejected' && typeof event.metadata['reason'] === 'string' && (
                <p className="text-xs text-red-600 mt-0.5">"{event.metadata['reason']}"</p>
              )}
              {event.event_type === 'status_updated' && typeof event.metadata['onboarding_status'] === 'string' && (
                <p className="text-xs text-teal-600 mt-0.5">
                  → {onboardingStatusLabel(event.metadata['onboarding_status'] as OnboardingStatusType)}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(event.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Duplicate warning ────────────────────────────────────────────────────────

function DuplicateWarning({
  duplicates,
}: {
  duplicates: { by_email: Array<{ id: string; first_name: string; last_name: string; status: string }>; by_phone: Array<{ id: string; first_name: string; last_name: string; status: string }>; by_personnummer: Array<{ id: string; first_name: string; last_name: string; status: string }> } | undefined;
}) {
  if (!duplicates) return null;

  const allMatches = [
    ...duplicates.by_email.map((s) => ({ ...s, matchType: 'e-post' })),
    ...duplicates.by_phone.map((s) => ({ ...s, matchType: 'telefon' })),
    ...duplicates.by_personnummer.map((s) => ({ ...s, matchType: 'personnummer' })),
  ].filter(
    (v, i, arr) => arr.findIndex((x) => x.id === v.id) === i,
  );

  if (allMatches.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            {allMatches.length === 1 ? 'Möjlig dubblett hittad' : `${allMatches.length} möjliga dubbletter hittade`}
          </p>
          <div className="space-y-1.5">
            {allMatches.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-amber-800">
                  {s.first_name} {s.last_name}
                  <span className="text-amber-600 font-normal ml-1.5">(match via {s.matchType})</span>
                </span>
                <Link
                  to={`/students/${s.id}`}
                  className="inline-flex items-center gap-0.5 text-xs text-amber-700 hover:text-amber-900 font-medium underline shrink-0"
                >
                  Visa elev <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-600 mt-2">Godkännande är inte blockerat. Kontrollera manuellt vid behov.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Package assignment section ───────────────────────────────────────────────

function PackageAssignmentSection({
  assignment,
  onAssign,
  isPending,
}: {
  assignment: {
    package_name: string;
    package_quantity: number;
    campaign_name: string | null;
    coupon_code: string | null;
    base_price: number;
    vat_rate: number;
    campaign_discount: number;
    coupon_discount: number;
    final_price_incl_vat: number;
    currency: string;
    lessons_used: number;
    assigned_at: string;
  } | null;
  onAssign: () => void;
  isPending: boolean;
}) {
  if (!assignment) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 italic">Inget paket tilldelat ännu.</p>
        <button
          onClick={onAssign}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
          Tilldela paket
        </button>
      </div>
    );
  }

  const inclVat = (exVat: number) => Math.round(exVat * (1 + assignment.vat_rate) * 100) / 100;

  return (
    <>
      <Row label="Paket"         value={assignment.package_name} />
      <Row label="Lektioner"     value={`${assignment.package_quantity} st`} />
      <Row label="Använda"       value={`${assignment.lessons_used} st`} />
      <Row label="Kvar"          value={`${assignment.package_quantity - assignment.lessons_used} st`} />
      <Row label="Tilldelat"     value={formatDate(assignment.assigned_at)} />
      {assignment.campaign_name && (
        <Row label="Kampanj"     value={assignment.campaign_name} />
      )}
      {assignment.coupon_code && (
        <Row label="Kupong"      value={assignment.coupon_code} />
      )}
      <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Grundpris</span>
          <span>{formatPrice(inclVat(assignment.base_price), assignment.currency)}</span>
        </div>
        {assignment.campaign_discount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Kampanjrabatt</span>
            <span>−{formatPrice(inclVat(assignment.campaign_discount), assignment.currency)}</span>
          </div>
        )}
        {assignment.coupon_discount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Kupongrabatt</span>
            <span>−{formatPrice(inclVat(assignment.coupon_discount), assignment.currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100">
          <span>Totalt inkl. moms</span>
          <span>{formatPrice(assignment.final_price_incl_vat, assignment.currency)}</span>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function EnrollmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: resp, isLoading, isError } = useEnrollment(id ?? null);
  const enrollment = resp?.data;
  const status     = enrollment?.status as EnrollmentStatusType | undefined;

  const canCheckDuplicates = Boolean(id) && (status === 'submitted' || status === 'pending_review' || status === 'approved');
  const { data: duplicates } = useEnrollmentDuplicates(id ?? null, canCheckDuplicates);

  const approve        = useApproveEnrollment();
  const reject         = useRejectEnrollment();
  const convert        = useConvertEnrollment();
  const updateNotes    = useUpdateEnrollmentNotes();
  const assignPackage  = useAssignPackage();
  const updateOnboard  = useUpdateOnboardingStatus();

  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog,  setShowRejectDialog]  = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  const [notes,        setNotes]        = useState<string | null>(null);
  const [notesEditing, setNotesEditing] = useState(false);

  const currentNotes = notes ?? (enrollment?.internal_notes ?? '');

  function handleApprove() {
    if (!id) return;
    approve.mutate(id, {
      onSuccess: () => setShowApproveDialog(false),
    });
  }

  function handleReject(reason: string) {
    if (!id) return;
    reject.mutate({ id, reason: reason || 'Inte angett' }, {
      onSuccess: () => setShowRejectDialog(false),
    });
  }

  function handleConvert() {
    if (!id) return;
    convert.mutate(id, {
      onSuccess: (data) => {
        setShowConvertDialog(false);
        const studentId = (data as { data?: { student_id?: string } })?.data?.student_id;
        if (studentId) {
          void navigate(`/students/${studentId}`);
        }
      },
    });
  }

  function handleSaveNotes() {
    if (!id) return;
    updateNotes.mutate({ id, internal_notes: currentNotes }, {
      onSuccess: () => setNotesEditing(false),
    });
  }

  function handleOnboardingChange(value: string) {
    if (!id) return;
    updateOnboard.mutate({ id, onboarding_status: value as OnboardingStatusType });
  }

  if (isError) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-gray-700">Anmälan hittades inte.</p>
        <Link to="/enrollments" className="mt-2 inline-block text-sm text-blue-600 hover:underline">← Tillbaka</Link>
      </div>
    );
  }

  const canApprove = status === 'submitted' || status === 'pending_review';
  const canReject  = status !== 'converted' && status !== 'rejected';
  const canConvert = status === 'approved';

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/enrollments" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">
              {isLoading ? 'Laddar…' : enrollment ? `${enrollment.first_name} ${enrollment.last_name}` : 'Anmälan'}
            </h1>
            {status && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${enrollmentStatusColor(status)}`}>
                {enrollmentStatusLabel(status)}
              </span>
            )}
          </div>
          {enrollment && (
            <p className="text-sm text-gray-500">Inkommen {formatDate(enrollment.submitted_at)}</p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-xl" />)}
        </div>
      ) : enrollment ? (
        <div className="space-y-4">

          {/* Action bar */}
          {(canApprove || canReject || canConvert) && (
            <div className="flex flex-wrap gap-2">
              {canApprove && (
                <button
                  onClick={() => setShowApproveDialog(true)}
                  disabled={approve.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Godkänn
                </button>
              )}
              {canConvert && (
                <button
                  onClick={() => setShowConvertDialog(true)}
                  disabled={convert.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <User className="w-4 h-4" />
                  Omvandla till elev
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => setShowRejectDialog(true)}
                  disabled={reject.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Neka
                </button>
              )}
            </div>
          )}

          {/* Converted: link to student */}
          {status === 'converted' && enrollment.student_id && (
            <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2.5 text-sm">
              <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
              <span className="text-purple-800">
                Omvandlad till elev —{' '}
                <Link to={`/students/${enrollment.student_id}`} className="font-medium underline hover:text-purple-900">
                  Visa elev
                </Link>
              </span>
            </div>
          )}

          {/* Rejected reason */}
          {status === 'rejected' && enrollment.rejected_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <span className="font-medium">Nekad:</span> {enrollment.rejected_reason}
            </div>
          )}

          {/* Duplicate warning (non-blocking) */}
          <DuplicateWarning duplicates={duplicates} />

          {/* Customer info */}
          <Section title="Kunduppgifter" icon={<User className="w-4 h-4 text-gray-400" />}>
            <Row label="Namn"         value={`${enrollment.first_name} ${enrollment.last_name}`} />
            <Row label="E-post"       value={enrollment.email} />
            <Row label="Telefon"      value={enrollment.phone} />
            <Row label="Personnummer" value={enrollment.personnummer ?? null} />
            <Row label="Adress"       value={enrollment.address ?? null} />
            <Row label="Språk"        value={enrollment.preferred_language} />
            <Row label="Kategori"     value={enrollment.license_category} />
            {enrollment.comments && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-line">
                {enrollment.comments}
              </div>
            )}
          </Section>

          {/* Package + pricing */}
          <Section title="Paket & pris" icon={<Package className="w-4 h-4 text-gray-400" />}>
            <Row label="Paket"      value={enrollment.package_name} />
            {enrollment.package_code && (
              <Row label="Paketnr"  value={enrollment.package_code} />
            )}
            <Row label="Lektioner" value={`${enrollment.package_quantity} st`} />
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Grundpris</span>
                <span>{formatPrice(enrollment.base_price_incl_vat, enrollment.currency)}</span>
              </div>
              {enrollment.campaign_discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>{enrollment.campaign_name ?? 'Kampanjrabatt'}</span>
                  <span>−{formatPrice(enrollment.campaign_discount * (1 + enrollment.vat_rate), enrollment.currency)}</span>
                </div>
              )}
              {enrollment.coupon_discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Kupong {enrollment.coupon_code ? `(${enrollment.coupon_code})` : ''}</span>
                  <span>−{formatPrice(enrollment.coupon_discount * (1 + enrollment.vat_rate), enrollment.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100">
                <span>Totalt inkl. moms</span>
                <span>{formatPrice(enrollment.final_price_incl_vat, enrollment.currency)}</span>
              </div>
            </div>
          </Section>

          {/* Campaign / coupon */}
          {(enrollment.campaign_name || enrollment.coupon_code) && (
            <Section title="Kampanj & kupong" icon={<Tag className="w-4 h-4 text-gray-400" />}>
              {enrollment.campaign_name && <Row label="Kampanj" value={enrollment.campaign_name} />}
              {enrollment.coupon_code   && <Row label="Kupong"  value={enrollment.coupon_code} />}
            </Section>
          )}

          {/* Package assignment (visible after conversion) */}
          {status === 'converted' && (
            <Section title="Pakettilldelning" icon={<BookOpen className="w-4 h-4 text-gray-400" />}>
              <PackageAssignmentSection
                assignment={enrollment.package_assignment}
                onAssign={() => id && assignPackage.mutate(id)}
                isPending={assignPackage.isPending}
              />
            </Section>
          )}

          {/* Onboarding status (visible after conversion) */}
          {status === 'converted' && (
            <Section title="Onboarding-status" icon={<User className="w-4 h-4 text-gray-400" />}>
              <div className="flex flex-wrap items-center gap-3">
                {enrollment.student_onboarding_status && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${onboardingStatusColor(enrollment.student_onboarding_status)}`}>
                    {onboardingStatusLabel(enrollment.student_onboarding_status)}
                  </span>
                )}
                <select
                  value={enrollment.student_onboarding_status ?? 'new_student'}
                  onChange={(e) => handleOnboardingChange(e.target.value)}
                  disabled={updateOnboard.isPending}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-60"
                >
                  <option value="new_student">Ny elev</option>
                  <option value="documents_pending">Dokument inväntas</option>
                  <option value="ready_for_booking">Redo för bokning</option>
                  <option value="active_student">Aktiv elev</option>
                </select>
                {updateOnboard.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                )}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Uppdateras direkt på elevens profil. Visas i elevlistan.
              </p>
            </Section>
          )}

          {/* Internal notes */}
          <Section title="Interna anteckningar" icon={<FileText className="w-4 h-4 text-gray-400" />}>
            {notesEditing ? (
              <div className="space-y-2">
                <textarea
                  value={currentNotes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  placeholder="Lägg till interna anteckningar…"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={updateNotes.isPending}
                    className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {updateNotes.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Spara
                  </button>
                  <button
                    onClick={() => { setNotesEditing(false); setNotes(null); }}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {currentNotes ? (
                  <p className="text-sm text-gray-700 whitespace-pre-line mb-2">{currentNotes}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic mb-2">Inga anteckningar.</p>
                )}
                <button
                  onClick={() => setNotesEditing(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {currentNotes ? 'Redigera' : '+ Lägg till anteckning'}
                </button>
              </div>
            )}
          </Section>

          {/* Timeline */}
          <Section title="Tidslinje" icon={<Clock className="w-4 h-4 text-gray-400" />}>
            <TimelineSection events={enrollment.events ?? []} />
          </Section>

        </div>
      ) : null}

      {/* Dialogs */}
      {showApproveDialog && (
        <ConfirmDialog
          title="Godkänn anmälan"
          message="Är du säker på att du vill godkänna den här anmälan?"
          onConfirm={handleApprove}
          onCancel={() => setShowApproveDialog(false)}
          isPending={approve.isPending}
        />
      )}

      {showRejectDialog && (
        <ConfirmDialog
          title="Neka anmälan"
          message="Ange gärna en anledning till varför anmälan nekas."
          onConfirm={handleReject}
          onCancel={() => setShowRejectDialog(false)}
          isPending={reject.isPending}
          withReason
          reasonLabel="Anledning"
        />
      )}

      {showConvertDialog && (
        <ConfirmDialog
          title="Omvandla till elev"
          message="En ny elevpost skapas baserat på anmälningsuppgifterna. Om eleven redan finns (samma e-post) kopplas posten till den befintliga eleven. Paketet tilldelas automatiskt."
          onConfirm={handleConvert}
          onCancel={() => setShowConvertDialog(false)}
          isPending={convert.isPending}
        />
      )}
    </div>
  );
}
