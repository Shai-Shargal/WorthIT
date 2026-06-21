export const TIER_LIMITS: Record<string, number> = {
  free: 15,
  pro: 100,
  enterprise: 999999,
};

export function isNewMonth(monthStartDate: Date): boolean {
  const now = new Date();
  return (
    now.getFullYear() > monthStartDate.getFullYear() ||
    now.getMonth() > monthStartDate.getMonth()
  );
}
