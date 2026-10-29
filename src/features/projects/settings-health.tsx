import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Finding_Serialize, type Group, unwrap } from "@/lib/ipc";
import { projectKeys, useHealth, worstStatus } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { Skeleton } from "@/ui/atoms/skeleton";
import { StatusDot } from "@/ui/atoms/status-dot";
import { FindingRow } from "@/ui/molecules/finding-row";
import { RefChip } from "@/ui/molecules/ref-chip";

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

/** Settings / Health: four groups with a count each, and one fix action for each finding. */
export function Health() {
	const { t } = useI18n();
	const health = useHealth();
	const findings = health.data;
	if (findings === undefined) return null;
	return (
		<div className="flex max-w-2xl flex-col gap-6 p-4">
			<h1 className="sr-only">{t.tabs.settings.health}</h1>
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
				return (
					<section key={g} aria-labelledby={`health-${g}`}>
						<h2 id={`health-${g}`} className="px-3 py-1 text-12 font-medium text-n-11">
							{format(t.count, { name: t.health.group[g], count: rows.length })}
						</h2>
						{rows.map((f) => (
							<Finding key={f.id} finding={f} />
						))}
					</section>
				);
			})}
		</div>
	);
}
