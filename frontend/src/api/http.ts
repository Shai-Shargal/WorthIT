export function parseError(res: Response, data: unknown, fallbackPrefix = 'Request failed'): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === 'string' && err.length > 0) return err;
  }
  return `${fallbackPrefix} (${res.status})`;
}
