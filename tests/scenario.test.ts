import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenario } from '../lib/emissions/scenario.ts';

const base = {
  demandTonnes: 0.26,
  conventionalKgPerTonne: 75.5,
  localDistanceKm: 15,
  localFactorGPerTkm: 750,
  serverPowerW: 60,
  serverHours: 720,
  serverPue: 1.2,
  serverCarbonGPerKwh: 320,
  inferenceWhPerThousand: 15,
  inferencesAtFullAdoption: 65,
  aiCarbonGPerKwh: 320,
  aiCorrection: 1,
  aiPue: 1,
};

void test('reproduce el control de 13 canastas del manuscrito', () => {
  const result = calculateScenario(base);
  assert.equal(result.serverKg.toFixed(4), '16.5888');
  assert.equal(result.localKgPerTonne, 11.25);
  assert.ok(result.equilibriumTonnes !== null);
  assert.equal((result.equilibriumTonnes! / 0.02).toFixed(2), '12.91');
});

void test('mantiene el mismo período y cantidad en los extremos', () => {
  const result = calculateScenario(base, 1);
  assert.equal(result.points[0].alternative, result.baselineKg + result.serverKg);
  assert.equal(result.points[1].conventional, 0);
  assert.equal(result.points[1].localTonnes, base.demandTonnes);
});

void test('no inventa equilibrio cuando el circuito local es más intensivo', () => {
  const result = calculateScenario({ ...base, localDistanceKm: 500 });
  assert.equal(result.equilibriumTonnes, null);
});
