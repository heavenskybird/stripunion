// Existing canonical web stream, verified against the first-party GA4 Admin
// snapshot (property 530171093, defaultUri https://stripunion.com). Public ID.
export const DEFAULT_GA4_MEASUREMENT_ID = 'G-K57BRX69X1';
export function resolveGa4MeasurementId(configured) {
  const value = String(configured || '').trim() || DEFAULT_GA4_MEASUREMENT_ID;
  if (!/^G-[A-Z0-9]{4,20}$/i.test(value)) throw new Error('Invalid public GA4 measurement configuration.');
  return value;
}
