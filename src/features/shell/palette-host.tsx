import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { cannedPrompt, itemTypeOf, PROMPT_KINDS, pageItemType } from "@/lib/assistant/prompts";
import { format, LANGS, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useProjectActions, useProjects } from "@/lib/projects";
import { setHitQuery, snippetParts, useParsedRef, useRefSearch } from "@/lib/refs";
import { useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { rememberSelection } from "@/lib/shell/selection";
import { Button } from "@/ui/atoms/button";
import { ChatBubbleIcon, CodeBracketIcon, DocumentTextIcon, SparklesIcon } from "@/ui/icons";
import { CommandPalette, type PaletteGroup } from "@/ui/organisms/command-palette";
import type { Action } from "./actions";
import { answerOf } from "./ask-answer";
import { PLACE_ICON, sectionPath, viewPath, visiblePlaces, visibleSections } from "./places";
import { refPage, refSelection } from "./ref-page";
import { tabLabel } from "./spaces";

/**
 * The Ask bar of the top bar with its one panel. The palette action focuses the bar: it opens no
 * dialog. adr:0023 spec:app-redesign#REQ-004 spec:app-redesign#REQ-005
 */
export function PaletteHost({ actions, shortcut }: { actions: Action[]; shortcut?: string }) {
	const { t, lang } = useI18n();
	const { promptLang } = usePrefs();
	const { paletteOpen, setPaletteOpen, openRef, openRefAt, ask, selectedRef, setAssistantOpen } =
		useShell();
	const input = useRef<HTMLInputElement>(null);
	// The palette shortcut and the project switcher open the panel: the focus goes to the bar.
	useEffect(() => {
		if (paletteOpen && document.activeElement !== input.current) input.current?.focus();
	}, [paletteOpen]);
	const features = useQuery({
		queryKey: ["features", "list"],
		queryFn: () => unwrap(commands.featuresList()),
	}).data;
	const { level } = useRights();
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
	const tabs = visiblePlaces(level).flatMap((place) =>
		visibleSections(place, level).map(([space, tab]) => ({
			id: `go-${place}-${tab}`,
			label: `${t.ui.place[place]} / ${tabLabel(t, space, tab)}`,
			Icon: PLACE_ICON[place],
			run: () => void navigate({ to: sectionPath(place, tab) }),
		})),
	);

	const type = pageItemType(viewPath(pathname));
	// The item that the inspector shows, when it is of the page type.
	const subject = type && selectedRef && itemTypeOf(selectedRef) === type ? selectedRef : null;
	const promptLanguage = LANGS.find((l) => l === promptLang) ?? lang;
	const groups: PaletteGroup[] = [
		{
			id: "go",
			heading: t.palette.goTo,
			items: [
				...tabs.map((a) => ({
					id: a.id,
					label: a.label,
					icon: <a.Icon size={14} />,
					onSelect: a.run,
				})),
				...(projects.data ?? []).map((p) => ({
					id: `project-${p.id}`,
					label: p.name,
					icon: <CodeBracketIcon size={14} />,
					onSelect: () => void switchTo(p.id),
				})),
				...(parsed
					? [
							{
								id: "ref",
								// The label holds the text, because the bar filters by label.
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
			id: "do",
			heading: t.palette.do,
			items: [
				...actions
					.filter((a) => !a.disabled && !a.hidden)
					.map((a) => ({
						id: a.id,
						label: a.label,
						icon: <a.Icon size={14} />,
						shortcut: a.shortcut,
						onSelect: a.run,
					})),
				...(type ? PROMPT_KINDS[type] : []).map((kind) => ({
					id: `prompt-${kind}`,
					label: t.assistant.ask[kind],
					icon: <ChatBubbleIcon size={14} />,
					onSelect: () =>
						ask(cannedPrompt(promptLanguage, type as NonNullable<typeof type>, kind, subject)),
				})),
				...(hits.length
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
					: []),
			],
		},
	];

	const found = answerOf(text, features ?? [], {
		blocked: t.palette.wordsBlocked,
		stopped: t.palette.wordsStopped,
		needs: t.palette.wordsNeeds,
	});
	const markName = {
		blocked: t.palette.markBlocked,
		stopped: t.palette.markStopped,
		needs_you: t.palette.markNeeds,
	};
	// The main action of each mark: it opens the run, where that action is on top (as the Runs card does).
	const actionOf = {
		blocked: t.factory.unblock,
		stopped: t.factory.why.again,
		needs_you: t.factory.answer,
	};
	const answer = (
		<section className="flex flex-col gap-2 px-2 pt-1">
			{found?.map((g) => (
				<div key={g.mark} className="flex flex-col gap-1">
					<h2 className="text-12 text-n-11">{markName[g.mark]}</h2>
					{g.features.length === 0 ? (
						<p className="text-ui text-n-11">{t.palette.noAnswer}</p>
					) : null}
					<ul className="flex flex-col gap-1">
						{g.features.map((f) => (
							<li key={`${f.title}-${f.ref}`} className="flex items-center justify-between gap-2">
								<span className="min-w-0 flex-1 truncate text-ui text-n-12">{f.title}</span>
								{f.ref ? (
									<Button
										className="min-h-control"
										aria-label={`${actionOf[g.mark]} ${f.title}`}
										onClick={() => {
											const ref = f.ref;
											if (ref) openRef(ref);
											setPaletteOpen(false);
										}}
									>
										{actionOf[g.mark]}
									</Button>
								) : null}
							</li>
						))}
					</ul>
				</div>
			))}
			<Button
				variant="ghost"
				className="min-h-control self-start"
				onClick={() => {
					// The text goes to the draft and opens the panel; no text only opens the panel.
					if (text) ask(text);
					else setAssistantOpen(true);
					setPaletteOpen(false);
				}}
			>
				{t.palette.openAssistant}
			</Button>
		</section>
	);

	return (
		<CommandPalette
			open={paletteOpen}
			onOpenChange={setPaletteOpen}
			groups={groups}
			answer={answer}
			answered={Boolean(found)}
			text={query}
			onTextChange={setQuery}
			// An answer shows for the text. Any other text goes to the full assistant.
			onSubmit={(v) => {
				if (found) return false;
				ask(v);
				setPaletteOpen(false);
			}}
			inputRef={input}
			shortcut={shortcut}
		/>
	);
}
