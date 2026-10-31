import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useProjectActions, useProjects } from "@/lib/projects";
import { useParsedRef, useRefSearch } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { rememberSelection } from "@/lib/shell/selection";
import { CodeBracketIcon, DocumentTextIcon } from "@/ui/icons";
import { CommandPalette, type PaletteGroup } from "@/ui/organisms/command-palette";
import { type Action, SPACE_ICON } from "./actions";
import { refPage, refSelection } from "./ref-page";
import { orderedSpaces, tabLabel, tabPath, visibleTabs } from "./spaces";

export function PaletteHost({ actions }: { actions: Action[] }) {
	const { t } = useI18n();
	const { paletteOpen, setPaletteOpen, openRef, openRefAt } = useShell();
	const { role, profile } = usePrefs();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [query, setQuery] = useState("");
	const projects = useProjects();
	const { switchTo } = useProjectActions();
	const text = query.trim();
	// The Rust grammar tells whether the text is a ref. The index finds entities by ref or title.
	const parsed = useParsedRef(text).data;
	const found = useRefSearch(text).data ?? [];

	// A ref opens its page, then the inspector shows it. Next to its page, only the inspector opens.
	const show = (ref: string) => {
		const page = refPage(ref);
		if (!page || page === pathname) return openRef(ref);
		const open = refSelection(t, ref);
		if (open) rememberSelection(...open);
		openRefAt(ref, page);
		void navigate({ to: page });
	};
	const tabs = orderedSpaces(role, profile.tabs).flatMap((space) =>
		visibleTabs(space, profile.hiddenTabs, role).map((tab) => ({
			id: `go-${space}-${tab}`,
			label: `${t.space[space]} / ${tabLabel(t, space, tab)}`,
			Icon: SPACE_ICON[space],
			run: () => void navigate({ to: tabPath(space, tab) }),
		})),
	);

	const groups: PaletteGroup[] = [
		{
			id: "actions",
			heading: t.palette.actions,
			items: [...actions.filter((a) => !a.disabled), ...tabs].map((a) => ({
				id: a.id,
				label: a.label,
				icon: <a.Icon size={14} />,
				shortcut: "shortcut" in a ? a.shortcut : undefined,
				onSelect: a.run,
			})),
		},
		{
			id: "projects",
			heading: t.palette.projects,
			items: (projects.data ?? []).map((p) => ({
				id: `project-${p.id}`,
				label: p.name,
				icon: <CodeBracketIcon size={14} />,
				onSelect: () => void switchTo(p.id),
			})),
		},
		{
			id: "refs",
			heading: t.palette.refs,
			items: [
				...(parsed
					? [
							{
								id: "ref",
								// The label holds the text, because the palette filters by label.
								label: format(t.shell.openRef, { ref: text }),
								icon: <DocumentTextIcon size={14} />,
								onSelect: () => show(text),
							},
						]
					: []),
				...found
					.filter((h) => h.ref !== text)
					.map((h) => ({
						id: `ref-${h.ref}`,
						label: `${h.ref} ${h.title}`,
						icon: <DocumentTextIcon size={14} />,
						onSelect: () => show(h.ref),
					})),
			],
		},
	];

	return (
		// The palette keeps its text inside. The input event bubbles through the portal to here.
		<div
			style={{ display: "contents" }}
			onInput={(e) => {
				if (e.target instanceof HTMLInputElement) setQuery(e.target.value);
			}}
		>
			<CommandPalette
				open={paletteOpen}
				onOpenChange={(open) => {
					setPaletteOpen(open);
					if (!open) setQuery("");
				}}
				groups={groups}
			/>
		</div>
	);
}
