import { InternalLink } from '@/components/internal-link';

export function CarbonLogo({ large = false }: { large?: boolean }) {
  const size = large ? 'size-28' : 'size-11';
  return <svg viewBox="0 0 64 64" className={size} aria-label="Balance Co2 Argentina">
    <title>Balance Co2 Argentina</title>
    <circle cx="32" cy="32" r="11" fill="white" stroke="#4b9fc5" strokeWidth="2" />
    <text x="32" y="37" textAnchor="middle" fill="#27799f" fontSize="15" fontWeight="700">C</text>
    <g fill="#dff3fb" stroke="#4b9fc5" strokeWidth="2"><circle cx="13" cy="17" r="5"/><circle cx="51" cy="17" r="5"/><circle cx="12" cy="46" r="5"/><circle cx="52" cy="46" r="5"/></g>
    <g stroke="#80bdd6" strokeWidth="2"><path d="M18 20l7 6M46 20l-7 6M17 43l8-6M47 43l-8-6"/></g>
  </svg>;
}

export function SiteHeader() {
  return <header className="sticky top-0 z-50 border-b border-border/80 bg-white/92 backdrop-blur-xl">
    <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-5 py-3 sm:px-8">
      <InternalLink href="/" className="flex items-center gap-3"><CarbonLogo /><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-primary">Movilidad alimentaria</p><p className="text-base font-semibold tracking-tight">Balance Co2 Argentina</p></div></InternalLink>
      <nav aria-label="Navegación principal" className="flex items-center gap-1 text-sm font-medium"><InternalLink className="hidden rounded-lg px-3 py-2 hover:bg-secondary sm:block" href="/dashboard">Dashboard</InternalLink><InternalLink className="rounded-lg px-3 py-2 hover:bg-secondary" href="/simulador">Simulador</InternalLink><InternalLink className="hidden rounded-lg px-3 py-2 hover:bg-secondary md:block" href="/#fuentes">Fuentes</InternalLink></nav>
    </div>
  </header>;
}
