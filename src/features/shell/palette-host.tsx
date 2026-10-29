import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands } from "@/lib/ipc";
import { CodeBracketIcon, DocumentTextIcon } from "@/ui/icons";
import { CommandPalette, type PaletteGroup } from "@/ui/organisms/command-palette";
import type { Action } from "./actions";
import { useShell } from "./shell-state";
import { isRef } from "./spaces";

export function PaletteHost({ actions }: { actions: Action[] }) {
	const { t } = useI18n();
	const { paletteOpen, setPaletteOpen, openRef } = useShell();
	const [query, setQuery] = useState("");
	const recent = useQuery({
		queryKey: ["projects", "recent"],
		queryFn: () => commands.projectsRecent(),
	});
	const text = query.trim();

	const groups: PaletteGroup[] = [
		{
			id: "actions",
			heading: t.palette.actions,
			items: actions.map((a) => ({
				id: a.id,
				label: a.label,
				icon: <a.Icon size={14} />,
				shortcut: a.shortcut,
				onSelect: a.run,
			})),
		},
		{
			id: "projects",
			heading: t.palette.projects,
			items: (recent.data ?? []).map((p) => ({
				id: `project-${p.id}`,
				label: p.name,
				icon: <CodeBracketIcon size={14} />,
				// Placeholder: opening a project comes with `add-projects`.
				onSelect: () => {},
			})),
		},
		{
			id: "refs",
			heading: t.palette.refs,
			items: isRef(text)
				? [
						{
							id: "ref",
							// The label holds the text, because the palette filters by label.
							label: format(t.shell.openRef, { ref: text }),
							icon: <DocumentTextIcon size={14} />,
							onSelect: () => openRef(text),
						},
					]
				: [],
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
