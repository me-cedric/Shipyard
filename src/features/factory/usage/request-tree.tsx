import { useState } from "react";
import { useUsageTree } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { Select } from "@/ui/atoms/select";
import { Panel } from "@/ui/molecules/panel";

type Run = { run: string; key: string };

/**
 * FinOps request tree: the requests of one run with tokens and cost, nested by step. Legacy source:
 * `infrastructure/finops.rs` (`FinopsFlameNode`, the request tree behind the flame graph).
 */
export function RequestTree({ runs }: { runs: Run[] }) {
	const { t, lang } = useI18n();
	const f = t.factory;
	const [picked, setPicked] = useState<string | null>(null);
	const run = picked ?? runs[0]?.run ?? null;
	const tree = useUsageTree(run).data;
	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	const time = new Intl.DateTimeFormat(lang, { timeStyle: "medium" });
	if (runs.length === 0) return null;
	return (
		<Panel
			title={f.requestTree}
			toolbar={
				<Select
					label={f.treeRun}
					value={run ?? ""}
					onValueChange={setPicked}
					items={runs.map((r) => ({ value: r.run, label: r.key }))}
				/>
			}
			flush
		>
			<ul className="flex flex-col">
				{(tree?.steps ?? []).map((s) => (
					<li key={s.step} className="border-b">
						<details open>
							<summary className="flex min-h-row cursor-pointer items-center gap-3 px-3 text-ui font-medium focus-visible:outline-2">
								<span className="min-w-0 flex-1 truncate font-mono">{s.step}</span>
								<span className="text-12 text-n-11">{s.tokens.toLocaleString()}</span>
								<span className="w-16 text-right text-12">{money.format(s.usd ?? 0)}</span>
							</summary>
							<ul className="flex flex-col">
								{s.requests.map((r) => (
									<li
										key={r.at}
										className="flex min-h-row items-center gap-3 pr-3 pl-8 text-12 text-n-11"
									>
										<time className="flex-1" dateTime={new Date(r.at * 1000).toISOString()}>
											{time.format(new Date(r.at * 1000))}
										</time>
										<span>
											{f.tokensIn} {r.inputTokens.toLocaleString()}
										</span>
										<span>
											{f.tokensOut} {r.outputTokens.toLocaleString()}
										</span>
										<span className="w-16 text-right">{money.format(r.usd ?? 0)}</span>
									</li>
								))}
							</ul>
						</details>
					</li>
				))}
			</ul>
		</Panel>
	);
}
