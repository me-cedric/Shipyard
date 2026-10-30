import { format, useI18n } from "@/lib/i18n";

type Request = { at: number; inputTokens: number; outputTokens: number };
type Step = { step: string; tokens: number; requests: Request[] };

const TONES = ["bg-accent-soft", "bg-info-soft", "bg-success-soft", "bg-warning-soft"];
const BAR =
	"h-6 min-w-0 truncate rounded-sm px-1 text-left text-12 text-n-12 focus-visible:outline-2 focus-visible:outline-offset-1";

/**
 * The spend of one run as a flame graph: the run on top, its steps below, the requests of each step
 * under it. A bar is as wide as its tokens. Each bar is a button, so Tab reaches it and the label reads
 * its name and tokens.
 */
export function SpendFlame({ name, steps }: { name: string; steps: Step[] }) {
	const { t } = useI18n();
	const total = steps.reduce((n, s) => n + s.tokens, 0);
	if (total === 0) return <p className="px-3 py-2 text-ui text-n-11">{t.reports.flame.none}</p>;
	const label = (n: string, count: number) => format(t.reports.flame.tokens, { name: n, count });
	return (
		<section aria-label={t.reports.flame.title} className="flex flex-col gap-0.5 p-3">
			<button type="button" aria-label={label(name, total)} className={`${BAR} w-full bg-n-5`}>
				{label(name, total)}
			</button>
			<div className="flex gap-0.5">
				{steps.map((s, i) => (
					<button
						key={s.step}
						type="button"
						aria-label={label(s.step, s.tokens)}
						title={label(s.step, s.tokens)}
						style={{ flexGrow: s.tokens, flexBasis: 0 }}
						className={`${BAR} ${TONES[i % TONES.length]}`}
					>
						{s.step}
					</button>
				))}
			</div>
			<div className="flex gap-0.5">
				{steps.map((s, i) => (
					<div
						key={s.step}
						style={{ flexGrow: s.tokens, flexBasis: 0 }}
						className="flex min-w-0 gap-px"
					>
						{s.requests.map((r) => {
							const n = r.inputTokens + r.outputTokens;
							const at = new Date(r.at * 1000).toLocaleTimeString();
							return (
								<button
									key={r.at}
									type="button"
									aria-label={label(`${s.step} ${at}`, n)}
									title={label(`${s.step} ${at}`, n)}
									style={{ flexGrow: n, flexBasis: 0 }}
									className={`h-6 min-w-0 rounded-sm opacity-70 focus-visible:outline-2 focus-visible:outline-offset-1 ${TONES[i % TONES.length]}`}
								/>
							);
						})}
					</div>
				))}
			</div>
		</section>
	);
}
