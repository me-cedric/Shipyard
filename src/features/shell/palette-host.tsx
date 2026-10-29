import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useProjectActions, useProjects } from "@/lib/projects";
import { useParsedRef, useRefSearch } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { CodeBracketIcon, DocumentTextIcon } from "@/ui/icons";
import { CommandPalette, type PaletteGroup } from "@/ui/organisms/command-palette";
import type { Action } from "./actions";

export function PaletteHost({ actions }: { actions: Action[] }) {
	const { t } = useI18n();
	const { paletteOpen, setPaletteOpen, openRef } = useShell();
	const [query, setQuery] = useState("");
	const projects = useProjects();
	const { switchTo } = useProjectActions();
	const text = query.trim();
	// The Rust grammar tells whether the text is a ref. The index finds entities by ref or title.
	const parsed = useParsedRef(text).data;
	const found = useRefSearch(text).data ?? [];

	const groups: PaletteGroup[] = [
		{
			id: "actions",
			heading: t.palette.actions,
			items: actions
				.filter((a) => !a.disabled)
				.map((a) => ({
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
								onSelect: () => openRef(text),
							},
						]
					: []),
				...found
					.filter((h) => h.ref !== text)
					.map((h) => ({
						id: `ref-${h.ref}`,
						label: `${h.ref} ${h.title}`,
						icon: <DocumentTextIcon size={14} />,
						onSelect: () => openRef(h.ref),
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
