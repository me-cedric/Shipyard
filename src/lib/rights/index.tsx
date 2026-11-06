import { useQuery } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { type Access, commands, type Level, type Right, type TeamRole, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { Button, type ButtonProps } from "@/ui/atoms/button";
import { IconButton, type IconButtonProps } from "@/ui/atoms/icon-button";

export const rightsKey = ["rights"] as const;

/** An area of `team-rights`: each role has the level `none`, `read` or `write` in it. */
export type Area = Exclude<keyof Access, "merge" | "approve">;

/** The person and the rights of the open project, as the backend gives them (`team-rights` REQ-008). */
export function useRightsView() {
	const project = useActiveProject().data;
	return useQuery({
		queryKey: [...rightsKey, project?.id ?? null],
		queryFn: () => unwrap(commands.rightsGet()),
		enabled: !!project,
	});
}

/**
 * `can(right)` is true until the backend answers or when it fails: the backend refuses a write
 * anyway, the view only shows it early. `gate(right)` gives the props of an off control, with its reason.
 * `level(area)` is `write` until the backend answers: `none` hides the area.
 */
export function useRights() {
	const { t } = useI18n();
	const view = useRightsView().data;
	const person = view?.person;
	const can = (right: Right) => !person || person.rights.includes(right);
	const level = (area: Area): Level => person?.access[area] ?? "write";
	const role = person?.role ?? null;
	const gate = (right: Right): { disabled?: true; reason?: string } =>
		can(right)
			? {}
			: {
					disabled: true,
					reason: format(t.rights.needs, {
						right,
						role: role ? t.rights.role[role as TeamRole] : t.rights.noRole,
					}),
				};
	return { can, gate, level, person, view, role };
}

/** A Button that turns off, with the reason, when the person lacks `right`. */
export function RightButton({ right, disabled, reason, ...props }: ButtonProps & { right: Right }) {
	const g = useRights().gate(right);
	return <Button {...props} disabled={disabled || g.disabled} reason={g.reason ?? reason} />;
}

/** An IconButton that turns off, with the reason, when the person lacks `right`. */
export function RightIconButton({
	right,
	disabled,
	reason,
	...props
}: IconButtonProps & { right: Right }) {
	const g = useRights().gate(right);
	return <IconButton {...props} disabled={disabled || g.disabled} reason={g.reason ?? reason} />;
}
