const EARTH_RADIUS_KM = 6371;

export function parseGeoCoordinate(
  value: string | number | null | undefined,
  label: string,
): number {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim())
  ) {
    throw new Error(`Invalid ${label}`);
  }

  const n = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${label}`);
  }

  return n;
}

export function parseMaxRadiusKm(value: string | null | undefined): number {
  if (!value?.trim()) {
    throw new Error('Invalid maxRadius');
  }

  const n = Number(value.trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Invalid maxRadius');
  }

  return n;
}

export function distanceInKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function isWithinRadiusKm(
  pointLat: number,
  pointLng: number,
  centerLat: number,
  centerLng: number,
  radiusKm: number,
): boolean {
  return distanceInKm(pointLat, pointLng, centerLat, centerLng) <= radiusKm;
}
