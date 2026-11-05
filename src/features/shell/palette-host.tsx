import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useProjectActions, useProjects } from "@/lib/projects";
import { setHitQuery, snippetParts, useParsedRef, useRefSearch } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { rememberSelection } from "@/lib/shell/selection";
import { CodeBracketIcon, DocumentTextIcon, SparklesIcon } from "@/ui/icons";
import { CommandPalette, type PaletteGroup } from "@/ui/organisms/command-palette";
import { type Action, SPACE_ICON } from "./actions";
import { refPage, refSelection } from "./ref-page";
import { orderedSpaces, tabLabel, tabPath, visibleTabs } from "./spaces";

export function PaletteHost({ actions }: { actions: Action[] }) {
	const { t } = useI18n();
	const { paletteOpen, setPaletteOpen, openRef, openRefAt, ask } = useShell();
	const { role, profile } = usePrefs();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [query, setQuery] = useState("");
	const projects = useProjects();
	const { switchTo } = useProjectActions();
	const text = query.trim();
	// The Rust grammar tells whether the text is a ref. The index finds entities by ref or title.
	const parsed = useParsedRef(text).data;
	const search = useRefSearch(text);
	// The hits of an older text do not show: the palette skips the label filter for a hit.
	const hits = search.isPlaceholderData ? [] : (search.data ?? []).filter((h) => h.ref !== text);

	// A ref opens its page, then the inspector shows it. Next to its page, only the inspector opens.
	const show = (ref: string) => {
		// The open document marks the words of the search.
		setHitQuery(text);
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
			],
		},
		// The hits group by kind. The index already chose them, so the label filter skips them.
		...[...new Set(hits.map((h) => h.kind))].map((kind) => ({
			id: `refs-${kind}`,
			heading: kind,
			items: hits
				.filter((h) => h.kind === kind)
				.map((h) => ({
					id: `ref-${h.ref}`,
					label: `${h.ref} ${h.title}`,
					listed: true,
					detail: h.snippet
						? snippetParts(h.snippet).map((p, i) =>
								// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
								p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
							)
						: undefined,
					icon: <DocumentTextIcon size={14} />,
					onSelect: () => show(h.ref),
				})),
		})),
		{
			id: "ask",
			heading: t.palette.ask,
			items: hits.length
				? [
						{
							id: "ask-hits",
							label: t.palette.ask,
							listed: true,
							icon: <SparklesIcon size={14} />,
							// The text goes to the message box. It is not sent.
							onSelect: () =>
								ask(
									format(t.palette.askPrompt, {
										items: hits.map((h) => `- ${h.ref} ${h.title}`).join("\n"),
									}),
								),
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
