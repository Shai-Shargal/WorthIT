const MONTHLY_LIMIT = 15;

let analysesUsed = 0;

export function incrementUsage(): void {
  analysesUsed += 1;
}

export function getUsageStats() {
  return {
    analysesUsed,
    monthlyAnalysisLimit: MONTHLY_LIMIT,
    remainingAnalyses: Math.max(0, MONTHLY_LIMIT - analysesUsed),
    subscriptionPlan: 'Free',
  };
}

export function resetUsageForTests(): void {
  analysesUsed = 0;
}
