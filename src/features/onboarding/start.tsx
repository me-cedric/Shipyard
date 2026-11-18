import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { runnerKeys } from "@/features/settings/connections/keys";
import { hiddenSection } from "@/features/shell/places";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useRights } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { CheckIcon, Cog6ToothIcon, CpuChipIcon, FolderOpenIcon, UserCircleIcon } from "@/ui/icons";
import { Door } from "@/ui/molecules/door";
import { PageHeader } from "@/ui/molecules/page-header";
import { Terms } from "@/ui/molecules/term";
import { ChecklistControl, ITEMS, type ItemId, useChecklist } from "./checklist";

/** A door to a scope of Setup, with its one state line. */
function Scope({
	to,
	label,
	icon,
	state,
}: {
	to: string;
	label: string;
	icon: ReactNode;
	state: string;
}) {
	return (
		<Door
			label={label}
			icon={icon}
			render={(p) => (
				<Link to={to} className={p.className}>
					{p.children}
					<span className="text-14 text-n-11">{state}</span>
				</Link>
			)}
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
	const { role } = usePrefs();
	const { level } = useRights();
	// A role does not see the door of a scope that it cannot open (`spec:app-redesign#REQ-006`).
	const sees = (scope: string) => !hiddenSection(level, "setup", scope);
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	}).data;
	const [chosen, setChosen] = useState<ItemId | null>(null);
	const todo = ITEMS.filter((i) => state.done[i] === false);
	const open = chosen ?? todo[0] ?? ITEMS[0];
	// Skip goes to the next step that is to do, and starts again at the top after the last one.
	const after = todo.filter((i) => i !== open);
	const next = after.find((i) => ITEMS.indexOf(i) > ITEMS.indexOf(open)) ?? after[0];
	const toConnect = (["tracker", "forge"] as const).filter((i) => state.done[i] === false).length;
	const ready = runners?.filter((r) => r.state === "detected").length ?? 0;
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<PageHeader icon={<Cog6ToothIcon size={16} />} title={t.ui.place.setup} />
			<div className="mx-4 grid gap-6 rounded-xl bg-surface-2 p-4 shadow-1 md:grid-cols-[18rem_1fr]">
				<ol aria-label={s.title} className="flex flex-col">
					{ITEMS.map((id, i) => {
						const done = state.done[id] === true;
						return (
							<li key={id}>
								<button
									type="button"
									aria-current={id === open ? "step" : undefined}
									onClick={() => setChosen(id)}
									className="flex min-h-control w-full items-center gap-3 rounded-md px-2 text-left text-14 text-n-11 hover:bg-n-3 aria-[current=step]:font-semibold aria-[current=step]:text-n-12"
								>
									<span
										aria-hidden="true"
										className={cn(
											"flex size-6 shrink-0 items-center justify-center rounded-full text-12",
											done
												? "bg-n-12 text-n-1"
												: id === open
													? "bg-accent text-accent-fg"
													: "border-2 border-n-8",
										)}
									>
										{done ? <CheckIcon size={12} /> : i + 1}
									</span>
									{s.item[id]}
									{done ? <span className="sr-only">{s.done}</span> : null}
								</button>
							</li>
						);
					})}
				</ol>
				<section aria-labelledby="setup-step" className="flex flex-col gap-4">
					<h2 id="setup-step" className="text-20 font-semibold text-n-12">
						<Terms>{s.question[open]}</Terms>
					</h2>
					<div className="flex flex-wrap items-center justify-end gap-2">
						{next ? (
							<Button className="min-h-control" onClick={() => setChosen(next)}>
								{s.skip}
							</Button>
						) : null}
						<ChecklistControl id={open} state={state} />
					</div>
				</section>
			</div>
			<div className="mx-4 grid gap-4 sm:grid-cols-3">
				{sees("project") ? (
					<Scope
						to="/setup/project"
						label={s.scope.project}
						icon={<FolderOpenIcon size={20} />}
						state={
							state.done.project === false
								? s.state.noProject
								: toConnect
									? format(s.state.connections, { count: toConnect })
									: s.state.connected
						}
					/>
				) : null}
				{sees("computer") ? (
					<Scope
						to="/setup/computer"
						label={s.scope.computer}
						icon={<CpuChipIcon size={20} />}
						state={format(s.state.tools, { count: ready })}
					/>
				) : null}
				<Scope
					to="/setup/me"
					label={s.scope.me}
					icon={<UserCircleIcon size={20} />}
					state={`${t.role[role]}, ${t.lang[lang]}`}
				/>
			</div>
		</div>
	);
}
