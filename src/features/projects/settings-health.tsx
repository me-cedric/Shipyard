import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Finding_Serialize, type Group, type Severity, unwrap } from "@/lib/ipc";
import { projectKeys, useHealth, worstStatus } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { Ring } from "@/ui/atoms/ring";
import { Skeleton } from "@/ui/atoms/skeleton";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CommandLineIcon, DocumentTextIcon, LinkIcon, ShieldCheckIcon } from "@/ui/icons";
import { FindingRow } from "@/ui/molecules/finding-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DoctorLedger } from "./doctor-ledger";
import { DoctorTools } from "./doctor-tools";

const GROUPS: Group[] = ["compliance", "tools", "refs", "generated"];
const GHOST_ROWS = [0, 1, 2, 3, 4];

type Preview = { path: string; content: string };

function Finding({ finding }: { finding: Finding_Serialize }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { openRef } = useShell();
	const [preview, setPreview] = useState<Preview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const { fix } = finding;

	const attempt = async (work: () => Promise<void>) => {
		try {
			setError(null);
			await work();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	const message = (t.health.finding as Record<string, string>)[finding.code] ?? finding.code;
	const run = () =>
		attempt(async () => {
			if (fix.kind === "open") openRef(fix.target);
			else if (fix.kind === "recheck") await qc.invalidateQueries({ queryKey: projectKeys.health });
			else if (fix.kind === "apply") {
				await unwrap(commands.compassApply([fix.entry]));
				await qc.invalidateQueries();
			}
			// A file fix shows the new content first. It writes after the confirm click.
			else setPreview(await unwrap(commands.healthFix(finding.id, null)));
		});
	const confirm = () =>
		attempt(async () => {
			if (preview) await unwrap(commands.healthFix(finding.id, preview.content));
			setPreview(null);
			await qc.invalidateQueries();
		});

	return (
		<FindingRow
			status={worstStatus([finding.severity])}
			title={format(message, { detail: finding.detail ?? "" })}
			source={
				finding.source ? (
					<RefChip refId={finding.source} state="resolved" onOpen={openRef} />
				) : undefined
			}
			action={{ label: t.health.fix[fix.kind], onClick: run }}
		>
			{preview ? (
				<div className="flex flex-col gap-2 px-3 pb-2">
					<figure aria-label={preview.path}>
						<pre className="max-h-48 overflow-auto rounded-md border bg-n-2 p-2 font-mono text-11">
							{preview.content}
						</pre>
					</figure>
					<div>
						<Button variant="primary" onClick={confirm}>
							{t.health.confirm}
						</Button>
					</div>
				</div>
			) : null}
			{error ? (
				<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</FindingRow>
	);
}

const ICON: Record<Group, ReactNode> = {
	compliance: <ShieldCheckIcon size={14} />,
	tools: <CommandLineIcon size={14} />,
	refs: <LinkIcon size={14} />,
	generated: <DocumentTextIcon size={14} />,
};
const SEVERITIES: Severity[] = ["error", "warning", "info"];
const TONE = { error: "danger", warning: "warning", info: "info" } as const;

/**
 * Settings / Health: a score ring (the groups with no finding), the count of each severity, then
 * four groups with a count each, and one fix action for each finding.
 */
export function Health() {
	const { t } = useI18n();
	const s = t.settings.health;
	const health = useHealth();
	const findings = health.data;
	if (findings === undefined) return null;
	const clean = GROUPS.filter((g) => !findings.some((f) => f.group === g)).length;
	return (
		<div className="flex flex-col">
			<PageHeader
				icon={<ShieldCheckIcon size={16} />}
				title={t.tabs.settings.health}
				count={findings.length}
			/>
			<div className="flex max-w-4xl flex-col gap-4 px-4 pt-1 pb-4">
				<div className="flex flex-wrap items-stretch gap-3">
					<div className="flex items-center gap-3 rounded-lg border bg-surface-2 px-4 py-3 shadow-1">
						<Ring value={clean} max={GROUPS.length} label={s.score} className="size-14">
							{clean}/{GROUPS.length}
						</Ring>
						<span className="text-12 text-n-11">{s.score}</span>
					</div>
					<StatStrip
						className="min-w-0 flex-1 lg:grid-cols-3"
						items={SEVERITIES.map((v) => ({
							label: s[v],
							value: String(findings.filter((f) => f.severity === v).length),
							tone: TONE[v],
						}))}
					/>
				</div>
				{findings.length === 0 ? (
					<div className="flex flex-col gap-1">
						<StatusDot status="success" className="size-4" />
						<div aria-hidden="true" className="flex flex-col gap-1">
							{GHOST_ROWS.map((i) => (
								<Skeleton key={i} className="h-row" style={{ opacity: 1 - i * 0.18 }} />
							))}
						</div>
					</div>
				) : null}
				{GROUPS.map((g) => {
					const rows = findings.filter((f) => f.group === g);
					const worst = worstStatus(rows.map((f) => f.severity));
					return (
						<Panel
							key={g}
							title={t.health.group[g]}
							count={rows.length}
							icon={ICON[g]}
							tone={rows.length ? (worst === "danger" ? "danger" : worst) : undefined}
							flush
						>
							{rows.map((f) => (
								<Finding key={f.id} finding={f} />
							))}
						</Panel>
					);
				})}
				<DoctorTools />
				<DoctorLedger findings={findings} />
			</div>
		</div>
	);
}
