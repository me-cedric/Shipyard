import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject, useProjectActions, useProjects } from "@/lib/projects";
import { IconButton } from "@/ui/atoms/icon-button";
import { Tooltip } from "@/ui/atoms/tooltip";
import { ChevronLeftIcon, ChevronRightIcon } from "@/ui/icons";
import { ProjectSwitcher } from "@/ui/molecules/project-switcher";
import logo from "../../../docs/assets/logo.svg";
import { type Action, SPACE_ICON, shortcutText } from "./actions";
import { orderedSpaces } from "./spaces";

export function Sidebar({ toggle }: { toggle: Action }) {
	const { t } = useI18n();
	const { role, sidebarOpen } = usePrefs();
	const projects = useProjects().data ?? [];
	const active = useActiveProject().data;
	const { switchTo } = useProjectActions();
	const entries = orderedSpaces(role).map((space, i) => {
		const Icon = SPACE_ICON[space];
		const name = t.space[space];
		const link: ReactElement<Record<string, unknown>> = (
			<Link
				to={`/${space}` as const}
				aria-label={name}
				className="flex h-8 items-center gap-3 rounded-md px-2 text-ui text-n-11 hover:bg-n-3 hover:text-n-12 aria-[current=page]:bg-n-4 aria-[current=page]:text-n-12"
			>
				<Icon size={16} />
				{sidebarOpen ? <span className="truncate">{name}</span> : null}
			</Link>
		);
		return (
			<li key={space} className={space === "settings" ? "mt-auto" : undefined}>
				{sidebarOpen ? (
					link
				) : (
					<Tooltip label={name} shortcut={shortcutText(String(i + 1))}>
						{link}
					</Tooltip>
				)}
			</li>
		);
	});
	return (
		<div className="flex h-full flex-col gap-1 p-2">
			<div className="flex h-8 items-center px-1">
				<img src={logo} alt="Shipyard" className="size-6 shrink-0" />
			</div>
			{sidebarOpen && active ? (
				<ProjectSwitcher
					projects={projects}
					value={active.id}
					onChange={(id) => void switchTo(id)}
					className="w-full"
				/>
			) : null}
			<ul className="flex min-h-0 flex-1 flex-col gap-0.5">{entries}</ul>
			<IconButton
				label={sidebarOpen ? t.nav.collapse : t.nav.expand}
				shortcut={toggle.shortcut}
				onClick={toggle.run}
				className="h-8 w-8"
			>
				{sidebarOpen ? <ChevronLeftIcon size={16} /> : <ChevronRightIcon size={16} />}
			</IconButton>
		</div>
	);
}
