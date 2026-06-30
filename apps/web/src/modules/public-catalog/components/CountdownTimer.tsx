import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

function getTimeLeft(endsAt: string): string | null {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return null;

  const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 7)   return null;
  if (days > 0)   return `${days} dag${days !== 1 ? 'ar' : ''} kvar`;
  if (hours > 0)  return `${hours} timm${hours !== 1 ? 'ar' : 'e'} kvar`;
  if (minutes > 0) return `${minutes} minut${minutes !== 1 ? 'er' : ''} kvar`;
  return 'Avslutas snart';
}

interface CountdownTimerProps {
  endsAt:    string;
  className?: string;
}

export function CountdownTimer({ endsAt, className }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(endsAt));

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft(endsAt)), 60_000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (timeLeft === null) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full ${className ?? ''}`}>
      <Clock className="w-3 h-3" />
      {timeLeft}
    </span>
  );
}
