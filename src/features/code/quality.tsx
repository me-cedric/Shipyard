import { useState } from "react";
import { PageExport } from "@/features/reports/page-export";
import { useCoverageReport, useForgeActions, useQuality } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import type { SbomReport } from "@/lib/ipc";
import { RightButton, RightIconButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { formatDuration } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Button } from "@/ui/atoms/button";
import { ArrowPathIcon, CheckIcon, CommandLineIcon, LockClosedIcon } from "@/ui/icons";
import { ATTENTION_FRAME } from "@/ui/molecules/attention-card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FindingRow } from "@/ui/molecules/finding-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { withProject } from "./project-gate";
import { beginRun, endRun, runKey, useLiveRuns } from "./quality-live";
import {
	DOCS_FRESH,
	GateTile,
	infoKey,
	MISSING,
	RANK,
	type Row,
	statusOf,
	TOOLS,
	VERIFY_DOCS,
} from "./quality-page";
import { QualitySetup } from "./quality-setup";
import { securityScore } from "./security-score";
import { SEVERITY_STATUS } from "./status";
import { useRun } from "./use-run";
import { FileDialog } from "./viewer";

type Kind = "check" | "scanner";
/** What the panel in place shows: a gate, the score, the parts list or the scanners. */
type Shown = string | "score" | "sbom" | "scanners" | null;

function QualityView() {
	const { t, lang } = useI18n();
	const quality = useQuality();
	const q = quality.data;
	const coverage = useCoverageReport().data;
	const { check, scan, install, installTool, sbom } = useForgeActions();
	const { error, run } = useRun();
	const { runInTerminal, ask } = useShell();
	// Health shows for every role: a role with no level on code reads the gates, not the files.
	const noCode = useRights().level("code") === "none";
	const running = useLiveRuns();
	const [confirming, setConfirming] = useState<string | null>(null);
	const [installing, setInstalling] = useState<string | null>(null);
	const [shown, setShown] = useState<Shown>(null);
	const [setting, setSetting] = useState(false);
	const [allAsk, setAllAsk] = useState(false);
	const [exported, setExported] = useState<SbomReport | null>(null);
	const [viewing, setViewing] = useState<{ path: string; line: number | null } | null>(null);
	if (!q)
		return (
			<>
				<PageHeader icon={<CheckIcon size={16} />} title={t.tabs.code.quality} />
				<ErrorNotice error={quality.error} className="px-4 py-2" />
			</>
		);
	const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
	const q18 = t.forge.quality;
	const h = t.flow.health;
	const i = t.flow.look.impact.health;
	const cx = t.flow.look.checks;
	// A named command and the check that verifies all docs have a plain name for people.
	const nameOf = (r: Row) =>
		(r.label && (q18.named as Record<string, string>)[r.label]) ||
		(r.name === VERIFY_DOCS
			? t.review.quality.verifyDocs
			: r.name === DOCS_FRESH
				? t.review.quality.docs
				: r.name);
	const toggle = (key: Shown) => setShown(shown === key ? null : key);

	// A run needs a confirmation that names the check (REQ-026).
	const runOne = async (kind: Kind, name: string) => {
		const key = runKey(kind, name);
		beginRun(key);
		try {
			await (kind === "check" ? check(name) : scan(name));
		} finally {
			endRun(key);
		}
	};
	const gates = [
		...q.checks.map((r) => ({ kind: "check" as const, r })),
		...q.scanners.map((r) => ({ kind: "scanner" as const, r })),
	].map((g) => {
		const key = runKey(g.kind, g.r.name);
		const live = running.get(key);
		return { ...g, key, live, status: statusOf(g.r.last, !!live) };
	});
	const runButton = (g: (typeof gates)[number], className?: string) =>
		confirming === g.key ? (
			<RightButton
				right="runs.start"
				variant="primary"
				className={`min-h-control ${className ?? ""}`}
				onClick={() =>
					void run(async () => {
						setConfirming(null);
						await runOne(g.kind, g.r.name);
					})
				}
			>
				{format(q18.confirm, {
					name: g.r.label ? `${nameOf(g.r)} (${g.r.name})` : nameOf(g.r),
				})}
			</RightButton>
		) : (
			<RightButton
				right="runs.start"
				className={`min-h-control ${className ?? ""}`}
				aria-label={format(q18.runName, { name: nameOf(g.r) })}
				disabled={!!g.live}
				onClick={() => setConfirming(g.key)}
			>
				{q18.run}
			</RightButton>
		);
	const tiles = [...gates].sort((a, b) => RANK[a.status] - RANK[b.status]);
	const failing = tiles.filter((g) => g.status === "danger" || g.status === "warning");
	const firstWithFindings = failing.find((g) => g.r.last?.findings.length);
	const reports = q.scanners.map((r) => r.last);
	const score = securityScore(reports);
	const found = reports.reduce((n, r) => n + (r?.findings.length ?? 0), 0);
	const toFix = failing.length;
	const open = tiles.find((g) => g.key === shown);
	const runnable = gates.filter((g) => g.r.available);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				icon={<CheckIcon size={16} />}
				title={toFix === 0 ? h.clean : toFix === 1 ? h.fixOne : format(h.fixMany, { count: toFix })}
			/>
			{error ? (
				<p role="alert" className="px-4 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="flex flex-col gap-6 px-4 pt-1 pb-10">
				{toFix > 0 ? (
					<section
						aria-label={format(i.failing, { names: failing.map((g) => nameOf(g.r)).join(", ") })}
						className={`flex flex-wrap items-center gap-4 rounded-lg bg-surface-2 px-6 py-5 shadow-2 ${ATTENTION_FRAME}`}
					>
						<div className="mr-auto flex items-center gap-3">
							<Avatar agent name={cx.builder} />
							<h2 className="text-20 font-semibold text-n-12">
								{format(i.failing, { names: failing.map((g) => nameOf(g.r)).join(", ") })}
							</h2>
						</div>
						{firstWithFindings ? (
							<Button onClick={() => setShown(firstWithFindings.key)}>{i.showFindings}</Button>
						) : null}
						<Button
							variant="primary"
							onClick={() =>
								ask(format(cx.fixAsk, { failing: failing.map((g) => nameOf(g.r)).join(", ") }))
							}
						>
							{cx.fix}
						</Button>
					</section>
				) : null}
				<div className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3.5">
					{/* One grid for both kinds, the failing ones first. Each kind is a named group with its count: the wrappers draw no box, `order` sets the place. */}
					{(["check", "scanner"] as const).map((kind) => {
						const own = tiles.filter((g) => g.kind === kind);
						return (
							// biome-ignore lint/a11y/useSemanticElements: a fieldset draws a border and a legend; the group only names and counts a kind
							<div
								key={kind}
								role="group"
								aria-label={`${kind === "check" ? q18.checks : q18.scanners} (${own.length})`}
								className="contents"
							>
								{/* The name of the kind for assistive technology: the tiles are h3, so each group needs an h2 (heading order) also when no gate fails. */}
								<h2 className="sr-only">{kind === "check" ? q18.checks : q18.scanners}</h2>
								{own.map((g) => {
									const { r, key, live, status } = g;
									const last = r.last;
									const label = live
										? q18.running
										: status === "idle"
											? q18.never
											: status === "danger"
												? q18.failed
												: status === "warning"
													? q18.warnings
													: cx.pass;
									const info =
										(q18.info as Record<string, string[]>)[infoKey(r, g.kind)] ?? q18.info.generic;
									const showOpen = last && !live && !(confirming === key && shown !== key);
									return (
										<GateTile
											order={tiles.indexOf(g)}
											key={key}
											id={`check-${r.name}`}
											kind={g.kind}
											name={nameOf(r)}
											info={info}
											status={status}
											label={
												r.name === DOCS_FRESH && last && last.findings.length > 0 && !live
													? format(t.review.quality.staleDocs, { count: last.findings.length })
													: r.available
														? label
														: q18.notInstalled
											}
											live={live}
											action={
												!r.available ? (
													<Button
														className="min-h-control flex-1"
														aria-label={`${i.setupOne} ${nameOf(r)}`}
														onClick={() => setShown("scanners")}
													>
														{i.setupOne}
													</Button>
												) : showOpen ? (
													<Button
														className="min-h-control flex-1"
														aria-label={format(i.openName, { name: nameOf(r) })}
														aria-expanded={shown === key}
														onClick={() => toggle(key)}
													>
														{i.open}
													</Button>
												) : (
													runButton(g, "flex-1")
												)
											}
										/>
									);
								})}
							</div>
						);
					})}
				</div>
				<div className="flex flex-wrap gap-3">
					{allAsk ? (
						<RightButton
							right="runs.start"
							variant="primary"
							onClick={() =>
								void run(async () => {
									setAllAsk(false);
									for (const g of runnable) await runOne(g.kind, g.r.name);
								})
							}
						>
							{format(i.runAllConfirm, { count: runnable.length })}
						</RightButton>
					) : (
						<RightButton right="runs.start" variant="primary" onClick={() => setAllAsk(true)}>
							{i.runAll}
						</RightButton>
					)}
					<Button aria-expanded={shown === "scanners"} onClick={() => toggle("scanners")}>
						{i.setupScanners}
					</Button>
					<Button aria-expanded={shown === "score"} onClick={() => toggle("score")}>
						{q18.score}
					</Button>
					<Button aria-expanded={shown === "sbom"} onClick={() => toggle("sbom")}>
						{i.sbom}
					</Button>
				</div>
				{open?.r.last ? (
					<Panel
						title={nameOf(open.r)}
						bodyClassName="gap-3 p-3"
						toolbar={
							<>
								{open.r.command ? (
									<RightIconButton
										right="code.write"
										label={format(q18.terminal, { name: nameOf(open.r) })}
										onClick={() => open.r.command && runInTerminal(open.r.command)}
									>
										<CommandLineIcon size={16} />
									</RightIconButton>
								) : null}
								{runButton(open)}
								<Button className="min-h-control" onClick={() => setShown(null)}>
									{i.close}
								</Button>
							</>
						}
					>
						<p className="text-12 text-n-11">
							{formatDuration(open.r.last.durationMs, lang)} ·{" "}
							{format(q18.at, { date: date.format(new Date(open.r.last.at)) })}
						</p>
						<div className="-mx-3 -mb-3 border-t">
							{open.r.last.findings.map((f, n) => {
								// A finding with no path is the reason that a check failed.
								const tool = TOOLS[MISSING.exec(f.message)?.[1] ?? ""];
								return (
									<FindingRow
										// biome-ignore lint/suspicious/noArrayIndexKey: the findings never reorder
										key={n}
										status={SEVERITY_STATUS[f.severity] ?? "idle"}
										title={f.path ? `${q18.severity[f.severity]}: ${f.message}` : f.message}
										source={
											f.path ? (
												<Button
													variant="ghost"
													aria-label={format(q18.open, { path: f.path })}
													disabled={noCode}
													reason={noCode ? t.rights.noAccess : undefined}
													onClick={() => setViewing({ path: f.path, line: f.line })}
												>
													{f.path}
													{f.line ? `:${f.line}` : ""}
												</Button>
											) : tool ? (
												<RightButton
													right="code.write"
													variant="ghost"
													className="border-n-7"
													onClick={() => void run(() => installTool(tool))}
												>
													{format(q18.installName, { name: tool })}
												</RightButton>
											) : undefined
										}
									/>
								);
							})}
							{open.r.last.tail ? (
								<pre className="overflow-x-auto px-3 py-1 font-mono text-12">
									{open.r.last.tail}
								</pre>
							) : null}
						</div>
					</Panel>
				) : null}
				{shown === "scanners" ? (
					<Panel title={i.setupScanners} count={q.scanners.length} flush>
						{q.scanners.map((r) => (
							<div
								key={r.name}
								className="flex min-h-row items-center gap-3 border-b px-3 text-ui last:border-b-0"
							>
								<span className="min-w-0 flex-1 truncate text-n-12">{nameOf(r)}</span>
								{r.available ? (
									<span className="text-n-11">{q18.passed}</span>
								) : (
									<>
										<span className="text-n-11">{q18.notInstalled}</span>
										<RightButton
											right="code.write"
											className="min-h-control"
											aria-label={format(q18.installName, { name: r.name })}
											busy={installing === r.name}
											onClick={() =>
												void run(async () => {
													setInstalling(r.name);
													try {
														await install(r.name);
													} finally {
														setInstalling(null);
													}
												})
											}
										>
											{q18.install}
										</RightButton>
									</>
								)}
							</div>
						))}
					</Panel>
				) : null}
				{shown === "score" ? (
					<Panel
						title={q18.score}
						bodyClassName="gap-3 p-3"
						toolbar={<PageExport page="security" />}
					>
						<StatStrip
							items={[
								{
									label: q18.score,
									value: score === null ? "-" : String(score),
									icon: <LockClosedIcon size={14} />,
									tone:
										score === null
											? "info"
											: score >= 80
												? "success"
												: score >= 50
													? "warning"
													: "danger",
								},
								{
									label: q18.scanned,
									value: `${reports.filter(Boolean).length}/${q.scanners.length}`,
									icon: <CheckIcon size={14} />,
								},
								{
									label: q18.findingsTotal,
									value: String(found),
									icon: <ArrowPathIcon size={14} />,
									tone: reports.some((r) => r && !r.passed)
										? "danger"
										: found > 0
											? "warning"
											: "success",
								},
								...(coverage
									? [
											{
												label: t.review.quality.coverage,
												value: `${coverage.percent}%`,
												icon: <CheckIcon size={14} />,
												tone:
													coverage.percent >= 80
														? ("success" as const)
														: coverage.percent >= 50
															? ("warning" as const)
															: ("danger" as const),
											},
										]
									: []),
							]}
						/>
					</Panel>
				) : null}
				{shown === "sbom" ? (
					<Panel title={q18.sbom} bodyClassName="flex items-center gap-3 p-3">
						<RightButton
							right="code.write"
							className="min-h-control"
							aria-label={q18.exportSbom}
							onClick={() => void run(async () => setExported(await sbom()))}
						>
							{q18.exportSbom}
						</RightButton>
						{exported ? (
							<span role="status" className="text-ui text-n-11">
								{format(q18.sbomDone, { count: exported.components, path: exported.path })}
							</span>
						) : null}
					</Panel>
				) : null}
				<section
					aria-label={i.commands}
					className="flex flex-col rounded-xl bg-surface-2 py-2 shadow-2"
				>
					<div className="flex min-h-row items-center gap-3 px-6">
						<h2 className="flex-1 text-15 font-semibold text-n-12">{i.commands}</h2>
						<RightButton
							right="project.settings"
							className="min-h-control"
							onClick={() => setSetting(true)}
						>
							{i.edit}
						</RightButton>
					</div>
				</section>
			</div>
			{setting ? <QualitySetup onClose={() => setSetting(false)} /> : null}
			{viewing ? (
				<FileDialog path={viewing.path} line={viewing.line} onClose={() => setViewing(null)} />
			) : null}
		</div>
	);
}

export const Quality = withProject(QualityView, "quality");
