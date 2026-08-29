/** @type {import('tailwindcss').Config} */
export const baseTailwindConfig = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          active: 'hsl(var(--primary-active))',
          light: 'hsl(var(--primary-light))',
          dark: 'hsl(var(--primary-dark))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        disabled: {
          DEFAULT: 'hsl(var(--disabled))',
          foreground: 'hsl(var(--disabled-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        surface: 'hsl(var(--surface))',
        divider: 'hsl(var(--divider))',
        selection: 'hsl(var(--selection))',
        'foreground-secondary': 'hsl(var(--foreground-secondary))',
        // Brand — Trafikcloud
        brand: {
          50: '#eef5ff',
          100: '#dbe9fe',
          200: '#bcd7fd',
          300: '#8dbdfb',
          400: '#579af6',
          500: '#2B7DE9',
          600: '#1c63cc',
          700: '#194fa5',
          800: '#194485',
          900: '#0F2C59',
        },
        // Sidebar
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
        },
        // Tenant sidebar — scoped variant used only by the tenant dashboard's
        // own Sidebar/MobileSidebar (Tenant Dashboard Visual Alignment,
        // 2026-08-29). Kept fully separate from `sidebar` above so Platform
        // Admin's own sidebar (PlatformSidebar.tsx, still using `sidebar-*`)
        // is unaffected by this recolor.
        'tenant-sidebar': {
          DEFAULT: 'hsl(var(--tenant-sidebar-background))',
          foreground: 'hsl(var(--tenant-sidebar-foreground))',
          primary: 'hsl(var(--tenant-sidebar-primary))',
          'primary-foreground': 'hsl(var(--tenant-sidebar-primary-foreground))',
          accent: 'hsl(var(--tenant-sidebar-accent))',
          'accent-foreground': 'hsl(var(--tenant-sidebar-accent-foreground))',
          border: 'hsl(var(--tenant-sidebar-border))',
        },
        // Action — the primary call-to-action accent. Defaults to `--primary`
        // everywhere (identical to today); overridden only inside the
        // `.tenant-shell` wrapper (AppShell.tsx) so the shared Button
        // component's `default` variant renders orange in the tenant
        // dashboard specifically, without touching Platform Admin, Student
        // Portal, or public marketing, which render the exact same Button
        // component outside that wrapper.
        action: {
          DEFAULT: 'hsl(var(--action))',
          foreground: 'hsl(var(--action-foreground))',
          hover: 'hsl(var(--action-hover))',
        },
      },
      // Listivo design-reference audit (2026-08-29): a restrained two-tier
      // radius system — 5px for standard controls (Button, Input, Select,
      // Tabs, Dropdown/Select content), 10px for large surfaces (Card,
      // Dialog/Sheet). md/sm are fixed values rather than calc() offsets
      // from --radius so the two tiers can each land on the source's exact
      // 5px/10px targets instead of being arithmetically tied together.
      borderRadius: {
        lg: 'var(--radius)',   // 10px — see globals.css
        md: '0.3125rem',       // 5px — standard controls
        sm: '0.1875rem',       // 3px — tightly-nested elements (menu items)
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Headings only (Listivo design-reference audit, 2026-08-29) — see
        // globals.css's `.tenant-shell h1..h4` rule and CardTitle, which
        // apply this via the `font-heading` class rather than every page
        // needing to reach for it individually.
        heading: ['"Red Hat Display"', 'Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
      },
    },
  },
  plugins: ['tailwindcss-animate'],
};
