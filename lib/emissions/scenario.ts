export type ScenarioInputs = {
  demandTonnes: number;
  conventionalKgPerTonne: number;
  averageKgPerTransaction: number;
  conversionPct: number;
  localDistanceMinKm: number;
  localDistanceMaxKm: number;
  localFactorGPerTkm: number;
  serverPowerW: number;
  serverHours: number;
  serverPue: number;
  serverCarbonGPerKwh: number;
  inferenceWhPerThousand: number;
  inferencesPerAttempt: number;
  aiCarbonGPerKwh: number;
  aiCorrection: number;
  aiPue: number;
};

export type ScenarioPoint = {
  localTransactions: number;
  substitutedKg: number;
  adoptionPct: number;
  attempts: number;
  inferenceCount: number;
  conventionalRemaining: number;
  conventionalAvoided: number;
  server: number;
  ai: number;
  localTransport: number;
  localTransportMin: number;
  localTransportMax: number;
  platform: number;
  platformMin: number;
  platformMax: number;
  platformRange: [number, number];
  totalScenario: number;
  netSaving: number;
};

const safe = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

export function calculateScenario(inputs: ScenarioInputs, requestedSteps = 80) {
  const demandTonnes = safe(inputs.demandTonnes);
  const demandKg = demandTonnes * 1_000;
  const averageKg = safe(inputs.averageKgPerTransaction);
  const conversion = Math.min(100, safe(inputs.conversionPct));
  const conventionalGPerTonne = safe(inputs.conventionalKgPerTonne) * 1_000;
  const distanceMin = Math.min(
    safe(inputs.localDistanceMinKm),
    safe(inputs.localDistanceMaxKm),
  );
  const distanceMax = Math.max(
    safe(inputs.localDistanceMinKm),
    safe(inputs.localDistanceMaxKm),
  );
  const distanceMid = (distanceMin + distanceMax) / 2;
  const localFactor = safe(inputs.localFactorGPerTkm);

  const baselineG = demandTonnes * conventionalGPerTonne;
  const serverG =
    ((safe(inputs.serverPowerW) * safe(inputs.serverHours)) / 1_000) *
    Math.max(1, safe(inputs.serverPue)) *
    safe(inputs.serverCarbonGPerKwh);
  const aiGPerInference =
    (safe(inputs.inferenceWhPerThousand) / 1_000_000) *
    safe(inputs.aiCorrection) *
    Math.max(1, safe(inputs.aiPue)) *
    safe(inputs.aiCarbonGPerKwh);
  const attemptsPerSuccess =
    conversion > 0 ? 100 / conversion : Number.POSITIVE_INFINITY;
  const inferencesPerSuccess = Number.isFinite(attemptsPerSuccess)
    ? attemptsPerSuccess * safe(inputs.inferencesPerAttempt)
    : Number.POSITIVE_INFINITY;
  const maximumTransactions =
    averageKg > 0 ? Math.ceil(demandKg / averageKg) : 0;

  const evaluate = (transactionCount: number): ScenarioPoint => {
    const localTransactions = Math.min(
      maximumTransactions,
      Math.max(0, transactionCount),
    );
    const substitutedKg = Math.min(demandKg, localTransactions * averageKg);
    const substitutedTonnes = substitutedKg / 1_000;
    const attempts = Number.isFinite(attemptsPerSuccess)
      ? localTransactions * attemptsPerSuccess
      : 0;
    const inferenceCount = Number.isFinite(inferencesPerSuccess)
      ? localTransactions * inferencesPerSuccess
      : 0;
    const conventionalAvoided = substitutedTonnes * conventionalGPerTonne;
    const conventionalRemaining = Math.max(0, baselineG - conventionalAvoided);
    const ai = inferenceCount * aiGPerInference;
    const localTransportMin = substitutedTonnes * distanceMin * localFactor;
    const localTransport = substitutedTonnes * distanceMid * localFactor;
    const localTransportMax = substitutedTonnes * distanceMax * localFactor;
    const platformMin = serverG + ai + localTransportMin;
    const platform = serverG + ai + localTransport;
    const platformMax = serverG + ai + localTransportMax;
    const totalScenario = conventionalRemaining + platform;
    return {
      localTransactions,
      substitutedKg,
      adoptionPct: demandKg > 0 ? (substitutedKg / demandKg) * 100 : 0,
      attempts,
      inferenceCount,
      conventionalRemaining,
      conventionalAvoided,
      server: serverG,
      ai,
      localTransport,
      localTransportMin,
      localTransportMax,
      platform,
      platformMin,
      platformMax,
      platformRange: [platformMin, platformMax],
      totalScenario,
      netSaving: baselineG - totalScenario,
    };
  };

  const conventionalDeclinePerTransaction =
    (averageKg / 1_000) * conventionalGPerTonne;
  const localMidPerTransaction =
    (averageKg / 1_000) * distanceMid * localFactor;
  const aiPerTransaction = Number.isFinite(inferencesPerSuccess)
    ? inferencesPerSuccess * aiGPerInference
    : 0;
  const platformGrowthPerTransaction =
    localMidPerTransaction + aiPerTransaction;
  const convergenceDenominator =
    conventionalDeclinePerTransaction + platformGrowthPerTransaction;
  const convergenceTransactions =
    convergenceDenominator > 0 && baselineG >= serverG
      ? (baselineG - serverG) / convergenceDenominator
      : null;
  const climateSavingPerTransaction =
    conventionalDeclinePerTransaction - platformGrowthPerTransaction;
  const climateEquilibriumTransactions =
    climateSavingPerTransaction > 0
      ? serverG / climateSavingPerTransaction
      : null;

  const count = Math.max(
    1,
    Math.min(maximumTransactions || 1, Math.floor(requestedSteps)),
  );
  const indexes = new Set<number>([0, maximumTransactions]);
  for (let index = 0; index <= count; index += 1) {
    indexes.add(Math.round((maximumTransactions * index) / count));
  }
  const points = [...indexes].sort((a, b) => a - b).map(evaluate);

  return {
    baselineG,
    serverG,
    aiGPerInference,
    attemptsPerSuccess,
    inferencesPerSuccess,
    maximumTransactions,
    conventionalDeclinePerTransaction,
    platformGrowthPerTransaction,
    convergenceTransactions,
    climateEquilibriumTransactions,
    distanceMin,
    distanceMid,
    distanceMax,
    points,
    evaluate,
  };
}
