import { useI18n } from "@/lib/i18n";
import { Select } from "../atoms/select";
import { type Status, StatusDot } from "../atoms/status-dot";

export type ProjectState = "clean" | "changed" | "behind" | "ahead" | "missing";

// One shape for each state of a working copy.
const STATE_DOT: Record<ProjectState, Status> = {
	clean: "success",
	changed: "warning",
	behind: "info",
	ahead: "active",
	missing: "danger",
};

export type SwitcherProject = { id: string; name: string; state: ProjectState };

/** Lists the projects with the state of each working copy. Arrow keys and Enter change the project. */
export function ProjectSwitcher({
	projects,
	value,
	onChange,
	className,
}: {
	projects: SwitcherProject[];
	value: string;
	onChange: (id: string) => void;
	className?: string;
}) {
	const { t } = useI18n();
	return (
		<Select
			label={t.projects.switcher}
			value={value}
			onValueChange={onChange}
			className={className}
			items={projects.map((p) => ({
				value: p.id,
				label: p.name,
				icon: <StatusDot status={STATE_DOT[p.state]} label={t.projects.state[p.state]} />,
			}))}
		/>
	);
}
