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
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { LinkButton } from "@/ui/atoms/link-button";
import {
	ChatBubbleIcon,
	CodeBracketIcon,
	DocumentTextIcon,
	PlayIcon,
	SparklesIcon,
} from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { CommandPalette, type PaletteGroup } from "@/ui/organisms/command-palette";
import type { Action } from "./actions";
import { answerOf, headingOf } from "./ask-answer";
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
 * The Ask bar of the top row. Open, it covers the page area with the answer, the Reply field and
 * the lists. The palette action focuses the bar: it opens no dialog. adr:0023 spec:app-redesign#REQ-004 spec:app-redesign#REQ-005
 */
export function PaletteHost({ actions, shortcut }: { actions: Action[]; shortcut?: string }) {
	const { t, lang } = useI18n();
	const { promptLang } = usePrefs();
	const { paletteOpen, setPaletteOpen, openRef, openRefAt, ask, selectedRef } = useShell();
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
	const { failure, run: guard } = useGuard();
	const { level } = useRights();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [query, setQuery] = useState("");
	const [reply, setReply] = useState("");
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
					: `${t.ui.place[place]}, ${tabLabel(t, space, tab)}`,
			Icon: PLACE_ICON[place],
			run: () => void navigate({ to: sectionPath(place, tab) }),
		})),
	);

	// The pages that left the section switch keep a destination: the projects, the impacts, the pull
	// requests and each door of Setup (`spec:app-redesign#REQ-024`). A door shows with its scope.
	const scopes = visibleSections("setup", level).map(([, tab]) => tab);
	const door = (scope: string, page: string, label: string) => ({
		id: `go-setup-${scope}-${page}`,
		label: `${t.ui.place.setup}, ${label}`,
		href: `/setup/${scope}?page=${page}`,
		Icon: PLACE_ICON.setup,
		hidden: !scopes.includes(scope),
	});
	const tickets = door("project", "tickets", t.projects.ticketsConfig.title);
	const doors = [
		{ id: "go-projects", label: t.tabs.home.projects, href: "/projects", Icon: CodeBracketIcon },
		{
			id: "go-flow-impacts",
			label: `${t.ui.place.flow}, ${tabLabel(t, "code", "impacts")}`,
			href: "/flow/impacts",
			Icon: PLACE_ICON.flow,
			hidden: hiddenTab(level, "code", "impacts"),
		},
		{
			id: "go-code-pull-requests",
			label: `${t.ui.place.code}, ${tabLabel(t, "code", "pull-requests")}`,
			href: "/code/pull-requests",
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
					icon: <a.Icon size={20} />,
					onSelect: a.run,
				})),
				...(projects.data ?? []).map((p) => ({
					id: `project-${p.id}`,
					label: p.name,
					icon: <CodeBracketIcon size={20} />,
					onSelect: () => void switchTo(p.id),
				})),
				...(parsed
					? [
							{
								id: "ref",
								// The label holds the text, because the bar filters by label.
								label: format(t.shell.openRef, { ref: text }),
								icon: <DocumentTextIcon size={20} />,
								onSelect: () => show(text),
							},
						]
					: []),
			],
		},
		// The hits group by kind. The index already chose them, so the label filter skips them.
		...[...new Set(hits.map((h) => h.kind))].map((kind) => ({
			id: `refs-${kind}`,
			heading: (t.refGroup as Record<string, string>)[kind] ?? kind,
			items: hits
				.filter((h) => h.kind === kind)
				.map((h) => ({
					id: `ref-${h.ref}`,
					label: h.title || h.ref,
					listed: true,
					detail: h.snippet
						? snippetParts(h.snippet).map((p, i) =>
								p.hit ? (
									// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
									<mark key={i} className="bg-accent-subtle text-n-12">
										{p.text}
									</mark>
								) : (
									// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
									<span key={i}>{p.text}</span>
								),
							)
						: undefined,
					icon: <DocumentTextIcon size={20} />,
					onSelect: () => show(h.ref),
				})),
		})),
		{
			id: "do",
			heading: t.palette.do,
			items: [
				...actions
					.filter((a) => !a.disabled && !a.hidden)
					.flatMap((a) => {
						const item = {
							id: a.id,
							label: a.id === "sync" ? t.palette.syncNow : a.label,
							icon: <a.Icon size={20} />,
							shortcut: a.shortcut,
							onSelect: a.run,
						};
						// The start from a ticket is a part of the page New feature: its row follows it.
						return a.id === "new-feature"
							? [
									item,
									{
										id: "start-from-ticket",
										label: t.palette.startOnTicket,
										icon: <PlayIcon size={20} />,
										shortcut: undefined,
										onSelect: () => void navigate({ to: "/flow/new" }),
									},
								]
							: [item];
					}),
				...(type ? PROMPT_KINDS[type] : []).map((kind) => ({
					id: `prompt-${kind}`,
					label: t.assistant.ask[kind],
					icon: <ChatBubbleIcon size={20} />,
					onSelect: () =>
						ask(cannedPrompt(promptLanguage, type as NonNullable<typeof type>, kind, subject)),
				})),
				...(hits.length
					? [
							{
								id: "ask-hits",
								label: t.palette.ask,
								listed: true,
								icon: <SparklesIcon size={20} />,
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

	// Under an answer the text is a question, not a label: the lists show the places that the text
	// names, else Flow and Plan, and the usual actions.
	const words = text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((w) => w.length > 2);
	const short = (g: PaletteGroup): PaletteGroup => {
		if (g.id === "do")
			return {
				...g,
				items: g.items.filter(
					(i) => i.id === "new-feature" || i.id === "start-from-ticket" || i.id === "sync",
				),
			};
		if (g.id !== "go") return g;
		const named = g.items.filter((i) => words.some((w) => i.label.toLowerCase().includes(w)));
		const usual = g.items.filter((i) => i.id === "go-flow-flow" || i.id === "go-plan-timeline");
		return { ...g, items: (named.length ? named : usual).slice(0, 4) };
	};
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
	const heads = {
		blocked: { one: t.palette.headBlockedOne, many: t.palette.headBlocked },
		stopped: { one: t.palette.headStoppedOne, many: t.palette.headStopped },
		needs_you: { one: t.palette.headNeedsOne, many: t.palette.headNeeds },
		none: t.palette.noAnswer,
	};
	const answer = (
		<Card pad className="flex flex-col gap-4.5">
			{found ? (
				<div className="flex items-center gap-3">
					<Avatar name="Shipyard" agent />
					<span aria-hidden="true" className="font-semibold">
						Shipyard
					</span>
				</div>
			) : null}
			{found?.map((g) => (
				<div key={g.mark} className="flex flex-col gap-4.5">
					<h2 className="font-semibold text-30 text-n-12">{headingOf(g, heads)}</h2>
					<ul className="flex flex-col gap-2.5">
						{g.features.map((f) => (
							<li
								key={`${f.title}-${f.ref}`}
								className="flex flex-wrap items-center gap-3 rounded-field bg-surface-0 p-4"
							>
								<span className="min-w-0 flex-[1_1_220px] font-semibold text-n-12">{f.title}</span>
								<Badge variant="you">{markName[g.mark]}</Badge>
								{f.action && f.run && f.action !== "reply" ? (
									<RightButton
										right="runs.start"
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
			<ErrorNotice error={failure} />
			{found ? (
				<form
					className="flex flex-wrap gap-2.5"
					onSubmit={(e) => {
						e.preventDefault();
						const v = reply.trim();
						if (!v) return;
						// The reply goes to the full assistant, under the question that it answers.
						ask(text ? `${text}\n\n${v}` : v);
						void navigate({ to: "/ask" });
						setReply("");
						setQuery("");
						setPaletteOpen(false);
					}}
				>
					<Input
						label={t.palette.reply}
						value={reply}
						onChange={(e) => setReply(e.target.value)}
						className="w-auto flex-[1_1_200px]"
					/>
					<Button type="submit" variant="primary">
						{t.palette.send}
					</Button>
				</form>
			) : null}
			<LinkButton
				onClick={() => {
					// The text goes to the draft of the Ask page; no text only opens the page.
					if (text) ask(text);
					void navigate({ to: "/ask" });
					setPaletteOpen(false);
				}}
			>
				{t.palette.openAssistant}
			</LinkButton>
		</Card>
	);

	return (
		<CommandPalette
			open={paletteOpen}
			onOpenChange={setPaletteOpen}
			groups={found ? groups.map(short) : groups}
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
