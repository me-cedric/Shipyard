import { Today } from "@/features/home/today";
import { Checklist } from "@/features/onboarding";
import { FirstRun } from "@/features/projects/first-run";
import { ProjectSettings } from "@/features/projects/settings-project";
import { Automation } from "@/features/sync/automation";
import { useActiveProject } from "@/lib/projects";

/** Home starts with the first run until a project is active. */
export function HomeToday() {
	const active = useActiveProject().data;
	if (active === undefined) return null;
	return active ? <Today start={<Checklist onlyTodo className="mx-4 shrink-0" />} /> : <FirstRun />;
}

/** Settings / Project holds the project settings, then the Automation group of `add-sync`. */
export function ProjectView() {
	return (
		<>
			<ProjectSettings />
			<Automation />
		</>
	);
}
