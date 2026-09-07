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
import { measureTransport } from '@/lib/emissions/transport';

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
  meta: { sourceUpdated: string };
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
const formatEmissions = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000)
    return `${format.format(value / 1_000_000)} t CO₂e`;
  if (absolute >= 1_000) return `${format.format(value / 1_000)} kg CO₂e`;
  return `${format.format(value)} g CO₂e`;
};
const formatMass = (tonnes: number) =>
  tonnes >= 1000
    ? `${format.format(tonnes / 1000)} kt`
    : `${format.format(tonnes)} t`;

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
  const [localAvailableTonnes, setLocalAvailableTonnes] = useState(10);
  const [averageKg, setAverageKg] = useState(20);
  const [conversion, setConversion] = useState(20);
  const [localKmMin, setLocalKmMin] = useState(5);
  const [localKmMax, setLocalKmMax] = useState(15);
  const [selectedTransactions, setSelectedTransactions] = useState(0);
  const [plausibleOnly, setPlausibleOnly] = useState(false);
  const [serverPower, setServerPower] = useState(60);
  const [hoursPerMonth, setHoursPerMonth] = useState(720);
  const [serverPue, setServerPue] = useState(1.2);
  const [serverCountry, setServerCountry] = useState('AR');
  const [serverCarbon, setServerCarbon] = useState(320);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiModel, setAiModel] = useState('smollm');
  const [inferencesPerAttempt, setInferencesPerAttempt] = useState(2);
  const [aiCountry, setAiCountry] = useState('AR');
  const [aiCarbon, setAiCarbon] = useState(320);
  const [equilibriumZoom, setEquilibriumZoom] = useState(true);

  useEffect(() => {
    fetch('/data/dashboard.json?v=sim-3')
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
    fetch(`${meta.recordFiles[year]}?v=sim-3`)
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

  const sourceDate = meta
    ? new Date(`${meta.meta.sourceUpdated}T00:00:00`)
    : null;
  const selectedYear = Number(year);
  const isPartialYear = Boolean(
    sourceDate &&
    selectedYear === sourceDate.getFullYear() &&
    sourceDate.getMonth() < 11,
  );
  const periodMonths = isPartialYear ? sourceDate!.getMonth() + 1 : 12;
  const yearLabels = Object.fromEntries(
    (meta?.years ?? []).map((item) => [
      String(item),
      sourceDate &&
      item === sourceDate.getFullYear() &&
      sourceDate.getMonth() < 11
        ? `${item} · parcial (${sourceDate.getMonth() + 1} meses)`
        : `${item} · año completo`,
    ]),
  );
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
      emissionsG = 0,
      weightedKm = 0,
      rows = 0,
      trips = 0,
      activity = 0;
    if (!scopeValue || !province || !department)
      return {
        mass,
        emissionsG,
        weightedKm,
        trips,
        rows,
        activity,
        kgPerTonne: 0,
        avgKm: 0,
      };
    for (const r of records) {
      const inScope =
        scopeType === 'product' ? r.p === scopeValue : r.g === scopeValue;
      if (!inScope || r.dp !== province || r.dd !== department) continue;
      const measure = measureTransport(r, {
        plausibleOnly,
        circuity,
        sameAreaKm,
        factorGPerTkm: conventionalFactor,
      });
      if (!measure) continue;
      mass += measure.massTonnes;
      emissionsG += measure.emissionsG;
      weightedKm += measure.massTonnes * measure.distanceKm;
      activity += measure.activityTonneKm;
      trips += measure.trips;
      rows += 1;
    }
    return {
      mass,
      emissionsG,
      weightedKm,
      trips,
      rows,
      activity,
      kgPerTonne: mass ? emissionsG / 1000 / mass : 0,
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
        referenceMassTonnes: reference.mass,
        conventionalBaselineG: reference.emissionsG,
        localAvailableTonnes,
        averageKgPerTransaction: averageKg,
        conversionPct: conversion,
        localDistanceMinKm: localKmMin,
        localDistanceMaxKm: localKmMax,
        localFactorGPerTkm: localFactor,
        serverPowerW: serverPower,
        serverHoursPerMonth: hoursPerMonth,
        periodMonths,
        serverPue,
        serverCarbonGPerKwh: serverCarbon,
        inferenceWhPerThousand: aiEnabled ? selectedAi.wh : 0,
        inferencesPerAttempt: aiEnabled ? inferencesPerAttempt : 0,
        aiCarbonGPerKwh: aiCarbon,
        aiCorrection: 1,
        aiPue: 1,
      }),
    [
      reference.mass,
      reference.emissionsG,
      localAvailableTonnes,
      averageKg,
      conversion,
      localKmMin,
      localKmMax,
      localFactor,
      serverPower,
      hoursPerMonth,
      periodMonths,
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
  const equilibrium = scenario.climateEquilibriumTransactions;
  const equilibriumReachable =
    equilibrium !== null && equilibrium <= scenario.maximumTransactions;
  const equilibriumPoint = equilibriumReachable
    ? scenario.evaluate(equilibrium!)
    : null;
  const maximumPoint = scenario.evaluate(scenario.maximumTransactions);
  const maximumReductionPct = scenario.baselineG
    ? (maximumPoint.netSaving / scenario.baselineG) * 100
    : 0;
  const equilibriumLimit =
    equilibriumZoom && equilibriumReachable
      ? Math.min(
          scenario.maximumTransactions,
          Math.max(50, Math.ceil(equilibrium! * 2.5)),
        )
      : scenario.maximumTransactions;
  const equilibriumPoints = useMemo(
    () => samplePoints(equilibriumLimit, scenario.evaluate),
    [equilibriumLimit, scenario],
  );
  const compositionPoints = useMemo(
    () => samplePoints(scenario.maximumTransactions, scenario.evaluate),
    [scenario],
  );
  const invalidDistance = localKmMax < localKmMin;
  const ready =
    !loading &&
    reference.mass > 0 &&
    localAvailableTonnes > 0 &&
    averageKg > 0 &&
    conversion > 0 &&
    conversion <= 100 &&
    !invalidDistance;

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
      <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Calculator className="size-4" /> Simulador territorial
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Balance anual de emisiones para circuitos de proximidad basados en
              tecnología de la información
            </h1>
            <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">
              La referencia completa surge de los movimientos SENASA del
              alimento y distrito seleccionados.
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
            <Panel number="01" title="Referencia SENASA" icon={<Truck />}>
              <TextField
                label="Objetivo"
                description="Explique qué alimento o grupo se quiere proveer mediante un circuito local asistido por tecnología."
                value={objective}
                onChange={setObjective}
                placeholder="Describa el cambio de abastecimiento que desea evaluar"
              />
              <Picker
                label="Año SENASA"
                description="Define el período de movimientos y el tiempo atribuible a la infraestructura."
                value={year}
                onChange={(value) => {
                  setLoading(true);
                  setYear(value);
                  setScopeValue('');
                  setProvince('');
                  setDepartment('');
                }}
                options={(meta?.years ?? []).map(String)}
                labels={yearLabels}
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
                description="Provincia cuyo abastecimiento registrado se toma como referencia."
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
                description="Unidad territorial de destino incluida en la estimación."
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
                description="Factor aplicado tanto en el dashboard como en esta referencia."
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
                  description="Ajusta la distancia geodésica para aproximar la ruta."
                  value={circuity}
                  onChange={setCircuity}
                  step="0.05"
                />
                <NumberField
                  label="Viaje en el distrito"
                  description="Distancia asignada a movimientos internos."
                  suffix="km"
                  value={sameAreaKm}
                  onChange={setSameAreaKm}
                />
              </div>
              <div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/55 px-3 py-2.5 text-sm font-medium">
                  <span>Sólo cargas ≤ 60 t</span>
                  <Switch
                    aria-label="Sólo cargas de hasta 60 toneladas"
                    checked={plausibleOnly}
                    onCheckedChange={setPlausibleOnly}
                  />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  El valor inicial coincide con el dashboard para que ambas
                  páginas comparen la misma muestra.
                </p>
              </div>
            </Panel>
            <Panel number="02" title="Plataforma local" icon={<CheckCircle2 />}>
              <NumberField
                label="Toneladas disponibles localmente"
                description="Oferta máxima que puede sustituir movimientos convencionales durante el período. Por encima de este valor no se descuentan más emisiones."
                suffix="t"
                value={localAvailableTonnes}
                onChange={setLocalAvailableTonnes}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Kg por transacción"
                  description="Peso promedio entregado en cada compra concretada."
                  suffix="kg"
                  value={averageKg}
                  onChange={setAverageKg}
                />
                <NumberField
                  label="Conversión"
                  description="Porcentaje de intentos que terminan en una compra."
                  suffix="%"
                  value={conversion}
                  onChange={setConversion}
                  max={100}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Distancia mínima"
                  description="Menor recorrido vial local esperado."
                  suffix="km"
                  value={localKmMin}
                  onChange={setLocalKmMin}
                />
                <NumberField
                  label="Distancia máxima"
                  description="Mayor recorrido admitido como local."
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
                description="Factor aplicado al transporte de proximidad."
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
                  description="Potencia atribuible a la aplicación."
                  suffix="W"
                  value={serverPower}
                  onChange={setServerPower}
                />
                <NumberField
                  label="Horas por mes"
                  description="Se multiplican por los meses del período SENASA."
                  suffix="h"
                  value={hoursPerMonth}
                  onChange={setHoursPerMonth}
                />
              </div>
              <Picker
                label="País del servidor"
                description="Matriz eléctrica aplicada al consumo del servidor."
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
                  description="Emisiones de la electricidad consumida."
                  suffix="g/kWh"
                  value={serverCarbon}
                  onChange={setServerCarbon}
                />
                <NumberField
                  label="PUE"
                  description="Energía total del centro respecto del equipo."
                  value={serverPue}
                  onChange={setServerPue}
                  step="0.05"
                />
              </div>
              <p className="rounded-xl bg-secondary/55 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Período computado:{' '}
                <strong className="text-foreground">
                  {periodMonths} meses ·{' '}
                  {format.format(hoursPerMonth * periodMonths)} horas
                </strong>
                .{' '}
                {isPartialYear
                  ? 'El año seleccionado tiene cobertura parcial.'
                  : 'El costo mensual se contabiliza 12 veces.'}
              </p>
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
                    description="Consumo de referencia por cada mil inferencias."
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
                    description="Consultas realizadas por cada interacción, exitosa o no."
                    value={inferencesPerAttempt}
                    onChange={setInferencesPerAttempt}
                  />
                  <Picker
                    label="País de ejecución"
                    description="Matriz eléctrica aplicada a la inferencia."
                    value={aiCountry}
                    onChange={(value) => changeCountry(value, 'ai')}
                    options={countries.map((c) => c.id)}
                    labels={Object.fromEntries(
                      countries.map((c) => [c.id, c.name]),
                    )}
                  />
                  <NumberField
                    label="Intensidad eléctrica IA"
                    description="Emisiones de la electricidad utilizada por el modelo."
                    suffix="g/kWh"
                    value={aiCarbon}
                    onChange={setAiCarbon}
                  />
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
                  ? `${scopeValue} · destino ${department}, ${province} · ${year}`
                  : 'Seleccione un alimento y un distrito de destino. Ningún territorio está preseleccionado.'}
              </p>
            </div>
            {loading ? (
              <EmptyState
                title="Cargando la referencia territorial"
                detail="Estamos preparando los movimientos del período seleccionado."
              />
            ) : !scopeValue || !province || !department ? (
              <EmptyState
                title="Seleccione el escenario de referencia"
                detail="Elija un producto o grupo, una provincia y un partido o departamento para comenzar."
              />
            ) : reference.mass <= 0 ? (
              <Notice tone="error">
                No hay masa utilizable para esta combinación.
              </Notice>
            ) : !ready ? (
              <Notice tone="error">
                Revise la disponibilidad local, el peso, la conversión y el
                rango de distancia antes de calcular.
              </Notice>
            ) : (
              <>
                <article className="rounded-2xl border border-primary/25 bg-gradient-to-br from-white to-[#f0faff] p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-primary">
                        Referencia territorial SENASA
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold">
                        {scopeValue} con destino {department}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Todos los movimientos incluidos por los filtros durante{' '}
                        {year}
                        {isPartialYear ? ' (período parcial)' : ''}.
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
                      <span className="text-muted-foreground">
                        Huella convencional estimada
                      </span>
                      <strong className="ml-2 text-primary">
                        {formatEmissions(reference.emissionsG)}
                      </strong>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <MiniMetric
                      label="Carga registrada"
                      value={formatMass(reference.mass)}
                    />
                    <MiniMetric
                      label="Registros"
                      value={compact.format(reference.trips)}
                    />
                    <MiniMetric
                      label="Actividad"
                      value={`${compact.format(reference.activity)} t·km`}
                    />
                    <MiniMetric
                      label="Distancia ponderada"
                      value={`${format.format(reference.avgKm)} km`}
                    />
                    <MiniMetric
                      label="Intensidad"
                      value={`${format.format(reference.kgPerTonne)} kg/t`}
                    />
                  </div>
                </article>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="Infraestructura del período"
                    value={formatEmissions(scenario.serverG)}
                    detail={`${scenario.periodMonths} meses · ${format.format(scenario.serverHours)} horas`}
                  />
                  <Metric
                    label="Capacidad local de sustitución"
                    value={compact.format(scenario.maximumTransactions)}
                    detail={`${formatMass(scenario.maximumSubstitutableTonnes)} disponibles de ${formatMass(reference.mass)} SENASA`}
                  />
                  <CriticalMetric
                    label="Equilibrio climático"
                    transactions={equilibrium}
                    reachable={equilibriumReachable}
                    detail="Ahorro logístico = huella digital"
                  />
                  <Metric
                    label="Ahorro máximo posible"
                    value={formatEmissions(maximumPoint.netSaving)}
                    detail={`${format.format(maximumReductionPct)}% de la huella inicial con la oferta disponible`}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric
                    label="Costo fijo de TI"
                    value={formatEmissions(scenario.serverG)}
                  />
                  <MiniMetric
                    label="Costo variable de TI por operación"
                    value={formatEmissions(scenario.aiPerTransaction)}
                  />
                  <MiniMetric
                    label="Transporte de proximidad por operación"
                    value={formatEmissions(scenario.localPerTransaction)}
                  />
                  <MiniMetric
                    label="Emisiones logísticas evitadas por operación"
                    value={formatEmissions(scenario.netAvoidedPerTransaction)}
                  />
                </div>

                <ChartCard
                  eyebrow="Reducción posible"
                  title="Impacto de la solución"
                  description="Compara la huella inicial del distrito con las emisiones que permanecen al incorporar oferta de proximidad. La diferencia entre ambas curvas es el ahorro neto."
                  badge={`Reducción máxima: ${format.format(maximumReductionPct)}%`}
                >
                  <EmissionsChart
                    data={compositionPoints}
                    xKey="substitutedTonnes"
                    xLabel="Toneladas reemplazadas"
                    maxX={scenario.maximumSubstitutableTonnes}
                    lines={[
                      {
                        key: 'initialEmissions',
                        name: 'Emisiones iniciales',
                        color: '#df7b42',
                      },
                      {
                        key: 'totalScenario',
                        name: 'Emisiones con la solución',
                        color: '#167fa4',
                      },
                    ]}
                    rangeKey="totalScenarioRange"
                    rangeName="Rango por distancia de proximidad"
                    marker={null}
                  />
                </ChartCard>

                <ChartCard
                  eyebrow="Punto de equilibrio"
                  title="Balance de emisiones"
                  description="Compara la huella digital más el transporte de proximidad con las emisiones convencionales evitadas. El balance es: solución local + TI − emisiones evitadas."
                  badge={
                    equilibriumPoint
                      ? `Equilibrio: ${formatMass(equilibriumPoint.substitutedTonnes)}`
                      : 'Equilibrio no alcanzable'
                  }
                >
                  <div className="mb-3 flex items-center justify-end gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Escala del gráfico
                    </span>
                    <button
                      type="button"
                      onClick={() => setEquilibriumZoom(true)}
                      className={`rounded-full px-3 py-1.5 font-medium ${equilibriumZoom ? 'bg-primary text-white' : 'bg-secondary text-primary'}`}
                    >
                      Cerca del equilibrio
                    </button>
                    <button
                      type="button"
                      onClick={() => setEquilibriumZoom(false)}
                      className={`rounded-full px-3 py-1.5 font-medium ${!equilibriumZoom ? 'bg-primary text-white' : 'bg-secondary text-primary'}`}
                    >
                      Todo el distrito
                    </button>
                  </div>
                  <EmissionsChart
                    data={equilibriumPoints}
                    xKey="substitutedTonnes"
                    xLabel="Toneladas reemplazadas"
                    maxX={scenario.evaluate(equilibriumLimit).substitutedTonnes}
                    lines={[
                      {
                        key: 'localPlusDigital',
                        name: 'Transporte de proximidad + TI',
                        color: '#167fa4',
                      },
                      {
                        key: 'conventionalDisplaced',
                        name: 'Emisiones convencionales evitadas',
                        color: '#2d9a77',
                      },
                    ]}
                    rangeKey="localPlusDigitalRange"
                    rangeName="Rango por distancia de proximidad"
                    marker={
                      equilibriumPoint && equilibrium! <= equilibriumLimit
                        ? {
                            x: equilibriumPoint.substitutedTonnes,
                            y: equilibriumPoint.localPlusDigital,
                            label: 'Balance cero',
                            color: '#76528f',
                          }
                        : null
                    }
                  />
                </ChartCard>

                <ChartCard
                  eyebrow="Resultado acumulado"
                  title="Ahorro total"
                  description="Totaliza las emisiones netas evitadas hasta alcanzar la menor de las dos capacidades: la carga SENASA o las toneladas disponibles en proximidad."
                  badge={`${maximumPoint.netSaving >= 0 ? '+' : ''}${formatEmissions(maximumPoint.netSaving)}`}
                >
                  <EmissionsChart
                    data={compositionPoints}
                    xKey="substitutedTonnes"
                    xLabel="Toneladas reemplazadas"
                    maxX={scenario.maximumSubstitutableTonnes}
                    lines={[
                      {
                        key: 'netSaving',
                        name: 'Ahorro neto acumulado',
                        color: '#2d9a77',
                      },
                    ]}
                    rangeKey="netSavingRange"
                    rangeName="Rango de ahorro por distancia"
                    marker={null}
                  />
                </ChartCard>

                <article className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-primary">
                        Punto analizado
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        {integer.format(selected)} transacciones concretadas
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {format.format(point.substitutedKg)} kg ·{' '}
                        {format.format(point.adoptionPct)}% de la masa
                        territorial.
                      </p>
                    </div>
                    <Field
                      label="Cantidad exacta"
                      description="También puede escribirse un valor puntual."
                    >
                      <Input
                        aria-label="Cantidad exacta de transacciones"
                        type="number"
                        min="0"
                        max={scenario.maximumTransactions}
                        value={selected}
                        onChange={(event) =>
                          setSelectedTransactions(
                            Math.max(
                              0,
                              Math.min(
                                scenario.maximumTransactions,
                                Number(event.target.value),
                              ),
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <Slider
                    aria-label="Transacciones locales concretadas"
                    className="mt-5"
                    value={[selected]}
                    onValueChange={(value) =>
                      setSelectedTransactions(
                        Array.isArray(value) ? value[0] : value,
                      )
                    }
                    min={0}
                    max={scenario.maximumTransactions}
                    step={Math.max(
                      1,
                      Math.floor(scenario.maximumTransactions / 1000),
                    )}
                  />
                </article>
                <div className="grid gap-4 md:grid-cols-2">
                  <Breakdown
                    title="Operación seleccionada"
                    rows={[
                      [
                        'Transacciones concretadas',
                        point.localTransactions,
                        '',
                      ],
                      ['Intentos requeridos', point.attempts, ''],
                      ['Inferencias totales', point.inferenceCount, ''],
                      ['Masa sustituida', point.substitutedKg, ' kg'],
                      ['Adopción territorial', point.adoptionPct, ' %'],
                    ]}
                  />
                  <Breakdown
                    title="Balance del paper"
                    rows={[
                      [
                        'Convencional desplazado',
                        point.conventionalDisplaced,
                        ' g CO₂e',
                      ],
                      [
                        'Transporte de proximidad',
                        point.localTransport,
                        ' g CO₂e',
                      ],
                      ['Huella digital', point.digital, ' g CO₂e'],
                      [
                        'Balance (solución − evitadas)',
                        point.emissionsBalance,
                        ' g CO₂e',
                      ],
                      ['Ahorro neto', point.netSaving, ' g CO₂e'],
                    ]}
                  />
                </div>
                <Notice>
                  <strong>Identidad de control:</strong> huella total del
                  escenario = logística convencional restante + transporte local
                  + huella digital. El ahorro neto es la diferencia frente a la
                  huella convencional territorial inicial.
                </Notice>
                <Notice>
                  <strong>Alcance:</strong> SENASA aporta movimientos y pesos.
                  Las emisiones se estiman con distancias y factores GLEC; el
                  resultado no demuestra que cada operación local suprima un
                  viaje completo.
                </Notice>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function samplePoints(limit: number, evaluate: (x: number) => ScenarioPoint) {
  if (!(limit > 0)) return [evaluate(0)];
  const values = new Set<number>([0, limit]);
  for (let i = 0; i <= 100; i++) values.add((limit * i) / 100);
  return [...values].sort((a, b) => a - b).map(evaluate);
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
function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/80 bg-white px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
function CriticalMetric({
  label,
  transactions,
  reachable,
  detail,
}: {
  label: string;
  transactions: number | null;
  reachable: boolean;
  detail: string;
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
            ? detail
            : 'Supera la masa registrada'
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
function ChartCard({
  eyebrow,
  title,
  description,
  badge,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          {badge}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}
type ChartLine = { key: keyof ScenarioPoint; name: string; color: string };
function EmissionsChart({
  data,
  xKey,
  xLabel,
  maxX,
  lines,
  rangeKey,
  rangeName,
  marker,
}: {
  data: ScenarioPoint[];
  xKey: 'localTransactions' | 'substitutedTonnes';
  xLabel: string;
  maxX: number;
  lines: ChartLine[];
  rangeKey?: keyof ScenarioPoint;
  rangeName?: string;
  marker: { x: number; y: number; label: string; color: string } | null;
}) {
  const maximumG = data.reduce((maximum, point) => {
    const lineMaximum = Math.max(
      ...lines.map((line) => Math.abs(point[line.key] as number)),
    );
    const range = rangeKey ? point[rangeKey] : null;
    const rangeMaximum = Array.isArray(range)
      ? Math.max(...range.map((value) => Math.abs(value)))
      : 0;
    return Math.max(maximum, lineMaximum, rangeMaximum);
  }, 0);
  const yScale =
    maximumG >= 1_000_000
      ? { divisor: 1_000_000, unit: 't CO₂e' }
      : maximumG >= 1_000
        ? { divisor: 1_000, unit: 'kg CO₂e' }
        : { divisor: 1, unit: 'g CO₂e' };
  return (
    <div className="h-[390px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 28, right: 24, left: 20, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d8ebf3" />
          <XAxis
            type="number"
            dataKey={xKey}
            domain={[0, maxX]}
            tickFormatter={(value) => compact.format(value)}
            label={{
              value: xLabel,
              position: 'insideBottom',
              offset: -3,
            }}
            height={50}
          />
          <YAxis
            tickFormatter={(value) => format.format(value / yScale.divisor)}
            label={{ value: yScale.unit, angle: -90, position: 'insideLeft' }}
            width={88}
          />
          <Tooltip content={<ScenarioTooltip lines={lines} xKey={xKey} />} />
          <Legend />
          {rangeKey && (
            <Area
              type="monotone"
              dataKey={rangeKey as string}
              name={rangeName}
              fill="#bfeaf6"
              fillOpacity={0.55}
              stroke="none"
              legendType="none"
            />
          )}
          {lines.map((line) => (
            <Line
              key={line.key as string}
              type="monotone"
              dataKey={line.key as string}
              name={line.name}
              stroke={line.color}
              strokeWidth={3}
              dot={false}
            />
          ))}
          {marker && (
            <>
              <ReferenceLine
                x={marker.x}
                stroke={marker.color}
                strokeDasharray="5 4"
                label={{
                  value: marker.label,
                  position: 'insideTopRight',
                  fill: marker.color,
                }}
              />
              <ReferenceDot
                x={marker.x}
                y={marker.y}
                r={5}
                fill={marker.color}
                stroke="#fff"
                strokeWidth={2}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
function ScenarioTooltip({
  active,
  payload,
  lines,
  xKey,
}: {
  active?: boolean;
  payload?: { payload: ScenarioPoint }[];
  lines: ChartLine[];
  xKey: 'localTransactions' | 'substitutedTonnes';
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="min-w-64 rounded-xl border border-border bg-white p-3 text-xs shadow-xl">
      <p className="mb-2 font-semibold">
        {xKey === 'substitutedTonnes'
          ? `${format.format(point.substitutedTonnes)} t reemplazadas`
          : `${integer.format(point.localTransactions)} transacciones`}
      </p>
      <TooltipRow
        label="Masa sustituida"
        value={`${format.format(point.substitutedKg)} kg`}
      />
      {lines.map((line) => (
        <TooltipRow
          key={line.key as string}
          label={line.name}
          value={formatEmissions(point[line.key] as number)}
        />
      ))}
      <TooltipRow
        label="Ahorro neto"
        value={`${point.netSaving >= 0 ? '+' : ''}${formatEmissions(point.netSaving)}`}
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
