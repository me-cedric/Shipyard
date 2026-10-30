import { useEffect, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { NoProject } from "@/features/work/no-project";
import { useFactoryFile, useFactoryWrites, useRoles, useWorkflows } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import type { IssueView } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { ArrowsRightLeftIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { Panel } from "@/ui/molecules/panel";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import { ListDetail } from "@/ui/templates/list-detail";

type Pick = { kind: "workflow" | "role"; id: string };

/** One workflow or role file in the editor frame. A workflow is checked at each change (factory REQ-010, REQ-029). */
function FileEditor({ kind, id }: Pick) {
	const { t } = useI18n();
	const loaded = useFactoryFile(kind, id).data;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	const [draft, setDraft] = useState<string | null>(null);
	const [issue, setIssue] = useState<IssueView | null>(null);
	const text = draft ?? loaded;
	useEffect(() => {
		if (kind !== "workflow" || draft === null) return;
		let stale = false;
		writes
			.check(id, draft)
			.then((i) => !stale && setIssue(i))
			.catch(() => {});
		return () => {
			stale = true;
		};
	}, [kind, id, draft, writes.check]);
	if (text === undefined) return null;
	const dirty = text !== loaded;
	const message = issue
		? { message: issue.message, line: issue.line }
		: error
			? { message: error }
			: null;
	return (
		<EditorFrame
			title={id}
			refId={kind === "workflow" ? `wf:${id}` : `role:${id}`}
			primary={{
				label: t.design.save,
				disabled: !dirty || issue !== null,
				onClick: () =>
					void run(async () => {
						await writes.write(kind, id, text);
						setDraft(null);
					}),
			}}
			save={dirty ? "dirty" : "clean"}
			error={message}
			labels={t.design.frame}
		>
			<CodeEditor
				label={id}
				value={text}
				errorLine={issue?.line}
				onChange={setDraft}
				className="flex-1"
			/>
		</EditorFrame>
	);
}

/** Factory / Workflows: the workflows and the roles in two groups, and the editor of the chosen file. */
export function Workflows() {
	const { t } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const workflows = useWorkflows().data ?? [];
	const roles = useRoles().data ?? [];
	const [pick, setPick] = useState<Pick | null>(null);
	if (active === null) return <NoProject title={f.workflows} />;
	const first = workflows[0];
	// The first workflow opens until a person picks a file.
	const current = pick ?? (first ? { kind: "workflow" as const, id: first.id } : null);
	const groups = [
		{
			name: f.workflows,
			kind: "workflow" as const,
			rows: workflows.map((w) => ({ id: w.id, steps: w.steps, bad: w.issue !== null })),
		},
		{
			name: f.roles,
			kind: "role" as const,
			rows: roles.map((r) => ({ id: r.id, steps: [] as string[], bad: false })),
		},
	];
	return (
		<ListDetail
			title={f.workflows}
			icon={<ArrowsRightLeftIcon size={16} />}
			count={workflows.length}
		>
			<div className="flex min-h-0 flex-1 gap-3 px-4 pb-4">
				<div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto">
					{groups.map((g) => (
						<Panel key={g.kind} title={g.name} count={g.rows.length} flush>
							<ul aria-label={g.name}>
								{g.rows.map((r) => {
									const on = current?.kind === g.kind && current.id === r.id;
									return (
										<li key={r.id} className="border-b last:border-b-0">
											<button
												type="button"
												data-nav=""
												aria-current={on ? "true" : undefined}
												onClick={() => setPick({ kind: g.kind, id: r.id })}
												className={cn(
													"relative flex w-full flex-col gap-1.5 px-3 py-2 text-left text-ui transition-colors duration-(--duration-fast) hover:bg-n-3",
													on && "bg-accent-soft",
												)}
											>
												{on ? (
													<span
														aria-hidden="true"
														className="absolute inset-y-0 left-0 w-0.5 bg-accent-gradient"
													/>
												) : null}
												<span className="flex items-center gap-2">
													<span className="flex-1 font-mono text-12 text-n-12">{r.id}</span>
													{r.bad ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
												</span>
												{r.steps.length ? (
													<span className="flex flex-wrap items-center gap-1">
														{r.steps.map((step, i) => (
															<span key={step} className="flex items-center gap-1">
																{i > 0 ? (
																	<span aria-hidden="true" className="text-n-9">
																		›
																	</span>
																) : null}
																<Badge className="font-mono">{step}</Badge>
															</span>
														))}
													</span>
												) : null}
											</button>
										</li>
									);
								})}
							</ul>
						</Panel>
					))}
				</div>
				<div className="flex min-w-0 flex-1 flex-col overflow-auto rounded-lg border bg-surface-1 p-3 shadow-1">
					{current ? <FileEditor key={`${current.kind}:${current.id}`} {...current} /> : null}
				</div>
			</div>
		</ListDetail>
	);
}
