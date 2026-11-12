import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { PageExport } from "@/features/reports/page-export";
import { type QualityReport, useCoverageReport, useForgeActions, useQuality } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import type { SbomReport } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { cn, formatDuration } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { StatusDot } from "@/ui/atoms/status-dot";
import {
	ArrowPathIcon,
	CheckIcon,
	CommandLineIcon,
	InformationCircleIcon,
	LockClosedIcon,
} from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FindingRow } from "@/ui/molecules/finding-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { withProject } from "./project-gate";
import { beginRun, endRun, RunLive, runKey, useLiveRuns } from "./quality-live";
import { QualitySetup } from "./quality-setup";
import { securityScore } from "./security-score";
import { SEVERITY_STATUS } from "./status";
import { useRun } from "./use-run";
import { FileDialog } from "./viewer";

/** The name of the check that verifies all docs, as the backend gives it. */
const VERIFY_DOCS = "verify all docs";
/** The check that lists the docs that did not follow the code, as the backend names it. */
const DOCS_FRESH = "docs freshness";

type Row = {
	name: string;
	label?: string | null;
	command?: string;
	available: boolean;
	last: QualityReport | null;
};

/** The tool that the app installs, by the program that a failed check could not find. */
const TOOLS: Record<string, string> = {
	pnpm: "pnpm",
	node: "node",
	npm: "node",
	git: "git",
	cargo: "rust",
};
const MISSING = /^(\S+) is not installed or not found$/;

/** The info text of a check, by its command. Any other gate command has the generic text. */
function infoKey(r: Row, kind: "check" | "scanner") {
	if (kind === "scanner") return r.name;
	const id = `${r.label ?? ""} ${r.name}`;
	return r.name === VERIFY_DOCS
		? "verifyDocs"
		: r.name === DOCS_FRESH
			? "docs"
			: /cargo fmt/.test(id)
				? "fmt"
				: /cargo clippy/.test(id)
					? "clippy"
					: /cargo test/.test(id)
						? "cargoTest"
						: /typecheck|tsc/.test(id)
							? "typecheck"
							: /lint/.test(id)
								? "lint"
								: /test/.test(id)
									? "test"
									: "generic";
}

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3 p-3";
const LINE = {
	active: "bg-accent",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	idle: "bg-n-7",
} as const;
const TILE = {
	active: "bg-info-soft text-info-text",
	success: "bg-success-soft text-success-text",
	warning: "bg-warning-soft text-warning-text",
	danger: "bg-danger-soft text-danger-text",
	idle: "bg-n-3 text-n-11",
} as const;

function QualityView() {
	const { t, lang } = useI18n();
	const quality = useQuality();
	const q = quality.data;
	const coverage = useCoverageReport().data;
	const { check, scan, install, installTool, sbom } = useForgeActions();
	const { error, run } = useRun();
	const { runInTerminal } = useShell();
	const running = useLiveRuns();
	const [confirming, setConfirming] = useState<string | null>(null);
	const [installing, setInstalling] = useState<string | null>(null);
	const [shown, setShown] = useState<string | null>(null);
	const [setting, setSetting] = useState(false);
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
	// A named command and the check that verifies all docs have a plain name for people.
	const nameOf = (r: Row) =>
		(r.label && (q18.named as Record<string, string>)[r.label]) ||
		(r.name === VERIFY_DOCS
			? t.review.quality.verifyDocs
			: r.name === DOCS_FRESH
				? t.review.quality.docs
				: r.name);

	// A run needs a confirmation that names the check (REQ-026).
	const rows = (kind: "check" | "scanner", items: Row[]) =>
		items.map((r) => {
			const key = runKey(kind, r.name);
			const last = r.last;
			const live = running.get(key);
			// A run that passed with findings is a warning; Failed is only for `passed: false`.
			const status = live
				? "active"
				: !last
					? "idle"
					: !last.passed
						? "danger"
						: last.findings.length > 0
							? "warning"
							: "success";
			const label = live
				? q18.running
				: status === "idle"
					? q18.never
					: status === "danger"
						? q18.failed
						: status === "warning"
							? q18.warnings
							: q18.passed;
			const info = (q18.info as Record<string, string[]>)[infoKey(r, kind)] ?? q18.info.generic;
			return (
				<Card
					key={key}
					id={`check-${r.name}`}
					className={cn(
						"relative flex flex-col gap-2 overflow-hidden p-3",
						shown === key && "col-span-full",
					)}
				>
					<span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5", LINE[status])} />
					<div className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className={cn(
								"flex size-8 shrink-0 items-center justify-center rounded-md",
								TILE[status],
							)}
						>
							{kind === "check" ? <CheckIcon size={14} /> : <LockClosedIcon size={14} />}
						</span>
						<h3 className="min-w-0 flex-1 truncate font-mono text-ui text-n-12">{nameOf(r)}</h3>
						<Popover.Root>
							<Popover.Trigger
								aria-label={format(q18.about, { name: nameOf(r) })}
								className="inline-flex size-(--row-h) shrink-0 items-center justify-center rounded-md text-n-11 hover:bg-n-3 hover:text-n-12"
							>
								<InformationCircleIcon size={16} />
							</Popover.Trigger>
							<Popover.Portal>
								<Popover.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
									<Popover.Popup
										aria-label={format(q18.about, { name: nameOf(r) })}
										className="flex w-72 flex-col gap-2 rounded-lg border border-n-6 bg-surface-3 p-3 text-ui text-n-12 shadow-3"
									>
										{info.map((line) => (
											<p key={line}>{line}</p>
										))}
									</Popover.Popup>
								</Popover.Positioner>
							</Popover.Portal>
						</Popover.Root>
						{r.command ? (
							<IconButton
								label={format(q18.terminal, { name: nameOf(r) })}
								onClick={() => r.command && runInTerminal(r.command)}
							>
								<CommandLineIcon size={16} />
							</IconButton>
						) : null}
						<Badge variant={status === "idle" ? "neutral" : status === "active" ? "info" : status}>
							<StatusDot status={status} label={label} className="size-2" />
							<span aria-hidden="true">{label}</span>
						</Badge>
					</div>
					{r.label && nameOf(r) !== r.name ? (
						<p className="truncate font-mono text-12 text-n-11">{r.name}</p>
					) : null}
					{live ? <RunLive run={live} name={nameOf(r)} /> : null}
					<div className="flex min-h-row items-center gap-2">
						{last ? (
							<>
								<span className="flex-1 text-12 text-n-11">
									{r.name === DOCS_FRESH
										? `${format(t.review.quality.staleDocs, { count: last.findings.length })} · `
										: null}
									{formatDuration(last.durationMs, lang)} ·{" "}
									{format(q18.at, { date: date.format(new Date(last.at)) })}
								</span>
								{last.findings.length > 0 ? (
									<Button variant="ghost" onClick={() => setShown(shown === key ? null : key)}>
										{q18.findings}
									</Button>
								) : null}
							</>
						) : (
							<span className="flex-1" />
						)}
						{r.available ? (
							confirming === key ? (
								<RightButton
									right="runs.start"
									variant="primary"
									onClick={() =>
										void run(async () => {
											setConfirming(null);
											beginRun(key);
											try {
												await (kind === "check" ? check(r.name) : scan(r.name));
											} finally {
												endRun(key);
											}
										})
									}
								>
									{format(q18.confirm, {
										name: r.label ? `${nameOf(r)} (${r.name})` : nameOf(r),
									})}
								</RightButton>
							) : (
								<RightButton
									right="runs.start"
									aria-label={format(q18.runName, { name: nameOf(r) })}
									disabled={!!live}
									onClick={() => setConfirming(key)}
								>
									<ArrowPathIcon size={14} />
									{q18.run}
								</RightButton>
							)
						) : (
							<>
								<span className="text-12 text-n-11">{q18.notInstalled}</span>
								<Button
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
								</Button>
							</>
						)}
					</div>
					{last && shown === key ? (
						<div className="-mx-3 -mb-3 border-t">
							{last.findings.map((f, i) => {
								// A finding with no path is the reason that a check failed.
								const tool = TOOLS[MISSING.exec(f.message)?.[1] ?? ""];
								return (
									<FindingRow
										// biome-ignore lint/suspicious/noArrayIndexKey: the findings never reorder
										key={i}
										status={SEVERITY_STATUS[f.severity] ?? "idle"}
										title={f.path ? `${q18.severity[f.severity]}: ${f.message}` : f.message}
										action={
											!f.path && tool
												? {
														label: format(q18.installName, { name: tool }),
														onClick: () => void run(() => installTool(tool)),
													}
												: undefined
										}
										source={
											f.path ? (
												<Button
													variant="ghost"
													aria-label={format(q18.open, { path: f.path })}
													onClick={() => setViewing({ path: f.path, line: f.line })}
												>
													{f.path}
													{f.line ? `:${f.line}` : ""}
												</Button>
											) : undefined
										}
									/>
								);
							})}
							{last.tail ? (
								<pre className="overflow-x-auto px-3 py-1 font-mono text-12">{last.tail}</pre>
							) : null}
						</div>
					) : null}
				</Card>
			);
		});

	const reports = q.scanners.map((r) => r.last);
	const score = securityScore(reports);
	const found = reports.reduce((n, r) => n + (r?.findings.length ?? 0), 0);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				icon={<CheckIcon size={16} />}
				title={t.tabs.code.quality}
				count={q.checks.length + q.scanners.length}
				action={<PageExport page="security" />}
			/>
			{error ? (
				<p role="alert" className="px-4 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="flex flex-col gap-3 px-4 pt-1 pb-4">
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
				<Panel title={q18.sbom} bodyClassName="flex items-center gap-3 p-3">
					<RightButton
						right="code.write"
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
				<Panel
					title={q18.checks}
					count={q.checks.length}
					bodyClassName={GRID}
					toolbar={<Button onClick={() => setSetting(true)}>{q18.setup}</Button>}
				>
					{rows("check", q.checks)}
				</Panel>
				<Panel title={q18.scanners} count={q.scanners.length} bodyClassName={GRID}>
					{rows("scanner", q.scanners)}
				</Panel>
			</div>
			{setting ? <QualitySetup onClose={() => setSetting(false)} /> : null}
			{viewing ? (
				<FileDialog path={viewing.path} line={viewing.line} onClose={() => setViewing(null)} />
			) : null}
		</div>
	);
}

export const Quality = withProject(QualityView, "quality");
