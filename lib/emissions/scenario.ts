export type ScenarioInputs = {
  demandTonnes: number;
  conventionalKgPerTonne: number;
  localDistanceKm: number;
  localFactorGPerTkm: number;
  serverPowerW: number;
  serverHours: number;
  serverPue: number;
  serverCarbonGPerKwh: number;
  inferenceWhPerThousand: number;
  inferencesAtFullAdoption: number;
  aiCarbonGPerKwh: number;
  aiCorrection: number;
  aiPue: number;
};

export type ScenarioPoint = {
  localTonnes: number;
  adoptionPct: number;
  conventional: number;
  local: number;
  server: number;
  ai: number;
  alternative: number;
  baseline: number;
  balance: number;
};

export function calculateScenario(inputs: ScenarioInputs, steps = 40) {
  const demand = Math.max(0, inputs.demandTonnes);
  const localKgPerTonne = Math.max(0, inputs.localDistanceKm) * Math.max(0, inputs.localFactorGPerTkm) / 1000;
  const serverKg = Math.max(0, inputs.serverPowerW) * Math.max(0, inputs.serverHours) / 1000
    * Math.max(1, inputs.serverPue) * Math.max(0, inputs.serverCarbonGPerKwh) / 1000;
  const kwhPerInference = Math.max(0, inputs.inferenceWhPerThousand) / 1_000_000;
  const aiKgPerInference = kwhPerInference * Math.max(0, inputs.aiCorrection)
    * Math.max(1, inputs.aiPue) * Math.max(0, inputs.aiCarbonGPerKwh) / 1000;
  const baselineKg = demand * Math.max(0, inputs.conventionalKgPerTonne);
  const inferenceRate = demand > 0 ? Math.max(0, inputs.inferencesAtFullAdoption) / demand : 0;
  const marginalSaving = inputs.conventionalKgPerTonne - localKgPerTonne - inferenceRate * aiKgPerInference;
  const equilibriumTonnes = marginalSaving > 0 ? serverKg / marginalSaving : null;
  const points: ScenarioPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const localTonnes = demand * index / steps;
    const inferenceCount = inferenceRate * localTonnes;
    const conventional = (demand - localTonnes) * inputs.conventionalKgPerTonne;
    const local = localTonnes * localKgPerTonne;
    const ai = inferenceCount * aiKgPerInference;
    const alternative = conventional + local + serverKg + ai;
    points.push({ localTonnes, adoptionPct: steps ? index / steps * 100 : 0, conventional, local, server: serverKg, ai, alternative, baseline: baselineKg, balance: baselineKg - alternative });
  }
  return { localKgPerTonne, serverKg, aiKgPerInference, baselineKg, marginalSaving, equilibriumTonnes, points };
}
