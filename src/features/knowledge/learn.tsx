import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NoProject } from "@/features/work/no-project";
import { useI18n } from "@/lib/i18n";
import { useLearn } from "@/lib/knowledge";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Progress } from "@/ui/atoms/progress";
import { AcademicCapIcon, ArrowPathIcon, BookOpenIcon, CheckIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { ListDetail } from "@/ui/templates/list-detail";

const DONE = "shipyard.learn.done";

/** The steps that the user opened, kept on this machine. */
function useDone() {
	const [done, setDone] = useState<string[]>(() => {
		try {
			return JSON.parse(localStorage.getItem(DONE) ?? "[]");
		} catch {
			return [];
		}
	});
	const mark = (ref: string) => {
		if (done.includes(ref)) return;
		const next = [...done, ref];
		localStorage.setItem(DONE, JSON.stringify(next));
		setDone(next);
	};
	return { done, mark };
}

/**
 * Knowledge / Learn: the path (the architecture, the ADRs in number order, then the specs) as a
 * journey, and the glossary of the terms that the specs define. Each step is an entity ref; an
 * opened step counts as done (REQ-020, REQ-021).
 */
export function Learn() {
	const { t } = useI18n();
	const k = t.knowledge.learn;
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const { openRef } = useShell();
	const learn = useLearn().data;
	const { done, mark } = useDone();
	if (active === undefined) return null;
	if (active === null) return <NoProject title={k.title} />;
	const path = learn?.path ?? [];
	const glossary = learn?.glossary ?? [];
	const kinds = t.refKind as Record<string, string>;
	const finished = path.filter((s) => done.includes(s.ref)).length;
	const open = (ref: string) => {
		mark(ref);
		openRef(ref);
	};
	return (
		<ListDetail title={k.title} icon={<AcademicCapIcon size={16} />} count={path.length}>
			{learn && path.length === 0 && glossary.length === 0 ? (
				<div className="p-4">
					<EmptyState
						action={{
							label: t.home.refresh,
							icon: <ArrowPathIcon size={14} />,
							onClick: () => void qc.invalidateQueries({ queryKey: ["knowledge", "learn"] }),
						}}
					/>
				</div>
			) : (
				<div className="grid min-h-0 flex-1 auto-rows-min gap-3 overflow-auto px-4 pt-1 pb-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
					<Panel
						title={k.path}
						count={path.length}
						icon={<AcademicCapIcon size={14} />}
						toolbar={
							<span className="flex items-center gap-2">
								<Progress value={finished} max={path.length} label={k.progress} className="w-28" />
								<span className="font-mono text-12 text-n-11">
									{finished}/{path.length}
								</span>
							</span>
						}
						bodyClassName="p-3"
					>
						<ol aria-label={k.path} className="flex flex-col">
							{path.map((s, i) => {
								const ok = done.includes(s.ref);
								return (
									<li
										key={s.ref}
										className="relative flex gap-3 pb-3 last:pb-0 before:absolute before:top-7 before:bottom-0 before:left-3.5 before:w-px before:bg-n-6 last:before:hidden"
									>
										<span
											aria-hidden="true"
											className={cn(
												"z-10 flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-12",
												ok
													? "border-transparent bg-success-soft text-success-text"
													: "bg-surface-2 text-n-11",
											)}
										>
											{ok ? <CheckIcon size={14} /> : i + 1}
										</span>
										<span className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border bg-surface-2 px-3 py-2 shadow-1">
											<span className="flex items-center gap-2">
												<RefChip refId={s.ref} state="resolved" title={s.title} onOpen={open} />
												<Badge>{kinds[s.kind] ?? s.kind}</Badge>
											</span>
											<span className="truncate text-ui text-n-12">{s.title}</span>
										</span>
									</li>
								);
							})}
						</ol>
					</Panel>
					<Panel title={k.glossary} count={glossary.length} icon={<BookOpenIcon size={14} />} flush>
						<ul aria-label={k.glossary}>
							{glossary.map((g) => (
								<li key={g.term} className="flex flex-col gap-1 border-b px-3 py-2 last:border-b-0">
									<span className="flex items-center gap-2">
										<button
											type="button"
											data-nav=""
											onClick={() => openRef(g.spec)}
											className="min-w-0 flex-1 truncate rounded-sm text-left font-medium text-ui text-n-12 hover:underline"
										>
											{g.term}
										</button>
										<RefChip refId={g.spec} state="resolved" onOpen={openRef} />
									</span>
									<span className="text-12 text-n-11">{g.meaning}</span>
								</li>
							))}
						</ul>
					</Panel>
				</div>
			)}
		</ListDetail>
	);
}
