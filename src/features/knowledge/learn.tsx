import { useQueryClient } from "@tanstack/react-query";
import { NoProject } from "@/features/work/no-project";
import { useI18n } from "@/lib/i18n";
import { useLearn } from "@/lib/knowledge";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { ArrowPathIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { GroupSection } from "@/ui/molecules/group-section";
import { RefChip } from "@/ui/molecules/ref-chip";
import { ListDetail } from "@/ui/templates/list-detail";

/**
 * Knowledge / Learn: the path (the architecture, the ADRs in number order, then the specs) and the
 * glossary of the terms that the specs define. Each step is an entity ref (REQ-020, REQ-021).
 */
export function Learn() {
	const { t } = useI18n();
	const k = t.knowledge.learn;
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const { openRef } = useShell();
	const learn = useLearn().data;
	if (active === undefined) return null;
	if (active === null) return <NoProject title={k.title} />;
	const path = learn?.path ?? [];
	const glossary = learn?.glossary ?? [];
	return (
		<ListDetail title={k.title}>
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
				<>
					<GroupSection name={k.path} count={path.length}>
						<ol aria-label={k.path}>
							{path.map((s, i) => (
								<li key={s.ref} className="flex h-row items-center gap-2 border-b px-3">
									<span className="w-6 font-mono text-12 text-n-11">{i + 1}</span>
									<RefChip refId={s.ref} state="resolved" title={s.title} onOpen={openRef} />
									<span className="truncate text-ui">{s.title}</span>
								</li>
							))}
						</ol>
					</GroupSection>
					<GroupSection name={k.glossary} count={glossary.length}>
						<ul aria-label={k.glossary}>
							{glossary.map((g) => (
								<li key={g.term} className="flex min-h-row items-center gap-2 border-b px-3">
									<button
										type="button"
										data-nav=""
										onClick={() => openRef(g.spec)}
										className="rounded-sm font-medium text-ui hover:underline"
									>
										{g.term}
									</button>
									<span className="min-w-0 flex-1 truncate text-ui text-n-11">{g.meaning}</span>
									<RefChip refId={g.spec} state="resolved" onOpen={openRef} />
								</li>
							))}
						</ul>
					</GroupSection>
				</>
			)}
		</ListDetail>
	);
}
