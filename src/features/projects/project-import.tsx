import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ImportReport, pickFolder, unwrap } from "@/lib/ipc";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { ArrowDownTrayIcon, DocumentTextIcon } from "@/ui/icons";
import { SettingsRow } from "@/ui/molecules/settings-row";

/**
 * The Legacy import: one action. The command copies the files that do not exist and replaces none,
 * so the report lists what it copied, what it skipped and each file that already exists (Q-090).
 */
export function ProjectImport() {
	const { t } = useI18n();
	const k = t.projects.legacy;
	const qc = useQueryClient();
	const [report, setReport] = useState<ImportReport | null>(null);
	const [error, setError] = useState<string | null>(null);

	const run = async () => {
		try {
			setError(null);
			const source = await pickFolder();
			if (!source) return;
			setReport(await unwrap(commands.projectImport(source)));
			await qc.invalidateQueries();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const groups = report
		? [
				{ id: "copied", rows: report.copied.map((path) => ({ path, note: null })) },
				{ id: "skipped", rows: report.skipped.map((s) => ({ path: s.path, note: s.reason })) },
				{ id: "conflicts", rows: report.conflicts.map((path) => ({ path, note: k.exists })) },
			]
		: [];
	return (
		<section aria-label={k.title} className="flex flex-col gap-2">
			<div>
				<Button onClick={() => void run()}>
					<ArrowDownTrayIcon size={14} />
					{k.import}
				</Button>
			</div>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{groups.map((g) => (
				<section key={g.id} aria-label={k[g.id as "copied"]}>
					<h3 className="py-1 text-12 font-medium text-n-11">
						{format(t.count, { name: k[g.id as "copied"], count: g.rows.length })}
					</h3>
					{g.rows.map((r) => (
						<SettingsRow key={r.path} icon={<DocumentTextIcon size={14} />} label={r.path}>
							{r.note ? (
								<Badge variant={g.id === "conflicts" ? "warning" : "neutral"}>{r.note}</Badge>
							) : null}
						</SettingsRow>
					))}
				</section>
			))}
		</section>
	);
}
