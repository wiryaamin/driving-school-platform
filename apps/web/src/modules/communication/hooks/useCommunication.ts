import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommChannel = 'email' | 'sms' | 'whatsapp' | 'push' | 'voice';
export type MsgStatus   = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'cancelled';

export interface ChannelConfig {
  id:              string;
  organization_id: string;
  channel:         CommChannel;
  enabled:         boolean;
  provider:        string | null;
  from_address:    string | null;
  display_name:    string | null;
  daily_limit:     number;
  created_at:      string;
  updated_at:      string;
}

export interface OutboundMessage {
  id:                  string;
  organization_id:     string;
  channel:             CommChannel;
  recipient_type:      'student' | 'instructor' | 'manual';
  recipient_id:        string | null;
  recipient_address:   string;
  template_id:         string | null;
  subject:             string | null;
  body:                string;
  status:              MsgStatus;
  provider:            string | null;
  provider_message_id: string | null;
  error_message:       string | null;
  retry_count:         number;
  max_retries:         number;
  retry_after:         string | null;
  scheduled_at:        string | null;
  sent_at:             string | null;
  delivered_at:        string | null;
  metadata:            Record<string, unknown>;
  created_at:          string;
  created_by:          string;
}

export interface CommTemplate {
  id:              string;
  organization_id: string | null;
  key:             string;
  locale:          string;
  channel:         CommChannel | 'internal';
  subject:         string | null;
  body_html:       string | null;
  body_text:       string;
  variables:       string[];
  is_active:       boolean;
}

export interface NotificationRule {
  id:              string;
  organization_id: string;
  trigger_event:   string;
  channel:         CommChannel;
  template_id:     string;
  recipient_type:  'student' | 'instructor';
  enabled:         boolean;
  created_at:      string;
  updated_at:      string;
  template?: {
    id:      string;
    key:     string;
    locale:  string;
    channel: string;
  } | null;
}

export interface SendMessageParams {
  channel:            CommChannel;
  recipient_type?:    'student' | 'instructor' | 'manual' | undefined;
  recipient_id?:      string | undefined;
  recipient_address:  string;
  template_id?:       string | undefined;
  subject?:           string | undefined;
  body:               string;
  scheduled_at?:      string | undefined;
  variables?:         Record<string, string> | undefined;
  metadata?:          Record<string, unknown> | undefined;
}

export interface CreateTemplateParams {
  key:        string;
  locale?:    string;
  channel:    CommChannel | 'internal';
  subject?:   string | null;
  body_text:  string;
  body_html?: string | null;
  variables?: string[];
}

export interface UpdateTemplateParams {
  subject?:   string | null;
  body_text?: string;
  body_html?: string | null;
  variables?: string[];
  is_active?: boolean;
}

export interface CreateRuleParams {
  trigger_event:   string;
  channel:         CommChannel;
  template_id:     string;
  recipient_type?: 'student' | 'instructor';
  enabled?:        boolean;
}

export interface UpdateRuleParams {
  enabled?:        boolean | undefined;
  template_id?:    string | undefined;
  recipient_type?: 'student' | 'instructor' | undefined;
}

export interface MessageListParams {
  channel?:   CommChannel | undefined;
  status?:    MsgStatus | undefined;
  from?:      string | undefined;
  to?:        string | undefined;
  page?:      number | undefined;
  per_page?:  number | undefined;
}

export interface CommAnalyticsSummary {
  channel:       CommChannel;
  total:         number;
  sent:          number;
  failed:        number;
  queued:        number;
  delivery_rate: number;
}

export interface QueueHealthChannel {
  channel:          CommChannel;
  queued_count:     number;
  sending_count:    number;
  retryable_count:  number;
  failed_total:     number;
  oldest_queued_at: string | null;
}

export interface QueueHealth {
  total_queued:     number;
  total_retryable:  number;
  oldest_queued_at: string | null;
  by_channel:       QueueHealthChannel[];
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const commKeys = {
  all:         ['communications'] as const,
  channels:    () => [...commKeys.all, 'channels'] as const,
  templates:   (channel?: string) => [...commKeys.all, 'templates', channel ?? 'all'] as const,
  messages:    (params: MessageListParams) => [...commKeys.all, 'messages', params] as const,
  rules:       () => [...commKeys.all, 'rules'] as const,
  analytics:   (days: number) => [...commKeys.all, 'analytics', days] as const,
  queueHealth: () => [...commKeys.all, 'queue-health'] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function invoke<T>(path: string, opts?: Parameters<typeof supabase.functions.invoke>[1]): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(path, opts);
  if (error) throw error;
  if (!data) throw new Error('Empty response');
  return data;
}

// ─── Channel config hooks ─────────────────────────────────────────────────────

export function useChannelConfigs() {
  return useQuery({
    queryKey: commKeys.channels(),
    queryFn:  () => invoke<{ data: ChannelConfig[] }>('communications/channels', { method: 'GET' }).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useUpdateChannelConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channel, ...body }: Partial<ChannelConfig> & { channel: CommChannel }) =>
      invoke<{ data: ChannelConfig }>(`communications/channels/${channel}`, {
        method: 'PUT',
        body:   JSON.stringify(body),
      }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: commKeys.channels() }),
  });
}

// ─── Template hooks ───────────────────────────────────────────────────────────

export function useCommTemplates(channel?: CommChannel | 'all') {
  const ch = channel === 'all' ? undefined : channel;
  return useQuery({
    queryKey: commKeys.templates(ch),
    queryFn:  () => invoke<{ data: CommTemplate[] }>(
      `communications/templates${ch ? `?channel=${ch}` : ''}`,
      { method: 'GET' },
    ).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateTemplateParams) =>
      invoke<{ data: CommTemplate }>('communications/templates', {
        method: 'POST',
        body:   JSON.stringify(params),
      }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: commKeys.templates() }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateTemplateParams & { id: string }) =>
      invoke<{ data: CommTemplate }>(`communications/templates/${id}`, {
        method: 'PATCH',
        body:   JSON.stringify(body),
      }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: commKeys.templates() }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      invoke<{ success: boolean }>(`communications/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: commKeys.templates() }),
  });
}

// ─── Notification rule hooks ──────────────────────────────────────────────────

export function useNotificationRules() {
  return useQuery({
    queryKey: commKeys.rules(),
    queryFn:  () => invoke<{ data: NotificationRule[] }>('communications/rules', { method: 'GET' }).then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateRuleParams) =>
      invoke<{ data: NotificationRule }>('communications/rules', {
        method: 'POST',
        body:   JSON.stringify(params),
      }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: commKeys.rules() }),
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateRuleParams & { id: string }) =>
      invoke<{ data: NotificationRule }>(`communications/rules/${id}`, {
        method: 'PATCH',
        body:   JSON.stringify(body),
      }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: commKeys.rules() }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      invoke<{ success: boolean }>(`communications/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: commKeys.rules() }),
  });
}

// ─── Message hooks ────────────────────────────────────────────────────────────

export function useMessageList(params: MessageListParams = {}) {
  const qs = new URLSearchParams();
  if (params.channel)  qs.set('channel',  params.channel);
  if (params.status)   qs.set('status',   params.status);
  if (params.from)     qs.set('from',     params.from);
  if (params.to)       qs.set('to',       params.to);
  if (params.page)     qs.set('page',     String(params.page));
  if (params.per_page) qs.set('per_page', String(params.per_page));

  const query = qs.toString();

  return useQuery({
    queryKey: commKeys.messages(params),
    queryFn:  () => invoke<{ data: OutboundMessage[]; meta: { total: number; page: number; per_page: number } }>(
      `communications${query ? `?${query}` : ''}`,
      { method: 'GET' },
    ),
    staleTime: 30_000,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: SendMessageParams) =>
      invoke<{ data: OutboundMessage }>('communications/send', {
        method: 'POST',
        body:   JSON.stringify(params),
      }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...commKeys.all, 'messages'] });
      void qc.invalidateQueries({ queryKey: commKeys.queueHealth() });
    },
  });
}

export function useRetryMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      invoke<{ data: OutboundMessage }>(`communications/${id}/retry`, { method: 'PATCH' })
        .then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...commKeys.all, 'messages'] });
      void qc.invalidateQueries({ queryKey: commKeys.queueHealth() });
    },
  });
}

export function useCancelMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      invoke<{ data: OutboundMessage }>(`communications/${id}/cancel`, { method: 'PATCH' })
        .then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...commKeys.all, 'messages'] });
      void qc.invalidateQueries({ queryKey: commKeys.queueHealth() });
    },
  });
}

// ─── Analytics + queue health hooks ──────────────────────────────────────────

export function useCommAnalytics(days = 7, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: commKeys.analytics(days),
    queryFn:  () => invoke<{ data: CommAnalyticsSummary[]; days: number }>(
      `communications/analytics?days=${days}`,
      { method: 'GET' },
    ).then((r) => r.data),
    enabled:   options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export interface CommDailyStat {
  date:   string;
  total:  number;
  sent:   number;
  failed: number;
}

export function useCommDailyStats(days = 7) {
  return useQuery({
    queryKey: [...commKeys.all, 'daily-stats', days] as const,
    queryFn:  () => invoke<{ data: CommDailyStat[]; days: number; format: string }>(
      `communications/analytics?days=${days}&format=daily`,
      { method: 'GET' },
    ).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useQueueHealth(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: commKeys.queueHealth(),
    queryFn:  () => invoke<{ data: QueueHealth }>('communications/queue-health', { method: 'GET' }).then((r) => r.data),
    enabled:   options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useBulkRetry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channel?: CommChannel) =>
      invoke<{ retried: number }>('communications/bulk-retry', {
        method: 'POST',
        body:   JSON.stringify({ channel: channel ?? null }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...commKeys.all, 'messages'] });
      void qc.invalidateQueries({ queryKey: commKeys.queueHealth() });
    },
  });
}

export function useSeedDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      invoke<{ success: boolean; channels_added: number; rules_added: number }>(
        'communications/seed-defaults',
        { method: 'POST', body: JSON.stringify({}) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: commKeys.channels() });
      void qc.invalidateQueries({ queryKey: commKeys.rules() });
    },
  });
}

export function useStudentMessages(studentId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...commKeys.all, 'student-messages', studentId] as const,
    queryFn:  () => invoke<{ data: OutboundMessage[]; meta: { total: number; page: number; per_page: number } }>(
      `communications?recipient_id=${encodeURIComponent(studentId!)}&per_page=20`,
      { method: 'GET' },
    ),
    enabled:   enabled && Boolean(studentId),
    staleTime: 30_000,
  });
}
