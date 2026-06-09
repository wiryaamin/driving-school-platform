import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, Mail, GraduationCap,
  Calendar, User, Shield, Info,
} from 'lucide-react';
import { StudentFinancePanel } from '@modules/finance/index.js';
import {
  Button, Badge,
  Card, CardContent, CardHeader, CardTitle,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useStudent } from '../hooks/useStudents.js';
import { StudentStatusBadge, PermitStageBadge, permitStageLabel } from '../components/StudentStatusBadge.js';
import { StudentForm } from '../components/StudentForm.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Permit stage progress list ───────────────────────────────────────────────

const PERMIT_STAGES_ORDERED = [
  'not_started', 'theory_study',
  'risk1_booked', 'risk1_completed',
  'risk2_booked', 'risk2_completed',
  'theory_exam_booked', 'theory_passed',
  'practical_exam_booked', 'practical_passed',
  'licence_issued',
] as const;

function stageIndex(stage: string): number {
  return PERMIT_STAGES_ORDERED.indexOf(stage as typeof PERMIT_STAGES_ORDERED[number]);
}

// ─── Detail row primitive ─────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
      <span className="text-sm text-foreground">{value ?? '—'}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);

  const { data: student, isLoading, error } = useStudent(id ?? null);

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-32 text-muted-foreground text-sm">
          Laddar elevuppgifter...
        </div>
      </PageLayout>
    );
  }

  if (error || !student) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <p className="text-sm text-muted-foreground">
            {error ? 'Det gick inte att hämta elevuppgifterna.' : 'Eleven hittades inte.'}
          </p>
          <Button variant="outline" onClick={() => navigate('/students')}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Tillbaka till elevlistan
          </Button>
        </div>
      </PageLayout>
    );
  }

  const fullName = `${student.first_name} ${student.last_name}`;
  const currentStageIdx = stageIndex(student.permit_stage);

  return (
    <PageLayout>
      <PageHeader
        title={fullName}
        {...(student.email ? { description: student.email } : {})}
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Elever', href: '/students' },
          { label: fullName },
        ]}
        actions={
          <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Redigera
            </Button>
          </PermissionGate>
        }
      />

      <PageContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Left column ───────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Profile card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Elevprofil
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow label="Fullständigt namn" value={fullName} />
                <DetailRow
                  label="Status"
                  value={<StudentStatusBadge status={student.status} />}
                />
                {student.personnummer_last4 && (
                  <DetailRow
                    label="Personnummer"
                    value={
                      <span className="font-mono">
                        ******-{student.personnummer_last4}
                      </span>
                    }
                  />
                )}
                <DetailRow label="Identitetstyp" value={
                  student.identity_type === 'personnummer' ? 'Personnummer' :
                  student.identity_type === 'samordningsnummer' ? 'Samordningsnummer' :
                  student.identity_type === 'passport' ? 'Pass' :
                  student.identity_type === 'national_id' ? 'Nationellt ID' : '—'
                } />
                {student.licence_number && (
                  <DetailRow label="Körkortnummer" value={student.licence_number} />
                )}
              </CardContent>
            </Card>

            {/* Contact card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  Kontaktuppgifter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow
                  label="E-post"
                  value={student.email
                    ? <a href={`mailto:${student.email}`} className="text-primary hover:underline">{student.email}</a>
                    : null
                  }
                />
                <DetailRow
                  label="Telefon"
                  value={student.phone
                    ? <a href={`tel:${student.phone}`} className="text-primary hover:underline">{student.phone}</a>
                    : null
                  }
                />
                {(student.address_line1 || student.city) && (
                  <DetailRow
                    label="Adress"
                    value={
                      <div className="space-y-0.5">
                        {student.address_line1 && <div>{student.address_line1}</div>}
                        {(student.postal_code || student.city) && (
                          <div>{[student.postal_code, student.city].filter(Boolean).join(' ')}</div>
                        )}
                      </div>
                    }
                  />
                )}
              </CardContent>
            </Card>

            {/* Licence & education */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-muted-foreground" />
                  Körkort & utbildning
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow
                  label="Behörighet"
                  value={student.target_licence_category || null}
                />
                <DetailRow
                  label="Utbildningssteg"
                  value={<PermitStageBadge stage={student.permit_stage} />}
                />
                <DetailRow label="Inskrivningsdatum"   value={formatDate(student.enrolled_at)} />
                <DetailRow label="Risk 1 genomförd"    value={formatDate(student.risk1_completed_at)} />
                <DetailRow label="Risk 2 genomförd"    value={formatDate(student.risk2_completed_at)} />
                <DetailRow label="Teori godkänd"       value={formatDate(student.theory_passed_at)} />
                <DetailRow label="Uppkörning godkänd"  value={formatDate(student.practical_passed_at)} />
                <DetailRow label="Körkort utfärdat"    value={formatDate(student.licence_issued_at)} />
              </CardContent>
            </Card>

          </div>

          {/* ── Right column ──────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Permit progress */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-muted-foreground" />
                  Utbildningsframsteg
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {PERMIT_STAGES_ORDERED.map((stage, idx) => {
                    const done = idx < currentStageIdx;
                    const active = idx === currentStageIdx;
                    return (
                      <div
                        key={stage}
                        className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${
                          active
                            ? 'bg-primary/10 text-primary font-medium'
                            : done
                            ? 'text-muted-foreground line-through'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          done ? 'bg-green-500' : active ? 'bg-primary' : 'bg-muted-foreground/30'
                        }`} />
                        {permitStageLabel(stage)}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Instructor */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Tilldelad lärare
                </CardTitle>
              </CardHeader>
              <CardContent>
                {student.assigned_instructor_id ? (
                  <div className="text-sm text-muted-foreground">
                    <Badge variant="outline" className="font-mono text-xs">
                      {student.assigned_instructor_id.slice(0, 8)}…
                    </Badge>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Lärarnamn hämtas i nästa fas
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Ingen lärare tilldelad</p>
                )}
              </CardContent>
            </Card>

            {/* Datasekretess */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  Datasekretess
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow
                  label="Dataskyddssamtycke"
                  value={student.data_processing_consent
                    ? <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent">Ja</Badge>
                    : <Badge variant="outline">Nej</Badge>
                  }
                />
                <DetailRow
                  label="E-postmarknadsföring"
                  value={student.communication_opt_in_email ? 'Ja' : 'Nej'}
                />
                <DetailRow
                  label="SMS-marknadsföring"
                  value={student.communication_opt_in_sms ? 'Ja' : 'Nej'}
                />
                {student.gdpr_consent_given_at && (
                  <DetailRow
                    label="Samtycke datum"
                    value={formatDate(student.gdpr_consent_given_at)}
                  />
                )}
              </CardContent>
            </Card>

            {/* Metadata */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  Metadata
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow label="Skapad"     value={formatDateTime(student.created_at)} />
                <DetailRow label="Uppdaterad" value={formatDateTime(student.updated_at)} />
                <DetailRow label="Inskrivningsdatum" value={formatDate(student.enrolled_at)} />
              </CardContent>
            </Card>

          </div>
        </div>

        {/* ── Upcoming lessons placeholder ──────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              Kommande lektioner
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <Calendar className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Lektionsbokning aktiveras i UI-3</p>
              <Link to="/scheduling" className="text-xs text-primary hover:underline">
                Gå till schema
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* ── Finance panel ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StudentFinancePanel studentId={student.id} />
        </div>

      </PageContent>

      {/* Edit sheet */}
      <StudentForm
        open={editOpen}
        onOpenChange={setEditOpen}
        student={student}
      />
    </PageLayout>
  );
}
