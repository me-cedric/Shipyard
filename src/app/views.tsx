import { useRef } from "react";
import { Today } from "@/features/home/today";
import { FirstRun } from "@/features/projects/first-run";
import { NoProject } from "@/features/shell/no-project";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject, useProjects } from "@/lib/projects";
import { ClockIcon } from "@/ui/icons";
import { Loading } from "@/ui/molecules/loading";

/**
 * Home shows Today with a project. With none it shows the first run on a first launch (no role,
 * no project in the list) and the No project card for a person who is known. A first launch stays
 * a first launch until a project opens, so that Continue does not swap the page.
 */
export function HomeToday() {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const { role, loaded } = usePrefs();
	const projects = useProjects().data;
	const first = useRef<boolean | null>(null);
	if (active) first.current = null;
	else if (first.current === null && loaded && projects)
		first.current = role === "none" && !projects.length;
	const icon = <ClockIcon size={16} />;
	if (active) return <Today />;
	if (active === undefined || first.current === null)
		return <Loading title={t.tabs.home.today} icon={icon} />;
	return first.current ? <FirstRun /> : <NoProject title={t.tabs.home.today} icon={icon} />;
}
