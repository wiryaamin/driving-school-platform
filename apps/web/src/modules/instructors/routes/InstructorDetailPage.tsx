import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, Mail, Shield, Info,
  Award, Briefcase, Calendar, BookOpen, Clock,
} from 'lucide-react';
import {
  Button, Badge,
  Card, CardContent, CardHeader, CardTitle,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useInstructor } from '../hooks/useInstructors.js';
import { InstructorStatusBadge } from '../components/InstructorStatusBadge.js';
import { InstructorForm } from '../components/InstructorForm.js';
import {
  formatAdiValidity,
  formatDate,
  formatDateTime,
} from '../lib/instructorUtils.js';

// ─── Detail row primitive ─────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground w-44 shrink-0">{label}</span>
      <span className="text-sm text-foreground">{value ?? '—'}</span>
    </div>
  );
}

// ─── ADI validity indicator ───────────────────────────────────────────────────

function AdiValidityBadge({ validUntil }: { validUntil: string | null }) {
  if (!validUntil) return <span className="text-muted-foreground">—</span>;
  const isExpired = new Date(validUntil) < new Date();
  return (
    <span className="flex items-center gap-2">
      <span className={isExpired ? 'text-destructive' : 'text-foreground'}>
        {formatAdiValidity(validUntil)}
      </span>
      {isExpired && (
        <Badge variant="destructive" className="text-xs">Utgången</Badge>
      )}
    </span>
  );
}

// ─── Teaching categories visual list ─────────────────────────────────────────

function TeachingCategoryList({ categories }: { categories: string[] }) {
  if (categories.length === 0) return <span className="text-muted-foreground">Inga kategorier registrerade</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((cat) => (
        <Badge key={cat} variant="outline" className="font-mono font-semibold">
          {cat}
        </Badge>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function InstructorDetailPage() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const [editOpen, setEditOpen] = useState(false);

  const { data: instructor, isLoading, error } = useInstructor(id ?? null);

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-32 text-muted-foreground text-sm">
          Laddar läraruppgifter...
        </div>
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
          <Button variant="outline" onClick={() => navigate('/instructors')}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Tillbaka till lärarlistan
          </Button>
        </div>
      </PageLayout>
    );
  }

  const fullName = `${instructor.first_name} ${instructor.last_name}`;

  return (
    <PageLayout>
      <PageHeader
        title={fullName}
        {...(instructor.email ? { description: instructor.email } : {})}
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Lärare', href: '/instructors' },
          { label: fullName },
        ]}
        actions={
          <PermissionGate permission={Permissions.INSTRUCTORS_UPDATE}>
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

            {/* Profile overview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  Lärarprofil
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow label="Fullständigt namn" value={fullName} />
                <DetailRow
                  label="Status"
                  value={<InstructorStatusBadge status={instructor.employment_type} />}
                />
                {instructor.personnummer_last4 && (
                  <DetailRow
                    label="Personnummer"
                    value={
                      <span className="font-mono">
                        ******-{instructor.personnummer_last4}
                      </span>
                    }
                  />
                )}
                {instructor.employee_number && (
                  <DetailRow
                    label="Anställningsnummer"
                    value={<span className="font-mono">{instructor.employee_number}</span>}
                  />
                )}
                {instructor.languages_spoken.length > 0 && (
                  <DetailRow
                    label="Talade språk"
                    value={instructor.languages_spoken.join(', ')}
                  />
                )}
                {instructor.max_lessons_per_day != null && (
                  <DetailRow
                    label="Max lektioner/dag"
                    value={`${instructor.max_lessons_per_day} lektioner`}
                  />
                )}
              </CardContent>
            </Card>

            {/* Contact */}
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
                  value={
                    instructor.email
                      ? <a href={`mailto:${instructor.email}`} className="text-primary hover:underline">{instructor.email}</a>
                      : null
                  }
                />
                <DetailRow
                  label="Telefon"
                  value={
                    instructor.phone
                      ? <a href={`tel:${instructor.phone}`} className="text-primary hover:underline">{instructor.phone}</a>
                      : null
                  }
                />
              </CardContent>
            </Card>

            {/* Employment */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  Anställning
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow label="Anställningsform" value={
                  <InstructorStatusBadge status={instructor.employment_type} />
                } />
                <DetailRow label="Anställd sedan"    value={formatDate(instructor.employment_started_at)} />
                <DetailRow label="Anställd till"     value={formatDate(instructor.employment_ended_at)} />
              </CardContent>
            </Card>

          </div>

          {/* ── Right column ──────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Certifications */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="w-4 h-4 text-muted-foreground" />
                  Behörigheter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Undervisningskategorier</p>
                  <TeachingCategoryList categories={instructor.teaching_categories} />
                </div>
                {instructor.adi_number && (
                  <div className="pt-1 border-t border-border space-y-0">
                    <DetailRow label="ADI-nummer"    value={<span className="font-mono">{instructor.adi_number}</span>} />
                    <DetailRow
                      label="ADI gäller till"
                      value={<AdiValidityBadge validUntil={instructor.adi_valid_until} />}
                    />
                  </div>
                )}
                {!instructor.adi_number && (
                  <p className="text-sm text-muted-foreground">Inget ADI-certifikat registrerat</p>
                )}
              </CardContent>
            </Card>

            {/* Availability summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Tillgänglighet
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
                  <Clock className="w-7 h-7 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Tillgänglighet hanteras i schemaläggningen.
                  </p>
                  <Link
                    to={`/scheduling?instructor_id=${instructor.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Öppna schema för {instructor.first_name}
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  Åtkomst
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <DetailRow
                  label="Plattformskonto"
                  value={
                    instructor.user_id
                      ? <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent">Aktivt</Badge>
                      : <Badge variant="outline">Ej kopplat</Badge>
                  }
                />
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
                <DetailRow label="Skapad"     value={formatDateTime(instructor.created_at)} />
                <DetailRow label="Uppdaterad" value={formatDateTime(instructor.updated_at)} />
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
              <p className="text-sm text-muted-foreground">
                Lärarens kommande lektioner visas i schemaläggningen.
              </p>
              <Link
                to={`/scheduling?instructor_id=${instructor.id}`}
                className="text-xs text-primary hover:underline"
              >
                Öppna schema
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* ── Assigned students placeholder ─────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              Tilldelade elever
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <p className="text-sm text-muted-foreground">
                Elevtilldelning visas i UI-5.
              </p>
            </div>
          </CardContent>
        </Card>

      </PageContent>

      <InstructorForm
        open={editOpen}
        onOpenChange={setEditOpen}
        instructor={instructor}
      />
    </PageLayout>
  );
}
