import { ArrowRight, BarChart3, BookOpen, Calculator, MapPinned } from 'lucide-react';
import { CarbonLogo, SiteHeader } from '@/components/site-header';
import { InternalLink } from '@/components/internal-link';

const sources = [
  { name: 'SENASA', role: 'Movimientos, productos, pesos y territorios de origen y destino.', href: 'https://qliksensebycores.senasa.gob.ar/sense/app/2c5b45af-04a5-42e6-be1d-2424656625de/sheet/c8f024ca-17d6-40b6-ac4f-13737142fa34/state/analysis' },
  { name: 'GeoRef Argentina', role: 'Nombres, códigos y referencias geográficas oficiales.', href: 'https://www.argentina.gob.ar/georef' },
  { name: 'GLEC Framework', role: 'Marco metodológico para emisiones del transporte logístico.', href: 'https://www.smartfreightcentre.org/en/our-programs/global-logistics-emissions-council/' },
  { name: 'Green Algorithms', role: 'Estimación energética y de carbono de la infraestructura computacional.', href: 'https://www.green-algorithms.org/GAapp-overview/' },
  { name: 'AI Energy Score', role: 'Mediciones comparables de energía para tareas de inferencia de IA.', href: 'https://huggingface.co/spaces/AIEnergyScore/Leaderboard' },
  { name: 'Ember', role: 'Metodología de intensidad de carbono de la generación eléctrica por país.', href: 'https://ember-energy.org/data/yearly-electricity-data/' },
];

export default function Home() {
  return <main className="min-h-screen bg-background text-foreground">
    <SiteHeader />
    <section className="relative overflow-hidden border-b border-border bg-[linear-gradient(145deg,#ffffff_10%,#edf9fe_62%,#dff3fb_100%)]">
      <div className="pointer-events-none absolute -right-24 top-16 size-[34rem] rounded-full border border-primary/15" />
      <div className="pointer-events-none absolute right-8 top-36 size-72 rounded-full border border-primary/20" />
      <div className="relative mx-auto grid max-w-[1440px] items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:py-28">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[.22em] text-primary">Movilidad alimentaria · Argentina</p>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.04] tracking-[-.045em] sm:text-6xl lg:text-7xl">Calculá cuándo la tecnología y los alimentos de cercanía <span className="text-primary">reducen la huella de carbono.</span></h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">Explorá el transporte de productos en Argentina y compará el ahorro de un circuito local con las emisiones de la solución digital que lo hace posible.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <InternalLink className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-foreground/90" href="/dashboard">Huella de Transporte por Distrito <ArrowRight className="size-4" /></InternalLink>
            <InternalLink className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-primary/35 bg-white px-5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-secondary" href="/simulador">Evaluar una Solución Tecnológica <Calculator className="size-4 text-primary" /></InternalLink>
          </div>
        </div>
        <div className="relative mx-auto hidden aspect-square w-full max-w-[480px] lg:block" aria-hidden="true">
          <div className="absolute inset-10 rounded-full border border-primary/25 bg-white/60 shadow-[0_28px_90px_rgba(64,153,193,.16)] backdrop-blur-sm" />
          <div className="absolute inset-[28%] grid place-items-center rounded-full bg-white shadow-lg"><CarbonLogo large /></div>
          <Orbit icon={<MapPinned />} label="Territorio" className="left-0 top-[42%]" />
          <Orbit icon={<BarChart3 />} label="Transporte" className="right-0 top-[18%]" />
          <Orbit icon={<Calculator />} label="Tecnología" className="bottom-[5%] right-[12%]" />
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8">
      <div className="grid gap-5 md:grid-cols-2">
        <InternalLink href="/dashboard" className="group rounded-3xl border border-border bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
          <BarChart3 className="size-7 text-primary" /><p className="mt-8 text-sm font-semibold text-primary">01 · Observar</p><h2 className="mt-2 text-2xl font-semibold">Huella del transporte de productos</h2><p className="mt-3 leading-relaxed text-muted-foreground">Filtrá los movimientos registrados, compará grupos y productos, y examiná rutas, volúmenes y emisiones estimadas.</p><span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold">Abrir dashboard <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
        </InternalLink>
        <InternalLink href="/simulador" className="group rounded-3xl border border-border bg-secondary/45 p-7 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
          <Calculator className="size-7 text-primary" /><p className="mt-8 text-sm font-semibold text-primary">02 · Evaluar</p><h2 className="mt-2 text-2xl font-semibold">Balance de una solución de proximidad</h2><p className="mt-3 leading-relaxed text-muted-foreground">Definí un escenario local y descubrí cuántas toneladas deben cambiar de circuito para compensar la huella digital.</p><span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold">Abrir simulador <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
        </InternalLink>
      </div>
    </section>
    <section id="fuentes" className="scroll-mt-20 border-t border-border bg-secondary/30">
      <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8">
        <div className="max-w-2xl"><p className="flex items-center gap-2 text-sm font-semibold text-primary"><BookOpen className="size-4" /> Trazabilidad</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Fuentes y metodología</h2><p className="mt-3 leading-relaxed text-muted-foreground">Cada resultado debe leerse junto con su fuente, unidad, período y alcance. Los enlaces permiten revisar las referencias utilizadas.</p></div>
        <div className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">{sources.map((source) => <a key={source.name} href={source.href} target="_blank" rel="noreferrer" className="group bg-white p-5 transition hover:bg-[#f5fbfe]"><h3 className="font-semibold">{source.name}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{source.role}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">Consultar fuente <ArrowRight className="size-3.5 transition group-hover:translate-x-1" /></span></a>)}</div>
        <p className="mt-6 max-w-4xl text-sm leading-relaxed text-muted-foreground">Balance Co2 Argentina estima emisiones de transporte y operación digital. No representa la huella completa de producción, conservación, desperdicio o consumo de los alimentos ni certifica viajes efectivamente evitados.</p>
      </div>
    </section>
  </main>;
}

function Orbit({ icon, label, className }: { icon: React.ReactNode; label: string; className: string }) {
  return <div className={`absolute flex items-center gap-2 rounded-full border border-primary/25 bg-white px-4 py-3 text-sm font-semibold shadow-md ${className}`}><span className="text-primary">{icon}</span>{label}</div>;
}
