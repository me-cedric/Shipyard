import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type CompassEntry_Serialize as Entry, type SyncState, unwrap } from "@/lib/ipc";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { LinkIcon, ShieldCheckIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const STATUS = { current: "applied", stale: "stale", absent: "missing" } as const;
const TONE = { current: "success", stale: "warning", absent: "danger" } as const;
const key = (e: Entry) => `${e.kind}:${e.id}`;

/**
 * Settings / Health: each compass skill is applied, stale or missing, with its fix, and the
 * linked child projects take what the parent holds. Nothing is pushed. Source: Legacy
 * `pages/Doctor.tsx` (compliance registry) and `ChildProjects.tsx` (propagation).
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
	const [error, setError] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const attempt = async (job: () => Promise<void>) => {
		setError(null);
		setNote(null);
		try {
			await job();
			await qc.invalidateQueries();
		} catch (e) {
			setError(message(e));
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
			{note ? (
				<p role="status" className="text-ui text-success-text">
					{note}
				</p>
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}
