import { useQueryClient } from "@tanstack/react-query";
import { Toggle } from "@/features/settings/parts";
import { HIDEABLE_PLACES, type PlaceId } from "@/features/shell/places";
import { useGuard } from "@/features/work/guard";
import { useRolesSave } from "@/features/work/team-rights";
import { format, useI18n } from "@/lib/i18n";
import { type Access, commands, type Level, type TeamRole, unwrap } from "@/lib/ipc";
import { useRights } from "@/lib/rights";
import { Chip } from "@/ui/atoms/chip";
import { Segmented } from "@/ui/atoms/segmented";
import { Card } from "@/ui/molecules/card";

const LEVELS: Level[] = ["none", "read", "write"];
type Area = Exclude<keyof Access, "merge" | "approve">;

/** The rows of the card, in the order of the design (picture 029). Code and merge is one row. */
const ROWS = [
	"work",
	"specs",
	"design",
	"plan",
	"runs",
	"approve",
	"code",
	"knowledge",
	"costs",
	"settings",
] as const;

/**
 * The rights of one role in plain words (`spec:shell-setup-rights#REQ-004`, `#REQ-011`). Plan and
 * estimates has No, See and Change. Code and merge is one row that sets two rights: the level of
 * the code, and the merge switch beside it. Under the rows, each place that the role sees has a
 * switch: a place that a role does not see is hidden, and the rights stay as they are. A switch
 * saves at once and needs `project.settings`.
 */
export function RoleCard({ role, onRole }: { role: TeamRole; onRole: (role: TeamRole) => void }) {
	const { t } = useI18n();
	const r = t.rights.team;
	const f = t.shellFn.rights;
	const roles = useRolesSave();
	const view = useRights().view;
	const off = useRights().gate("project.settings");
	const qc = useQueryClient();
	const { run } = useGuard();
	const mine = roles.table.find((x) => x.role === role);
	if (!mine) return null;
	const name = t.rights.role[role];
	const hidden = view?.roles.find((x) => x.role === role)?.hidden ?? [];
	/** The places that the role does not see: one command with the new list. */
	const setHidden = (place: PlaceId, shown: boolean) =>
		void run(async () => {
			const next = shown ? hidden.filter((p) => p !== place) : [...hidden, place];
			try {
				await unwrap(commands.rightsRolesSave([{ role, access: mine.access, hidden: next }], []));
			} finally {
				await qc.invalidateQueries();
			}
		});
	const fieldset = "w-64 shrink-0 disabled:opacity-60";
	return (
		<Card pad className="flex flex-[3_1_30rem] flex-col gap-3.5">
			{/* biome-ignore lint/a11y/useSemanticElements: a group of toggles, not a form part */}
			<div role="group" aria-label={r.roleGroup} className="flex flex-wrap gap-2">
				{roles.table.map((x) => (
					<Chip key={x.role} selected={x.role === role} onClick={() => onRole(x.role)}>
						{t.rights.role[x.role]}
					</Chip>
				))}
			</div>
			<h2 className="text-30 font-semibold text-n-12">{format(r.can, { role: name })}</h2>
			<ul className="flex flex-col">
				{ROWS.map((k) => {
					const label = k === "approve" ? r.approve : r.area[k as Area];
					const row = k === "code" ? f.codeMerge : label;
					return (
						<li
							key={k}
							aria-label={row}
							className="flex min-h-14 flex-wrap items-center gap-3 py-1 [&+&]:border-t [&+&]:border-n-6"
						>
							<span className="flex-[1_1_12.5rem] font-medium text-n-12">{row}</span>
							{/* The fieldset turns the switch off without the right, with the reason. */}
							<fieldset disabled={off.disabled} title={off.reason} className={fieldset}>
								{k === "approve" ? (
									<Segmented
										label={`${name} ${label}`}
										value={mine.access.approve ? "yes" : "none"}
										onValueChange={(v) =>
											void roles.setAccess(role, { ...mine.access, approve: v === "yes" })
										}
										items={[
											{ value: "none", label: r.pick.none },
											{ value: "yes", label: r.pick.yes },
										]}
									/>
								) : (
									<Segmented
										label={`${name} ${row}`}
										value={mine.access[k as Area]}
										onValueChange={(v) =>
											void roles.setAccess(role, {
												...mine.access,
												[k]: v,
												// The merge right needs the code right: a lower level takes it away.
												...(k === "code" && v !== "write" ? { merge: false } : {}),
											})
										}
										items={LEVELS.map((l) => ({ value: l, label: r.pick[l] }))}
									/>
								)}
							</fieldset>
							{k === "code" ? (
								<fieldset
									disabled={off.disabled || mine.access.code !== "write"}
									title={off.reason}
									className="shrink-0 disabled:opacity-60"
								>
									<Toggle
										label={`${name} ${r.merge}`}
										checked={mine.access.merge}
										onCheckedChange={(on) =>
											void roles.setAccess(role, { ...mine.access, merge: on })
										}
									/>
								</fieldset>
							) : null}
						</li>
					);
				})}
			</ul>
			<section aria-label={format(f.placesTitle, { role: name })} className="flex flex-col">
				<h3 className="pt-2 pb-1 text-13 font-semibold text-n-10">
					{format(f.placesTitle, { role: name })}
				</h3>
				<ul className="flex flex-col">
					{HIDEABLE_PLACES.map((p) => {
						const place = t.ui.place[p];
						return (
							<li
								key={p}
								className="flex min-h-14 items-center gap-3 py-1 [&+&]:border-t [&+&]:border-n-6"
							>
								<span className="flex-1 font-medium text-n-12">{place}</span>
								<fieldset disabled={off.disabled} title={off.reason} className="shrink-0">
									<Toggle
										label={format(f.hide, { place, role: name })}
										checked={!hidden.includes(p)}
										onCheckedChange={(on) => setHidden(p, on)}
									/>
								</fieldset>
							</li>
						);
					})}
				</ul>
			</section>
		</Card>
	);
}
