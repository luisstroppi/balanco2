import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenario } from '../lib/emissions/scenario.ts';

const approximately = (actual: number, expected: number, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≠ ${expected}`,
  );

const base = {
  referenceMassTonnes: 10,
  conventionalBaselineG: 755_000,
  localAvailableTonnes: 10,
  averageKgPerTransaction: 20,
  conversionPct: 20,
  localDistanceMinKm: 5,
  localDistanceMaxKm: 15,
  localFactorGPerTkm: 750,
  serverPowerW: 60,
  serverHoursPerMonth: 720,
  periodMonths: 12,
  serverPue: 1.2,
  serverCarbonGPerKwh: 320,
  inferenceWhPerThousand: 15,
  inferencesPerAttempt: 2,
  aiCarbonGPerKwh: 320,
  aiCorrection: 1,
  aiPue: 1,
};

void test('usa la masa y la huella anual suministradas por SENASA', () => {
  const result = calculateScenario(base);
  const zero = result.evaluate(0);
  const full = result.evaluate(result.maximumTransactions);
  assert.equal(result.baselineG, 755_000);
  assert.equal(result.maximumTransactions, 500);
  assert.equal(zero.conventionalRemaining, 755_000);
  assert.equal(full.substitutedKg, 10_000);
  assert.equal(full.conventionalRemaining, 0);
});

void test('multiplica por doce la infraestructura mensual para un año completo', () => {
  const monthly = calculateScenario({ ...base, periodMonths: 1 });
  const annual = calculateScenario(base);
  approximately(monthly.serverG, 16_588.8);
  approximately(annual.serverG, monthly.serverG * 12);
  assert.equal(annual.serverHours, 8_640);
});

void test('una conversión del 20 por ciento requiere cinco intentos por operación', () => {
  const point = calculateScenario(base).evaluate(12);
  assert.equal(point.attempts, 60);
  assert.equal(point.inferenceCount, 120);
});

void test('calcula el ahorro del paper como convencional desplazado menos transporte local', () => {
  const point = calculateScenario(base).evaluate(10);
  approximately(
    point.avoidedLogistics,
    point.conventionalDisplaced - point.localTransport,
  );
  approximately(point.netSaving, point.avoidedLogistics - point.digital);
});

void test('reproduce aproximadamente las trece operaciones mensuales del paper', () => {
  const paper = calculateScenario({
    ...base,
    referenceMassTonnes: 1,
    conventionalBaselineG: 65_450,
    conversionPct: 100,
    localDistanceMinKm: 1.6,
    localDistanceMaxKm: 1.6,
    periodMonths: 1,
    inferenceWhPerThousand: 1.5,
    inferencesPerAttempt: 4,
  });
  assert.equal(paper.climateEquilibriumTransactions?.toFixed(2), '12.91');
});

void test('el equilibrio climático iguala ahorro logístico y huella digital', () => {
  const result = calculateScenario(base);
  assert.ok(result.climateEquilibriumTransactions !== null);
  const point = result.evaluate(result.climateEquilibriumTransactions!);
  assert.ok(Math.abs(point.avoidedLogistics - point.digital) < 1e-7);
  assert.ok(Math.abs(point.netSaving) < 1e-7);
});

void test('el balance resta las emisiones evitadas al transporte local más TI', () => {
  const result = calculateScenario(base);
  const point = result.evaluate(100);
  approximately(
    point.emissionsBalance,
    point.localPlusDigital - point.conventionalDisplaced,
  );
  approximately(point.emissionsBalance, -point.netSaving);
});

void test('el punto de equilibrio deja el balance de emisiones en cero', () => {
  const result = calculateScenario(base);
  assert.ok(result.climateEquilibriumTransactions !== null);
  const point = result.evaluate(result.climateEquilibriumTransactions!);
  approximately(point.localPlusDigital, point.conventionalDisplaced);
  assert.ok(Math.abs(point.emissionsBalance) < 1e-7);
});

void test('el cruce de componentes iguala logística restante y transporte local más TI', () => {
  const result = calculateScenario(base);
  assert.ok(result.componentCrossoverTransactions !== null);
  const point = result.evaluate(result.componentCrossoverTransactions!);
  assert.ok(
    Math.abs(point.conventionalRemaining - point.localPlusDigital) < 1e-7,
  );
});

void test('al reemplazar toneladas baja la logística convencional y sube el ahorro neto', () => {
  const result = calculateScenario(base);
  const initial = result.evaluate(0);
  const intermediate = result.evaluate(250);
  const full = result.evaluate(result.maximumTransactions);
  assert.ok(initial.conventionalRemaining > intermediate.conventionalRemaining);
  assert.ok(intermediate.conventionalRemaining > full.conventionalRemaining);
  assert.ok(initial.netSaving < intermediate.netSaving);
  assert.ok(intermediate.netSaving < full.netSaving);
});

void test('con sustitución total permanecen transporte de proximidad y tecnología', () => {
  const result = calculateScenario(base);
  const full = result.evaluate(result.maximumTransactions);
  approximately(full.conventionalRemaining, 0);
  approximately(full.totalScenario, full.localPlusDigital);
  assert.ok(full.totalScenario > 0);
});

void test('la oferta local limita la masa y evita descontar emisiones adicionales', () => {
  const result = calculateScenario({ ...base, localAvailableTonnes: 2 });
  assert.equal(result.maximumSubstitutableTonnes, 2);
  assert.equal(result.maximumTransactions, 100);
  const limit = result.evaluate(result.maximumTransactions);
  const beyond = result.evaluate(result.maximumTransactions * 10);
  assert.equal(limit.substitutedKg, 2_000);
  assert.equal(limit.conventionalRemaining, 604_000);
  assert.deepEqual(beyond, limit);
});

void test('impacto y ahorro total respetan el rango de distancia y la oferta local', () => {
  const result = calculateScenario({ ...base, localAvailableTonnes: 2 });
  const zero = result.evaluate(0);
  const maximum = result.evaluate(result.maximumTransactions);
  assert.equal(zero.initialEmissions, result.baselineG);
  assert.equal(maximum.substitutedTonnes, 2);
  approximately(maximum.netSaving, result.baselineG - maximum.totalScenario);
  assert.deepEqual(maximum.totalScenarioRange, [
    maximum.totalScenarioMin,
    maximum.totalScenarioMax,
  ]);
  assert.deepEqual(maximum.netSavingRange, [
    maximum.netSavingMin,
    maximum.netSavingMax,
  ]);
});

void test('la última operación no sustituye más masa que la registrada', () => {
  const result = calculateScenario({
    ...base,
    referenceMassTonnes: 0.05,
    averageKgPerTransaction: 30,
  });
  const point = result.evaluate(2);
  assert.equal(point.substitutedKg, 50);
  assert.equal(point.conventionalRemaining, 0);
});

void test('informa que no hay equilibrio si el margen climático es negativo', () => {
  const result = calculateScenario({
    ...base,
    localDistanceMinKm: 500,
    localDistanceMaxKm: 500,
  });
  assert.equal(result.climateEquilibriumTransactions, null);
});

void test('cada parámetro cuantitativo modifica al menos un resultado del escenario', () => {
  const signature = (inputs: typeof base) => {
    const result = calculateScenario(inputs);
    const point = result.evaluate(Math.min(100, result.maximumTransactions));
    return [
      result.baselineG,
      result.serverG,
      result.maximumTransactions,
      result.climateEquilibriumTransactions ?? -1,
      result.componentCrossoverTransactions ?? -1,
      result.conventionalPerTransaction,
      result.localPerTransaction,
      result.aiPerTransaction,
      point.digital,
      point.avoidedLogistics,
      point.localPlusDigital,
      point.netSaving,
    ];
  };
  const baseline = signature(base);
  const variations: Partial<typeof base>[] = [
    { referenceMassTonnes: 12 },
    { conventionalBaselineG: 800_000 },
    { localAvailableTonnes: 8 },
    { averageKgPerTransaction: 25 },
    { conversionPct: 25 },
    { localDistanceMinKm: 7 },
    { localDistanceMaxKm: 20 },
    { localFactorGPerTkm: 500 },
    { serverPowerW: 80 },
    { serverHoursPerMonth: 600 },
    { periodMonths: 6 },
    { serverPue: 1.4 },
    { serverCarbonGPerKwh: 400 },
    { inferenceWhPerThousand: 25 },
    { inferencesPerAttempt: 4 },
    { aiCarbonGPerKwh: 450 },
    { aiCorrection: 1.2 },
    { aiPue: 1.3 },
  ];
  for (const variation of variations) {
    const changed = signature({ ...base, ...variation });
    assert.ok(
      changed.some((value, index) => Math.abs(value - baseline[index]) > 1e-9),
      `Sin efecto: ${Object.keys(variation)[0]}`,
    );
  }
});
