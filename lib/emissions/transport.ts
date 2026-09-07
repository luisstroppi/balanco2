export type TransportRecord = {
  same: number;
  km: number;
  n: number;
  m: number;
  np: number;
  mp: number;
};

export type TransportSettings = {
  plausibleOnly: boolean;
  circuity: number;
  sameAreaKm: number;
  factorGPerTkm: number;
};

export function measureTransport(
  record: TransportRecord,
  settings: TransportSettings,
) {
  const trips = settings.plausibleOnly ? record.np : record.n;
  const massTonnes = settings.plausibleOnly ? record.mp : record.m;
  if (!(trips > 0) || !(massTonnes > 0)) return null;

  const distanceKm = record.same
    ? settings.sameAreaKm
    : record.km * settings.circuity;
  const activityTonneKm = massTonnes * distanceKm;
  return {
    trips,
    massTonnes,
    distanceKm,
    activityTonneKm,
    emissionsG: activityTonneKm * settings.factorGPerTkm,
  };
}
