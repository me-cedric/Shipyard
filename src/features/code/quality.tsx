import { useState } from "react";
import { type QualityReport, useForgeActions, useQuality } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon, CheckIcon, LockClosedIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { FindingRow } from "@/ui/molecules/finding-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { withProject } from "./project-gate";
import { SEVERITY_STATUS } from "./status";
import { useRun } from "./use-run";
import { FileDialog } from "./viewer";

type Row = { name: string; available: boolean; last: QualityReport | null };

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3 p-3";
const LINE = { success: "bg-success", danger: "bg-danger", idle: "bg-n-7" } as const;
const TILE = {
	success: "bg-success-soft text-success-text",
	danger: "bg-danger-soft text-danger-text",
	idle: "bg-n-3 text-n-11",
} as const;

function QualityView() {
	const { t, lang } = useI18n();
	const q = useQuality().data;
	const { check, scan } = useForgeActions();
	const { error, run } = useRun();
	const [confirming, setConfirming] = useState<string | null>(null);
	const [shown, setShown] = useState<string | null>(null);
	const [viewing, setViewing] = useState<{ path: string; line: number | null } | null>(null);
	if (!q) return null;
	const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
	const q18 = t.forge.quality;

	// A run needs a confirmation that names the check (REQ-026).
	const rows = (kind: "check" | "scanner", items: Row[]) =>
		items.map((r) => {
			const key = `${kind}:${r.name}`;
			const last = r.last;
			const status = last ? (last.passed ? "success" : "danger") : "idle";
			const label = last ? (last.passed ? q18.passed : q18.failed) : q18.never;
			return (
				<Card
					key={key}
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
						<h3 className="min-w-0 flex-1 truncate font-mono text-ui text-n-12">{r.name}</h3>
						<Badge variant={status === "idle" ? "neutral" : status}>
							<StatusDot status={status} label={label} className="size-2" />
							<span aria-hidden="true">{label}</span>
						</Badge>
					</div>
					<div className="flex min-h-row items-center gap-2">
						{last ? (
							<>
								<span className="flex-1 text-12 text-n-11">
									{format(q18.duration, { ms: last.durationMs })} ·{" "}
									{format(q18.at, { date: date.format(new Date(last.at)) })}
								</span>
								<Button variant="ghost" onClick={() => setShown(shown === key ? null : key)}>
									{q18.findings}
								</Button>
							</>
						) : (
							<span className="flex-1" />
						)}
						{r.available ? (
							confirming === key ? (
								<Button
									variant="primary"
									onClick={() =>
										void run(async () => {
											setConfirming(null);
											await (kind === "check" ? check(r.name) : scan(r.name));
										})
									}
								>
									{format(q18.confirm, { name: r.name })}
								</Button>
							) : (
								<Button
									aria-label={format(q18.runName, { name: r.name })}
									onClick={() => setConfirming(key)}
								>
									<ArrowPathIcon size={14} />
									{q18.run}
								</Button>
							)
						) : (
							<span className="text-12 text-n-11">{q18.notInstalled}</span>
						)}
					</div>
					{last && shown === key ? (
						<div className="-mx-3 -mb-3 border-t">
							{last.findings.map((f, i) => (
								<FindingRow
									// biome-ignore lint/suspicious/noArrayIndexKey: the findings never reorder
									key={i}
									status={SEVERITY_STATUS[f.severity] ?? "idle"}
									title={`${q18.severity[f.severity]}: ${f.message}`}
									source={
										<Button
											variant="ghost"
											aria-label={format(q18.open, { path: f.path })}
											onClick={() => setViewing({ path: f.path, line: f.line })}
										>
											{f.path}
											{f.line ? `:${f.line}` : ""}
										</Button>
									}
								/>
							))}
							{last.tail ? (
								<pre className="overflow-x-auto px-3 py-1 font-mono text-12">{last.tail}</pre>
							) : null}
						</div>
					) : null}
				</Card>
			);
		});

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				icon={<CheckIcon size={16} />}
				title={t.tabs.code.quality}
				count={q.checks.length + q.scanners.length}
			/>
			{error ? (
				<p role="alert" className="px-4 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="flex flex-col gap-3 px-4 pt-1 pb-4">
				<Panel title={q18.checks} count={q.checks.length} bodyClassName={GRID}>
					{rows("check", q.checks)}
				</Panel>
				<Panel title={q18.scanners} count={q.scanners.length} bodyClassName={GRID}>
					{rows("scanner", q.scanners)}
				</Panel>
			</div>
			{viewing ? (
				<FileDialog path={viewing.path} line={viewing.line} onClose={() => setViewing(null)} />
			) : null}
		</div>
	);
}

export const Quality = withProject(QualityView);
