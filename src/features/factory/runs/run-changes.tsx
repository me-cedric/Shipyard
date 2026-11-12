import { useState } from "react";
import type { useRunDiff } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { RunView } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ChevronDownIcon, ChevronRightIcon } from "@/ui/icons";
import { DiffView, parseDiff } from "@/ui/molecules/diff-view";
import { EmptyState } from "@/ui/molecules/empty-state";
import { FindingRow } from "@/ui/molecules/finding-row";
import { Panel } from "@/ui/molecules/panel";

const SEVERITY = { P0: "danger", P1: "warning", P2: "info" } as const;

type Files = NonNullable<ReturnType<typeof useRunDiff>["data"]>;

/** The lines that a file adds and removes. */
export function countsOf(text: string) {
	const lines = parseDiff(text);
	return {
		added: lines.filter((l) => l.kind === "add").length,
		removed: lines.filter((l) => l.kind === "del").length,
	};
}

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
					{diff.map((d) => {
						const shown = open.has(d.path);
						const n = countsOf(d.text);
						return (
							<div key={d.path} className="border-b last:border-b-0">
								<button
									type="button"
									aria-expanded={shown}
									onClick={() => toggle(d.path)}
									className="flex min-h-row w-full items-center gap-2 bg-n-2 px-3 text-left text-n-11 hover:bg-n-3 focus-visible:shadow-glow"
								>
									{shown ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
									<span className="min-w-0 flex-1 truncate font-mono text-11">{d.path}</span>
									{d.binary ? null : (
										<>
											<span aria-hidden="true" className="font-mono text-11">
												<span className="text-success-text">+{n.added}</span>{" "}
												<span className="text-danger-text">−{n.removed}</span>
											</span>
											<span className="sr-only">
												{format(f.counts, { added: n.added, removed: n.removed })}
											</span>
										</>
									)}
								</button>
								{shown ? (
									<DiffView
										text={d.text}
										path={d.path}
										binary={d.binary}
										truncated={d.truncated}
										label={format(t.code.diff, { path: d.path })}
										binaryLabel={t.code.binary}
										truncatedLabel={t.code.truncated}
									/>
								) : null}
							</div>
						);
					})}
				</Panel>
			) : null}
		</div>
	);
}
