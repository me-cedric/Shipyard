import type { QualityReport } from "@/lib/code";

/** Points lost for one finding. A critical costs 25, so four end at 0. */
const PENALTY: Record<string, number> = { critical: 25, high: 10, medium: 4, low: 1 };

/** 100 minus the penalty of each finding of the last scanner reports, never below 0. `null`: no scan ran. */
export function securityScore(reports: (QualityReport | null)[]): number | null {
	const ran = reports.filter((r): r is QualityReport => r !== null);
	if (ran.length === 0) return null;
	const lost = ran.flatMap((r) => r.findings).reduce((n, f) => n + (PENALTY[f.severity] ?? 2), 0);
	return Math.max(0, 100 - lost);
}
