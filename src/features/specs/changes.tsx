import { useQueries } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText, useMenus } from "@/lib/menus";
import { useFormIntent, useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import {
	ARTIFACTS,
	artifactPath,
	type Change,
	kindStatus,
	useChanges,
	useMarkerCounts,
	useSpecsActions,
} from "@/lib/specs";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Progress } from "@/ui/atoms/progress";
import { StatusDot } from "@/ui/atoms/status-dot";
import { DocumentTextIcon, PlusIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";
import { LIST, useEnter } from "@/ui/motion";
import { ListDetail } from "@/ui/templates/list-detail";
import { ChangeDetail } from "./change-detail";
import { NameDialog } from "./name-dialog";
import { WithProject } from "./no-project";
import { DOT } from "./status";

/** The line after a step of the stepper, in the colour of the step. */
const LINE = { missing: "bg-n-6", draft: "bg-warning/60", done: "bg-success/70" } as const;

/** The checked and all checkboxes of the task files of each change, by change id. */
function useTaskCounts(changes: Change[]) {
	const files = changes.flatMap((c) =>
		c.artifacts
			.filter((a) => a.artifact === "tasks" && a.status !== "missing")
			.map((a) => ({ id: c.id, path: artifactPath(c, a) })),
	);
	const results = useQueries({
		queries: files.map((f) => ({
			// Not the key of the editor: the editor keeps the stamp of its own open.
			queryKey: ["specs", "tasks", f.path],
			queryFn: () => unwrap(commands.specsRead(f.path)),
		})),
	});
	const out: Record<string, { done: number; total: number }> = {};
	files.forEach((f, i) => {
		const text = results[i]?.data?.text ?? "";
		const o = out[f.id] ?? { done: 0, total: 0 };
		o.done += (text.match(/^\s*[-*] \[[xX]\]/gm) ?? []).length;
		o.total += (text.match(/^\s*[-*] \[[ xX]\]/gm) ?? []).length;
		out[f.id] = o;
	});
	return out;
}

/** The five artifacts of a change as steps on one line. */
function Stepper({ change }: { change: Change }) {
	const s = useI18n().t.specs;
	return (
		<ol className="flex items-start">
			{ARTIFACTS.map((kind, i) => {
				const status = kindStatus(change, kind);
				return (
					<li key={kind} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
						<span className="flex w-full items-center">
							<span
								className={cn(
									"h-px flex-1",
									i === 0 ? "bg-transparent" : LINE[kindStatus(change, ARTIFACTS[i - 1] ?? kind)],
								)}
							/>
							<span
								className={cn(
									"flex size-6 items-center justify-center rounded-full border bg-surface-1",
									status === "done" && "border-success/50 bg-success-soft",
									status === "draft" && "border-warning/50 bg-warning-soft",
								)}
							>
								<StatusDot
									status={DOT[status]}
									label={`${s.artifact[kind]}: ${s.status[status]}`}
								/>
							</span>
							<span
								className={cn(
									"h-px flex-1",
									i === ARTIFACTS.length - 1 ? "bg-transparent" : LINE[status],
								)}
							/>
						</span>
						<span className="max-w-full truncate text-11 text-n-11">{s.artifact[kind]}</span>
					</li>
				);
			})}
		</ol>
	);
}

/** Specs / Changes: each change with the status of its five artifacts and its open markers. */
export function SpecChanges() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs.changes}>
			<ChangeList />
		</WithProject>
	);
}

function ChangeList() {
	const { t } = useI18n();
	const s = t.specs;
	const act = useSpecsActions();
	const menu = useMenus();
	const { openRef } = useShell();
	const list = useChanges().data;
	const markers = useMarkerCounts(list ?? []);
	// The open item stays with the tab; the cards are the overview.
	const [open, setOpen] = useTabSelection("specs:changes");
	const [creating, setCreating] = useState(false);
	useFormIntent("change", () => setCreating(true));

	const tasks = useTaskCounts(list ?? []);
	const enter = useEnter();
	const current = list?.find((c) => c.id === open);
	if (current) return <ChangeDetail change={current} onBack={() => setOpen(null)} />;
	const create = () => setCreating(true);
	return (
		<ListDetail
			title={t.tabs.specs.changes}
			icon={<DocumentTextIcon size={16} />}
			count={list?.length}
			action={
				list?.length ? (
					<Button variant="primary" onClick={create}>
						<PlusIcon size={14} />
						{s.newChange}
					</Button>
				) : null
			}
		>
			{list && list.length === 0 ? (
				<div className="p-4">
					<EmptyState
						layout="cards"
						action={{ label: s.newChange, icon: <PlusIcon size={14} />, onClick: create }}
					/>
				</div>
			) : (
				<motion.ul
					aria-label={t.tabs.specs.changes}
					variants={LIST}
					initial={enter}
					animate="shown"
					className="grid min-h-0 auto-rows-min grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3 overflow-auto px-4 pt-1 pb-4"
				>
					{(list ?? []).map((c) => {
						const n = markers[c.id] ?? 0;
						const done = tasks[c.id];
						return (
							<li key={c.id}>
								<ContextMenu
									items={menu("spec", {
										open: () => {
											setOpen(c.id);
											openRef(`change:${c.id}`);
										},
										"copy-ref": () => copyText(`change:${c.id}`),
									})}
								>
									<Card interactive className="p-0">
										<button
											type="button"
											onClick={() => {
												setOpen(c.id);
												openRef(`change:${c.id}`);
											}}
											className="flex w-full flex-col gap-3 p-3 rounded-lg text-left"
										>
											<span className="flex items-center gap-2">
												<span className="min-w-0 flex-1 truncate text-14 text-n-12">{c.title}</span>
												{n ? (
													<Badge variant="warning" className="font-mono">
														<span className="sr-only">{s.markers} </span>
														{n}
													</Badge>
												) : null}
											</span>
											<Stepper change={c} />
											{done?.total ? (
												<span className="flex items-center gap-2 text-12 text-n-11">
													{s.artifact.tasks}
													<Progress
														value={done.done}
														max={done.total}
														label={format(t.count, { name: s.artifact.tasks, count: done.done })}
														className="flex-1"
													/>
													<span className="font-mono">
														{done.done}/{done.total}
													</span>
												</span>
											) : null}
										</button>
									</Card>
								</ContextMenu>
							</li>
						);
					})}
				</motion.ul>
			)}
			{creating ? (
				<NameDialog
					title={s.newChange}
					label={s.changeId}
					onCreate={async (id) => {
						const c = await act.createChange(id);
						setOpen(c.id);
						openRef(`change:${c.id}`);
					}}
					onClose={() => setCreating(false)}
				/>
			) : null}
		</ListDetail>
	);
}
