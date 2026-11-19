import { useState } from "react";
import { Impacts } from "@/features/code/impacts";
import { PullPart } from "@/features/code/pull-page";
import { CI_STATUS } from "@/features/code/status";
import { useRunScope } from "@/features/factory/runs/run-detail";
import { nameOf } from "@/features/factory/runs/run-live";
import { hiddenTab } from "@/features/shell/spaces";
import { useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ChevronLeftIcon, ChevronRightIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Panel } from "@/ui/molecules/panel";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import { StartAgent } from "./start";
import type { Parts } from "./use-feature";

/**
 * Checks: the gates of the run, the checks of the pull request and the impacts of the change
 * (`spec:app-redesign#REQ-023`). The impacts open in the section, with each function of their page.
 */
export function Checks({ parts, ci }: { parts: Parts; ci?: string | null }) {
	const { t } = useI18n();
	const f = t.factory;
	const scope = useRunScope();
	const [impacts, setImpacts] = useState(false);
	// The impacts keep the gate of the code area, as their page `/flow/impacts` does.
	const noCode = hiddenTab(useRights().level, "code", "impacts");
	if (impacts && !noCode)
		return (
			<div className="flex flex-col gap-3">
				<Button
					variant="ghost"
					className="min-h-control w-fit text-accent-text"
					onClick={() => setImpacts(false)}
				>
					<ChevronLeftIcon size={14} />
					{t.flow.feature.section.checks}
				</Button>
				<div className="flex h-[70vh] min-h-96 flex-col">
					<Impacts />
				</div>
			</div>
		);
	const open = (
		<button
			type="button"
			className="flex min-h-control w-full items-center justify-between gap-2 rounded-xl bg-surface-2 px-4 text-left text-ui font-medium text-n-12 shadow-1 hover:bg-n-3 disabled:text-n-11 disabled:hover:bg-surface-2"
			disabled={noCode}
			title={noCode ? t.rights.noAccess : undefined}
			aria-description={noCode ? t.rights.noAccess : undefined}
			onClick={() => setImpacts(true)}
		>
			{t.flow.feature.impacts}
			<ChevronRightIcon size={14} />
		</button>
	);
	if (!scope && !parts.pr)
		return (
			<div className="flex flex-col gap-6">
				<EmptyState title={t.flow.feature.noRun} extra={<StartAgent parts={parts} />} />
				{open}
			</div>
		);
	return (
		<div className="flex flex-col gap-6">
			{scope ? (
				<Panel title={t.flow.feature.gates} count={scope.run.steps.length} flush>
					<ul>
						{scope.run.steps.map((s) => (
							<li
								key={s.id}
								className="flex min-h-row items-center gap-2 border-b px-3 text-ui last:border-b-0"
							>
								<StatusDot status={STEP_STATUS[s.state]} label={f.step[s.state]} />
								<span className="min-w-0 flex-1 truncate">{nameOf(s.id)}</span>
								<span className="text-12 text-n-11">{f.step[s.state]}</span>
							</li>
						))}
					</ul>
				</Panel>
			) : null}
			{/* The state that the card of Flow names, before the list of the checks. */}
			{ci && ci !== "none" ? (
				<p className="flex items-center gap-2 text-ui text-n-12">
					<StatusDot status={CI_STATUS[ci] ?? "idle"} label={t.forge.ci[ci as "none"]} />
					{t.forge.ci[ci as "none"]}
				</p>
			) : null}
			{parts.pr ? <PullPart part="checks" /> : null}
			{open}
		</div>
	);
}
