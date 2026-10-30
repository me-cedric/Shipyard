import { GetStarted } from "@/features/home/get-started";
import { Inbox } from "@/features/home/inbox/inbox";
import { FirstRun } from "@/features/projects/first-run";
import { ProjectSettings } from "@/features/projects/settings-project";
import { Automation } from "@/features/sync/automation";
import { useActiveProject } from "@/lib/projects";

/** Home starts with the first run until a project is active. */
export function HomeInbox() {
	const active = useActiveProject().data;
	if (active === undefined) return null;
	return active ? <Inbox start={<GetStarted />} /> : <FirstRun />;
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
