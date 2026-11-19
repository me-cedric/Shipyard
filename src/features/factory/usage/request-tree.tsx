import { useState } from "react";
import { useUsageTree } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import { Card } from "@/ui/molecules/card";
import { SpendFlame } from "./spend-flame";

type Run = { run: string; key: string; title?: string };

const BOX = "flex items-center gap-3 rounded-md bg-n-3 px-4 py-3";

/**
 * The requests of one run (picture 078): the run, its steps and the requests of each step with
 * tokens and cost, as a tree or as a flame graph. `run` is the run in the address; none picks the first.
 */
export function RequestTree({
	runs,
	run: picked,
	onRun,
}: {
	runs: Run[];
	run?: string | null;
	onRun?: (run: string) => void;
}) {
	const { t, lang } = useI18n();
	const f = t.factory;
	const s = f.spendPage;
	const [mine, setMine] = useState<string | null>(null);
	const [view, setView] = useState<"tree" | "flame">("tree");
	const run = runs.find((r) => r.run === (picked ?? mine))?.run ?? runs[0]?.run ?? null;
	const tree = useUsageTree(run).data;
	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	const time = new Intl.DateTimeFormat(lang, { timeStyle: "medium" });
	if (runs.length === 0) return null;
	const name = runs.find((r) => r.run === run)?.key ?? "";
	return (
		<Card pad className="flex flex-[1.5_1_24rem] flex-col gap-2">
			<div className="flex items-center gap-3">
				<h2 className="mr-auto text-13 font-semibold text-n-11">{s.requests}</h2>
				<Select
					label={f.treeRun}
					className="min-h-control"
					value={run ?? ""}
					onValueChange={(v) => (onRun ? onRun(v) : setMine(v))}
					items={runs.map((r) => ({ value: r.run, label: r.title ?? r.key }))}
				/>
			</div>
			{view === "flame" ? (
				<SpendFlame name={name} steps={tree?.steps ?? []} />
			) : (
				<>
					<div className={`${BOX} font-semibold`}>
						<span className="mr-auto">{f.run}</span>
						<span>{money.format(tree?.usd ?? 0)}</span>
					</div>
					<ul className="flex flex-col gap-2">
						{(tree?.steps ?? []).map((st) => (
							<li key={st.step}>
								<details open className="ml-6 flex flex-col gap-2">
									<summary className={`${BOX} cursor-pointer`}>
										<span className="mr-auto min-w-0 flex-1 truncate">{st.step}</span>
										<span className="text-12 text-n-11">{st.tokens.toLocaleString()}</span>
										<span>{money.format(st.usd ?? 0)}</span>
									</summary>
									<ul className="ml-6 flex flex-col gap-2">
										{st.requests.map((r) => (
											<li key={r.at} className={`${BOX} text-12 text-n-11`}>
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
				</>
			)}
			<div className="w-48 self-start">
				<Segmented
					label={s.picture}
					value={view}
					onValueChange={setView}
					items={[
						{ value: "tree", label: s.tree },
						{ value: "flame", label: s.flame },
					]}
				/>
			</div>
		</Card>
	);
}
