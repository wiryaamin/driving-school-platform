import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MessageSquare, CalendarDays, Bell, Loader2, AlertCircle,
  CheckCircle2, XCircle, Clock, CreditCard, Users2,
} from 'lucide-react';
import {
  usePortalHistory,
  usePortalBookings,
  usePortalNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type PortalNotification,
} from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#684EFF';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'short', day: 'numeric', month: 'long',
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}
function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).replace(/^./, c => c.toUpperCase());
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 60)  return `${mins} min sedan`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs} tim sedan`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days} d sedan`;
  return formatDate(iso);
}

// ─── Notification template helpers ───────────────────────────────────────────
// template_key on a canonical notification is the Communication Engine's
// trigger_event (e.g. 'booking_confirmed') — see communication-worker's
// runNotify(), Notification Center Step 1.

const TEMPLATE_LABELS: Record<string, string> = {
  booking_confirmed:         'Bokning bekräftad',
  booking_cancelled:         'Bokning avbokad',
  booking_rescheduled:       'Lektion ombokad',
  booking_reminder_24h:      'Påminnelse om lektion',
  booking_reminder_same_day: 'Påminnelse om lektion idag',
  waitlist_promoted:         'Plats tillgänglig',
  invoice_issued:            'Ny faktura',
  invoice_overdue:           'Betalningspåminnelse',
  // Bug fix: 'student.welcome' is queued directly by event-worker's
  // handleStudentCreated with no subject set at all (it bypasses the
  // trigger_event/TRIGGER_EVENT_META pipeline every other notification here
  // goes through — it's channel:'internal' only, never delivered via email/
  // sms). notifLabel()'s fallback (replacing '_' with a space) does nothing
  // for a dot-separated key, so the raw template_key rendered verbatim as
  // the card's title. This map is exactly the mechanism meant to prevent
  // that for a subject-less row — it just never had this key added.
  'student.welcome':         'Välkommen till elevportalen!',
};

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  booking_confirmed:         CheckCircle2,
  booking_cancelled:         XCircle,
  booking_rescheduled:       Clock,
  booking_reminder_24h:      Bell,
  booking_reminder_same_day: Bell,
  waitlist_promoted:         Users2,
  invoice_issued:            CreditCard,
  invoice_overdue:           AlertCircle,
};

const TEMPLATE_COLORS: Record<string, string> = {
  booking_confirmed:         'bg-green-50 text-green-600',
  booking_cancelled:         'bg-red-50 text-red-600',
  booking_rescheduled:       'bg-amber-50 text-amber-600',
  booking_reminder_24h:      'bg-blue-50 text-blue-600',
  booking_reminder_same_day: 'bg-blue-50 text-blue-600',
  waitlist_promoted:         'bg-blue-50 text-blue-600',
  invoice_issued:            'bg-orange-50 text-orange-600',
  invoice_overdue:           'bg-orange-50 text-orange-600',
};

// Deep-link identifiers are stable route keys chosen by the Communication
// Engine (never a stored URL) — resolved to an actual student-portal path
// here, so a future routing change never needs a database migration.
const DEEP_LINK_ROUTES: Record<string, string> = {
  booking_detail: '/portal/bokningar',
  waitlist:       '/portal/boka',
  invoice_detail: '/portal/konto',
};

const CATEGORY_LABELS: Record<string, string> = {
  booking:     'Bokning',
  lesson:      'Lektion',
  payment:     'Betalning',
  invoice:     'Faktura',
  waitlist:    'Väntelista',
  certificate: 'Intyg',
  account:     'Konto',
  security:    'Säkerhet',
  system:      'System',
  marketing:   'Erbjudande',
};

function notifLabel(templateKey: string): string {
  return TEMPLATE_LABELS[templateKey] ?? templateKey.replace(/_/g, ' ');
}
function notifIcon(templateKey: string): React.ElementType {
  return TEMPLATE_ICONS[templateKey] ?? Bell;
}
function notifColor(templateKey: string): string {
  return TEMPLATE_COLORS[templateKey] ?? 'bg-gray-50 text-gray-500';
}
function resolveDeepLink(identifier: string | null): string | null {
  if (!identifier) return null;
  return DEEP_LINK_ROUTES[identifier] ?? null;
}

// ─── Notification card ────────────────────────────────────────────────────────

function NotificationCard({ notif }: { notif: PortalNotification }) {
  const navigate   = useNavigate();
  const markRead   = useMarkNotificationRead();
  const Icon       = notifIcon(notif.template_key);
  const color      = notifColor(notif.template_key);
  // notif.subject is the Notification Center's canonical business title
  // (always populated — see communication-worker's TRIGGER_EVENT_META) and
  // is the single source of truth for the card's headline. notifLabel() is
  // only a defensive fallback for the (no longer expected) case of a
  // pre-Notification-Center row that somehow still has no subject.
  const title      = notif.subject ?? notifLabel(notif.template_key);
  const isUnread   = notif.read_at === null;
  const targetPath = resolveDeepLink(notif.deep_link_identifier);

  // Strip HTML tags from body for a plain-text preview
  const bodyText = notif.body
    ? notif.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : null;
  const preview = bodyText && bodyText.length > 120
    ? `${bodyText.slice(0, 117)}…`
    : bodyText;

  function handleClick() {
    if (isUnread) markRead.mutate(notif.id);
    if (targetPath) navigate(targetPath);
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-4 border-b border-gray-50 last:border-0 text-left transition-colors',
        targetPath || isUnread ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default',
        isUnread ? 'bg-blue-50/40' : 'bg-transparent',
      )}
    >
      <div className="relative shrink-0">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mt-0.5', color)}>
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </div>
        {isUnread && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#684EFF] border-2 border-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-sm leading-tight', isUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-700')}>
            {title}
          </p>
          <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(notif.created_at)}</span>
        </div>
        {preview && (
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{preview}</p>
        )}
        {notif.category && (
          <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-500">
            {CATEGORY_LABELS[notif.category] ?? notif.category}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Upcoming lesson preparation ──────────────────────────────────────────────

const LESSON_PREP: Record<string, { tip: string; icon: string }> = {
  default:    { icon: '🎯', tip: 'Sov gott kvällen innan och ät en bra frukost. Kom i tid till lektionen.' },
  körlektion: { icon: '🚗', tip: 'Repetera trafikregler för det område ni ska köra i. Ta med körkortstillståndet.' },
  'risk 1':   { icon: '❄️', tip: 'Ta på bekväma kläder. Risk 1 genomförs utomhus på halkbana oavsett väder.' },
  'risk 2':   { icon: '🌙', tip: 'Risk 2 genomförs under mörker. Planera för att komma ut sent eller tidigt.' },
  teoriprov:  { icon: '📖', tip: 'Repetera de kategorier du haft svårare med. Inga anteckningar tillåts på provet.' },
  uppkörning: { icon: '🏁', tip: 'Kör med inövade manövrar. Kommunicera med examinatorn. Lugn och fokuserad.' },
  parkering:  { icon: '🅿️', tip: 'Öva gärna parallellparkering hemma med stolar eller koner.' },
  motorväg:   { icon: '🚀', tip: 'Repetera regler för påfart/avfart och hur man byter fil på motorväg.' },
};

function getLessonPrep(lessonType: string | null): { tip: string; icon: string } {
  if (!lessonType) return LESSON_PREP['default']!;
  const lower = lessonType.toLowerCase();
  for (const [key, val] of Object.entries(LESSON_PREP)) {
    if (key !== 'default' && lower.includes(key)) return val;
  }
  return LESSON_PREP['default']!;
}

function UpcomingSection({ bookings }: {
  bookings: {
    id: string; starts_at: string; ends_at: string;
    lesson_type_name: string | null;
    instructor_first_name: string | null;
  }[];
}) {
  const upcoming = bookings
    .filter(b => new Date(b.starts_at) > new Date())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-[#684EFF] text-xs font-bold uppercase tracking-wide">Kommande lektioner</p>
      {upcoming.map(b => {
        const prep = getLessonPrep(b.lesson_type_name);
        return (
          <div key={b.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="px-4 py-3 flex items-center gap-3" style={{ borderLeft: `3px solid ${BRAND}` }}>
              <span className="text-xl shrink-0">{prep.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 leading-tight capitalize">
                  {formatDateFull(b.starts_at)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatTime(b.starts_at)} – {formatTime(b.ends_at)}
                  {b.lesson_type_name ? ` · ${b.lesson_type_name}` : ''}
                  {b.instructor_first_name ? ` · ${b.instructor_first_name}` : ''}
                </p>
              </div>
            </div>
            <div className="px-4 py-3 bg-blue-50/50 border-t border-blue-100/50">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">Förberedelse</p>
              <p className="text-xs text-gray-600 leading-relaxed">{prep.tip}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Rating dots ──────────────────────────────────────────────────────────────

function RatingDots({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={cn('w-2 h-2 rounded-full', i < Math.round(rating) ? 'bg-amber-400' : 'bg-gray-200')}
        />
      ))}
    </div>
  );
}

// ─── Instructor notes feed ────────────────────────────────────────────────────

interface HistoryItem {
  id:                    string;
  starts_at:             string;
  lesson_type_name:      string | null;
  instructor_first_name: string | null;
  instructor_last_name:  string | null;
  instructor_notes:      string | null;
  performance_rating:    number | null;
  notes:                 { content: string; created_at: string }[];
  status:                string;
}

function NotesFeed({ items }: { items: HistoryItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-[#684EFF] text-xs font-bold uppercase tracking-wide">
        Lärarkommentarer ({items.length})
      </p>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                style={{ background: BRAND }}
              >
                {(item.instructor_first_name ?? 'L').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-900">
                    {item.instructor_first_name ?? ''} {item.instructor_last_name ?? ''}
                  </p>
                  {item.performance_rating !== null && <RatingDots rating={item.performance_rating} />}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {formatDate(item.starts_at)}
                  {item.lesson_type_name ? ` · ${item.lesson_type_name}` : ''}
                </p>
                {item.instructor_notes && (
                  <p className="text-sm text-gray-700 mt-2 leading-relaxed italic">
                    "{item.instructor_notes}"
                  </p>
                )}
                {item.notes.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {item.notes.map((n, i) => (
                      <p key={i} className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-3 py-2">
                        {n.content}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── StudentPortalMeddelandenPage ─────────────────────────────────────────────

export function StudentPortalMeddelandenPage() {
  const { data: history = [],       isLoading: histLoading }   = usePortalHistory();
  const { data: bookings = [],      isLoading: bookLoading }   = usePortalBookings();
  const { data: notifications = [], isLoading: notifLoading }  = usePortalNotifications();
  const markAllRead = useMarkAllNotificationsRead();

  const isLoading  = histLoading || bookLoading || notifLoading;
  const unreadCount = notifications.filter(n => n.read_at === null).length;

  const notesItems = useMemo(
    () => history
      .filter((h: HistoryItem) => h.status === 'completed' && (h.instructor_notes || h.notes?.length > 0))
      .sort((a: HistoryItem, b: HistoryItem) => b.starts_at.localeCompare(a.starts_at)),
    [history],
  );

  const upcomingBookings = bookings.filter(b => new Date(b.starts_at) > new Date());
  const totalMessages    = notifications.length + notesItems.length;

  const isEmpty = totalMessages === 0 && upcomingBookings.length === 0 && !isLoading;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Meddelanden</h1>
          <p className="text-sm text-gray-400 mt-0.5">Notiser &amp; kommunikation</p>
        </div>
        {totalMessages > 0 && (
          <span
            className="px-3 py-1 rounded-full text-xs font-bold text-white"
            style={{ background: BRAND }}
          >
            {totalMessages}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* System notifications */}
          {notifications.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[#684EFF] text-xs font-bold uppercase tracking-wide">
                  Notiser ({notifications.length})
                </p>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    className="text-[10px] font-semibold text-gray-400 hover:text-[#684EFF] transition-colors"
                  >
                    Markera alla som lästa
                  </button>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                {notifications.map(n => (
                  <NotificationCard key={n.id} notif={n} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming lessons with prep */}
          <UpcomingSection bookings={bookings} />

          {/* Instructor notes feed */}
          {notesItems.length > 0 && <NotesFeed items={notesItems as HistoryItem[]} />}

          {/* Empty state */}
          {isEmpty && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center space-y-3">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                style={{ background: `${BRAND}10` }}
              >
                <MessageSquare className="w-7 h-7" style={{ color: BRAND }} />
              </div>
              <p className="text-sm font-semibold text-gray-700">Inga meddelanden ännu</p>
              <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
                Bokningsbekräftelser, påminnelser och lärarkommentarer visas här när du börjar boka lektioner.
              </p>
              <Link
                to="/portal/boka"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white"
                style={{ background: BRAND }}
              >
                <CalendarDays className="w-4 h-4" />
                Boka lektion
              </Link>
            </div>
          )}

          {/* Has upcoming but no notes/notifs */}
          {!isEmpty && notesItems.length === 0 && notifications.length === 0 && (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 text-center">
              <Bell className="w-5 h-5 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">
                Bokningsbekräftelser och lärarkommentarer visas här efter genomförda lektioner.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
