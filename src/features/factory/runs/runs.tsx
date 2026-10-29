import { useRef, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { NoProject } from "@/features/work/no-project";
import { useKillSwitch, useRunActions, useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { Lane } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { StatusDot } from "@/ui/atoms/status-dot";
import { EmptyState } from "@/ui/molecules/empty-state";
import { RunCard } from "@/ui/molecules/run-card";
import { ListDetail } from "@/ui/templates/list-detail";
import { RunDetail } from "./run-detail";

const LANES: Lane[] = ["queued", "working", "needs_you", "in_review", "ready_to_merge", "done"];

/** Factory / Runs: six lanes of runs, the kill switch and one action, start a run (factory REQ-027, REQ-038). */
export function Runs() {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const runs = useRuns();
	const kill = useKillSwitch().data;
	const act = useRunActions();
	const { openDetail } = useShell();
	const { error, run: guard } = useGuard();
	const [key, setKey] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const field = useRef<HTMLInputElement>(null);
	if (active === null) return <NoProject title={t.factory.runs} />;
	const all = runs.data ?? [];
	const start = () =>
		void guard(async () => {
			await act.start(key.trim());
			setKey("");
		});
	return (
		<ListDetail
			title={t.factory.runs}
			toolbar={
				<>
					<Input
						ref={field}
						label={t.factory.ticket}
						className="max-w-40"
						value={key}
						onChange={(e) => setKey(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && key.trim()) start();
						}}
					/>
					<Button variant="primary" disabled={!key.trim()} onClick={start}>
						{t.factory.start}
					</Button>
					<span className="ml-auto flex items-center gap-2 text-12">
						<StatusDot
							status={kill ? "danger" : "success"}
							label={kill ? t.factory.killOn : t.factory.killOff}
						/>
						{kill ? t.factory.killOn : t.factory.killOff}
					</span>
					{error ? (
						<p role="alert" className="w-full text-ui text-danger-text">
							{error}
						</p>
					) : null}
				</>
			}
		>
			{all.length === 0 && !runs.isPending ? (
				<div className="p-4">
					<EmptyState action={{ label: t.factory.start, onClick: () => field.current?.focus() }} />
				</div>
			) : (
				<div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-2">
					{LANES.map((lane) => {
						const rows = all.filter((r) => r.lane === lane);
						const name = t.factory.lane[lane];
						return (
							<section
								key={lane}
								aria-label={name}
								className="flex w-64 shrink-0 flex-col rounded-md bg-n-2"
							>
								<h2 className="flex h-row items-center px-2 text-12 font-medium text-n-11">
									{format(t.count, { name, count: rows.length })}
								</h2>
								<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1">
									{rows.map((r) => (
										<RunCard
											key={r.id}
											itemKey={r.key}
											title={r.title}
											state={r.state}
											workflow={r.workflow}
											costUsd={r.costUsd}
											budgetUsd={r.budgetUsd}
											questions={r.openQuestions}
											approvals={r.approvals}
											pr={lane === "in_review" || lane === "ready_to_merge" ? r.pr : null}
											selected={selected === r.id}
											onOpen={() => {
												setSelected(r.id);
												openDetail(r.key, <RunDetail key={r.id} id={r.id} />);
											}}
										/>
									))}
								</div>
							</section>
						);
					})}
				</div>
			)}
		</ListDetail>
	);
}
