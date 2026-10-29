import type { ComponentType } from "react";
import { Branches, Changes, History } from "@/features/code";
import { Inbox } from "@/features/home";
import { FirstRun, Health, ProjectSettings } from "@/features/projects";
import { Connections, Me } from "@/features/settings";
import { type SpaceId, tabLabel } from "@/features/shell";
import { Automation, Backlog } from "@/features/sync";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { EmptyState } from "@/ui/molecules/empty-state";

/** Home starts with the first run until a project is active. */
function HomeInbox() {
	const active = useActiveProject().data;
	if (active === undefined) return null;
	return active ? <Inbox /> : <FirstRun />;
}

/** Settings / Project holds the project settings, then the Automation group of `add-sync`. */
function ProjectView() {
	return (
		<>
			<ProjectSettings />
			<Automation />
		</>
	);
}

/** Views that a feature owns. The other tabs show the empty state until their capability lands. */
const VIEWS: Partial<Record<string, ComponentType>> = {
	"home/inbox": HomeInbox,
	"code/changes": Changes,
	"code/history": History,
	"code/branches": Branches,
	"settings/connections": Connections,
	"settings/me": Me,
	"work/backlog": Backlog,
	"settings/project": ProjectView,
	"settings/health": Health,
};

export function TabView({ space, tab }: { space: SpaceId; tab: string }) {
	const { t } = useI18n();
	const View = VIEWS[`${space}/${tab}`];
	if (View) return <View />;
	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="sr-only">{tabLabel(t, space, tab)}</h1>
			<EmptyState action={{ label: t.noun[space], onClick: () => {} }} />
		</div>
	);
}
