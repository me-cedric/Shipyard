import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { doStop } from "@/features/flow/stop-action";
import { useGuard } from "@/features/work/guard";
import { cannedPrompt, itemTypeOf, PROMPT_KINDS, pageItemType } from "@/lib/assistant/prompts";
import { useRunActions, useRuns } from "@/lib/factory";
import { format, LANGS, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { projectKeys, useProjectActions, useProjects } from "@/lib/projects";
import { setHitQuery, snippetParts, useParsedRef, useRefSearch } from "@/lib/refs";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { rememberSelection } from "@/lib/shell/selection";
import { Button } from "@/ui/atoms/button";
import { ChatBubbleIcon, CodeBracketIcon, DocumentTextIcon, SparklesIcon } from "@/ui/icons";
import { CommandPalette, type PaletteGroup } from "@/ui/organisms/command-palette";
import type { Action } from "./actions";
import { answerOf } from "./ask-answer";
import {
	hiddenSection,
	PLACE_ICON,
	sectionPath,
	viewPath,
	visiblePlaces,
	visibleSections,
} from "./places";
import { refPage, refSelection } from "./ref-page";
import { hiddenTab, tabLabel } from "./spaces";

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
	const runs = useRuns().data;
	const act = useRunActions();
	const { error: stopError, run: guard } = useGuard();
	const { level } = useRights();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [query, setQuery] = useState("");
	const projects = useProjects();
	// The same query as the project form: one cache.
	const projectFile = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	}).data?.file;
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
		// A connection is behind the door Connections of This project.
		if (ref.startsWith("conn:")) return void navigate({ href: "/setup/project?page=connections" });
		void navigate({ to: page });
	};
	const tabs = visiblePlaces(level).flatMap((place) =>
		visibleSections(place, level).map(([space, tab]) => ({
			id: `go-${place}-${tab}`,
			// The home of Library has the name of its place: the list names it once.
			label:
				space === "library" && tab === "home"
					? t.ui.place[place]
					: `${t.ui.place[place]} / ${tabLabel(t, space, tab)}`,
			Icon: PLACE_ICON[place],
			run: () => void navigate({ to: sectionPath(place, tab) }),
		})),
	);

	// The pages that left the section switch keep a destination: the projects, the impacts, the pull
	// requests and each door of Setup (`spec:app-redesign#REQ-024`). A door shows with its scope.
	const scopes = visibleSections("setup", level).map(([, tab]) => tab);
	const door = (scope: string, page: string, label: string) => ({
		id: `go-setup-${scope}-${page}`,
		label: `${t.ui.place.setup} / ${label}`,
		href: `/setup/${scope}?page=${page}`,
		Icon: PLACE_ICON.setup,
		hidden: !scopes.includes(scope),
	});
	const tickets = door("project", "tickets", t.projects.ticketsConfig.title);
	const doors = [
		{ id: "go-projects", label: t.tabs.home.projects, href: "/projects", Icon: CodeBracketIcon },
		{
			id: "go-flow-impacts",
			label: `${t.ui.place.flow} / ${tabLabel(t, "code", "impacts")}`,
			href: "/flow/impacts",
			Icon: PLACE_ICON.flow,
			hidden: hiddenTab(level, "code", "impacts"),
		},
		{
			id: "go-code-pull-requests",
			label: `${t.ui.place.code} / ${tabLabel(t, "code", "pull-requests")}`,
			href: "/code/now#code-now-pulls",
			Icon: PLACE_ICON.code,
			hidden: hiddenSection(level, "code", "now"),
		},
		door("project", "connections", t.tabs.settings.connections),
		// The tickets file is a part of the project file: no file, no door.
		{ ...tickets, hidden: tickets.hidden || !projectFile },
		door("project", "extensions", t.tabs.settings.extensions),
		door("project", "health", t.settings.pages.projectHealth),
		door("computer", "models", t.tabs.settings["agents-rules"]),
		door("computer", "share", t.settings.outside.title),
		door("computer", "health", t.settings.pages.computerHealth),
		door("computer", "logs", t.settings.pages.logs),
		door("me", "look", t.settings.pages.look),
	]
		.filter((d) => !("hidden" in d && d.hidden))
		.map((d) => ({ ...d, run: () => void navigate({ href: d.href }) }));

	const type = pageItemType(viewPath(pathname));
	// The item that the inspector shows, when it is of the page type.
	const subject = type && selectedRef && itemTypeOf(selectedRef) === type ? selectedRef : null;
	const promptLanguage = LANGS.find((l) => l === promptLang) ?? lang;
	const groups: PaletteGroup[] = [
		{
			id: "go",
			heading: t.palette.goTo,
			items: [
				...[...tabs, ...doors].map((a) => ({
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

	const found = answerOf(
		text,
		features ?? [],
		{
			blocked: t.palette.wordsBlocked,
			stopped: t.palette.wordsStopped,
			needs: t.palette.wordsNeeds,
		},
		runs ?? [],
	);
	const label = {
		reply: t.flow.stop.reply,
		unblock: t.factory.unblock,
		addBudget: t.flow.stop.addBudget,
		tryAgain: t.flow.stop.tryAgain,
		resume: t.factory.resume,
		closeDone: t.factory.closeDone,
	};
	const markName = {
		blocked: t.palette.markBlocked,
		stopped: t.palette.markStopped,
		needs_you: t.palette.markNeeds,
	};
	// The action of a mark: the main action of the stop state when the run is known (one click, as on Today),
	// else it opens the run, where that action is on top.
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
								{f.action && f.run && f.action !== "reply" ? (
									<RightButton
										right="runs.start"
										variant="primary"
										className="min-h-control"
										aria-label={`${label[f.action]} ${f.title}`}
										onClick={() => {
											const { action, run } = f;
											if (!(action && run)) return;
											void guard(() =>
												doStop(act, run, action, { open: (id) => openRef(`run:${id}`) }),
											).then((ok) => ok && setPaletteOpen(false));
										}}
									>
										{label[f.action]}
									</RightButton>
								) : f.ref ? (
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
			{stopError ? (
				<p role="alert" className="text-ui text-danger-text">
					{stopError}
				</p>
			) : null}
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
