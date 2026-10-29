import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { type AutomationView, syncKeys, useAutomation } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Switch } from "@/ui/atoms/switch";
import { Cog6ToothIcon } from "@/ui/icons";
import { Settings } from "@/ui/templates/settings";
import { type Draft, fromDraft, RUN_STATES, toDraft } from "./automation-draft";

const ICON = <Cog6ToothIcon size={14} />;
const WRITES = ["push", "pull_request", "tracker_transition", "tracker_comment"] as const;
const WRITE_KEY = {
	push: "push",
	pull_request: "pullRequest",
	tracker_transition: "trackerTransition",
	tracker_comment: "trackerComment",
} as const;

function Form({ view }: { view: AutomationView }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const a = t.sync.automation;
	const saved = toDraft(view.automation);
	const [draft, setDraft] = useState<Draft>(saved);
	const [error, setError] = useState<string | null>(null);
	const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

	const save = async () => {
		const parsed = fromDraft(draft, t);
		if ("error" in parsed) return setError(parsed.error);
		try {
			setError(null);
			await unwrap(commands.syncAutomationSave(parsed.automation));
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const field = (id: keyof Omit<Draft, "map" | "writes">, label: string, type?: "number") => ({
		id,
		icon: ICON,
		label,
		control: (
			<Input
				label={label}
				type={type}
				min={type ? 0 : undefined}
				value={draft[id]}
				onChange={(e) => setDraft({ ...draft, [id]: e.target.value })}
				className="w-64"
			/>
		),
	});

	return (
		<div className="flex flex-col gap-4 px-4 pb-4">
			<Settings
				sections={[
					{
						id: "automation",
						title: a.title,
						rows: [
							field("interval", a.interval, "number"),
							field("global", a.global, "number"),
							field("perProject", a.perProject, "number"),
							field("perStatus", a.perStatus),
						],
					},
					{
						id: "pickup",
						title: a.pickup,
						rows: [
							field("assignee", a.assignee),
							field("label", a.label),
							field("statuses", a.statuses),
							field("component", a.component),
							field("priority", a.priority),
						],
					},
					{
						id: "status-map",
						title: a.map,
						rows: RUN_STATES.map((state) => {
							const name = t.sync.runState[state];
							const row = draft.map[state] ?? { status: "", labels: "" };
							const set = (patch: Partial<typeof row>) =>
								setDraft({ ...draft, map: { ...draft.map, [state]: { ...row, ...patch } } });
							return {
								id: state,
								icon: ICON,
								label: name,
								control: (
									<span className="flex gap-2">
										<Input
											label={`${name}, ${a.mapStatus}`}
											value={row.status}
											onChange={(e) => set({ status: e.target.value })}
											className="w-40"
										/>
										<Input
											label={`${name}, ${a.mapLabels}`}
											value={row.labels}
											onChange={(e) => set({ labels: e.target.value })}
											className="w-40"
										/>
									</span>
								),
							};
						}),
					},
					{
						id: "writes",
						title: a.writes,
						rows: WRITES.map((w) => ({
							id: w,
							icon: ICON,
							label: a.write[WRITE_KEY[w]],
							control: (
								<Switch
									iconOnly
									label={a.write[WRITE_KEY[w]]}
									checked={draft.writes[w]}
									onCheckedChange={(on) =>
										setDraft({ ...draft, writes: { ...draft.writes, [w]: on } })
									}
								/>
							),
						})),
					},
				]}
			/>
			{view.file === "invalid" ? (
				<ul role="alert" className="text-ui text-danger-text">
					{view.issues.map((i) => (
						<li key={i}>{i}</li>
					))}
				</ul>
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{dirty ? (
				<div>
					<Button variant="primary" onClick={() => void save()}>
						{a.save}
					</Button>
				</div>
			) : null}
		</div>
	);
}

/** Settings / Project, group Automation: the pickup filter, the concurrency, the status mapping and
 * the write switches of `.shipyard/automation.yaml` (`add-sync` REQ-002, REQ-006, REQ-007). */
export function Automation() {
	const active = useActiveProject().data;
	const view = useAutomation().data;
	if (!active || !view) return null;
	// A saved file resets the draft.
	return <Form key={JSON.stringify(view)} view={view} />;
}
