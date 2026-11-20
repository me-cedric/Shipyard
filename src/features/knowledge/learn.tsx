import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DetailColumn, LibraryPage, PageColumns, SideCards } from "@/features/library/page-parts";
import { NoProject } from "@/features/shell/no-project";
import { format, useI18n } from "@/lib/i18n";
import { useLearn } from "@/lib/knowledge";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Progress } from "@/ui/atoms/progress";
import { AcademicCapIcon, ArrowPathIcon, CheckIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { LearnCard, LearnFeeds } from "./learn-feeds";
import { blankStep, type Draft, LearnActions, LearnPaths } from "./learn-paths";

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
 * Library / Learn: the path (the architecture, the ADRs in number order, then the specs) as one card
 * of slim rows with the next step marked, and the glossary of the terms that the specs define. A
 * step that the person opened counts as done (REQ-020, REQ-021). Beside them: the learning paths of
 * the team and the feeds of the project.
 */
export function Learn() {
	const { t } = useI18n();
	const k = t.knowledge.learn;
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const { openRef } = useShell();
	const learn = useLearn().data;
	const { done, mark } = useDone();
	const [picked, setPicked] = useState<string | null>(null);
	const [editing, setEditing] = useState<Draft | null>(null);
	if (active === undefined) return <Loading title={k.title} icon={<AcademicCapIcon size={16} />} />;
	if (active === null) return <NoProject title={k.title} icon={<AcademicCapIcon size={16} />} />;
	const path = learn?.path ?? [];
	const glossary = learn?.glossary ?? [];
	const kinds: Record<string, string> = { ...t.refKind, ...k.kinds };
	const finished = path.filter((s) => done.includes(s.ref)).length;
	const current = path.find((s) => !done.includes(s.ref))?.ref;
	const open = (ref: string) => {
		mark(ref);
		openRef(ref);
	};
	return (
		<LibraryPage
			title={k.heading}
			action={
				<LearnActions
					picked={picked}
					onPick={setPicked}
					editing={editing !== null}
					onNew={() => setEditing({ id: "", title: "", experts: [], steps: [blankStep()] })}
				/>
			}
		>
			{learn && path.length === 0 && glossary.length === 0 ? (
				<EmptyState
					title={t.empty.feeds}
					action={{
						label: t.home.refresh,
						icon: <ArrowPathIcon size={14} />,
						onClick: () => void qc.invalidateQueries({ queryKey: ["knowledge", "learn"] }),
					}}
				/>
			) : (
				<PageColumns>
					<DetailColumn className="flex-[3_1_480px]">
						<Card pad className="flex flex-col gap-4">
							<div className="flex flex-wrap items-center gap-3.5">
								<span className="text-17 font-semibold text-n-12">
									{format(k.of, { n: finished, count: path.length })}
								</span>
								<Progress
									value={finished}
									max={path.length}
									label={k.progress}
									className="h-2.5 min-w-48 flex-1"
								/>
							</div>
							<ol aria-label={k.path} className="flex flex-col gap-2.5">
								{path.map((s, i) => {
									const ok = done.includes(s.ref);
									const now = s.ref === current;
									return (
										<li
											key={s.ref}
											className="relative flex min-h-14 flex-wrap items-center gap-3.5 after:absolute after:top-[48px] after:left-[15px] after:h-2.5 after:w-0.5 after:bg-n-6 last:after:hidden"
										>
											<span
												aria-hidden="true"
												className={cn(
													"flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-semibold text-14",
													now
														? "border-accent bg-accent text-accent-fg ring-[5px] ring-accent/25"
														: ok
															? "border-transparent bg-success-soft text-success-text"
															: "border-n-7 bg-surface-1 text-n-12",
												)}
											>
												{ok ? <CheckIcon size={16} /> : i + 1}
											</span>
											{/* The title opens the step. */}
											<button
												type="button"
												onClick={() => open(s.ref)}
												className={cn(
													"min-h-control min-w-0 flex-1 text-left text-17",
													now ? "font-semibold" : "font-medium",
												)}
											>
												{s.title}
											</button>
											<Badge>{kinds[s.kind] ?? s.kind}</Badge>
											{now ? (
												<Button
													variant="primary"
													className="min-h-control"
													onClick={() => open(s.ref)}
												>
													{k.start}
												</Button>
											) : null}
										</li>
									);
								})}
							</ol>
						</Card>
						<LearnPaths part="paths" picked={picked} editing={editing} onEdit={setEditing} />
					</DetailColumn>
					<SideCards className="flex-[2_1_320px]">
						<LearnCard title={k.glossary}>
							<ul aria-label={k.glossary} className="flex flex-col gap-2">
								{glossary.map((g) => (
									<li key={g.term} className="flex flex-col">
										<button
											type="button"
											data-nav=""
											onClick={() => openRef(g.spec)}
											className="-mb-3 min-h-control w-fit max-w-full text-left font-semibold text-n-12 hover:underline"
										>
											{g.term}
										</button>
										<span className="text-n-11">{g.meaning}</span>
									</li>
								))}
							</ul>
						</LearnCard>
						<LearnPaths part="team" />
						<LearnFeeds />
					</SideCards>
				</PageColumns>
			)}
		</LibraryPage>
	);
}
