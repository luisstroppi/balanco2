'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Database, Info, Leaf,
  Route as RouteIcon, Scale, Truck,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SiteHeader } from '@/components/site-header';

type RouteRecord = {
  y: number; mo: number; g: string; p: string;
  op: string; od: string; olat: number; olon: number; oq: string;
  dp: string; dd: string; dlat: number; dlon: number; dq: string;
  km: number; same: number; n: number; m: number; np: number; mp: number;
};

type DashboardData = {
  meta: {
    dashboardRows: number; sourceRows: number; exportCoveragePct: number;
    sourceFiles: number; completeDataset: boolean; deliveryMethod: string;
    includedRows: number; geocodedRows: number; plausibleRows: number;
    sameAreaRows: number; routeGroups: number;
    matchQuality: Record<string, number>; scopeDefinition: string;
    distanceMethod: string; sourceUpdated: string;
  };
  factors: { id: string; label: string; gPerTkm: number }[];
  years: number[]; groups: string[]; products: string[];
  originProvinces: string[]; destinationProvinces: string[];
  topProducts: { name: string; trips: number }[];
  recordFiles: Record<string, string>;
};

type RouteSummary = {
  key: string; op: string; od: string; dp: string; dd: string;
  olat: number; olon: number; dlat: number; dlon: number;
  trips: number; mass: number; distance: number; tkm: number; emissions: number;
};

type ProductRouteSummary = RouteSummary & { product: string };

type FilteredTripRow = {
  key: string; year: number; month: number; group: string; product: string;
  op: string; od: string; dp: string; dd: string;
  trips: number; mass: number; distance: number; emissions: number;
};

type GeoFeatureCollection = {
  features: {
    properties: { id: string; nombre: string };
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
  }[];
};

const format0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const format1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const format2 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

function scaled(value: number, unit: string) {
  const absolute = Math.abs(value);
  const formatted = absolute >= 100 ? format0.format(value) : absolute >= 10 ? format1.format(value) : format2.format(value);
  return `${formatted} ${unit}`;
}

function adaptiveMass(tonnes: number) {
  if (Math.abs(tonnes) >= 1_000_000) return scaled(tonnes / 1_000_000, 'Mt');
  if (Math.abs(tonnes) >= 1_000) return scaled(tonnes / 1_000, 'kt');
  if (Math.abs(tonnes) >= 1) return scaled(tonnes, 't');
  return scaled(tonnes * 1_000, 'kg');
}

function adaptiveActivity(tonneKm: number) {
  if (Math.abs(tonneKm) >= 1_000_000_000) return scaled(tonneKm / 1_000_000_000, 'mil M t·km');
  if (Math.abs(tonneKm) >= 1_000_000) return scaled(tonneKm / 1_000_000, 'M t·km');
  if (Math.abs(tonneKm) >= 1_000) return scaled(tonneKm / 1_000, 'mil t·km');
  return scaled(tonneKm, 't·km');
}

function adaptiveEmissions(tonnesCo2e: number) {
  if (Math.abs(tonnesCo2e) >= 1_000_000) return scaled(tonnesCo2e / 1_000_000, 'MtCO₂e');
  if (Math.abs(tonnesCo2e) >= 1_000) return scaled(tonnesCo2e / 1_000, 'ktCO₂e');
  if (Math.abs(tonnesCo2e) >= 1) return scaled(tonnesCo2e, 'tCO₂e');
  return scaled(tonnesCo2e * 1_000, 'kgCO₂e');
}

export default function DashboardApp() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [records, setRecords] = useState<RouteRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const recordCache = useRef(new Map<number, RouteRecord[]>());
  const [error, setError] = useState('');
  const [year, setYear] = useState('2025');
  const [group, setGroup] = useState('all');
  const [product, setProduct] = useState('all');
  const [originProvince, setOriginProvince] = useState('all');
  const [originDepartment, setOriginDepartment] = useState('all');
  const [destinationProvince, setDestinationProvince] = useState('all');
  const [destinationDepartment, setDestinationDepartment] = useState('all');
  const [vehicle, setVehicle] = useState('medium');
  const [circuity, setCircuity] = useState(1.25);
  const [localKm, setLocalKm] = useState(15);
  const [plausibleOnly, setPlausibleOnly] = useState(false);

  useEffect(() => {
    fetch('/data/dashboard.json?v=senasa-all-2')
      .then((response) => {
        if (!response.ok) throw new Error('No se pudieron cargar los datos.');
        return response.json();
      })
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Error de carga'));
  }, []);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const selectedYears = year === 'all' ? data.years : [Number(year)];
    setRecordsLoading(true);
    Promise.all(selectedYears.map(async (selectedYear) => {
      const cached = recordCache.current.get(selectedYear);
      if (cached) return cached;
      const response = await fetch(`${data.recordFiles[String(selectedYear)]}?v=senasa-all-2`);
      if (!response.ok) throw new Error(`No se pudieron cargar los datos de ${selectedYear}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
      const loaded = isGzip
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json() as RouteRecord[]
        : JSON.parse(new TextDecoder().decode(bytes)) as RouteRecord[];
      recordCache.current.set(selectedYear, loaded);
      return loaded;
    }))
      .then((parts) => { if (!cancelled) setRecords(parts.flat()); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Error de carga'); })
      .finally(() => { if (!cancelled) setRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [data, year]);

  useEffect(() => {
    type ModelContext = { registerTool: (tool: Record<string, unknown>, options?: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = {
      name: 'configure_transport_model',
      title: 'Configurar modelo de transporte',
      description: 'Actualiza el perfil vehicular, el factor vial, la distancia local y el filtro de cargas plausibles del dashboard.',
      inputSchema: {
        type: 'object',
        properties: {
          vehicle: { type: 'string', enum: ['light', 'medium', 'heavy'] },
          circuity: { type: 'number', minimum: 1, maximum: 1.6 },
          localKm: { type: 'number', minimum: 1, maximum: 60 },
          plausibleOnly: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const next = input as { vehicle?: string; circuity?: number; localKm?: number; plausibleOnly?: boolean };
        if (next.vehicle && !['light', 'medium', 'heavy'].includes(next.vehicle)) throw new Error('Perfil vehicular inválido');
        if (next.circuity !== undefined && (next.circuity < 1 || next.circuity > 1.6)) throw new Error('Factor vial fuera de rango');
        if (next.localKm !== undefined && (next.localKm < 1 || next.localKm > 60)) throw new Error('Distancia local fuera de rango');
        if (next.vehicle) setVehicle(next.vehicle);
        if (next.circuity !== undefined) setCircuity(next.circuity);
        if (next.localKm !== undefined) setLocalKm(next.localKm);
        if (next.plausibleOnly !== undefined) setPlausibleOnly(next.plausibleOnly);
        return { status: 'updated', ...next };
      },
    };
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    } catch {
      // WebMCP is optional in browsers that do not yet expose the registry.
    }
    return () => lifecycle.abort();
  }, []);

  const factor = data?.factors.find((item) => item.id === vehicle)?.gPerTkm ?? 210;
  const productOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(records.filter((item) => group === 'all' || item.g === group).map((item) => item.p))].sort();
  }, [data, records, group]);
  const originDepartmentOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(records.filter((item) => originProvince === 'all' || item.op === originProvince).map((item) => item.od))].sort();
  }, [data, records, originProvince]);
  const destinationDepartmentOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(records.filter((item) => destinationProvince === 'all' || item.dp === destinationProvince).map((item) => item.dd))].sort();
  }, [data, records, destinationProvince]);

  useEffect(() => {
    if (product !== 'all' && !productOptions.includes(product)) setProduct('all');
  }, [product, productOptions]);
  useEffect(() => {
    if (originDepartment !== 'all' && !originDepartmentOptions.includes(originDepartment)) setOriginDepartment('all');
  }, [originDepartment, originDepartmentOptions]);
  useEffect(() => {
    if (destinationDepartment !== 'all' && !destinationDepartmentOptions.includes(destinationDepartment)) setDestinationDepartment('all');
  }, [destinationDepartment, destinationDepartmentOptions]);

  const summary = useMemo(() => {
    if (!data) return null;
    const routeMap = new Map<string, RouteSummary>();
    const productRouteMap = new Map<string, ProductRouteSummary>();
    const annual = new Map<number, { trips: number; mass: number; tkm: number }>();
    const groups = new Map<string, { trips: number; mass: number; tkm: number }>();
    const products = new Map<string, { trips: number; mass: number; tkm: number }>();
    const originDepartments = new Map<string, { name: string; mass: number }>();
    const destinationDepartments = new Map<string, { name: string; mass: number }>();
    const tripRows: FilteredTripRow[] = [];
    let trips = 0, mass = 0, tkm = 0, tripKm = 0;
    for (const item of records) {
      if (year !== 'all' && item.y !== Number(year)) continue;
      if (group !== 'all' && item.g !== group) continue;
      if (product !== 'all' && item.p !== product) continue;
      if (originProvince !== 'all' && item.op !== originProvince) continue;
      if (originDepartment !== 'all' && item.od !== originDepartment) continue;
      if (destinationProvince !== 'all' && item.dp !== destinationProvince) continue;
      if (destinationDepartment !== 'all' && item.dd !== destinationDepartment) continue;
      const n = plausibleOnly ? item.np : item.n;
      const m = plausibleOnly ? item.mp : item.m;
      if (!n || !m) continue;
      const distance = item.same ? localKm : item.km * circuity;
      const activity = m * distance;
      tripRows.push({
        key: `${item.y}|${item.mo}|${item.g}|${item.p}|${item.op}|${item.od}|${item.olat}|${item.olon}|${item.oq}|${item.dp}|${item.dd}|${item.dlat}|${item.dlon}|${item.dq}|${item.km}|${item.same}`,
        year: item.y, month: item.mo, group: item.g, product: item.p,
        op: item.op, od: item.od, dp: item.dp, dd: item.dd,
        trips: n, mass: m, distance, emissions: activity * factor / 1_000_000,
      });
      trips += n; mass += m; tkm += activity; tripKm += n * distance;
      const annualItem = annual.get(item.y) ?? { trips: 0, mass: 0, tkm: 0 };
      annualItem.trips += n; annualItem.mass += m; annualItem.tkm += activity; annual.set(item.y, annualItem);
      const groupItem = groups.get(item.g) ?? { trips: 0, mass: 0, tkm: 0 };
      groupItem.trips += n; groupItem.mass += m; groupItem.tkm += activity; groups.set(item.g, groupItem);
      const productItem = products.get(item.p) ?? { trips: 0, mass: 0, tkm: 0 };
      productItem.trips += n; productItem.mass += m; productItem.tkm += activity; products.set(item.p, productItem);
      const originKey = `${item.op}|${item.od}`;
      const originItem = originDepartments.get(originKey) ?? { name: `${item.od} · ${item.op}`, mass: 0 };
      originItem.mass += m; originDepartments.set(originKey, originItem);
      const destinationKey = `${item.dp}|${item.dd}`;
      const destinationItem = destinationDepartments.get(destinationKey) ?? { name: `${item.dd} · ${item.dp}`, mass: 0 };
      destinationItem.mass += m; destinationDepartments.set(destinationKey, destinationItem);
      const key = `${item.op}|${item.od}|${item.dp}|${item.dd}`;
      const route = routeMap.get(key) ?? {
        key, op: item.op, od: item.od, dp: item.dp, dd: item.dd,
        olat: item.olat, olon: item.olon, dlat: item.dlat, dlon: item.dlon,
        trips: 0, mass: 0, distance, tkm: 0, emissions: 0,
      };
      route.trips += n; route.mass += m; route.tkm += activity; routeMap.set(key, route);
      const productRouteKey = `${item.p}|${key}`;
      const productRoute = productRouteMap.get(productRouteKey) ?? {
        key: productRouteKey, product: item.p,
        op: item.op, od: item.od, dp: item.dp, dd: item.dd,
        olat: item.olat, olon: item.olon, dlat: item.dlat, dlon: item.dlon,
        trips: 0, mass: 0, distance, tkm: 0, emissions: 0,
      };
      productRoute.trips += n; productRoute.mass += m; productRoute.tkm += activity;
      productRouteMap.set(productRouteKey, productRoute);
    }
    const emissions = tkm * factor / 1_000_000;
    const routes = [...routeMap.values()].map((route) => ({ ...route, emissions: route.tkm * factor / 1_000_000 }))
      .sort((a, b) => b.emissions - a.emissions);
    const productRoutes = [...productRouteMap.values()].map((route) => ({ ...route, emissions: route.tkm * factor / 1_000_000 }))
      .sort((a, b) => b.emissions - a.emissions);
    return {
      trips, mass, tkm, emissions,
      avgDistance: trips ? tripKm / trips : 0,
      avgKgTrip: trips ? emissions * 1000 / trips : 0,
      kgPerTonne: mass ? emissions * 1000 / mass : 0,
      annual: [...annual].sort(([a], [b]) => a - b).map(([y, value]) => ({ year: String(y), emissions: value.tkm * factor / 1_000_000, trips: value.trips })),
      groups: [...groups].map(([name, value]) => ({ name, emissions: value.tkm * factor / 1_000_000, trips: value.trips })).sort((a, b) => b.emissions - a.emissions),
      products: [...products].map(([name, value]) => ({ name, emissions: value.tkm * factor / 1_000_000, trips: value.trips, mass: value.mass })).sort((a, b) => b.emissions - a.emissions),
      originDepartments: [...originDepartments].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.mass - a.mass),
      destinationDepartments: [...destinationDepartments].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.mass - a.mass),
      routes, productRoutes,
      tripRows: tripRows.sort((a, b) => b.year - a.year || b.month - a.month || b.emissions - a.emissions),
    };
  }, [data, records, year, group, product, originProvince, originDepartment, destinationProvince, destinationDepartment, plausibleOnly, localKm, circuity, factor]);

  const groupOverview = useMemo(() => {
    if (!data) return [];
    const overview = new Map<string, { trips: number; mass: number; tkm: number }>();
    for (const item of records) {
      if (year !== 'all' && item.y !== Number(year)) continue;
      if (originProvince !== 'all' && item.op !== originProvince) continue;
      if (originDepartment !== 'all' && item.od !== originDepartment) continue;
      if (destinationProvince !== 'all' && item.dp !== destinationProvince) continue;
      if (destinationDepartment !== 'all' && item.dd !== destinationDepartment) continue;
      const n = plausibleOnly ? item.np : item.n;
      const m = plausibleOnly ? item.mp : item.m;
      if (!n || !m) continue;
      const distance = item.same ? localKm : item.km * circuity;
      const value = overview.get(item.g) ?? { trips: 0, mass: 0, tkm: 0 };
      value.trips += n; value.mass += m; value.tkm += m * distance; overview.set(item.g, value);
    }
    return [...overview].map(([name, value]) => ({ name, emissions: value.tkm * factor / 1_000_000, trips: value.trips, mass: value.mass })).sort((a, b) => b.emissions - a.emissions);
  }, [data, records, year, originProvince, originDepartment, destinationProvince, destinationDepartment, plausibleOnly, localKm, circuity, factor]);

  function selectGroup(name: string) {
    setGroup(name);
    setProduct('all');
    window.requestAnimationFrame(() => document.getElementById('product-drilldown')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  if (error) return <StateMessage title="No se pudo abrir el dashboard" detail={error} />;
  if (!data || recordsLoading || !summary) return <StateMessage title="Preparando el análisis territorial" detail="Procesando rutas, cargas y factores de emisión…" />;

  const geocodingCoverage = data.meta.geocodedRows / data.meta.includedRows * 100;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        <section className="mb-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Filter label="Año" value={year} onChange={setYear} options={data.years.map(String)} allLabel="Todos los años" />
            <Filter label="Grupo de productos" value={group} onChange={setGroup} options={data.groups} allLabel="Todos los grupos" />
            <Filter label="Producto específico" value={product} onChange={setProduct} options={productOptions} allLabel="Todos los productos" />
            <Filter label="Perfil vehicular" value={vehicle} onChange={setVehicle} options={data.factors.map((item) => item.id)} labels={Object.fromEntries(data.factors.map((item) => [item.id, item.label]))} allLabel="" hideAll />
          </div>
          <div className="mt-4 grid items-stretch gap-3 xl:grid-cols-[1fr_auto_1fr]">
            <TerritoryFilterGroup title="Origen" marker="A">
              <Filter label="Provincia" value={originProvince} onChange={(value) => { setOriginProvince(value); setOriginDepartment('all'); }} options={data.originProvinces} allLabel="Todas las provincias" />
              <Filter label="Partido / departamento" value={originDepartment} onChange={setOriginDepartment} options={originDepartmentOptions} allLabel="Todos los partidos" />
            </TerritoryFilterGroup>
            <div className="hidden items-center justify-center xl:flex" aria-hidden="true"><ArrowRight className="size-5 text-primary/60" /></div>
            <TerritoryFilterGroup title="Destino" marker="B">
              <Filter label="Provincia" value={destinationProvince} onChange={(value) => { setDestinationProvince(value); setDestinationDepartment('all'); }} options={data.destinationProvinces} allLabel="Todas las provincias" />
              <Filter label="Partido / departamento" value={destinationDepartment} onChange={setDestinationDepartment} options={destinationDepartmentOptions} allLabel="Todos los partidos" />
            </TerritoryFilterGroup>
          </div>
          <div className="mt-4 grid gap-5 border-t border-border pt-4 md:grid-cols-[1fr_1fr_auto] md:items-center">
            <RangeControl label="Factor de distancia vial" value={`${circuity.toFixed(2)}×`} min={1} max={1.6} step={0.05} current={circuity} onChange={setCircuity} />
            <RangeControl label="Viaje dentro del departamento" value={`${localKm} km`} min={1} max={60} step={1} current={localKm} onChange={setLocalKm} />
            <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl bg-muted px-4 py-2.5 text-sm font-medium md:min-w-56">
              Sólo cargas ≤ 60 t
              <Switch checked={plausibleOnly} onCheckedChange={setPlausibleOnly} aria-label="Filtrar cargas plausibles" />
            </label>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric icon={RouteIcon} label="Registros analizados" value={compact(summary.trips)} detail={`${format1.format(summary.avgDistance)} km promedio`} />
          <Metric icon={Scale} label="Carga transportada" value={adaptiveMass(summary.mass)} detail={`${adaptiveMass(summary.mass / summary.trips)} por registro`} />
          <Metric icon={Truck} label="Actividad logística" value={adaptiveActivity(summary.tkm)} detail={`${format0.format(factor)} gCO₂e/t·km`} />
          <Metric icon={Leaf} label="Huella estimada" value={adaptiveEmissions(summary.emissions)} detail={`${adaptiveEmissions(summary.emissions / summary.trips)} por registro`} accent />
          <Metric icon={Database} label="Intensidad" value={`${format2.format(summary.kgPerTonne)} kg`} detail="CO₂e por tonelada transportada" />
        </section>

        <section className="mt-4 grid items-stretch gap-4 xl:grid-cols-2">
          <GroupOverview groups={groupOverview} selected={group} onSelect={selectGroup} />
          <RouteMap routes={summary.routes} />
        </section>

        <section id="product-drilldown" className="mt-4 scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Drill-down · grupo → producto → recorrido</p>
              <h2 className="mt-1 text-2xl font-semibold">{group === 'all' ? 'Todos los productos SENASA' : group}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {product === 'all' ? 'Seleccioná un producto para que todo el tablero profundice en él.' : `Detalle activo: ${product}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {group !== 'Tubérculos y bulbos' && <Button variant="outline" onClick={() => { setGroup('Tubérculos y bulbos'); setProduct('all'); }}>Explorar tubérculos y bulbos</Button>}
              {product !== 'all' && <Button variant="outline" onClick={() => setProduct('all')}>Volver al grupo</Button>}
            </div>
          </div>
          <div className="grid xl:grid-cols-[0.78fr_1.22fr]">
            <article className="border-b border-border p-5 xl:border-b-0 xl:border-r">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div><p className="text-sm font-medium text-primary">Aporte por producto</p><h3 className="mt-1 text-lg font-semibold">Productos que explican la huella</h3></div>
                <span className="text-xs text-muted-foreground">tCO₂e</span>
              </div>
              <div className="h-[340px] min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={summary.products.slice(0, 10)} layout="vertical" margin={{ left: 12, right: 18 }}>
                    <CartesianGrid horizontal={false} stroke="#d6edf6" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#62869a', fontSize: 11 }} tickFormatter={(value) => compact(value)} />
                    <YAxis type="category" dataKey="name" width={105} axisLine={false} tickLine={false} tick={{ fill: '#294b60', fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip unit="tCO₂e" />} cursor={{ fill: '#f0f9fd' }} />
                    <Bar dataKey="emissions" radius={[0, 6, 6, 0]} fill="#79bfdd" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {summary.products.slice(0, 6).map((item, index) => (
                  <button key={item.name} onClick={() => setProduct(item.name)} className={`rounded-xl border px-3 py-2 text-left transition hover:border-primary ${product === item.name ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <span className="block truncate text-sm font-medium">{index + 1}. {item.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{adaptiveEmissions(item.emissions)} · {format1.format(item.emissions / summary.emissions * 100)}%</span>
                  </button>
                ))}
              </div>
            </article>
            <ProductRoutesTable routes={summary.productRoutes.slice(0, 12)} totalEmissions={summary.emissions} />
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-2">
          <DepartmentMassChart
            eyebrow="Distribución territorial · origen"
            title="Toneladas por partido de origen"
            data={summary.originDepartments}
            color="#8fcbe3"
          />
          <DepartmentMassChart
            eyebrow="Distribución territorial · destino"
            title="Toneladas por partido de destino"
            data={summary.destinationDepartments}
            color="#5aa8cc"
          />
        </section>

        <section className="mt-4">
          <article className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-4">
              <p className="text-sm font-medium text-primary">Evolución anual</p>
              <h2 className="mt-1 text-xl font-semibold">Emisiones por año</h2>
            </div>
            <div className="h-[330px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={summary.annual} margin={{ top: 10, right: 6, left: 2, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#d6edf6" />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#62869a', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#62869a', fontSize: 12 }} tickFormatter={(value) => `${format1.format(value / 1_000_000)}M`} width={54} />
                  <Tooltip content={<ChartTooltip unit="tCO₂e" />} cursor={{ fill: '#f0f9fd' }} />
                  <Bar dataKey="emissions" radius={[6, 6, 0, 0]} fill="#5aa8cc" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="mt-4">
          <RoutesTable routes={summary.routes.slice(0, 12)} />
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <MethodCard number="01" title="Masa" text="Se usa PESO TOTAL como kilogramos y se convierte a toneladas. El control de calidad puede excluir cargas mayores a 60 t." />
          <MethodCard number="02" title="Distancia" text={`Centroides oficiales GeoRef. Distancia geodésica × ${circuity.toFixed(2)}; dentro del mismo departamento se asumen ${localKm} km.`} />
          <MethodCard number="03" title="Emisiones" text={`Masa (t) × distancia (km) × ${format0.format(factor)} gCO₂e/t·km. Resultado WTW expresado en tCO₂e.`} />
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-[#eef8fc] p-5 text-foreground shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <div>
              <p className="text-sm font-medium text-primary">Calidad y alcance</p>
              <h2 className="mt-1 text-2xl font-semibold">Qué representa esta estimación</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Quality value={`${format2.format(geocodingCoverage)}%`} label="movimientos SENASA geocodificados" />
              <Quality value={compact(data.meta.plausibleRows)} label="cargas entre 0 y 60 toneladas" />
              <Quality value={compact(data.meta.sameAreaRows)} label="registros dentro del mismo departamento" />
            </div>
          </div>
          <div className="mt-6 grid gap-4 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground md:grid-cols-2">
            <p><strong className="text-foreground">Limitación territorial.</strong> Las coordenadas son centroides, no domicilios reales. El resultado es una aproximación de orden de magnitud y subestima o sobreestima rutas concretas.</p>
            <p><strong className="text-foreground">Cobertura de fuente.</strong> La base integra las 23 particiones disponibles y coincide con los 8.506.233 movimientos informados por Qlik. El año 2026 está actualizado hasta el 03/09.</p>
          </div>
        </section>

        <FilteredTripsTable rows={summary.tripRows} totalTrips={summary.trips} />

        <footer className="flex flex-col gap-3 py-6 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
          <p>Fuentes: SENASA DTV-e · GeoRef Argentina · metodología HUELLA.docx.pdf (GLEC v3.0 / ISO 14083).</p>
          <div className="flex flex-wrap gap-4">
            <a className="underline decoration-border underline-offset-4 hover:text-foreground" href="https://qliksensebycores.senasa.gob.ar/sense/app/2c5b45af-04a5-42e6-be1d-2424656625de/sheet/c8f024ca-17d6-40b6-ac4f-13737142fa34/state/analysis" target="_blank" rel="noreferrer">Tablero SENASA</a>
            <a className="underline decoration-border underline-offset-4 hover:text-foreground" href="https://www.argentina.gob.ar/georef" target="_blank" rel="noreferrer">GeoRef</a>
            <a className="underline decoration-border underline-offset-4 hover:text-foreground" href="https://www.smartfreightcentre.org/documents/328/GLEC_FRAMEWORK_v3_UPDATED_02_04_24.pdf" target="_blank" rel="noreferrer">GLEC Framework</a>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Filter({ label, value, onChange, options, allLabel, labels = {}, hideAll = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; allLabel: string; labels?: Record<string, string>; hideAll?: boolean }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="h-10 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent>{!hideAll && <SelectItem value="all">{allLabel}</SelectItem>}{options.map((option) => <SelectItem key={option} value={option}>{labels[option] ?? option}</SelectItem>)}</SelectContent></Select></label>;
}

function TerritoryFilterGroup({ title, marker, children }: { title: string; marker: string; children: React.ReactNode }) {
  return <fieldset className="rounded-2xl border border-[#c8e6f1] bg-[#f4fbfe] p-3">
    <legend className="sr-only">{title}</legend>
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><span className="grid size-6 place-items-center rounded-full bg-[#d9f0f8] font-mono text-xs">{marker}</span>{title}</div>
    <div className="grid gap-3 sm:grid-cols-2">{children}</div>
  </fieldset>;
}

function GroupOverview({ groups, selected, onSelect }: { groups: { name: string; emissions: number; trips: number; mass: number }[]; selected: string; onSelect: (name: string) => void }) {
  const total = groups.reduce((sum, item) => sum + item.emissions, 0);
  const max = groups[0]?.emissions || 1;
  return <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-medium text-primary">Vista general</p><h2 className="mt-1 text-xl font-semibold">Emisiones por grupo de productos</h2><p className="mt-1 text-sm text-muted-foreground">Elegí un grupo para ver sus productos y recorridos.</p></div>
      {selected !== 'all' && <Button variant="outline" onClick={() => onSelect('all')}>Ver todos los grupos</Button>}
    </div>
    {groups.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">
      {groups.map((item, index) => <button key={item.name} type="button" aria-pressed={selected === item.name} onClick={() => onSelect(item.name)} className={`group rounded-xl border p-3 text-left transition hover:border-primary hover:bg-primary/[.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected === item.name ? 'border-primary bg-primary/[.05]' : 'border-border'}`}>
        <div className="flex items-start justify-between gap-3"><span className="text-sm font-semibold">{index + 1}. {item.name}</span><span className="shrink-0 font-mono text-sm font-semibold text-primary">{adaptiveEmissions(item.emissions)}</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-[#a9d9ea] to-primary transition-all group-hover:brightness-105" style={{ width: `${Math.max(2, item.emissions / max * 100)}%` }} /></div>
        <div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground"><span>{format1.format(item.emissions / total * 100)}% del total</span><span>{compact(item.trips)} registros</span></div>
      </button>)}
    </div> : <p className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">No hay movimientos para los filtros territoriales y temporales elegidos.</p>}
  </section>;
}

function DepartmentMassChart({ eyebrow, title, data, color }: { eyebrow: string; title: string; data: { key: string; name: string; mass: number }[]; color: string }) {
  const visible = data.slice(0, 12);
  return <article className="min-w-0 rounded-2xl border border-border bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-primary">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">Partido/departamento y provincia · según los filtros activos</p></div>
      <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Top {visible.length}</span>
    </div>
    {visible.length ? <div className="h-[390px] min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={visible} layout="vertical" margin={{ top: 2, right: 18, left: 10, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="#d6edf6" />
          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#62869a', fontSize: 11 }} tickFormatter={(value) => compact(value)} />
          <YAxis type="category" dataKey="name" width={150} axisLine={false} tickLine={false} tick={{ fill: '#294b60', fontSize: 11 }} />
          <Tooltip content={<ChartTooltip unit="t" />} cursor={{ fill: '#f0f9fd' }} />
          <Bar dataKey="mass" radius={[0, 6, 6, 0]} fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No hay toneladas para los filtros elegidos.</p>}
  </article>;
}

function RangeControl({ label, value, min, max, step, current, onChange }: { label: string; value: string; min: number; max: number; step: number; current: number; onChange: (value: number) => void }) {
  return <label className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-sm font-medium"><span>{label}</span><span className="font-mono text-primary">{value}</span><Slider className="col-span-2" min={min} max={max} step={step} value={[current]} onValueChange={(values) => onChange(Array.isArray(values) ? values[0] : Number(values))} /></label>;
}

function Metric({ icon: Icon, label, value, detail, accent = false }: { icon: typeof Leaf; label: string; value: string; detail: string; accent?: boolean }) {
  return <article className={`rounded-2xl border p-4 shadow-sm ${accent ? 'border-[#9fd2e5] bg-[#eaf7fc]' : 'border-border bg-white'}`}><div className="flex items-center justify-between"><span className="text-sm font-medium text-muted-foreground">{label}</span><Icon className="size-4 text-primary" /></div><p className={`mt-4 text-[clamp(1.6rem,2vw,2.1rem)] font-semibold tracking-[-0.045em] ${accent ? 'text-[#205f7d]' : ''}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}

function RouteMap({ routes }: { routes: RouteSummary[] }) {
  const [geography, setGeography] = useState<GeoFeatureCollection | null>(null);
  useEffect(() => {
    fetch('/data/provincias.geojson').then((response) => response.json()).then(setGeography).catch(() => setGeography(null));
  }, []);
  const project = (lat: number, lon: number) => ({ x: (lon + 74) / 21.5 * 700 + 30, y: (-lat - 20.5) / 35 * 620 + 48 });
  const provincePaths = useMemo(() => {
    if (!geography) return [];
    return geography.features.map((feature) => {
      const polygons = feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates as number[][][]]
        : feature.geometry.coordinates as number[][][][];
      const path = polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([lon, lat], index) => {
        const point = project(lat, lon);
        return `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      }).join('') + 'Z')).join('');
      return { id: feature.properties.id, name: feature.properties.nombre, path };
    });
  }, [geography]);
  const { origins, destinations } = useMemo(() => {
    const originMap = new Map<string, { key: string; name: string; province: string; lat: number; lon: number; mass: number }>();
    const destinationMap = new Map<string, { key: string; name: string; province: string; lat: number; lon: number; mass: number }>();
    for (const route of routes) {
      const originKey = `${route.op}|${route.od}`;
      const origin = originMap.get(originKey) ?? { key: originKey, name: route.od, province: route.op, lat: route.olat, lon: route.olon, mass: 0 };
      origin.mass += route.mass; originMap.set(originKey, origin);
      const destinationKey = `${route.dp}|${route.dd}`;
      const destination = destinationMap.get(destinationKey) ?? { key: destinationKey, name: route.dd, province: route.dp, lat: route.dlat, lon: route.dlon, mass: 0 };
      destination.mass += route.mass; destinationMap.set(destinationKey, destination);
    }
    return { origins: [...originMap.values()], destinations: [...destinationMap.values()] };
  }, [routes]);
  const flowRoutes = routes.slice(0, 60);
  const maxEmission = flowRoutes[0]?.emissions || 1;
  const maxNodeMass = Math.max(...origins.map((point) => point.mass), ...destinations.map((point) => point.mass), 1);
  const nodeRadius = (mass: number, maxMass: number) => 2.5 + 18 * Math.sqrt(mass / maxMass);
  return <article className="relative min-h-[560px] overflow-hidden rounded-2xl border border-border bg-[#f4fbfe] p-5 text-foreground shadow-sm">
    <div className="relative z-10 flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-primary">Mapa de flujos</p><h2 className="mt-1 text-xl font-semibold">Rutas y volumen transportado</h2><p className="mt-1 text-xs text-muted-foreground">Área de cada punto proporcional a los kilos enviados o recibidos</p></div><span className="rounded-full border border-border bg-white px-3 py-1 text-xs text-muted-foreground">Top {flowRoutes.length} rutas</span></div>
    <svg viewBox="0 0 760 700" className="absolute inset-x-0 bottom-0 h-[500px] w-full" role="img" aria-label="Mapa de Argentina con rutas de productos SENASA y nodos proporcionales al peso transportado">
      <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(75,159,197,.09)" /></pattern><clipPath id="argentina-map-clip"><rect x="0" y="0" width="760" height="700" /></clipPath></defs>
      <rect width="760" height="700" fill="url(#grid)" />
      <g clipPath="url(#argentina-map-clip)">{provincePaths.map((province) => <path key={province.id} d={province.path} fill="#dceff6" stroke="#80bdd6" strokeWidth="1"><title>{province.name}</title></path>)}</g>
      <g>{flowRoutes.slice().reverse().map((route) => { const a=project(route.olat,route.olon), b=project(route.dlat,route.dlon); const bend=Math.min(70,Math.abs(b.x-a.x)*.18+18); return <path key={route.key} d={`M${a.x},${a.y} Q${(a.x+b.x)/2},${(a.y+b.y)/2-bend} ${b.x},${b.y}`} fill="none" stroke="#3d91b7" strokeOpacity={.16 + .62*Math.sqrt(route.emissions/maxEmission)} strokeWidth={.8 + 4.5*Math.sqrt(route.emissions/maxEmission)}><title>{route.od}, {route.op} → {route.dd}, {route.dp}: {format1.format(route.mass * 1000)} kg · {adaptiveEmissions(route.emissions)}</title></path>;})}</g>
      <g>{destinations.slice().sort((a,b) => b.mass-a.mass).reverse().map((point) => { const p=project(point.lat,point.lon); return <circle key={point.key} cx={p.x} cy={p.y} r={nodeRadius(point.mass,maxNodeMass)} fill="#8ed5e9" fillOpacity=".72" stroke="#27799f" strokeWidth="1"><title>Destino · {point.name}, {point.province}: {format0.format(point.mass * 1000)} kg recibidos</title></circle>;})}</g>
      <g>{origins.slice().sort((a,b) => b.mass-a.mass).reverse().map((point) => { const p=project(point.lat,point.lon); return <circle key={point.key} cx={p.x} cy={p.y} r={nodeRadius(point.mass,maxNodeMass)} fill="#ffffff" fillOpacity=".85" stroke="#4b9fc5" strokeWidth="2"><title>Origen · {point.name}, {point.province}: {format0.format(point.mass * 1000)} kg enviados</title></circle>;})}</g>
      <text x="28" y="42" fill="#527a8e" fontSize="12">N</text><path d="M32 54V82M32 54l-5 8M32 54l5 8" stroke="#527a8e" fill="none" />
    </svg>
    <div className="absolute bottom-4 left-5 z-10 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><i className="size-3 rounded-full border-2 border-[#4b9fc5] bg-white" />Kg enviados</span><span className="flex items-center gap-2"><i className="size-3 rounded-full border border-[#27799f] bg-[#8ed5e9]" />Kg recibidos</span><span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-[#3d91b7]" />Flujo</span></div>
  </article>;
}

function RoutesTable({ routes }: { routes: RouteSummary[] }) {
  return <article className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm"><div className="flex items-center justify-between p-5"><div><p className="text-sm font-medium text-primary">Corredores</p><h2 className="mt-1 text-xl font-semibold">Rutas con mayor huella</h2></div><Info className="size-5 text-muted-foreground" /></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-border bg-muted/70 text-xs uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="px-5 py-3 font-semibold">Ruta</th><th className="px-3 py-3 text-right font-semibold">Registros</th><th className="px-3 py-3 text-right font-semibold">Dist.</th><th className="px-3 py-3 text-right font-semibold">Carga</th><th className="px-5 py-3 text-right font-semibold">Huella</th></tr></thead><tbody>{routes.map((route) => <tr key={route.key} className="border-b border-border/70 last:border-0"><td className="px-5 py-3"><div className="flex items-center gap-2 font-medium"><span className="max-w-40 truncate">{route.od}</span><ArrowRight className="size-3.5 shrink-0 text-muted-foreground" /><span className="max-w-40 truncate">{route.dd}</span></div><div className="mt-0.5 text-xs text-muted-foreground">{route.op} → {route.dp}</div></td><td className="px-3 py-3 text-right font-mono">{format0.format(route.trips)}</td><td className="px-3 py-3 text-right font-mono">{format0.format(route.distance)} km</td><td className="px-3 py-3 text-right font-mono">{adaptiveMass(route.mass)}</td><td className="px-5 py-3 text-right font-mono font-semibold text-primary">{adaptiveEmissions(route.emissions)}</td></tr>)}</tbody></table></div></article>;
}

function ProductRoutesTable({ routes, totalEmissions }: { routes: ProductRouteSummary[]; totalEmissions: number }) {
  return <article className="min-w-0">
    <div className="flex items-center justify-between p-5 pb-4">
      <div><p className="text-sm font-medium text-primary">Producto × corredor</p><h3 className="mt-1 text-lg font-semibold">Recorridos con mayor huella</h3></div>
      <Info className="size-5 text-muted-foreground" />
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-y border-border bg-muted/70 text-xs uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="px-5 py-3 font-semibold">Producto</th><th className="px-3 py-3 font-semibold">Recorrido</th><th className="px-3 py-3 text-right font-semibold">Registros</th><th className="px-3 py-3 text-right font-semibold">Dist.</th><th className="px-3 py-3 text-right font-semibold">Huella</th><th className="px-5 py-3 text-right font-semibold">Aporte</th></tr></thead>
        <tbody>{routes.map((route) => <tr key={route.key} className="border-b border-border/70 last:border-0"><td className="px-5 py-3 font-medium text-primary">{route.product}</td><td className="px-3 py-3"><div className="flex items-center gap-2 font-medium"><span className="max-w-36 truncate">{route.od}</span><ArrowRight className="size-3.5 shrink-0 text-muted-foreground" /><span className="max-w-36 truncate">{route.dd}</span></div><div className="mt-0.5 text-xs text-muted-foreground">{route.op} → {route.dp}</div></td><td className="px-3 py-3 text-right font-mono">{format0.format(route.trips)}</td><td className="px-3 py-3 text-right font-mono">{format0.format(route.distance)} km</td><td className="px-3 py-3 text-right font-mono font-semibold">{adaptiveEmissions(route.emissions)}</td><td className="px-5 py-3 text-right font-mono text-muted-foreground">{format1.format(route.emissions / totalEmissions * 100)}%</td></tr>)}</tbody>
      </table>
    </div>
  </article>;
}

function FilteredTripsTable({ rows, totalTrips }: { rows: FilteredTripRow[]; totalTrips: number }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  useEffect(() => setPage(1), [rows, pageSize]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const first = rows.length ? (safePage - 1) * pageSize + 1 : 0;
  const last = Math.min(safePage * pageSize, rows.length);
  return <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
    <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-medium text-primary">Detalle completo del filtro</p><h2 className="mt-1 text-xl font-semibold">Listado de registros incluidos</h2><p className="mt-1 text-sm text-muted-foreground">Cada fila agrupa registros del mismo mes, producto y corredor. En conjunto representan {format0.format(totalTrips)} filas de detalle SENASA.</p></div>
      <label className="flex items-center gap-3 text-sm font-medium">Filas por página<Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}><SelectTrigger className="w-24 bg-background"><SelectValue /></SelectTrigger><SelectContent>{[25,50,100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select></label>
    </div>
    <div className="overflow-x-auto border-y border-border">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="bg-muted/70 text-xs uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Período</th><th className="px-3 py-3 font-semibold">Grupo / producto</th><th className="px-3 py-3 font-semibold">Origen</th><th className="px-3 py-3 font-semibold">Destino</th><th className="px-3 py-3 text-right font-semibold">Registros</th><th className="px-3 py-3 text-right font-semibold">Carga</th><th className="px-3 py-3 text-right font-semibold">Distancia</th><th className="px-4 py-3 text-right font-semibold">Huella</th></tr></thead>
        <tbody>{visibleRows.map((row) => <tr key={row.key} className="border-t border-border/70"><td className="whitespace-nowrap px-4 py-3 font-mono">{String(row.month).padStart(2, '0')}/{row.year}</td><td className="px-3 py-3"><div className="font-medium">{row.product}</div><div className="mt-0.5 text-xs text-muted-foreground">{row.group}</div></td><td className="px-3 py-3"><div className="font-medium">{row.od}</div><div className="mt-0.5 text-xs text-muted-foreground">{row.op}</div></td><td className="px-3 py-3"><div className="font-medium">{row.dd}</div><div className="mt-0.5 text-xs text-muted-foreground">{row.dp}</div></td><td className="px-3 py-3 text-right font-mono">{format0.format(row.trips)}</td><td className="px-3 py-3 text-right font-mono">{adaptiveMass(row.mass)}</td><td className="px-3 py-3 text-right font-mono">{format1.format(row.distance)} km</td><td className="px-4 py-3 text-right font-mono font-semibold text-primary">{adaptiveEmissions(row.emissions)}</td></tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Mostrando {format0.format(first)}–{format0.format(last)} de {format0.format(rows.length)} filas agregadas</p><div className="flex gap-2"><Button variant="outline" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><span className="grid min-w-24 place-items-center text-sm font-medium">{safePage} / {pageCount}</span><Button variant="outline" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</Button></div></div>
  </section>;
}

function MethodCard({ number, title, text }: { number: string; title: string; text: string }) {
  return <article className="rounded-2xl border border-border bg-white p-5 shadow-sm"><span className="font-mono text-sm font-semibold text-primary">{number}</span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></article>;
}

function Quality({ value, label }: { value: string; label: string }) {
  return <div><p className="text-2xl font-semibold text-primary">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></div>;
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { value: number }[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  const value = unit === 'tCO₂e' ? adaptiveEmissions(payload[0].value) : `${format1.format(payload[0].value)} ${unit}`;
  return <div className="rounded-lg border border-border bg-white px-3 py-2 text-sm shadow-lg"><p className="font-medium">{label}</p><p className="mt-1 text-primary">{value}</p></div>;
}

function StateMessage({ title, detail }: { title: string; detail: string }) {
  return <main className="grid min-h-screen place-items-center bg-background p-6"><div className="max-w-md rounded-2xl border border-border bg-white p-8 text-center shadow-sm"><span className="mx-auto grid size-12 place-items-center rounded-xl bg-primary text-white"><Leaf /></span><h1 className="mt-5 text-2xl font-semibold">{title}</h1><p className="mt-2 text-muted-foreground">{detail}</p></div></main>;
}

function compact(value: number) {
  return new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}
