import { useState } from "react";
import { type QualityReport, useForgeActions, useQuality } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon } from "@/ui/icons";
import { FindingRow } from "@/ui/molecules/finding-row";
import { GroupSection } from "@/ui/molecules/group-section";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { withProject } from "./project-gate";
import { SEVERITY_STATUS } from "./status";
import { useRun } from "./use-run";
import { FileDialog } from "./viewer";

type Row = { name: string; available: boolean; last: QualityReport | null };

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
			return (
				<div key={key}>
					<SettingsRow label={r.name}>
						<StatusDot
							status={last ? (last.passed ? "success" : "danger") : "idle"}
							label={last ? (last.passed ? q18.passed : q18.failed) : q18.never}
						/>
						{last ? (
							<>
								<span className="text-12 text-n-11">
									{format(q18.duration, { ms: last.durationMs })} ·{" "}
									{format(q18.at, { date: date.format(new Date(last.at)) })}
								</span>
								<Button variant="ghost" onClick={() => setShown(shown === key ? null : key)}>
									{q18.findings}
								</Button>
							</>
						) : null}
						{r.available ? (
							confirming === key ? (
								<Button
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
									variant="ghost"
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
					</SettingsRow>
					{last && shown === key ? (
						<div>
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
				</div>
			);
		});

	return (
		<div>
			<h1 className="sr-only">{t.tabs.code.quality}</h1>
			{error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<GroupSection name={q18.checks} count={q.checks.length}>
				{rows("check", q.checks)}
			</GroupSection>
			<GroupSection name={q18.scanners} count={q.scanners.length}>
				{rows("scanner", q.scanners)}
			</GroupSection>
			{viewing ? (
				<FileDialog path={viewing.path} line={viewing.line} onClose={() => setViewing(null)} />
			) : null}
		</div>
	);
}

export const Quality = withProject(QualityView);
