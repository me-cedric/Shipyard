import { Today } from "@/features/home/today";
import { Checklist } from "@/features/onboarding";
import { FirstRun } from "@/features/projects/first-run";
import { ProjectSettings } from "@/features/projects/settings-project";
import { Automation } from "@/features/sync/automation";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { ClockIcon } from "@/ui/icons";
import { Loading } from "@/ui/molecules/loading";

/** Home starts with the first run until a project is active. */
export function HomeToday() {
	const { t } = useI18n();
	const active = useActiveProject().data;
	if (active === undefined)
		return <Loading title={t.tabs.home.today} icon={<ClockIcon size={16} />} />;
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
