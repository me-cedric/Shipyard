import { useEffect, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { NoProject } from "@/features/work/no-project";
import { useFactoryFile, useFactoryWrites, useRoles, useWorkflows } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { IssueView } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { CodeEditor } from "@/ui/molecules/code-editor";
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
	const groups = [
		{
			name: f.workflows,
			kind: "workflow" as const,
			rows: workflows.map((w) => ({ id: w.id, note: w.steps.join(" > "), bad: w.issue !== null })),
		},
		{
			name: f.roles,
			kind: "role" as const,
			rows: roles.map((r) => ({ id: r.id, note: "", bad: false })),
		},
	];
	return (
		<ListDetail title={f.workflows}>
			<div className="flex min-h-0 flex-1">
				<div className="w-80 shrink-0 overflow-auto border-r">
					{groups.map((g) => (
						<section key={g.kind} aria-label={g.name}>
							<h2 className="flex h-row items-center border-b bg-n-2 px-3 text-12 font-medium text-n-11">
								{format(t.count, { name: g.name, count: g.rows.length })}
							</h2>
							<ul aria-label={g.name}>
								{g.rows.map((r) => {
									const on = pick?.kind === g.kind && pick.id === r.id;
									return (
										<li key={r.id}>
											<button
												type="button"
												data-nav=""
												aria-current={on ? "true" : undefined}
												onClick={() => setPick({ kind: g.kind, id: r.id })}
												className={cn(
													"flex h-row w-full items-center gap-2 border-b px-3 text-left text-ui hover:bg-n-3",
													on && "bg-n-4",
												)}
											>
												<span className="shrink-0 font-mono text-12">{r.id}</span>
												<span className="min-w-0 flex-1 truncate text-12 text-n-11">{r.note}</span>
												{r.bad ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
											</button>
										</li>
									);
								})}
							</ul>
						</section>
					))}
				</div>
				<div className="flex min-w-0 flex-1 flex-col overflow-auto p-3">
					{pick ? <FileEditor key={`${pick.kind}:${pick.id}`} {...pick} /> : null}
				</div>
			</div>
		</ListDetail>
	);
}
