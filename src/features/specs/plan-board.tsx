import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { type Plan, type Requirement, useBdd, useRequirements, useSpecsActions } from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Progress } from "@/ui/atoms/progress";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "@/ui/icons";
import { ChevronRightIcon } from "@/ui/icons/index";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FilterBar } from "@/ui/molecules/filter-bar";
import { RefChip } from "@/ui/molecules/ref-chip";
import { StatStrip } from "@/ui/molecules/stat-strip";

const ORDER = ["fail", "blocked", "partial", "not-covered", "pass"] as const;
type Verdict = (typeof ORDER)[number];
const BADGE = {
	pass: "success",
	fail: "danger",
	partial: "warning",
	blocked: "warning",
	"not-covered": "neutral",
} as const;
type Filter = "all" | "uncovered" | "failing";
type Hit = { scenario: string; line: number; verdict: string };
type Line = { req: Requirement; hits: Hit[] };
type Section = {
	key: string;
	title: string;
	path: string | null;
	scenarios: number;
	lines: Line[];
	/** The scenarios of the plan that cite none of its requirements. */
	others: Hit[];
	verdict: Verdict;
};

/** The verdict that matters most: a failure shows before a pass. */
const worst = (verdicts: string[]): Verdict =>
	ORDER.find((v) => verdicts.includes(v)) ?? "not-covered";
const capOf = (ref: string) => ref.replace(/^spec:/, "").split("#")[0] ?? "";
const covered = (s: Section) => s.lines.filter((l) => l.hits.length > 0).length;

function VerdictBadge({ v }: { v: string }) {
	const { t } = useI18n();
	const known = (ORDER as readonly string[]).includes(v);
	return (
		<Badge variant={known ? BADGE[v as Verdict] : "neutral"}>
			{known ? t.specs.verdict[v as Verdict] : v}
		</Badge>
	);
}

/**
 * One scroll for the whole page: the figures, then one accordion row for each plan. A row shows
 * the name, the scenarios, the coverage and the last verdict. Open, it lists each requirement
 * with its scenarios, one for each line. The requirements that no plan reaches sit in the last row.
 * A capability with a requirement that no scenario cites, and that holds the text of a scenario,
 * has one button: it adds the scenarios of that text to the plan of the capability and opens it.
 */
export function PlanBoard({ plans, onOpen }: { plans: Plan[]; onOpen: (path: string) => void }) {
	const { t } = useI18n();
	const s = t.specs;
	const p = t.review.plans;
	const { openRef } = useShell();
	const act = useSpecsActions();
	const bdd = useBdd().data ?? [];
	const reqs = useRequirements().data ?? [];
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("all");
	const [open, setOpen] = useState<string[]>([]);
	const [failure, setFailure] = useState<unknown>(null);

	const reached = new Set<string>();
	const sections: Section[] = plans.map((pl) => {
		const caps = new Set(pl.refs.filter((r) => r.startsWith("spec:")).map(capOf));
		for (const c of caps) reached.add(c);
		const mine = bdd.filter((b) => b.plan === pl.path);
		const lines = reqs
			.filter((r) => caps.has(r.capability))
			.map((req) => ({ req, hits: req.scenarios.filter((h) => h.plan === pl.path) }));
		const named = new Set(lines.flatMap((l) => l.hits.map((h) => h.line)));
		return {
			key: pl.path,
			title: pl.title,
			path: pl.path,
			scenarios: pl.scenarios,
			lines,
			others: mine.filter((b) => !named.has(b.line)),
			verdict: worst(mine.map((b) => b.verdict)),
		};
	});
	const loose = reqs.filter((r) => !reached.has(r.capability));
	if (loose.length)
		sections.push({
			key: "",
			title: s.noPlan,
			path: null,
			scenarios: 0,
			lines: loose.map((req) => ({ req, hits: req.scenarios })),
			others: [],
			verdict: "not-covered",
		});

	const q = query.trim().toLowerCase();
	const has = (...texts: string[]) => !q || texts.some((x) => x.toLowerCase().includes(q));
	const okLine = (l: Line) =>
		filter === "all" ||
		(filter === "failing"
			? l.hits.some((h) => h.verdict === "fail")
			: l.hits.every((h) => h.verdict === "not-covered"));
	const okHit = (h: Hit) =>
		filter === "all" || (filter === "failing" ? h.verdict === "fail" : h.verdict === "not-covered");
	const view = sections.flatMap((sec) => {
		const all = has(sec.title);
		const lines = sec.lines.filter(
			(l) =>
				okLine(l) && (all || has(l.req.reference, l.req.title, ...l.hits.map((h) => h.scenario))),
		);
		const others = sec.others.filter((h) => okHit(h) && (all || has(h.scenario)));
		const shows = lines.length + others.length > 0 || (filter === "all" && all);
		return shows ? [{ sec, lines, others }] : [];
	});
	const count = (v: string) => bdd.filter((r) => r.verdict === v).length;
	const generate = async (cap: string) => {
		try {
			setFailure(null);
			onOpen((await act.generatePlan(cap)).path);
		} catch (e) {
			setFailure(e);
		}
	};
	const toggle = (key: string) =>
		setOpen((o) => (o.includes(key) ? o.filter((k) => k !== key) : [...o, key]));

	return (
		<>
			{bdd.length ? (
				<StatStrip
					items={[
						{ label: s.scenarios, value: String(bdd.length), icon: <CheckIcon size={14} /> },
						{ label: s.verdict.pass, value: String(count("pass")), tone: "success" },
						{ label: s.verdict.fail, value: String(count("fail")), tone: "danger" },
						{ label: s.verdict["not-covered"], value: String(count("not-covered")), tone: "info" },
					]}
				/>
			) : null}
			<FilterBar
				query={query}
				onQueryChange={setQuery}
				filters={[
					{ id: "all", label: s.filter.all },
					{ id: "uncovered", label: s.filter.uncovered },
					{ id: "failing", label: s.filter.failing },
				]}
				active={[filter]}
				onToggle={(id) => setFilter(id as Filter)}
			/>
			<ErrorNotice error={failure} />
			<ul aria-label={s.plans} className="flex flex-col rounded-lg border bg-surface-1 shadow-1">
				{view.map(({ sec, lines, others }) => {
					const isOpen = open.includes(sec.key);
					const done = covered(sec);
					const body = `plan-${sec.key || "none"}`;
					const caps = [
						...new Set(
							sec.lines
								.filter((l) => l.hits.length === 0 && l.req.detailed)
								.map((l) => l.req.capability),
						),
					];
					return (
						<li key={sec.key} className="border-b last:border-b-0">
							<h2>
								<button
									type="button"
									aria-expanded={isOpen}
									aria-controls={body}
									onClick={() => toggle(sec.key)}
									className="grid min-h-row w-full grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 text-left text-ui"
								>
									{isOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
									<span className="truncate font-medium">{sec.title}</span>
									<span className="text-12 text-n-11">
										{format(p.scenarios, { count: sec.scenarios })}
									</span>
									<span className="flex w-36 items-center gap-2">
										<Progress
											value={done}
											max={sec.lines.length}
											label={format(s.coveredOf, { covered: done, total: sec.lines.length })}
										/>
										<span className="font-mono text-12 whitespace-nowrap text-n-11">
											{done} / {sec.lines.length}
										</span>
									</span>
									<VerdictBadge v={sec.verdict} />
								</button>
							</h2>
							{isOpen ? (
								<div id={body} className="flex flex-col gap-2 px-3 pb-3 pl-9">
									<div className="flex flex-wrap gap-2">
										{sec.path ? (
											<Button onClick={() => onOpen(sec.path ?? "")}>{s.openPlan}</Button>
										) : null}
										{caps.map((cap) => (
											<RightButton
												right="specs.edit"
												key={cap}
												variant="ghost"
												aria-label={format(p.generateName, { name: cap })}
												onClick={() => void generate(cap)}
											>
												<PlusIcon size={14} />
												{p.generate}
											</RightButton>
										))}
									</div>
									<ul aria-label={`${p.requirements}: ${sec.title}`} className="flex flex-col">
										{lines.map(({ req, hits }) => (
											<li key={req.reference} className="flex flex-col border-b">
												<div className="flex min-h-row items-center gap-3 text-ui">
													<span className="shrink-0">
														<RefChip refId={req.reference} state="resolved" onOpen={openRef} />
													</span>
													<span className="min-w-0 flex-1 truncate">{req.title}</span>
													{hits.length ? (
														<VerdictBadge v={worst(hits.map((h) => h.verdict))} />
													) : (
														<Badge variant="warning">{p.noScenario}</Badge>
													)}
												</div>
												{hits.length ? (
													<ul className="flex flex-col pl-6">
														{hits.map((h) => (
															<li
																key={`${h.line}:${h.scenario}`}
																className="flex min-h-row items-center gap-3 text-ui"
															>
																<span className="min-w-0 flex-1 truncate">{h.scenario}</span>
																<VerdictBadge v={h.verdict} />
															</li>
														))}
													</ul>
												) : null}
											</li>
										))}
										{others.map((h) => (
											<li
												key={`o${h.line}:${h.scenario}`}
												className="flex min-h-row items-center gap-3 border-b text-ui"
											>
												<span className="min-w-0 flex-1 truncate">{h.scenario}</span>
												<VerdictBadge v={h.verdict} />
											</li>
										))}
									</ul>
								</div>
							) : null}
						</li>
					);
				})}
			</ul>
		</>
	);
}
