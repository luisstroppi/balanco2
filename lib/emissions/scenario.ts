export type ScenarioInputs = {
  referenceMassTonnes: number;
  conventionalBaselineG: number;
  localAvailableTonnes: number;
  averageKgPerTransaction: number;
  conversionPct: number;
  localDistanceMinKm: number;
  localDistanceMaxKm: number;
  localFactorGPerTkm: number;
  serverPowerW: number;
  serverHoursPerMonth: number;
  periodMonths: number;
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
  substitutedTonnes: number;
  adoptionPct: number;
  attempts: number;
  inferenceCount: number;
  conventionalDisplaced: number;
  conventionalRemaining: number;
  localTransport: number;
  localTransportMin: number;
  localTransportMax: number;
  server: number;
  ai: number;
  digital: number;
  avoidedLogistics: number;
  avoidedLogisticsMin: number;
  avoidedLogisticsMax: number;
  avoidedRange: [number, number];
  localPlusDigital: number;
  localPlusDigitalMin: number;
  localPlusDigitalMax: number;
  localPlusDigitalRange: [number, number];
  totalScenario: number;
  totalScenarioMin: number;
  totalScenarioMax: number;
  totalScenarioRange: [number, number];
  netSaving: number;
  netSavingMin: number;
  netSavingMax: number;
  netSavingRange: [number, number];
  emissionsBalance: number;
  initialEmissions: number;
};

const safe = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

export function calculateScenario(
  inputs: ScenarioInputs,
  requestedSteps = 100,
) {
  const referenceMassTonnes = safe(inputs.referenceMassTonnes);
  const referenceKg = referenceMassTonnes * 1_000;
  const maximumSubstitutableTonnes = Math.min(
    referenceMassTonnes,
    safe(inputs.localAvailableTonnes),
  );
  const maximumSubstitutableKg = maximumSubstitutableTonnes * 1_000;
  const baselineG = safe(inputs.conventionalBaselineG);
  const averageKg = safe(inputs.averageKgPerTransaction);
  const conversion = Math.min(100, safe(inputs.conversionPct));
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
  const periodMonths = Math.min(12, safe(inputs.periodMonths));

  const serverHours = safe(inputs.serverHoursPerMonth) * periodMonths;
  const serverG =
    ((safe(inputs.serverPowerW) * serverHours) / 1_000) *
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
    averageKg > 0 ? Math.ceil(maximumSubstitutableKg / averageKg) : 0;
  const conventionalGPerKg = referenceKg > 0 ? baselineG / referenceKg : 0;

  const evaluate = (transactionCount: number): ScenarioPoint => {
    const localTransactions = Math.min(
      maximumTransactions,
      Math.max(0, transactionCount),
    );
    const substitutedKg = Math.min(
      maximumSubstitutableKg,
      localTransactions * averageKg,
    );
    const substitutedTonnes = substitutedKg / 1_000;
    const attempts = Number.isFinite(attemptsPerSuccess)
      ? localTransactions * attemptsPerSuccess
      : 0;
    const inferenceCount = Number.isFinite(inferencesPerSuccess)
      ? localTransactions * inferencesPerSuccess
      : 0;
    const conventionalDisplaced = substitutedKg * conventionalGPerKg;
    const conventionalRemaining = Math.max(
      0,
      baselineG - conventionalDisplaced,
    );
    const localTransportMin = substitutedTonnes * distanceMin * localFactor;
    const localTransport = substitutedTonnes * distanceMid * localFactor;
    const localTransportMax = substitutedTonnes * distanceMax * localFactor;
    const server = serverG;
    const ai = inferenceCount * aiGPerInference;
    const digital = server + ai;
    const avoidedLogisticsMin = conventionalDisplaced - localTransportMax;
    const avoidedLogistics = conventionalDisplaced - localTransport;
    const avoidedLogisticsMax = conventionalDisplaced - localTransportMin;
    const localPlusDigitalMin = localTransportMin + digital;
    const localPlusDigital = localTransport + digital;
    const localPlusDigitalMax = localTransportMax + digital;
    const totalScenarioMin = conventionalRemaining + localPlusDigitalMin;
    const totalScenario = conventionalRemaining + localPlusDigital;
    const totalScenarioMax = conventionalRemaining + localPlusDigitalMax;
    const netSavingMin = baselineG - totalScenarioMax;
    const netSaving = baselineG - totalScenario;
    const netSavingMax = baselineG - totalScenarioMin;
    return {
      localTransactions,
      substitutedKg,
      substitutedTonnes,
      adoptionPct: referenceKg > 0 ? (substitutedKg / referenceKg) * 100 : 0,
      attempts,
      inferenceCount,
      conventionalDisplaced,
      conventionalRemaining,
      localTransport,
      localTransportMin,
      localTransportMax,
      server,
      ai,
      digital,
      avoidedLogistics,
      avoidedLogisticsMin,
      avoidedLogisticsMax,
      avoidedRange: [avoidedLogisticsMin, avoidedLogisticsMax],
      localPlusDigital,
      localPlusDigitalMin,
      localPlusDigitalMax,
      localPlusDigitalRange: [localPlusDigitalMin, localPlusDigitalMax],
      totalScenario,
      totalScenarioMin,
      totalScenarioMax,
      totalScenarioRange: [totalScenarioMin, totalScenarioMax],
      netSaving,
      netSavingMin,
      netSavingMax,
      netSavingRange: [netSavingMin, netSavingMax],
      emissionsBalance: localPlusDigital - conventionalDisplaced,
      initialEmissions: baselineG,
    };
  };

  const conventionalPerTransaction = averageKg * conventionalGPerKg;
  const localPerTransaction = (averageKg / 1_000) * distanceMid * localFactor;
  const aiPerTransaction = Number.isFinite(inferencesPerSuccess)
    ? inferencesPerSuccess * aiGPerInference
    : 0;
  const netAvoidedPerTransaction =
    conventionalPerTransaction - localPerTransaction;
  const climateMarginPerTransaction =
    netAvoidedPerTransaction - aiPerTransaction;
  const climateEquilibriumTransactions =
    climateMarginPerTransaction > 0
      ? serverG / climateMarginPerTransaction
      : null;
  const componentDenominator =
    conventionalPerTransaction + localPerTransaction + aiPerTransaction;
  const componentCrossoverTransactions =
    componentDenominator > 0 && baselineG >= serverG
      ? (baselineG - serverG) / componentDenominator
      : null;

  const count = Math.max(
    1,
    Math.min(maximumTransactions || 1, Math.floor(requestedSteps)),
  );
  const indexes = new Set<number>([0, maximumTransactions]);
  for (let index = 0; index <= count; index += 1)
    indexes.add(Math.round((maximumTransactions * index) / count));
  for (const threshold of [
    climateEquilibriumTransactions,
    componentCrossoverTransactions,
  ]) {
    if (
      threshold !== null &&
      threshold >= 0 &&
      threshold <= maximumTransactions
    ) {
      indexes.add(Math.floor(threshold));
      indexes.add(Math.ceil(threshold));
    }
  }
  const points = [...indexes].sort((a, b) => a - b).map(evaluate);

  return {
    baselineG,
    serverG,
    serverHours,
    periodMonths,
    aiGPerInference,
    attemptsPerSuccess,
    inferencesPerSuccess,
    maximumTransactions,
    maximumSubstitutableTonnes,
    conventionalGPerKg,
    conventionalPerTransaction,
    localPerTransaction,
    aiPerTransaction,
    netAvoidedPerTransaction,
    climateMarginPerTransaction,
    climateEquilibriumTransactions,
    componentCrossoverTransactions,
    distanceMin,
    distanceMid,
    distanceMax,
    points,
    evaluate,
  };
}
