import { Moon, Sun } from 'lucide-react';
import { useSessionStore } from '@core/store/session.store.js';
import { useUiStore } from '@core/store/ui.store.js';

export function PlatformTopBar() {
  const { user, profile } = useSessionStore();
  const { theme, toggleTheme } = useUiStore();

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : (user?.email ?? 'Platform Admin');

  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase() ?? '')
    .join('') || '?';

  return (
    <header className="h-14 bg-background border-b border-border flex items-center px-4 gap-3 fixed top-0 right-0 z-30 left-0 md:left-[280px]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Platform Admin</p>
        <p className="text-[10px] text-muted-foreground leading-none">Superadmin Console</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Ljust läge' : 'Mörkt läge'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-primary-foreground">{initials}</span>
          </div>
          <span className="hidden sm:block text-sm font-medium text-foreground truncate max-w-[140px]">
            {displayName}
          </span>
        </div>
      </div>
    </header>
  );
}
