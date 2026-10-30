import { format, useI18n } from "@/lib/i18n";
import type { Gauge as GaugeData } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/** A ring and its text value. The value reads "60 %" for assistive tools too. */
function Meter({ label, percent, ring }: { label: string; percent: number; ring?: boolean }) {
	const { t } = useI18n();
	const value = Math.min(100, Math.max(0, Math.round(percent)));
	const text = format(t.assistant.percent, { percent: value });
	const c = 2 * Math.PI * 9;
	return (
		// biome-ignore lint/a11y/useSemanticElements: a <meter> cannot hold the ring
		<span
			role="meter"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={value}
			aria-valuetext={text}
			className="inline-flex items-center gap-1 text-11 text-n-11"
		>
			{ring ? (
				<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
					<circle cx="12" cy="12" r="9" fill="none" strokeWidth="2.5" className="stroke-n-5" />
					<circle
						cx="12"
						cy="12"
						r="9"
						fill="none"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeDasharray={c}
						strokeDashoffset={c * (1 - value / 100)}
						className={cn(
							"transition-[stroke-dashoffset] duration-(--duration-base)",
							value >= 80 ? "stroke-danger" : value >= 60 ? "stroke-warning" : "stroke-accent",
						)}
					/>
				</svg>
			) : (
				<span aria-hidden="true">{label}</span>
			)}
			<span aria-hidden="true">{text}</span>
		</span>
	);
}

/** The share of the context window, then the quota windows that the runner reports. */
export function GaugeView({ gauge }: { gauge: GaugeData }) {
	const { t } = useI18n();
	const percent = gauge.windowTokens ? (gauge.usedTokens / gauge.windowTokens) * 100 : 0;
	return (
		<span className="flex flex-wrap items-center gap-2">
			<Meter ring label={t.assistant.ring} percent={percent} />
			{gauge.quotas.map((q) => (
				<Meter key={q.label} label={`${t.assistant.quotas} ${q.label}`} percent={q.percent} />
			))}
		</span>
	);
}
