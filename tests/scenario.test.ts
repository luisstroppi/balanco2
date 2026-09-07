import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenario } from '../lib/emissions/scenario.ts';

const base = {
  demandTonnes: 10,
  conventionalKgPerTonne: 75.5,
  averageKgPerTransaction: 20,
  conversionPct: 20,
  localDistanceMinKm: 5,
  localDistanceMaxKm: 15,
  localFactorGPerTkm: 750,
  serverPowerW: 60,
  serverHours: 720,
  serverPue: 1.2,
  serverCarbonGPerKwh: 320,
  inferenceWhPerThousand: 15,
  inferencesPerAttempt: 2,
  aiCarbonGPerKwh: 320,
  aiCorrection: 1,
  aiPue: 1,
};

void test('parte de la huella fija y de toda la logística convencional', () => {
  const result = calculateScenario(base);
  const zero = result.evaluate(0);
  assert.equal(zero.platform, result.serverG);
  assert.equal(zero.conventionalRemaining, result.baselineG);
  assert.equal(zero.substitutedKg, 0);
});

void test('una conversión del 20 por ciento requiere cinco intentos por operación', () => {
  const result = calculateScenario(base);
  const point = result.evaluate(12);
  assert.equal(result.attemptsPerSuccess, 5);
  assert.equal(point.attempts, 60);
  assert.equal(point.inferenceCount, 120);
});

void test('limita la sustitución a la demanda y nunca produce emisiones convencionales negativas', () => {
  const result = calculateScenario({
    ...base,
    demandTonnes: 0.05,
    averageKgPerTransaction: 30,
  });
  const point = result.evaluate(2);
  assert.equal(result.maximumTransactions, 2);
  assert.equal(point.substitutedKg, 50);
  assert.equal(point.conventionalRemaining, 0);
});

void test('calcula la banda de distancia local y usa el punto medio para la línea', () => {
  const result = calculateScenario(base);
  const point = result.evaluate(10);
  assert.ok(point.platformMin < point.platform);
  assert.ok(point.platform < point.platformMax);
  assert.equal(point.platform, (point.platformMin + point.platformMax) / 2);
});

void test('la convergencia iguala plataforma y logística tradicional restante', () => {
  const result = calculateScenario(base);
  assert.ok(result.convergenceTransactions !== null);
  const point = result.evaluate(result.convergenceTransactions!);
  assert.ok(Math.abs(point.platform - point.conventionalRemaining) < 1e-7);
});

void test('el equilibrio climático iguala huella añadida y emisiones evitadas', () => {
  const result = calculateScenario(base);
  assert.ok(result.climateEquilibriumTransactions !== null);
  const point = result.evaluate(result.climateEquilibriumTransactions!);
  assert.ok(Math.abs(point.platform - point.conventionalAvoided) < 1e-7);
  assert.ok(Math.abs(point.netSaving) < 1e-7);
});

void test('informa que no hay equilibrio si la operación local es más intensiva', () => {
  const result = calculateScenario({
    ...base,
    localDistanceMinKm: 500,
    localDistanceMaxKm: 500,
  });
  assert.equal(result.climateEquilibriumTransactions, null);
});
