import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { KINDS } from "@/features/settings/connections/connection-form";
import { runnerKeys } from "@/features/settings/connections/keys";
import { hiddenSection } from "@/features/shell/places";
import { format, useI18n } from "@/lib/i18n";
import { type ConnectionGroup, commands, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useRights, useRightsView } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Button } from "@/ui/atoms/button";
import { CheckIcon, Cog6ToothIcon, ComputerDesktopIcon, FolderOpenIcon } from "@/ui/icons";
import { PageHeader } from "@/ui/molecules/page-header";
import { StatePill } from "@/ui/molecules/setup-controls";
import { usePicture } from "@/ui/organisms/picture-field";
import { ChecklistControl, ITEMS, type ItemId, useChecklist } from "./checklist";

/** The card of a scope of Setup: an outline icon, the name and its state as a pill. */
function Scope({
	to,
	label,
	icon,
	state,
}: {
	to: string;
	label: string;
	icon: ReactNode;
	state: ReactNode;
}) {
	return (
		<Link
			to={to}
			className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface-2 p-6 text-n-12 shadow-2 hover:bg-n-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			{/* One height for an icon and for the picture of the person: the three names sit on one line. */}
			<span aria-hidden="true" className="flex h-8 items-center">
				{icon}
			</span>
			<span className="text-20 font-semibold">{label}</span>
			<span className="self-start">{state}</span>
		</Link>
	);
}

/** The choices of a step as large tiles. One is pressed; the actions of the step come after them. */
function Tiles({
	label,
	items,
	value,
	onPick,
}: {
	label: string;
	items: { id: string; label: string }[];
	value: string;
	onPick: (id: string) => void;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div
			role="group"
			aria-label={label}
			className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
		>
			{items.map((k) => (
				<button
					key={k.id}
					type="button"
					aria-pressed={value === k.id}
					onClick={() => onPick(k.id)}
					className={cn(
						"flex min-h-22 cursor-pointer items-center justify-center rounded-lg border border-n-7 bg-surface-1 px-3 text-17 font-semibold text-n-12",
						value === k.id && "bg-accent-tint outline-2 outline-accent",
					)}
				>
					{k.label}
				</button>
			))}
		</div>
	);
}

/** The products that a step of the issue tracker or the code host offers. */
function Kinds({
	group,
	kind = KINDS[group][0] ?? "",
	onPick,
}: {
	group: ConnectionGroup;
	kind?: string;
	onPick: (kind: string) => void;
}) {
	const { t } = useI18n();
	const names = t.connections.kind[group] as Record<string, string>;
	return (
		<Tiles
			label={t.connections.field.kind}
			items={KINDS[group].map((k) => ({ id: k, label: names[k] ?? k }))}
			value={kind}
			onPick={onPick}
		/>
	);
}

/**
 * Setup / Start (`spec:app-redesign#REQ-024`): the guided start. The list holds every item of the
 * start checklist with the same rule for done (`useChecklist`). The open step shows its one
 * question and the actions of the checklist. A door opens each scope of Setup that the role sees.
 */
export function SetupStart() {
	const { t, lang } = useI18n();
	const s = t.onboarding.setup;
	const state = useChecklist();
	const { role, defaultAgent, setPrefs } = usePrefs();
	const { level } = useRights();
	const avatar = usePicture("avatar").data;
	const handle = useRightsView().data?.person.member;
	const name =
		useTeam().data?.team.members.find((m) => m.handle === handle)?.name ?? t.shell.account;
	// A role does not see the door of a scope that it cannot open (`spec:app-redesign#REQ-006`).
	const sees = (scope: string) => !hiddenSection(level, "setup", scope);
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	}).data;
	const [chosen, setChosen] = useState<ItemId | null>(null);
	// The product that was picked for each group: the form opens on it.
	const [picked, setPicked] = useState<Partial<Record<ConnectionGroup, string>>>({});
	const todo = ITEMS.filter((i) => state.done[i] === false);
	const open = chosen ?? todo[0] ?? ITEMS[0];
	// Skip goes to the next step that is to do, and starts again at the top after the last one.
	const after = todo.filter((i) => i !== open);
	const next = after.find((i) => ITEMS.indexOf(i) > ITEMS.indexOf(open)) ?? after[0];
	const toConnect = (["tracker", "forge"] as const).filter((i) => state.done[i] === false).length;
	const ready = runners?.filter((r) => r.state === "detected").length ?? 0;
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4 [&>[data-page-header]]:-mb-4">
			<PageHeader icon={<Cog6ToothIcon size={16} />} title={t.ui.place.setup} />
			<div className="mx-4 flex flex-wrap rounded-lg bg-surface-2 shadow-2">
				<ol
					aria-label={s.title}
					className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 border-r border-n-6 p-6"
				>
					{ITEMS.map((id, i) => {
						const done = state.done[id] === true;
						return (
							<li key={id}>
								<button
									type="button"
									aria-current={id === open ? "step" : undefined}
									onClick={() => setChosen(id)}
									className="flex min-h-control w-full cursor-pointer items-center gap-3 rounded-md px-2 text-left text-n-12 aria-[current=step]:font-semibold"
								>
									<span
										aria-hidden="true"
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded-full text-13 font-semibold",
											done
												? "bg-n-12 text-n-1"
												: id === open
													? "bg-accent text-accent-fg outline-4 outline-accent-subtle"
													: "border-2 border-n-8",
										)}
									>
										{done ? <CheckIcon size={14} /> : i + 1}
									</span>
									{s.item[id]}
									{done ? <span className="sr-only">{s.done}</span> : null}
								</button>
							</li>
						);
					})}
				</ol>
				<section
					aria-labelledby="setup-step"
					className="flex min-w-0 flex-[3_1_420px] flex-col gap-6 p-8"
				>
					<h2 id="setup-step" className="text-30 leading-tight font-semibold text-n-12">
						{s.question[open]}
					</h2>
					{open === "tracker" || open === "forge" ? (
						<Kinds
							group={open}
							kind={picked[open]}
							onPick={(k) => setPicked((p) => ({ ...p, [open]: k }))}
						/>
					) : null}
					{open === "ai" && runners?.length ? (
						<Tiles
							label={t.personal.prefs.defaultAgent}
							items={runners.map((r) => ({ id: r.id, label: r.label }))}
							value={defaultAgent}
							onPick={(id) => setPrefs({ defaultAgent: id, defaultModel: "" })}
						/>
					) : null}
					{/* The actions sit under the choices, not at the foot: a short window still shows them. */}
					<div className="flex flex-wrap items-start justify-end gap-2.5">
						{next ? (
							<Button className="min-h-control" onClick={() => setChosen(next)}>
								{s.skip}
							</Button>
						) : null}
						<ChecklistControl
							id={open}
							state={state}
							pick={false}
							pane
							kind={open === "tracker" || open === "forge" ? picked[open] : undefined}
						/>
					</div>
				</section>
			</div>
			<div className="mx-4 grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
				{sees("project") ? (
					<Scope
						to="/setup/project"
						label={s.scope.project}
						icon={<FolderOpenIcon size={28} />}
						state={
							state.done.project === false ? (
								<StatePill state="fix">{s.state.noProject}</StatePill>
							) : toConnect ? (
								<StatePill state="fix">
									{format(s.state.connections, { count: toConnect })}
								</StatePill>
							) : (
								<StatePill state="ready">{s.state.connected}</StatePill>
							)
						}
					/>
				) : null}
				{sees("computer") ? (
					<Scope
						to="/setup/computer"
						label={s.scope.computer}
						icon={<ComputerDesktopIcon size={28} />}
						state={
							<StatePill state={ready ? "ready" : "fix"}>
								{format(s.state.tools, { count: ready })}
							</StatePill>
						}
					/>
				) : null}
				<Scope
					to="/setup/me"
					label={s.scope.me}
					icon={<Avatar name={name} src={avatar ?? undefined} />}
					state={<StatePill state="off">{`${t.role[role]}, ${t.lang[lang]}`}</StatePill>}
				/>
			</div>
		</div>
	);
}
