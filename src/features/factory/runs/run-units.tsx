import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize, RunView, UnitView } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { Panel } from "@/ui/molecules/panel";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import { UnitTranscript } from "./unit-chat";

const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

/** The command that opens a session of Claude Code again, in the folder of its unit. */
export const resumeCommand = (dir: string, session: string) =>
	`cd ${quote(dir)} && claude --resume ${quote(session)}`;

function Unit({
	unit,
	events,
	ticket,
}: {
	unit: UnitView;
	events: RunLogEvent_Serialize[];
	ticket: string;
}) {
	const { t } = useI18n();
	const f = t.factory;
	const { runInTerminal } = useShell();
	const [follow, setFollow] = useState(false);
	const mine = events.filter((e) => e.step === unit.id);
	const running = unit.state === "running";
	return (
		<li
			id={`unit-${unit.id}`}
			aria-label={unit.id}
			className="flex flex-col border-b last:border-b-0"
		>
			<div className="flex items-center gap-2 px-3 py-2 text-ui">
				<BrandIcon name={unit.runner} size={16} label={runnerName(unit.runner)} />
				<span className="min-w-0 flex-1 truncate font-mono text-12 text-n-12">{unit.id}</span>
				<StatusDot status={STEP_STATUS[unit.state]} label={f.step[unit.state]} />
				<Button variant="ghost" aria-pressed={follow} onClick={() => setFollow(!follow)}>
					{f.follow}
				</Button>
				{/* A unit of a run that started before the folder was kept has no folder to resume in. */}
				{unit.runner === "claude" && unit.session && unit.dir ? (
					<Button
						variant="ghost"
						disabled={running}
						reason={running ? f.terminalRunning : undefined}
						onClick={() => runInTerminal(resumeCommand(unit.dir, unit.session ?? ""))}
					>
						{f.openTerminal}
					</Button>
				) : null}
			</div>
			{follow ? <UnitTranscript events={mine} ticket={ticket} running={running} /> : null}
		</li>
	);
}

/** The AI tool sessions of a run, one for each unit that started: follow its events, open it in the terminal. */
export function RunUnits({ run, events }: { run: RunView; events: RunLogEvent_Serialize[] }) {
	const { t } = useI18n();
	const units = run.steps.flatMap((s) => s.units).filter((u) => u.runner !== "");
	if (units.length === 0) return null;
	return (
		<Panel title={t.factory.sessions} count={units.length} flush>
			<ul>
				{units.map((u) => (
					<Unit key={u.id} unit={u} events={events} ticket={run.key} />
				))}
			</ul>
		</Panel>
	);
}
