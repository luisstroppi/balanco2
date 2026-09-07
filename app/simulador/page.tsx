'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, BrainCircuit, Calculator, CheckCircle2, Info, Server, Truck } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { calculateScenario } from '@/lib/emissions/scenario';

type RouteRecord = { y:number; g:string; p:string; dp:string; dd:string; km:number; same:number; n:number; m:number; np:number; mp:number };
type DashboardData = { factors:{id:string;label:string;gPerTkm:number}[]; years:number[]; recordFiles:Record<string,string> };

const countries: { id:string; name:string; carbon?:number; year:string }[] = [
  { id:'AR', name:'Argentina · supuesto del paper', carbon:320, year:'Manuscrito' },
  { id:'BR', name:'Brasil · ingresar intensidad', year:'Manual' },
  { id:'CL', name:'Chile · ingresar intensidad', year:'Manual' },
  { id:'UY', name:'Uruguay · ingresar intensidad', year:'Manual' },
  { id:'PY', name:'Paraguay · ingresar intensidad', year:'Manual' },
  { id:'US', name:'Estados Unidos · ingresar intensidad', year:'Manual' },
  { id:'DE', name:'Alemania · ingresar intensidad', year:'Manual' },
  { id:'FR', name:'Francia · ingresar intensidad', year:'Manual' },
  { id:'ES', name:'España · ingresar intensidad', year:'Manual' },
  { id:'CUSTOM', name:'Otro · ingresar intensidad', year:'Manual' },
];

const aiModels = [
  { id:'none', name:'Sin IA', wh:0, detail:'No se agregan inferencias' },
  { id:'smollm', name:'HuggingFaceTB/SmolLM2-1.7B-Instruct', wh:7.708, detail:'Generación de texto · GPU · Feb 2025' },
  { id:'llama3', name:'meta-llama/Meta-Llama-3-8B', wh:17.333, detail:'Generación de texto · GPU · Feb 2025' },
  { id:'mistral', name:'mistralai/Mistral-7B-v0.1', wh:19.13, detail:'Generación de texto · GPU · Feb 2025' },
  { id:'phi4', name:'microsoft/phi-4', wh:28.741, detail:'Generación de texto · GPU · Feb 2025' },
  { id:'qwq', name:'Qwen/QwQ-32B-Preview', wh:54.556, detail:'Generación de texto · GPU · Feb 2025' },
  { id:'paper-light', name:'Perfil ilustrativo ligero del paper', wh:1.5, detail:'Escenario hipotético · no identifica modelo' },
  { id:'paper-standard', name:'Perfil ilustrativo estándar del paper', wh:15, detail:'Escenario hipotético · no identifica modelo' },
  { id:'paper-heavy', name:'Perfil ilustrativo intensivo del paper', wh:80, detail:'Escenario hipotético · no identifica modelo' },
];

const format = new Intl.NumberFormat('es-AR', { maximumFractionDigits:2 });
const compact = new Intl.NumberFormat('es-AR', { notation:'compact', maximumFractionDigits:1 });

export default function SimulatorPage() {
  const [meta,setMeta]=useState<DashboardData|null>(null);
  const [records,setRecords]=useState<RouteRecord[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [objective,setObjective]=useState('Proveer papa localmente en la ciudad de Rosario mediante TI');
  const [year,setYear]=useState('2025');
  const [product,setProduct]=useState('Papa');
  const [province,setProvince]=useState('Santa Fe');
  const [department,setDepartment]=useState('Rosario');
  const [conventionalVehicle,setConventionalVehicle]=useState('medium');
  const [localVehicle,setLocalVehicle]=useState('light');
  const [circuity,setCircuity]=useState(1.25);
  const [sameAreaKm,setSameAreaKm]=useState(15);
  const [localKm,setLocalKm]=useState(15);
  const [demand,setDemand]=useState(10);
  const [adoption,setAdoption]=useState(100);
  const [plausibleOnly,setPlausibleOnly]=useState(true);
  const [serverPower,setServerPower]=useState(60);
  const [hours,setHours]=useState(720);
  const [serverPue,setServerPue]=useState(1.2);
  const [serverCountry,setServerCountry]=useState('AR');
  const [serverCarbon,setServerCarbon]=useState(320);
  const [aiEnabled,setAiEnabled]=useState(false);
  const [aiModel,setAiModel]=useState('smollm');
  const [inferences,setInferences]=useState(1000);
  const [aiCountry,setAiCountry]=useState('AR');
  const [aiCarbon,setAiCarbon]=useState(320);

  useEffect(()=>{ fetch('/data/dashboard.json?v=sim-1').then(r=>{if(!r.ok)throw new Error('No se pudo cargar el catálogo SENASA.');return r.json()}).then((raw:unknown)=>{const value=raw as DashboardData;setMeta(value);setYear(value.years.includes(2025)?'2025':String(value.years.at(-1)));}).catch(e=>setError(e instanceof Error?e.message:'Error de carga')); },[]);
  useEffect(()=>{ if(!meta)return; let active=true; fetch(`${meta.recordFiles[year]}?v=sim-1`).then(async r=>{if(!r.ok)throw new Error(`No se pudieron cargar los datos de ${year}.`);const bytes=new Uint8Array(await r.arrayBuffer());return bytes[0]===0x1f&&bytes[1]===0x8b?new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json():JSON.parse(new TextDecoder().decode(bytes));}).then(v=>{if(active)setRecords(v as RouteRecord[])}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Error de carga')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}; },[meta,year]);

  const products=useMemo(()=>[...new Set(records.map(r=>r.p))].sort(),[records]);
  const provinces=useMemo(()=>[...new Set(records.filter(r=>r.p===product).map(r=>r.dp))].sort(),[records,product]);
  const departments=useMemo(()=>[...new Set(records.filter(r=>r.p===product&&r.dp===province).map(r=>r.dd))].sort(),[records,product,province]);
  const conventionalFactor=meta?.factors.find(f=>f.id===conventionalVehicle)?.gPerTkm??210;
  const localFactor=meta?.factors.find(f=>f.id===localVehicle)?.gPerTkm??750;
  const reference=useMemo(()=>{let mass=0,emissionsKg=0,weightedKm=0,rows=0,trips=0;for(const r of records){if(r.p!==product||r.dp!==province||r.dd!==department)continue;const m=plausibleOnly?r.mp:r.m;const n=plausibleOnly?r.np:r.n;if(!(m>0)||!(n>0))continue;const distance=r.same?sameAreaKm:r.km*circuity;mass+=m;weightedKm+=m*distance;emissionsKg+=m*distance*conventionalFactor/1000;rows+=1;trips+=n;}return{mass,emissionsKg,weightedKm,trips,rows,kgPerTonne:mass?emissionsKg/mass:0,avgKm:mass?weightedKm/mass:0};},[records,product,province,department,plausibleOnly,sameAreaKm,circuity,conventionalFactor]);
  const selectedAi=aiModels.find(m=>m.id===aiModel)??aiModels[0];
  const scenario=useMemo(()=>calculateScenario({demandTonnes:demand,conventionalKgPerTonne:reference.kgPerTonne,localDistanceKm:localKm,localFactorGPerTkm:localFactor,serverPowerW:serverPower,serverHours:hours,serverPue,serverCarbonGPerKwh:serverCarbon,inferenceWhPerThousand:aiEnabled?selectedAi.wh:0,inferencesAtFullAdoption:aiEnabled?inferences:0,aiCarbonGPerKwh:aiCarbon,aiCorrection:1,aiPue:1}),[demand,reference.kgPerTonne,localKm,localFactor,serverPower,hours,serverPue,serverCarbon,aiEnabled,selectedAi.wh,inferences,aiCarbon]);
  const point=scenario.points[Math.round(adoption/100*(scenario.points.length-1))]??scenario.points[0];
  const eq=scenario.equilibriumTonnes;
  const equilibriumReachable=eq!==null&&eq<=demand;

  const changeCountry=(id:string,kind:'server'|'ai')=>{const c=countries.find(item=>item.id===id);if(!c)return;if(kind==='server'){setServerCountry(id);if(c.carbon!==undefined)setServerCarbon(c.carbon)}else{setAiCountry(id);if(c.carbon!==undefined)setAiCarbon(c.carbon)}};

  return <main className="min-h-screen bg-[#f8fcfe] text-foreground"><SiteHeader />
    <div className="mx-auto max-w-[1580px] px-4 py-7 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="flex items-center gap-2 text-sm font-semibold text-primary"><Calculator className="size-4"/> Simulador de proximidad</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Balance entre transporte y tecnología</h1><p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">Definí una alternativa local y observá cuándo el ahorro logístico compensa el servidor y la IA.</p></div><Link href="/#fuentes" className="text-sm font-semibold text-primary hover:underline">Consultar fuentes y límites</Link></div>
      {error&&<Notice tone="error">{error}</Notice>}
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[430px_1fr]">
        <aside className="space-y-4 xl:sticky xl:top-20">
          <Panel number="01" title="Objetivo y referencia" icon={<Truck/>}>
            <Field label="Objetivo"><Input aria-label="Objetivo" value={objective} onChange={e=>setObjective(e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Picker label="Año SENASA" value={year} onChange={value=>{setLoading(true);setYear(value)}} options={(meta?.years??[]).map(String)} /><Picker label="Producto" value={product} onChange={value=>{setProduct(value);const nextProvince=[...new Set(records.filter(r=>r.p===value).map(r=>r.dp))].sort()[0]??'';setProvince(nextProvince);setDepartment(records.find(r=>r.p===value&&r.dp===nextProvince)?.dd??'')}} options={products} /></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Picker label="Provincia de destino" value={province} onChange={value=>{setProvince(value);setDepartment(records.find(r=>r.p===product&&r.dp===value)?.dd??'')}} options={provinces} /><Picker label="Localidad / departamento" value={department} onChange={setDepartment} options={departments} /></div>
            <Picker label="Vehículo convencional" value={conventionalVehicle} onChange={setConventionalVehicle} options={(meta?.factors??[]).map(f=>f.id)} labels={Object.fromEntries((meta?.factors??[]).map(f=>[f.id,`${f.label} · ${f.gPerTkm} g/t·km`]))}/>
            <div className="grid grid-cols-2 gap-3"><NumberField label="Factor vial" value={circuity} onChange={setCircuity} step="0.05"/><NumberField label="Km mismo depto." value={sameAreaKm} onChange={setSameAreaKm}/></div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/55 px-3 py-2.5 text-sm font-medium"><span>Sólo cargas ≤ 60 t</span><Switch aria-label="Sólo cargas de hasta 60 toneladas" checked={plausibleOnly} onCheckedChange={setPlausibleOnly}/></div>
          </Panel>
          <Panel number="02" title="Alternativa local" icon={<CheckCircle2/>}>
            <div className="grid grid-cols-2 gap-3"><NumberField label="Demanda del período" suffix="t" value={demand} onChange={setDemand}/><NumberField label="Distancia local" suffix="km" value={localKm} onChange={setLocalKm}/></div>
            <Picker label="Vehículo local" value={localVehicle} onChange={setLocalVehicle} options={(meta?.factors??[]).map(f=>f.id)} labels={Object.fromEntries((meta?.factors??[]).map(f=>[f.id,`${f.label} · ${f.gPerTkm} g/t·km`]))}/>
            <p className="text-xs leading-relaxed text-muted-foreground">La distancia ingresada es vial y no recibe el factor de ajuste de los centroides.</p>
          </Panel>
          <Panel number="03" title="Infraestructura" icon={<Server/>}>
            <div className="grid grid-cols-2 gap-3"><NumberField label="Potencia media" suffix="W" value={serverPower} onChange={setServerPower}/><NumberField label="Horas del período" suffix="h" value={hours} onChange={setHours}/></div>
            <Picker label="País del servidor" value={serverCountry} onChange={v=>changeCountry(v,'server')} options={countries.map(c=>c.id)} labels={Object.fromEntries(countries.map(c=>[c.id,c.name]))}/>
            <div className="grid grid-cols-2 gap-3"><NumberField label="Intensidad eléctrica" suffix="g/kWh" value={serverCarbon} onChange={setServerCarbon}/><NumberField label="PUE" value={serverPue} onChange={setServerPue} step="0.05"/></div>
            <p className="text-xs leading-relaxed text-muted-foreground">Potencia atribuible al servicio, no potencia nominal. Los valores eléctricos son editables y deben documentarse.</p>
          </Panel>
          <Panel number="04" title="Inteligencia artificial" icon={<BrainCircuit/>}>
            <div className="flex items-center justify-between rounded-xl bg-secondary/55 px-3 py-2.5 text-sm font-medium"><span>Incluir inferencias de IA</span><Switch aria-label="Incluir inferencias de IA" checked={aiEnabled} onCheckedChange={setAiEnabled}/></div>
            {aiEnabled&&<><Picker label="Modelo / perfil" value={aiModel} onChange={setAiModel} options={aiModels.filter(m=>m.id!=='none').map(m=>m.id)} labels={Object.fromEntries(aiModels.map(m=>[m.id,m.name]))}/><p className="-mt-1 text-xs leading-relaxed text-muted-foreground">{selectedAi.detail} · {format.format(selectedAi.wh)} Wh/1.000 inferencias.</p><NumberField label="Inferencias al 100 % local" value={inferences} onChange={setInferences}/><Picker label="País de ejecución de IA" value={aiCountry} onChange={v=>changeCountry(v,'ai')} options={countries.map(c=>c.id)} labels={Object.fromEntries(countries.map(c=>[c.id,c.name]))}/><NumberField label="Intensidad eléctrica IA" suffix="g/kWh" value={aiCarbon} onChange={setAiCarbon}/><Notice>AI Energy Score mide principalmente GPU; CPU, RAM, red y almacenamiento no se incluyen en este modo base.</Notice></>}
          </Panel>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-primary/25 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Objetivo evaluado</p><p className="mt-2 text-xl font-semibold">{objective||'Sin objetivo definido'}</p><p className="mt-2 text-sm text-muted-foreground">Referencia territorial: departamento {department}, {province}. No exclusiva de una ciudad ni demostración de consumo final.</p></div>
          {loading?<div className="grid min-h-64 place-items-center rounded-2xl border border-border bg-white"><p className="text-muted-foreground">Calculando la referencia territorial…</p></div>:reference.mass<=0?<Notice tone="error">No hay masa utilizable para esta combinación. Elegí otro producto o territorio.</Notice>:<>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Intensidad convencional" value={`${format.format(reference.kgPerTonne)} kg`} detail="CO₂e por tonelada"/><Metric label="Intensidad local" value={`${format.format(scenario.localKgPerTonne)} kg`} detail="CO₂e por tonelada"/><Metric label="Muestra SENASA" value={`${compact.format(reference.mass)} t`} detail={`${compact.format(reference.trips)} registros · ${format.format(reference.avgKm)} km ponderados`}/><Metric label="Punto de equilibrio" value={equilibriumReachable?`${format.format(eq!)} t`:'No alcanzable'} detail={eq===null?'El ahorro marginal no es positivo':eq!>demand?'Supera la demanda definida':`${format.format(eq!/demand*100)} % de la demanda`}/></div>
            <article className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-primary">Curva de sustitución</p><h2 className="mt-1 text-xl font-semibold">Huella a medida que la provisión pasa al circuito local</h2><p className="mt-1 text-sm text-muted-foreground">Misma demanda y período en todos los puntos.</p></div><div className={`rounded-xl px-4 py-3 text-sm font-semibold ${point.balance>=0?'bg-cyan-50 text-cyan-900':'bg-amber-50 text-amber-900'}`}>Balance a {adoption}%: {point.balance>=0?'+':''}{format.format(point.balance)} kg CO₂e</div></div>
              <div className="mt-5 h-[430px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={scenario.points} margin={{top:15,right:15,left:10,bottom:5}}><CartesianGrid strokeDasharray="3 3" stroke="#d8ebf3"/><XAxis dataKey="localTonnes" tickFormatter={v=>format.format(v)} label={{value:'Toneladas provistas localmente',position:'insideBottom',offset:-2}} height={48}/><YAxis tickFormatter={v=>compact.format(v)} width={64}/><Tooltip content={<ScenarioTooltip/>}/><Legend/><Area type="monotone" dataKey="conventional" stackId="1" name="Transporte convencional" fill="#b9ddea" stroke="#78b7d0"/><Area type="monotone" dataKey="local" stackId="1" name="Transporte local" fill="#80c9df" stroke="#3594b8"/><Area type="monotone" dataKey="server" stackId="1" name="Servidor" fill="#315d73" stroke="#315d73"/><Area type="monotone" dataKey="ai" stackId="1" name="IA" fill="#9aa9b0" stroke="#72858e"/><Line type="monotone" dataKey="alternative" name="Total alternativo" stroke="#08384c" strokeWidth={3} dot={false}/><Line type="monotone" dataKey="baseline" name="Referencia convencional" stroke="#d48345" strokeWidth={2} strokeDasharray="7 5" dot={false}/>{equilibriumReachable&&<ReferenceLine x={eq!} stroke="#0e7490" strokeDasharray="4 4" label="Equilibrio"/>}</AreaChart></ResponsiveContainer></div>
              <div className="mt-4"><div className="flex items-center justify-between text-sm"><span>Nivel de adopción local</span><span className="font-semibold text-primary">{adoption}% · {format.format(point.localTonnes)} t</span></div><Slider aria-label="Nivel de adopción local" className="mt-3" value={[adoption]} onValueChange={v=>setAdoption(Array.isArray(v)?v[0]:v)} min={0} max={100} step={1}/></div>
            </article>
            <div className="grid gap-4 md:grid-cols-2"><Breakdown title="Escenario seleccionado" rows={[['Convencional restante',point.conventional],['Transporte local',point.local],['Servidor',point.server],['IA',point.ai],['Total alternativo',point.alternative]]}/><Breakdown title="Lectura del resultado" rows={[['Referencia sin plataforma',point.baseline],['Ahorro logístico bruto',point.localTonnes*(reference.kgPerTonne-scenario.localKgPerTonne)],['Huella digital',point.server+point.ai],['Balance neto',point.balance]]}/></div>
            <Notice><strong>Alcance:</strong> estimación de transporte y operación digital. No incluye producción agrícola, frío, desperdicio, fabricación de equipos ni confirma que los viajes convencionales desaparezcan.</Notice>
          </>}
        </section>
      </div>
    </div>
  </main>;
}

function Panel({number,title,icon,children}:{number:string;title:string;icon:React.ReactNode;children:React.ReactNode}){return <section className="rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-secondary text-sm font-semibold text-primary">{number}</span><h2 className="flex flex-1 items-center gap-2 font-semibold">{title}<span className="ml-auto text-primary [&_svg]:size-4">{icon}</span></h2></div><div className="space-y-3">{children}</div></section>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><p className="text-sm font-medium">{label}</p>{children}</div>}
function Picker({label,value,onChange,options,labels={}}:{label:string;value:string;onChange:(v:string)=>void;options:string[];labels?:Record<string,string>}){return <Field label={label}><Select value={value} onValueChange={v=>{if(v!==null)onChange(v)}}><SelectTrigger aria-label={label} className="w-full bg-white"><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o} value={o}>{labels[o]??o}</SelectItem>)}</SelectContent></Select></Field>}
function NumberField({label,value,onChange,suffix,step='1'}:{label:string;value:number;onChange:(v:number)=>void;suffix?:string;step?:string}){return <Field label={label}><div className="relative"><Input aria-label={label} type="number" min="0" step={step} value={Number.isFinite(value)?value:''} onChange={e=>onChange(Number(e.target.value))} className={suffix?'pr-14':''}/>{suffix&&<span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-muted-foreground">{suffix}</span>}</div></Field>}
function Metric({label,value,detail}:{label:string;value:string;detail:string}){return <article className="rounded-2xl border border-border bg-white p-4 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p></article>}
function Notice({children,tone='info'}:{children:React.ReactNode;tone?:'info'|'error'}){return <div className={`mt-4 flex gap-3 rounded-xl border p-3 text-sm leading-relaxed ${tone==='error'?'border-red-200 bg-red-50 text-red-900':'border-primary/20 bg-secondary/55 text-muted-foreground'}`}>{tone==='error'?<AlertCircle className="mt-0.5 size-4 shrink-0"/>:<Info className="mt-0.5 size-4 shrink-0 text-primary"/>}<p>{children}</p></div>}
function Breakdown({title,rows}:{title:string;rows:[string,number][]}){return <article className="rounded-2xl border border-border bg-white p-5 shadow-sm"><h3 className="font-semibold">{title}</h3><dl className="mt-4 divide-y divide-border">{rows.map(([label,value],i)=><div key={label} className={`flex items-center justify-between gap-4 py-2.5 text-sm ${i===rows.length-1?'font-semibold':''}`}><dt className="text-muted-foreground">{label}</dt><dd className="font-mono">{value>=0&&label==='Balance neto'?'+':''}{format.format(value)} kg CO₂e</dd></div>)}</dl></article>}
function ScenarioTooltip({active,payload,label}:{active?:boolean;payload?:{name:string;value:number;color:string}[];label?:number}){if(!active||!payload?.length)return null;const unique=payload.filter((item,index,array)=>array.findIndex(other=>other.name===item.name)===index);return <div className="max-w-72 rounded-xl border border-border bg-white p-3 text-xs shadow-xl"><p className="mb-2 font-semibold">{format.format(label??0)} t locales</p>{unique.map(item=><div key={item.name} className="flex justify-between gap-5 py-0.5"><span style={{color:item.color}}>{item.name}</span><span className="font-mono">{format.format(item.value)} kg</span></div>)}</div>}
