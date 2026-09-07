'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  Info,
  Server,
  Truck,
} from 'lucide-react';
import { InternalLink } from '@/components/internal-link';
import { SiteHeader } from '@/components/site-header';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  calculateScenario,
  type ScenarioPoint,
} from '@/lib/emissions/scenario';

type RouteRecord = {
  y: number;
  g: string;
  p: string;
  dp: string;
  dd: string;
  km: number;
  same: number;
  n: number;
  m: number;
  np: number;
  mp: number;
};
type DashboardData = {
  factors: { id: string; label: string; gPerTkm: number }[];
  years: number[];
  recordFiles: Record<string, string>;
};
type ScopeType = 'product' | 'group';

const countries: { id: string; name: string; carbon?: number }[] = [
  { id: 'AR', name: 'Argentina · supuesto del manuscrito', carbon: 320 },
  { id: 'BR', name: 'Brasil · intensidad manual' },
  { id: 'CL', name: 'Chile · intensidad manual' },
  { id: 'UY', name: 'Uruguay · intensidad manual' },
  { id: 'PY', name: 'Paraguay · intensidad manual' },
  { id: 'US', name: 'Estados Unidos · intensidad manual' },
  { id: 'DE', name: 'Alemania · intensidad manual' },
  { id: 'FR', name: 'Francia · intensidad manual' },
  { id: 'ES', name: 'España · intensidad manual' },
  { id: 'CUSTOM', name: 'Otro país · intensidad manual' },
];

const aiModels = [
  {
    id: 'smollm',
    name: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    wh: 7.708,
    detail: 'Generación de texto · GPU · febrero de 2025',
  },
  {
    id: 'llama3',
    name: 'meta-llama/Meta-Llama-3-8B',
    wh: 17.333,
    detail: 'Generación de texto · GPU · febrero de 2025',
  },
  {
    id: 'mistral',
    name: 'mistralai/Mistral-7B-v0.1',
    wh: 19.13,
    detail: 'Generación de texto · GPU · febrero de 2025',
  },
  {
    id: 'phi4',
    name: 'microsoft/phi-4',
    wh: 28.741,
    detail: 'Generación de texto · GPU · febrero de 2025',
  },
  {
    id: 'qwq',
    name: 'Qwen/QwQ-32B-Preview',
    wh: 54.556,
    detail: 'Generación de texto · GPU · febrero de 2025',
  },
  {
    id: 'paper-light',
    name: 'Perfil ilustrativo ligero',
    wh: 1.5,
    detail: 'Escenario hipotético del manuscrito',
  },
  {
    id: 'paper-standard',
    name: 'Perfil ilustrativo estándar',
    wh: 15,
    detail: 'Escenario hipotético del manuscrito',
  },
  {
    id: 'paper-heavy',
    name: 'Perfil ilustrativo intensivo',
    wh: 80,
    detail: 'Escenario hipotético del manuscrito',
  },
];

const format = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('es-AR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const formatGrams = (value: number) => `${compact.format(value)} g`;

export default function SimulatorPage() {
  const [meta, setMeta] = useState<DashboardData | null>(null);
  const [records, setRecords] = useState<RouteRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [objective, setObjective] = useState('');
  const [year, setYear] = useState('');
  const [scopeType, setScopeType] = useState<ScopeType>('product');
  const [scopeValue, setScopeValue] = useState('');
  const [province, setProvince] = useState('');
  const [department, setDepartment] = useState('');
  const [conventionalVehicle, setConventionalVehicle] = useState('medium');
  const [localVehicle, setLocalVehicle] = useState('light');
  const [circuity, setCircuity] = useState(1.25);
  const [sameAreaKm, setSameAreaKm] = useState(15);
  const [demand, setDemand] = useState(10);
  const [averageKg, setAverageKg] = useState(20);
  const [conversion, setConversion] = useState(20);
  const [localKmMin, setLocalKmMin] = useState(5);
  const [localKmMax, setLocalKmMax] = useState(15);
  const [selectedTransactions, setSelectedTransactions] = useState(0);
  const [plausibleOnly, setPlausibleOnly] = useState(true);
  const [serverPower, setServerPower] = useState(60);
  const [hours, setHours] = useState(720);
  const [serverPue, setServerPue] = useState(1.2);
  const [serverCountry, setServerCountry] = useState('AR');
  const [serverCarbon, setServerCarbon] = useState(320);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiModel, setAiModel] = useState('smollm');
  const [inferencesPerAttempt, setInferencesPerAttempt] = useState(2);
  const [aiCountry, setAiCountry] = useState('AR');
  const [aiCarbon, setAiCarbon] = useState(320);

  useEffect(() => {
    fetch('/data/dashboard.json?v=sim-2')
      .then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar el catálogo SENASA.');
        return r.json();
      })
      .then((raw: unknown) => {
        const value = raw as DashboardData;
        setMeta(value);
        const currentYear = new Date().getFullYear();
        const closed = value.years.filter((item) => item < currentYear);
        setYear(String(closed.at(-1) ?? value.years.at(-1) ?? ''));
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Error de carga');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!meta || !year) return;
    let active = true;
    fetch(`${meta.recordFiles[year]}?v=sim-2`)
      .then(async (r) => {
        if (!r.ok)
          throw new Error(`No se pudieron cargar los datos de ${year}.`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        return bytes[0] === 0x1f && bytes[1] === 0x8b
          ? new Response(
              new Blob([bytes])
                .stream()
                .pipeThrough(new DecompressionStream('gzip')),
            ).json()
          : JSON.parse(new TextDecoder().decode(bytes));
      })
      .then((v) => {
        if (active) setRecords(v as RouteRecord[]);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Error de carga');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [meta, year]);

  const scopeOptions = useMemo(
    () =>
      [
        ...new Set(
          records
            .map((r) => (scopeType === 'product' ? r.p : r.g))
            .filter(Boolean),
        ),
      ].sort(),
    [records, scopeType],
  );
  const provinces = useMemo(
    () =>
      scopeValue
        ? [
            ...new Set(
              records
                .filter((r) =>
                  scopeType === 'product'
                    ? r.p === scopeValue
                    : r.g === scopeValue,
                )
                .map((r) => r.dp)
                .filter(Boolean),
            ),
          ].sort()
        : [],
    [records, scopeType, scopeValue],
  );
  const departments = useMemo(
    () =>
      scopeValue && province
        ? [
            ...new Set(
              records
                .filter(
                  (r) =>
                    (scopeType === 'product'
                      ? r.p === scopeValue
                      : r.g === scopeValue) && r.dp === province,
                )
                .map((r) => r.dd)
                .filter(Boolean),
            ),
          ].sort()
        : [],
    [records, scopeType, scopeValue, province],
  );
  const conventionalFactor =
    meta?.factors.find((f) => f.id === conventionalVehicle)?.gPerTkm ?? 210;
  const localFactor =
    meta?.factors.find((f) => f.id === localVehicle)?.gPerTkm ?? 750;
  const reference = useMemo(() => {
    let mass = 0,
      emissionsKg = 0,
      weightedKm = 0,
      rows = 0,
      trips = 0;
    if (!scopeValue || !province || !department)
      return {
        mass,
        emissionsKg,
        weightedKm,
        trips,
        rows,
        kgPerTonne: 0,
        avgKm: 0,
      };
    for (const r of records) {
      const inScope =
        scopeType === 'product' ? r.p === scopeValue : r.g === scopeValue;
      if (!inScope || r.dp !== province || r.dd !== department) continue;
      const m = plausibleOnly ? r.mp : r.m;
      const n = plausibleOnly ? r.np : r.n;
      if (!(m > 0) || !(n > 0)) continue;
      const distance = r.same ? sameAreaKm : r.km * circuity;
      mass += m;
      weightedKm += m * distance;
      emissionsKg += (m * distance * conventionalFactor) / 1000;
      rows += 1;
      trips += n;
    }
    return {
      mass,
      emissionsKg,
      weightedKm,
      trips,
      rows,
      kgPerTonne: mass ? emissionsKg / mass : 0,
      avgKm: mass ? weightedKm / mass : 0,
    };
  }, [
    records,
    scopeType,
    scopeValue,
    province,
    department,
    plausibleOnly,
    sameAreaKm,
    circuity,
    conventionalFactor,
  ]);

  const selectedAi = aiModels.find((m) => m.id === aiModel) ?? aiModels[0];
  const scenario = useMemo(
    () =>
      calculateScenario({
        demandTonnes: demand,
        conventionalKgPerTonne: reference.kgPerTonne,
        averageKgPerTransaction: averageKg,
        conversionPct: conversion,
        localDistanceMinKm: localKmMin,
        localDistanceMaxKm: localKmMax,
        localFactorGPerTkm: localFactor,
        serverPowerW: serverPower,
        serverHours: hours,
        serverPue,
        serverCarbonGPerKwh: serverCarbon,
        inferenceWhPerThousand: aiEnabled ? selectedAi.wh : 0,
        inferencesPerAttempt: aiEnabled ? inferencesPerAttempt : 0,
        aiCarbonGPerKwh: aiCarbon,
        aiCorrection: 1,
        aiPue: 1,
      }),
    [
      demand,
      reference.kgPerTonne,
      averageKg,
      conversion,
      localKmMin,
      localKmMax,
      localFactor,
      serverPower,
      hours,
      serverPue,
      serverCarbon,
      aiEnabled,
      selectedAi.wh,
      inferencesPerAttempt,
      aiCarbon,
    ],
  );

  const selected = Math.min(selectedTransactions, scenario.maximumTransactions);
  const point = scenario.evaluate(selected);
  const convergence = scenario.convergenceTransactions;
  const equilibrium = scenario.climateEquilibriumTransactions;
  const convergenceReachable =
    convergence !== null && convergence <= scenario.maximumTransactions;
  const equilibriumReachable =
    equilibrium !== null && equilibrium <= scenario.maximumTransactions;
  const ready =
    !loading &&
    reference.mass > 0 &&
    demand > 0 &&
    averageKg > 0 &&
    conversion > 0 &&
    conversion <= 100 &&
    localKmMin >= 0 &&
    localKmMax >= localKmMin;
  const invalidDistance = localKmMax < localKmMin;

  const resetTerritory = (type: ScopeType) => {
    setScopeType(type);
    setScopeValue('');
    setProvince('');
    setDepartment('');
    setSelectedTransactions(0);
  };
  const changeCountry = (id: string, kind: 'server' | 'ai') => {
    const country = countries.find((item) => item.id === id);
    if (!country) return;
    if (kind === 'server') {
      setServerCountry(id);
      if (country.carbon !== undefined) setServerCarbon(country.carbon);
    } else {
      setAiCountry(id);
      if (country.carbon !== undefined) setAiCarbon(country.carbon);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fcfe] text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-[1580px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Calculator className="size-4" /> Simulador de proximidad
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Balance entre transporte y tecnología
            </h1>
            <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">
              Evaluá cuántas operaciones locales hacen falta para compensar la
              infraestructura digital y reducir la huella del abastecimiento.
            </p>
          </div>
          <InternalLink
            href="/#fuentes"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Consultar fuentes y límites
          </InternalLink>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[440px_1fr]">
          <aside className="space-y-4 xl:sticky xl:top-20">
            <Panel number="01" title="Objetivo y referencia" icon={<Truck />}>
              <TextField
                label="Objetivo"
                description="Explique qué alimento o grupo se quiere proveer mediante un circuito local asistido por tecnología."
                value={objective}
                onChange={setObjective}
                placeholder="Describa el cambio de abastecimiento que desea evaluar"
              />
              <Picker
                label="Año SENASA"
                description="Período utilizado para construir la referencia de transporte convencional."
                value={year}
                onChange={(value) => {
                  setLoading(true);
                  setYear(value);
                  setScopeValue('');
                  setProvince('');
                  setDepartment('');
                }}
                options={(meta?.years ?? []).map(String)}
                placeholder="Seleccione el período"
              />
              <Picker
                label="Nivel de análisis"
                description="Permite evaluar una denominación específica o todo un grupo de productos."
                value={scopeType}
                onChange={(value) => resetTerritory(value as ScopeType)}
                options={['product', 'group']}
                labels={{
                  product: 'Producto específico',
                  group: 'Grupo de productos',
                }}
              />
              <Picker
                label={
                  scopeType === 'product'
                    ? 'Producto específico'
                    : 'Grupo de productos'
                }
                description="La lista conserva la nomenclatura original del conjunto SENASA."
                value={scopeValue}
                onChange={(value) => {
                  setScopeValue(value);
                  setProvince('');
                  setDepartment('');
                  setSelectedTransactions(0);
                }}
                options={scopeOptions}
                placeholder="Seleccione el alimento analizado"
              />
              <Picker
                label="Provincia de destino"
                description="Provincia de consumo cuyo abastecimiento convencional se toma como referencia."
                value={province}
                onChange={(value) => {
                  setProvince(value);
                  setDepartment('');
                  setSelectedTransactions(0);
                }}
                options={provinces}
                placeholder="Seleccione la provincia de consumo"
                disabled={!scopeValue}
              />
              <Picker
                label="Partido o departamento"
                description="Unidad territorial utilizada para estimar la intensidad convencional."
                value={department}
                onChange={(value) => {
                  setDepartment(value);
                  setSelectedTransactions(0);
                }}
                options={departments}
                placeholder="Seleccione el distrito de consumo"
                disabled={!province}
              />
              <Picker
                label="Vehículo convencional"
                description="Factor de emisión aplicado a los recorridos registrados por SENASA."
                value={conventionalVehicle}
                onChange={setConventionalVehicle}
                options={(meta?.factors ?? []).map((f) => f.id)}
                labels={Object.fromEntries(
                  (meta?.factors ?? []).map((f) => [
                    f.id,
                    `${f.label} · ${f.gPerTkm} g/t·km`,
                  ]),
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Factor vial"
                  description="Ajusta la distancia geodésica para aproximar un recorrido por ruta."
                  value={circuity}
                  onChange={setCircuity}
                  step="0.05"
                />
                <NumberField
                  label="Viaje dentro del distrito"
                  description="Distancia asignada cuando origen y destino están en el mismo distrito."
                  suffix="km"
                  value={sameAreaKm}
                  onChange={setSameAreaKm}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-secondary/55 px-3 py-2.5 text-sm font-medium">
                <span>Sólo cargas ≤ 60 t</span>
                <Switch
                  aria-label="Sólo cargas de hasta 60 toneladas"
                  checked={plausibleOnly}
                  onCheckedChange={setPlausibleOnly}
                />
              </div>
            </Panel>

            <Panel number="02" title="Operación local" icon={<CheckCircle2 />}>
              <NumberField
                label="Demanda del período"
                description="Toneladas actualmente abastecidas que podrían pasar al circuito local."
                suffix="t"
                value={demand}
                onChange={setDemand}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Kg por transacción"
                  description="Peso promedio entregado en cada compra concretada por la plataforma."
                  suffix="kg"
                  value={averageKg}
                  onChange={setAverageKg}
                />
                <NumberField
                  label="Conversión"
                  description="Porcentaje de intentos que terminan en una compra local."
                  suffix="%"
                  value={conversion}
                  onChange={setConversion}
                  max={100}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Distancia mínima"
                  description="Menor recorrido vial esperado entre proveedor y comprador."
                  suffix="km"
                  value={localKmMin}
                  onChange={setLocalKmMin}
                />
                <NumberField
                  label="Distancia máxima"
                  description="Mayor recorrido admitido para considerar una entrega como local."
                  suffix="km"
                  value={localKmMax}
                  onChange={setLocalKmMax}
                  invalid={invalidDistance}
                />
              </div>
              {invalidDistance && (
                <p className="text-xs font-medium text-red-700">
                  La distancia máxima debe ser igual o mayor que la mínima.
                </p>
              )}
              <Picker
                label="Vehículo local"
                description="Factor de emisión utilizado para los traslados concretados mediante la plataforma."
                value={localVehicle}
                onChange={setLocalVehicle}
                options={(meta?.factors ?? []).map((f) => f.id)}
                labels={Object.fromEntries(
                  (meta?.factors ?? []).map((f) => [
                    f.id,
                    `${f.label} · ${f.gPerTkm} g/t·km`,
                  ]),
                )}
              />
            </Panel>

            <Panel number="03" title="Infraestructura" icon={<Server />}>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Potencia media"
                  description="Potencia atribuible a esta aplicación, no la potencia nominal del equipo."
                  suffix="W"
                  value={serverPower}
                  onChange={setServerPower}
                />
                <NumberField
                  label="Horas del período"
                  description="Tiempo durante el cual la infraestructura permanece operativa."
                  suffix="h"
                  value={hours}
                  onChange={setHours}
                />
              </div>
              <Picker
                label="País del servidor"
                description="Ubicación cuya matriz eléctrica se aplica al consumo del servidor."
                value={serverCountry}
                onChange={(value) => changeCountry(value, 'server')}
                options={countries.map((c) => c.id)}
                labels={Object.fromEntries(
                  countries.map((c) => [c.id, c.name]),
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Intensidad eléctrica"
                  description="Emisiones de la electricidad consumida por el servidor."
                  suffix="g/kWh"
                  value={serverCarbon}
                  onChange={setServerCarbon}
                />
                <NumberField
                  label="PUE"
                  description="Relación entre energía total del centro de datos y energía informática."
                  value={serverPue}
                  onChange={setServerPue}
                  step="0.05"
                />
              </div>
            </Panel>

            <Panel
              number="04"
              title="Inteligencia artificial"
              icon={<BrainCircuit />}
            >
              <div className="flex items-center justify-between rounded-xl bg-secondary/55 px-3 py-2.5 text-sm font-medium">
                <span>Incluir inferencias de IA</span>
                <Switch
                  aria-label="Incluir inferencias de IA"
                  checked={aiEnabled}
                  onCheckedChange={setAiEnabled}
                />
              </div>
              {aiEnabled && (
                <>
                  <Picker
                    label="Modelo o perfil"
                    description="Consumo de referencia por cada mil inferencias según el perfil elegido."
                    value={aiModel}
                    onChange={setAiModel}
                    options={aiModels.map((m) => m.id)}
                    labels={Object.fromEntries(
                      aiModels.map((m) => [m.id, m.name]),
                    )}
                  />
                  <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
                    {selectedAi.detail} · {format.format(selectedAi.wh)}{' '}
                    Wh/1.000 inferencias.
                  </p>
                  <NumberField
                    label="Inferencias por intento"
                    description="Cantidad media de inferencias realizadas por cada interacción, exitosa o no."
                    value={inferencesPerAttempt}
                    onChange={setInferencesPerAttempt}
                  />
                  <Picker
                    label="País de ejecución de IA"
                    description="Matriz eléctrica aplicada al procesamiento del modelo."
                    value={aiCountry}
                    onChange={(value) => changeCountry(value, 'ai')}
                    options={countries.map((c) => c.id)}
                    labels={Object.fromEntries(
                      countries.map((c) => [c.id, c.name]),
                    )}
                  />
                  <NumberField
                    label="Intensidad eléctrica IA"
                    description="Emisiones de la electricidad utilizada para ejecutar el modelo."
                    suffix="g/kWh"
                    value={aiCarbon}
                    onChange={setAiCarbon}
                  />
                  <Notice>
                    La referencia de IA mide principalmente GPU; CPU, RAM, red y
                    almacenamiento no se incluyen en este modo base.
                  </Notice>
                </>
              )}
            </Panel>
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="rounded-2xl border border-primary/25 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">
                Objetivo evaluado
              </p>
              <p className="mt-2 text-xl font-semibold">
                {objective ||
                  'Defina un objetivo para identificar el escenario'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {department && province
                  ? `Referencia territorial: ${department}, ${province}.`
                  : 'Seleccione un alimento y un distrito de destino. Ningún territorio está preseleccionado.'}
              </p>
            </div>
            {loading ? (
              <EmptyState
                title="Cargando la referencia territorial"
                detail="Estamos preparando el catálogo del período seleccionado."
              />
            ) : !scopeValue || !province || !department ? (
              <EmptyState
                title="Seleccione el escenario de referencia"
                detail="Elija un producto o grupo, una provincia y un partido o departamento para comenzar."
              />
            ) : reference.mass <= 0 ? (
              <Notice tone="error">
                No hay masa utilizable para esta combinación. Seleccione otro
                alimento, grupo o territorio.
              </Notice>
            ) : !ready ? (
              <Notice tone="error">
                Revise la demanda, el peso por transacción, la conversión y el
                rango de distancia antes de calcular.
              </Notice>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Metric
                    label="Referencia inicial"
                    value={formatGrams(scenario.baselineG)}
                    detail="Logística convencional del período"
                  />
                  <Metric
                    label="Huella fija"
                    value={formatGrams(scenario.serverG)}
                    detail="Servidor antes de la primera operación"
                  />
                  <Metric
                    label="Traslados máximos"
                    value={integer.format(scenario.maximumTransactions)}
                    detail={`${format.format(averageKg)} kg por transacción`}
                  />
                  <CriticalMetric
                    label="Convergencia"
                    transactions={convergence}
                    reachable={convergenceReachable}
                  />
                  <CriticalMetric
                    label="Equilibrio climático"
                    transactions={equilibrium}
                    reachable={equilibriumReachable}
                  />
                </div>

                <article className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-primary">
                        Curvas por operación concretada
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        Cuándo la proximidad compensa la tecnología
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        La banda celeste representa el rango de distancia local;
                        la línea utiliza su punto medio.
                      </p>
                    </div>
                    <div
                      className={`rounded-xl px-4 py-3 text-sm font-semibold ${point.netSaving >= 0 ? 'bg-cyan-50 text-cyan-900' : 'bg-amber-50 text-amber-900'}`}
                    >
                      Balance en {integer.format(selected)} traslados:{' '}
                      {point.netSaving >= 0 ? '+' : ''}
                      {formatGrams(point.netSaving)}
                    </div>
                  </div>
                  <div className="mt-5 h-[460px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={scenario.points}
                        margin={{ top: 24, right: 20, left: 14, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#d8ebf3" />
                        <XAxis
                          type="number"
                          dataKey="localTransactions"
                          domain={[0, scenario.maximumTransactions]}
                          tickFormatter={(value) => compact.format(value)}
                          label={{
                            value: 'Traslados locales concretados',
                            position: 'insideBottom',
                            offset: -3,
                          }}
                          height={50}
                        />
                        <YAxis
                          tickFormatter={(value) => compact.format(value)}
                          label={{
                            value: 'g CO₂e',
                            angle: -90,
                            position: 'insideLeft',
                          }}
                          width={72}
                        />
                        <Tooltip content={<ScenarioTooltip />} />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="platformRange"
                          name="Rango de distancia local"
                          fill="#bfeaf6"
                          fillOpacity={0.55}
                          stroke="none"
                          legendType="none"
                        />
                        <Line
                          type="monotone"
                          dataKey="platform"
                          name="Solución TI + transporte local"
                          stroke="#0785ad"
                          strokeWidth={3}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="conventionalRemaining"
                          name="Logística tradicional restante"
                          stroke="#df7b42"
                          strokeWidth={3}
                          dot={false}
                        />
                        {convergenceReachable && (
                          <>
                            <ReferenceLine
                              x={convergence!}
                              stroke="#0b607a"
                              strokeDasharray="5 4"
                              label={{
                                value: 'Convergencia',
                                position: 'insideTopLeft',
                                fill: '#0b607a',
                              }}
                            />
                            <ReferenceDot
                              x={convergence!}
                              y={scenario.evaluate(convergence!).platform}
                              r={5}
                              fill="#0b607a"
                              stroke="#fff"
                              strokeWidth={2}
                            />
                          </>
                        )}
                        {equilibriumReachable && (
                          <>
                            <ReferenceLine
                              x={equilibrium!}
                              stroke="#76528f"
                              strokeDasharray="3 4"
                              label={{
                                value: 'Equilibrio climático',
                                position: 'insideTopRight',
                                fill: '#76528f',
                              }}
                            />
                            <ReferenceDot
                              x={equilibrium!}
                              y={scenario.evaluate(equilibrium!).platform}
                              r={5}
                              fill="#76528f"
                              stroke="#fff"
                              strokeWidth={2}
                            />
                          </>
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span>Traslados locales concretados</span>
                      <span className="font-semibold text-primary">
                        {integer.format(selected)} ·{' '}
                        {format.format(point.substitutedKg)} kg sustituidos
                      </span>
                    </div>
                    <Slider
                      aria-label="Traslados locales concretados"
                      className="mt-3"
                      value={[selected]}
                      onValueChange={(value) =>
                        setSelectedTransactions(
                          Array.isArray(value) ? value[0] : value,
                        )
                      }
                      min={0}
                      max={scenario.maximumTransactions}
                      step={1}
                    />
                  </div>
                </article>

                <div className="grid gap-4 md:grid-cols-2">
                  <Breakdown
                    title="Operación seleccionada"
                    rows={[
                      ['Traslados concretados', point.localTransactions, ''],
                      ['Intentos requeridos', point.attempts, ''],
                      ['Inferencias totales', point.inferenceCount, ''],
                      ['Masa sustituida', point.substitutedKg, ' kg'],
                      ['Adopción de la demanda', point.adoptionPct, ' %'],
                    ]}
                  />
                  <Breakdown
                    title="Balance de emisiones"
                    rows={[
                      [
                        'Logística tradicional restante',
                        point.conventionalRemaining,
                        ' g CO₂e',
                      ],
                      ['Transporte local', point.localTransport, ' g CO₂e'],
                      ['Servidor', point.server, ' g CO₂e'],
                      ['IA', point.ai, ' g CO₂e'],
                      ['Total del escenario', point.totalScenario, ' g CO₂e'],
                      ['Ahorro neto', point.netSaving, ' g CO₂e'],
                    ]}
                  />
                </div>
                <Notice>
                  <strong>Lectura:</strong> la convergencia iguala las dos
                  líneas visibles. El equilibrio climático ocurre cuando las
                  emisiones añadidas por tecnología y reparto local igualan las
                  emisiones convencionales evitadas.
                </Notice>
                <Notice>
                  <strong>Alcance:</strong> estimación de transporte y operación
                  digital. No incluye producción agrícola, frío, desperdicio,
                  fabricación de equipos ni confirma que cada operación elimine
                  un viaje convencional completo.
                </Notice>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Panel({
  number,
  title,
  icon,
  children,
}: {
  number: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-lg bg-secondary text-sm font-semibold text-primary">
          {number}
        </span>
        <h2 className="flex flex-1 items-center gap-2 font-semibold">
          {title}
          <span className="ml-auto text-primary [&_svg]:size-4">{icon}</span>
        </h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
function TextField({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Field label={label} description={description}>
      <Input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
function Picker({
  label,
  description,
  value,
  onChange,
  options,
  labels = {},
  placeholder = 'Seleccione una opción',
  disabled = false,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} description={description}>
      <Select
        value={value || null}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label} className="w-full bg-white">
          <SelectValue>
            {value ? (labels[value] ?? value) : placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option] ?? option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
function NumberField({
  label,
  description,
  value,
  onChange,
  suffix,
  step = '1',
  max,
  invalid = false,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: string;
  max?: number;
  invalid?: boolean;
}) {
  return (
    <Field label={label} description={description}>
      <div className="relative">
        <Input
          aria-label={label}
          aria-invalid={invalid}
          type="number"
          min="0"
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(Number(event.target.value))}
          className={suffix ? 'pr-16' : ''}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </article>
  );
}
function CriticalMetric({
  label,
  transactions,
  reachable,
}: {
  label: string;
  transactions: number | null;
  reachable: boolean;
}) {
  return (
    <Metric
      label={label}
      value={
        reachable ? integer.format(Math.ceil(transactions!)) : 'No alcanzable'
      }
      detail={
        transactions === null
          ? 'No existe con estos parámetros'
          : reachable
            ? 'traslados locales estimados'
            : 'Supera la demanda definida'
      }
    />
  );
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-primary/35 bg-white p-8 text-center">
      <div>
        <Calculator className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-xl font-semibold">{title}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}
function Notice({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'error';
}) {
  return (
    <div
      className={`mt-4 flex gap-3 rounded-xl border p-3 text-sm leading-relaxed ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-primary/20 bg-secondary/55 text-muted-foreground'}`}
    >
      {tone === 'error' ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
      )}
      <p>{children}</p>
    </div>
  );
}
function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: [string, number, string][];
}) {
  return (
    <article className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-4 divide-y divide-border">
        {rows.map(([label, value, suffix], index) => (
          <div
            key={label}
            className={`flex items-center justify-between gap-4 py-2.5 text-sm ${index === rows.length - 1 ? 'font-semibold' : ''}`}
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono">
              {value >= 0 && label === 'Ahorro neto' ? '+' : ''}
              {format.format(value)}
              {suffix}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
function ScenarioTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ScenarioPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="min-w-64 rounded-xl border border-border bg-white p-3 text-xs shadow-xl">
      <p className="mb-2 font-semibold">
        {integer.format(point.localTransactions)} traslados concretados
      </p>
      <TooltipRow
        label="Masa sustituida"
        value={`${format.format(point.substitutedKg)} kg`}
      />
      <TooltipRow
        label="Intentos requeridos"
        value={format.format(point.attempts)}
      />
      <TooltipRow
        label="Inferencias"
        value={format.format(point.inferenceCount)}
      />
      <TooltipRow
        label="Solución TI + local"
        value={formatGrams(point.platform)}
      />
      <TooltipRow
        label="Logística restante"
        value={formatGrams(point.conventionalRemaining)}
      />
      <TooltipRow
        label="Ahorro neto"
        value={`${point.netSaving >= 0 ? '+' : ''}${formatGrams(point.netSaving)}`}
      />
    </div>
  );
}
function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-5 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
