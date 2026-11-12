import { useState } from "react";
import type { useRunDiff } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import type { RunView } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { DiffFileList } from "@/ui/molecules/diff-file-list";
import { EmptyState } from "@/ui/molecules/empty-state";
import { FindingRow } from "@/ui/molecules/finding-row";
import { Panel } from "@/ui/molecules/panel";

const SEVERITY = { P0: "danger", P1: "warning", P2: "info" } as const;

type Files = NonNullable<ReturnType<typeof useRunDiff>["data"]>;

/** The Changes tab (REQ-032): the findings, then the files of the diff. Each file starts closed with its path and its counts. */
export function RunChanges({ run, diff }: { run: RunView; diff: Files }) {
	const { t } = useI18n();
	const f = t.factory;
	const [open, setOpen] = useState<Set<string>>(new Set());
	const all = open.size === diff.length;
	const toggle = (path: string) =>
		setOpen((o) => {
			const next = new Set(o);
			if (!next.delete(path)) next.add(path);
			return next;
		});
	if (!run.findings.length && !diff.length) return <EmptyState title={f.noChanges} />;
	return (
		<div className="flex flex-col gap-4">
			{run.findings.length ? (
				<Panel title={f.findings} count={run.findings.length} tone="warning" flush>
					{run.findings.map((x, i) => (
						<FindingRow
							// biome-ignore lint/suspicious/noArrayIndexKey: the findings never reorder
							key={i}
							status={SEVERITY[x.severity as keyof typeof SEVERITY] ?? "info"}
							title={x.text}
							source={
								x.path ? (
									<span className="font-mono text-11 text-n-11">
										{x.path}
										{x.line ? `:${x.line}` : ""}
									</span>
								) : undefined
							}
						/>
					))}
				</Panel>
			) : null}
			{diff.length ? (
				<Panel
					title={f.diff}
					count={diff.length}
					flush
					toolbar={
						<Button
							variant="ghost"
							onClick={() => setOpen(all ? new Set() : new Set(diff.map((d) => d.path)))}
						>
							{all ? f.collapseAll : f.expandAll}
						</Button>
					}
				>
					<DiffFileList
						files={diff.map((d) => ({
							path: d.path,
							patch: d.text,
							binary: d.binary,
							truncated: d.truncated,
						}))}
						expanded={open}
						onToggle={toggle}
					/>
				</Panel>
			) : null}
		</div>
	);
}
