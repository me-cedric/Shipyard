import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import {
	commands,
	type CompassEntry_Serialize as Entry,
	type Inspect_Serialize as Inspect,
	type SyncState,
	unwrap,
} from "@/lib/ipc";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { LinkIcon, ShieldCheckIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";

const STATUS = { current: "applied", stale: "stale", absent: "missing" } as const;
const TONE = { current: "success", stale: "warning", absent: "danger" } as const;
const key = (e: Entry) => `${e.kind}:${e.id}`;

/**
 * Settings / Health: each compass skill is applied, stale or missing, with its fix, and the
 * linked child projects take what the parent holds. Nothing is pushed.
 */
export function DoctorCompliance() {
	const { t } = useI18n();
	const d = t.doctor;
	const qc = useQueryClient();
	const compass = useQuery({
		queryKey: ["doctor", "skills"],
		queryFn: () => unwrap(commands.compassGet()),
	});
	const children = useQuery({
		queryKey: ["doctor", "children"],
		queryFn: () => unwrap(commands.childList()),
	});
	const [error, setError] = useState<unknown>(null);
	const [note, setNote] = useState<string | null>(null);
	const [inspected, setInspected] = useState<{ id: string; info: Inspect } | null>(null);
	const attempt = async (job: () => Promise<void>) => {
		setError(null);
		setNote(null);
		try {
			await job();
			await qc.invalidateQueries();
		} catch (e) {
			setError(e);
		}
	};
	const skills = (compass.data?.entries ?? []).filter((e) => e.kind === "skill");
	const linked = (children.data ?? []).filter((c) => c.cloned);
	if (!compass.data && linked.length === 0) return null;
	const fix = (e: Entry) =>
		attempt(async () => {
			if (e.state === "stale") await unwrap(commands.compassUpgrade([key(e)]));
			else await unwrap(commands.compassApply([key(e)]));
		});
	const bad = skills.filter((e) => e.state !== "current").length;
	return (
		<>
			{compass.data ? (
				<Panel
					title={d.skills.title}
					count={bad}
					icon={<ShieldCheckIcon size={14} />}
					tone={bad ? "warning" : "success"}
					flush
				>
					{skills.map((e) => (
						<div
							key={e.id}
							className="flex min-h-9 items-center gap-3 border-b px-3 py-1 last:border-b-0"
						>
							<span className="min-w-0 flex-1 truncate text-ui">{e.title}</span>
							<Badge variant={TONE[e.state as SyncState]}>
								{d.skills[STATUS[e.state as SyncState]]}
							</Badge>
							{e.state === "current" ? null : (
								<Button variant="secondary" onClick={() => void fix(e)}>
									{format(e.state === "stale" ? d.skills.upgrade : d.skills.apply, {
										name: e.title,
									})}
								</Button>
							)}
						</div>
					))}
				</Panel>
			) : null}
			{linked.length > 0 ? (
				<Panel title={d.propagate.title} count={linked.length} icon={<LinkIcon size={14} />} flush>
					{linked.map((c) => (
						<div
							key={c.id}
							className="flex min-h-9 items-center gap-3 border-b px-3 py-1 last:border-b-0"
						>
							<span className="min-w-0 flex-1 truncate text-ui">{c.name}</span>
							<span className="text-12 text-n-11">
								{format(d.propagate.held, { held: String(c.held), total: String(c.total) })}
							</span>
							<Button
								variant="ghost"
								onClick={() =>
									void attempt(async () =>
										setInspected({ id: c.id, info: await unwrap(commands.gitLinkedInspect(c.id)) }),
									)
								}
							>
								{format(t.extras.linked.inspect, { name: c.name })}
							</Button>
							<Button
								variant="secondary"
								disabled={c.proposed.length === 0}
								onClick={() =>
									void attempt(async () => {
										const [r] = await unwrap(commands.childDeploy([c.id], c.proposed));
										if (r?.error) throw new Error(r.error);
										setNote(format(d.propagate.done, { name: c.name }));
									})
								}
							>
								{format(d.propagate.action, { name: c.name })}
							</Button>
						</div>
					))}
				</Panel>
			) : null}
			{inspected ? <LinkedState info={inspected.info} /> : null}
			{note ? (
				<p role="status" className="text-ui text-success-text">
					{note}
				</p>
			) : null}
			{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
		</>
	);
}

/** The state of a linked project at a glance: branch, distance to the server, changes, last commit. */
function LinkedState({ info }: { info: Inspect }) {
	const { t } = useI18n();
	const l = t.extras.linked;
	const rows: [string, string][] = [
		[l.branch, info.branch ?? l.none],
		[l.ahead, String(info.ahead)],
		[l.behind, String(info.behind)],
		[l.changes, String(info.changes)],
		[l.stashes, String(info.stashes)],
		[l.last, info.last ?? l.none],
	];
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-ui">
			{rows.map(([k, v]) => (
				<div key={k} className="contents">
					<dt className="text-n-11">{k}</dt>
					<dd className="min-w-0 truncate">{v}</dd>
				</div>
			))}
		</dl>
	);
}
