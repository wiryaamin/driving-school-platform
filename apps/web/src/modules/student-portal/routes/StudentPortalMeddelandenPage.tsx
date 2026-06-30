import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare, CalendarDays, Bell, Loader2, AlertCircle,
  CheckCircle2, XCircle, Clock, Mail, Smartphone, Star,
} from 'lucide-react';
import {
  usePortalHistory,
  usePortalBookings,
  usePortalNotifications,
  type PortalNotification,
} from '../hooks/useStudentPortal.js';
import { cn } from '@/lib/utils.js';

const BRAND = '#1055C9';

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

const TEMPLATE_LABELS: Record<string, string> = {
  booking_confirmation:    'Bokning bekräftad',
  booking_reminder:        'Påminnelse om lektion',
  booking_cancellation:    'Bokning avbokad',
  booking_rescheduled:     'Lektion ombokad',
  waitlist_notification:   'Plats tillgänglig',
  waitlist_reminder:       'Påminnelse — väntelista',
  payment_reminder:        'Betalningspåminnelse',
  payment_received:        'Betalning mottagen',
  invoice_created:         'Ny faktura',
  welcome:                 'Välkommen',
  portal_access:           'Tillgång till elevportalen',
  lesson_feedback:         'Återkoppling från lärare',
  account_update:          'Kontouppdatering',
};

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  booking_confirmation:    CheckCircle2,
  booking_reminder:        Bell,
  booking_cancellation:    XCircle,
  booking_rescheduled:     Clock,
  waitlist_notification:   Bell,
  waitlist_reminder:       Clock,
  payment_reminder:        AlertCircle,
  payment_received:        CheckCircle2,
  invoice_created:         AlertCircle,
  welcome:                 Star,
  portal_access:           Star,
  lesson_feedback:         Star,
  account_update:          Bell,
};

const TEMPLATE_COLORS: Record<string, string> = {
  booking_confirmation:    'bg-green-50 text-green-600',
  booking_reminder:        'bg-blue-50 text-blue-600',
  booking_cancellation:    'bg-red-50 text-red-600',
  booking_rescheduled:     'bg-amber-50 text-amber-600',
  waitlist_notification:   'bg-blue-50 text-blue-600',
  waitlist_reminder:       'bg-gray-50 text-gray-500',
  payment_reminder:        'bg-orange-50 text-orange-600',
  payment_received:        'bg-green-50 text-green-600',
  invoice_created:         'bg-orange-50 text-orange-600',
  welcome:                 'bg-purple-50 text-purple-600',
  portal_access:           'bg-purple-50 text-purple-600',
  lesson_feedback:         'bg-amber-50 text-amber-600',
  account_update:          'bg-blue-50 text-blue-600',
};

const CHANNEL_ICON: Record<string, React.ElementType> = {
  email: Mail,
  sms:   Smartphone,
  push:  Bell,
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

// ─── Notification card ────────────────────────────────────────────────────────

function NotificationCard({ notif }: { notif: PortalNotification }) {
  const Icon    = notifIcon(notif.template_key);
  const color   = notifColor(notif.template_key);
  const label   = notifLabel(notif.template_key);
  const ChIcon  = CHANNEL_ICON[notif.channel] ?? Bell;

  // Strip HTML tags from body for a plain-text preview
  const bodyText = notif.body
    ? notif.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : null;
  const preview = bodyText && bodyText.length > 120
    ? `${bodyText.slice(0, 117)}…`
    : bodyText;

  return (
    <div className="flex items-start gap-3 px-4 py-4 border-b border-gray-50 last:border-0">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5', color)}>
        <Icon className="w-4 h-4" strokeWidth={1.75} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 leading-tight">{label}</p>
          <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(notif.created_at)}</span>
        </div>
        {notif.subject && (
          <p className="text-xs text-gray-600 mt-0.5 leading-snug">{notif.subject}</p>
        )}
        {preview && !notif.subject && (
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{preview}</p>
        )}
        <div className="flex items-center gap-1 mt-1">
          <ChIcon className="w-3 h-3 text-gray-300" />
          <span className="text-[10px] text-gray-400 capitalize">{notif.channel}</span>
        </div>
      </div>
    </div>
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
      <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide">Kommande lektioner</p>
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
      <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide">
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

  const isLoading = histLoading || bookLoading || notifLoading;

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
              <p className="text-[#1055C9] text-xs font-bold uppercase tracking-wide">
                Notiser ({notifications.length})
              </p>
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
