const CHANNEL_LABELS: Record<string, string> = {
  email:    'E-post',
  sms:      'SMS',
  whatsapp: 'WhatsApp',
  push:     'Push',
  voice:    'AI Röst',
  internal: 'In-app',
};

/**
 * Swedish display label for a notification delivery channel, e.g.
 * "internal" -> "In-app". Falls back to the raw value for any channel
 * not yet in the map rather than hiding it.
 */
export function formatChannelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}
