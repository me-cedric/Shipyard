import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useGuard } from "@/features/work/guard";
import { useMachineSessions, useMachineWrites } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, type OrcaSession, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { runnerName } from "@/ui/atoms/brand-icon";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { ChevronRightIcon, StopIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { Row } from "@/ui/molecules/row";
import { resumeLine, useTakeMachine } from "./take-control";

const HEAD = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11";
const SHAPE = { working: "accent", idle: "warning", done: "neutral", unknown: "neutral" } as const;
/** A model id in plain words: "claude-opus-4" reads "opus". */
export const modelName = (m?: string | null) =>
	(m ?? "").replace(/^claude-/, "").replace(/-[\d.-]+$/, "");
const known = (s: string): s is keyof typeof SHAPE => s in SHAPE;

/** The AI sessions of this computer, started by Shipyard or not, each with its stop. Rows of the card "On this machine". */
export function MachineRows() {
	const { t } = useI18n();
	const m = t.factory.machine;
	const rows = useMachineSessions().data ?? [];
	const writes = useMachineWrites();
	const take = useTakeMachine();
	const { error, run } = useGuard();
	return (
		<>
			{error ? (
				<p role="alert" className="px-6 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{rows.map((s) => (
				<Row key={s.key} className="min-h-18 py-2">
					<Avatar agent name={runnerName(s.runner)} />
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate font-semibold">{s.title || s.project}</span>
						<span className="truncate text-n-11">
							{[runnerName(s.runner), modelName(s.model)].filter(Boolean).join(", ")}
						</span>
					</span>
					<Badge variant={s.state === "working" ? "accent" : "neutral"}>
						{m.state[s.state === "working" || s.state === "idle" ? s.state : "done"]}
					</Badge>
					{s.pid !== null && resumeLine(s.runner, s.session) ? (
						<Button
							className="min-h-control"
							aria-label={format(t.shellFn.sessions.takeOf, { name: `${s.runner} ${s.project}` })}
							onClick={() => void run(() => take(s))}
						>
							{t.shellFn.sessions.take}
						</Button>
					) : null}
					{s.pid === null ? null : (
						<IconButton
							label={format(m.stop, { name: `${s.runner} ${s.project}` })}
							className="min-h-control min-w-11"
							onClick={() => void run(() => writes.stop(s.pid as number))}
						>
							<StopIcon size={14} />
						</IconButton>
					)}
				</Row>
			))}
		</>
	);
}

/** Orca sessions: read with its `orca` command. Shipyard never starts, stops or removes one. */
export function OrcaCard() {
	const { t } = useI18n();
	const o = t.personal.orca;
	const { error, run } = useGuard();
	const status = useQuery({
		queryKey: ["factory", "orca"],
		queryFn: () => unwrap(commands.orcaStatus()),
		refetchInterval: 10_000,
		retry: false,
	}).data;
	if (!status) return null;
	const open = (s: OrcaSession) => (
		<Row key={s.id}>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-semibold">{s.activity || s.title || s.id}</span>
				<span className="truncate text-n-11">
					{[s.agent, s.project, s.branch || s.worktree].filter(Boolean).join(", ")}
				</span>
			</span>
			<Badge variant={SHAPE[known(s.state) ? s.state : "unknown"]}>
				{o.state[known(s.state) ? s.state : "unknown"]}
			</Badge>
			<Button
				className="min-h-control"
				aria-label={format(o.open, { name: s.title || s.id })}
				onClick={() => void run(async () => unwrap(commands.orcaOpen(s.id, true)))}
			>
				{o.openShort}
			</Button>
		</Row>
	);
	return (
		<Card className="py-2">
			<section aria-label={o.title}>
				<h2 className={HEAD}>{o.title}</h2>
				{error ? (
					<p role="alert" className="px-6 py-2 text-ui text-danger-text">
						{error}
					</p>
				) : null}
				{!status.installed ? (
					<Row>
						<span className="flex-1 text-n-11">{o.missing}</span>
						<Button className="min-h-control" onClick={() => copyText(status.downloadUrl)}>
							{o.copyAddress}
						</Button>
					</Row>
				) : !status.running ? (
					<Row className="text-n-11">{status.message || o.closed}</Row>
				) : status.sessions.length === 0 ? (
					<Row className="text-n-11">{t.factory.sessionsPage.none}</Row>
				) : (
					status.sessions.map(open)
				)}
			</section>
		</Card>
	);
}

/** The door to the ended sessions. */
export function EndedCard() {
	const { t } = useI18n();
	const s = t.factory.sessionsPage;
	return (
		<Card className="py-2">
			<section aria-label={s.ended}>
				<h2 className={HEAD}>{s.ended}</h2>
				<Row
					render={(props) => (
						<Link to="/crew/sessions" search={{ page: "ended" } as never} {...props} />
					)}
				>
					<span className="font-semibold">{s.endedAll}</span>
					<ChevronRightIcon size={20} className="ml-auto text-n-10" />
				</Row>
			</section>
		</Card>
	);
}

export { HEAD as SIDE_HEAD };
