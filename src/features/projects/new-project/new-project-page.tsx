import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearch } from "@tanstack/react-router";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { useBare } from "@/features/shell/bare";
import { format, useI18n } from "@/lib/i18n";
import {
	type Brief,
	type CreatorResult_Serialize,
	commands,
	type NewMember,
	type NewProject_Deserialize,
	type Row_Serialize,
	unwrap,
} from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { outcomeError } from "@/lib/projects";
import { askForm } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { StepBar } from "@/ui/atoms/step-bar";
import { TrashIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { TILE_GRID } from "@/ui/molecules/tile";
import { useCloneFolder } from "../clone-folder";
import { folderOf, keyOf } from "../first-run";
import {
	BriefStep,
	KindStep,
	ProjectStep,
	type RemoteKind,
	RemoteStep,
	ROWS,
	StartStep,
	TeamStep,
} from "./steps";

/** The guided way: one question for each step. */
const GUIDED = ["name", "kind", "tools", "team", "ready"] as const;
/** All steps: one card for each part of the plan. */
const CARDS = ["project", "brief", "team", "remote", "start"] as const;
/** The team role of the first member: the personal role, `developer` when none is set. */
const TEAM_ROLE = (r: string) => (r === "none" ? "developer" : r);
/** The 820 px column of the page. */
const COLUMN = "w-full max-w-205";
/** The row labels are medium; a row with a field gives it 380 px (design: fields start at x 726 of 1440). */
const ROW_LOOK =
	"[&_[role=group]>span:first-child]:font-medium [&_[role=group]>div:last-child:has(>input,>textarea)]:basis-95";
const QUESTION = "text-center text-44 font-semibold text-n-12 outline-none";

/** What happens after Create: the run, the starter issues or nothing. */
function Created({
	result,
	start,
	runError,
	runStarted,
	issues,
	setIssues,
}: {
	result: CreatorResult_Serialize;
	start: string;
	runError: unknown;
	runStarted: boolean;
	issues: Row_Serialize[];
	setIssues: (rows: Row_Serialize[]) => void;
}) {
	const { t } = useI18n();
	const [failed, setFailed] = useState<{ reference: string; title: string; error: unknown }[]>([]);
	const [made, setMade] = useState(0);
	const [busy, setBusy] = useState(false);
	const createIssues = async () => {
		setBusy(true);
		const rows = issues;
		const out = await Promise.allSettled(rows.map((r) => unwrap(commands.workItemCreate(r, true))));
		setFailed(
			out.flatMap((o, i) =>
				o.status === "rejected"
					? [{ reference: rows[i]?.reference ?? "", title: rows[i]?.title ?? "", error: o.reason }]
					: [],
			),
		);
		setMade((n) => n + out.filter((o) => o.status === "fulfilled").length);
		// A row that was created leaves the list: a second click never makes a copy.
		setIssues(rows.filter((_, i) => out[i]?.status === "rejected"));
		setBusy(false);
	};
	return (
		<div className="flex max-w-xl flex-col gap-3">
			{result.warning ? <ErrorNotice error={result.warning} /> : null}
			{start === "run" && runStarted ? <p role="status">{t.creator.runStarted}</p> : null}
			{runError ? <ErrorNotice error={runError} /> : null}
			{start === "issues" ? (
				<>
					{issues.map((r, i) => (
						<div key={r.reference} className="flex items-center gap-2">
							<Input
								label={`${t.creator.issue} ${i + 1}`}
								value={r.title}
								onChange={(e) =>
									setIssues(issues.map((x) => (x === r ? { ...x, title: e.target.value } : x)))
								}
							/>
							<IconButton
								label={format(t.creator.removeIssue, { title: r.title })}
								onClick={() => setIssues(issues.filter((x) => x !== r))}
							>
								<TrashIcon size={14} />
							</IconButton>
						</div>
					))}
					{made ? <p role="status">{format(t.creator.issuesCreated, { count: made })}</p> : null}
					{failed.map((f) => (
						<div key={f.reference}>
							<span className="text-ui text-n-11">{f.title}</span>
							<ErrorNotice error={f.error} />
						</div>
					))}
					<div>
						<Button
							variant="primary"
							className="min-h-control"
							disabled={busy || issues.length === 0}
							onClick={() => void createIssues()}
						>
							{t.creator.createIssues}
						</Button>
					</div>
				</>
			) : null}
		</div>
	);
}

/**
 * New project (spec `project-creator`, pictures 061 and 098): a bare page with its own address. The
 * guided way asks one question for each step; All steps (`?all=true`) shows each field on one page.
 * The project is created at the last step only. The page starts afresh at each opening.
 */
export function NewProject() {
	useBare();
	const { t, lang } = useI18n();
	const { role } = usePrefs();
	const qc = useQueryClient();
	const router = useRouter();
	const [step, setStep] = useState(0);
	// All steps on one page, for a person who knows the answers. The address keeps the choice.
	const all = (useSearch({ strict: false }) as { all?: boolean }).all === true;
	// After a change of step the keyboard focus moves to the question.
	const question = useRef<HTMLHeadingElement>(null);
	const moved = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the step and the way are the triggers
	useEffect(() => {
		if (moved.current) question.current?.focus();
	}, [step, all]);
	const setAll = (next: boolean) => {
		moved.current = true;
		void router.navigate({ to: "/projects/new", search: next ? { all: true } : {}, replace: true });
	};
	const go = (next: number) => {
		moved.current = true;
		setStep(next);
	};
	const [parent, setParent] = useCloneFolder();
	const [name, setName] = useState("");
	const [keyText, setKeyText] = useState<string | null>(null);
	const [stack, setStack] = useState("node");
	const [docsLang, setDocsLang] = useState<string>(lang);
	const [pullsLang, setPullsLang] = useState<string>(lang);
	const [brief, setBrief] = useState<Brief>({ vision: "", users: "", scope: "" });
	const edited = useRef(new Set<keyof Brief>());
	const [team, setTeam] = useState<NewMember[] | null>(null);
	const [kind, setKind] = useState<RemoteKind>("local");
	const [url, setUrl] = useState("");
	const [forgeId, setForgeId] = useState<string | null>(null);
	const [slugText, setSlugText] = useState<string | null>(null);
	const [tracker, setTracker] = useState("");
	const [scope, setScope] = useState("");
	const [chosen, setChosen] = useState<string | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<CreatorResult_Serialize | null>(null);
	const [runError, setRunError] = useState<unknown>(null);
	const [runStarted, setRunStarted] = useState(false);
	const [issues, setIssues] = useState<Row_Serialize[]>([]);
	// The first tickets that the person removed before Create.
	const [dropped, setDropped] = useState<string[]>([]);

	const options = useQuery({
		queryKey: ["creator", "options"],
		queryFn: () => unwrap(commands.creatorOptions()),
	}).data;
	const connections = useQuery({
		queryKey: ["connections", "list"],
		queryFn: () => unwrap(commands.connectionsList()),
	}).data;
	const forges = (connections ?? []).filter(
		(c) => c.group === "forge" && (c.kind === "github" || c.kind === "gitlab"),
	);
	const trackers = (connections ?? []).filter((c) => c.group === "tracker");
	const forge = forges.find((c) => c.id === forgeId) ?? forges[0];
	const forgeOfExisting = forgeId ?? "";

	// A field that the person did not edit follows the name, the stack and the docs language.
	useEffect(() => {
		let live = true;
		void unwrap(commands.creatorDraft(name, stack, docsLang)).then((d) => {
			if (!live) return;
			setBrief((b) => {
				const keep = (f: keyof Brief) => (edited.current.has(f) ? b[f] : d[f]);
				return { vision: keep("vision"), users: keep("users"), scope: keep("scope") };
			});
		});
		return () => {
			live = false;
		};
	}, [name, stack, docsLang]);

	const members: NewMember[] = team ?? [{ name: options?.me ?? "", role: TEAM_ROLE(role) }];
	const slug = slugText ?? `${forge?.user ?? "owner"}/${folderOf(name)}`;
	const plan: NewProject_Deserialize = {
		name: name.trim(),
		key: (keyText ?? keyOf(name)).trim(),
		folder: `${parent}/${folderOf(name)}`,
		stack,
		brief,
		docsLang,
		pullsLang,
		members: members.filter((m) => m.name.trim()),
		remote:
			kind === "local"
				? { kind: "local" }
				: kind === "existing"
					? { kind: "existing", url: url.trim(), forge: forgeOfExisting || null }
					: { kind: "create", forge: forge?.id ?? "", slug: slug.trim() },
		tracker: tracker || null,
		trackerScope: scope.trim() || null,
	};
	const ready = name.trim() !== "" && parent !== "";
	const preview = useQuery({
		queryKey: ["creator", "preview", plan],
		queryFn: () => unwrap(commands.creatorPreview(plan)),
		enabled: ready,
		retry: false,
		placeholderData: keepPreviousData,
	});
	const start =
		chosen && preview.data?.starts.includes(chosen) ? chosen : (preview.data?.starts[0] ?? "later");
	const first = (preview.data?.issues ?? []).filter((r) => !dropped.includes(r.reference));

	const create = async () => {
		setBusy(true);
		setError(null);
		try {
			const r = await unwrap(commands.creatorCreate(plan, true));
			const message = outcomeError(t, r.outcome);
			if (message) return setError(message);
			setResult(r);
			setIssues(first);
			if (start === "run")
				try {
					await unwrap(commands.creatorBootstrap(true));
					setRunStarted(true);
				} catch (e) {
					setRunError(e);
				}
		} catch (e) {
			setError(e);
		} finally {
			setBusy(false);
		}
	};
	const finish = async () => {
		const project = result?.outcome.project;
		if (project) router.history.push(project.lastView ?? "/");
		await qc.invalidateQueries();
	};
	// The way out: the page before this one, or Projects when the app started here.
	const leave = () =>
		router.history.canGoBack() ? router.history.back() : void router.navigate({ to: "/projects" });

	const connect = () => {
		// The connections of This project, with the add form on the code host.
		askForm("connection:forge");
		router.history.push("/setup/project?page=connections");
	};
	const createButton = (large?: boolean) => (
		<Button
			variant="primary"
			size={large ? "lg" : "md"}
			className={large ? "min-w-55" : "min-h-control min-w-45"}
			// The files and the starts of Create are the ones of the current answers.
			disabled={busy || !ready || preview.isError || !preview.data || preview.isPlaceholderData}
			onClick={() => void create()}
		>
			{busy ? t.creator.creating : t.creator.create}
		</Button>
	);
	// Each part of the plan by its id: a card of All steps, or the body of a guided step.
	const part: Record<(typeof CARDS)[number], () => ReactNode> = {
		project: () =>
			options ? (
				<ProjectStep
					options={options}
					name={name}
					setName={setName}
					keyText={keyText ?? keyOf(name)}
					setKey={setKeyText}
					parent={parent}
					setParent={setParent}
					stack={stack}
					setStack={setStack}
				/>
			) : null,
		brief: () =>
			options ? (
				<BriefStep
					options={options}
					docsLang={docsLang}
					setDocsLang={setDocsLang}
					pullsLang={pullsLang}
					setPullsLang={setPullsLang}
					brief={brief}
					setField={(f, v) => {
						edited.current.add(f);
						setBrief({ ...brief, [f]: v });
					}}
				/>
			) : null,
		team: () =>
			options ? <TeamStep options={options} members={members} setMembers={setTeam} /> : null,
		remote: () => (
			<RemoteStep
				kind={kind}
				setKind={setKind}
				forges={forges}
				trackers={trackers}
				url={url}
				setUrl={setUrl}
				forge={kind === "create" ? (forge?.id ?? "") : forgeOfExisting}
				setForge={setForgeId}
				slug={slug}
				setSlug={setSlugText}
				tracker={tracker}
				setTracker={setTracker}
				scope={scope}
				setScope={setScope}
				connect={connect}
			/>
		),
		start: () => (
			<StartStep
				preview={preview.data}
				start={start}
				setStart={setChosen}
				onTools={() =>
					all
						? (() => {
								const card = document.getElementById("creator-remote");
								card?.scrollIntoView({ block: "start" });
								card?.focus();
							})()
						: go(GUIDED.indexOf("tools"))
				}
				issues={first}
				removeIssue={(reference) => setDropped([...dropped, reference])}
			/>
		),
	};
	const errors = (
		<>
			{preview.isError ? <ErrorNotice error={preview.error} /> : null}
			{error ? <ErrorNotice error={error} /> : null}
		</>
	);
	const page = "flex min-h-full flex-col items-center px-4 py-12";

	// A created project stays: Open shows it.
	if (result)
		return (
			<div className={cn(page, "justify-center gap-9")}>
				<h1 className={QUESTION}>{result.outcome.project?.name ?? t.creator.title}</h1>
				<Card pad className="flex w-full max-w-xl flex-col gap-4">
					<Created
						result={result}
						start={start}
						runError={runError}
						runStarted={runStarted}
						issues={issues}
						setIssues={setIssues}
					/>
					<Button variant="primary" size="lg" onClick={() => void finish()}>
						{t.creator.open}
					</Button>
				</Card>
			</div>
		);

	if (all)
		return (
			<div className={cn(page, "gap-5")}>
				<h1 ref={question} tabIndex={-1} className={QUESTION}>
					{t.creator.title}
				</h1>
				<StepBar
					total={CARDS.length}
					current={1}
					label={t.creator.steps}
					className="gap-2 *:w-11"
				/>
				<div className={cn(COLUMN, "flex flex-col gap-4", ROW_LOOK)}>
					{CARDS.map((s, i) => (
						<Card key={s} role="region" aria-labelledby={`creator-${s}`} className={ROWS}>
							<h2
								id={`creator-${s}`}
								tabIndex={-1}
								className="flex items-center gap-3 px-6 pt-4 pb-2 text-20 font-semibold text-n-12"
							>
								<span
									aria-hidden="true"
									className="flex size-8 items-center justify-center rounded-full bg-primary text-13 text-primary-fg"
								>
									{i + 1}
								</span>
								{t.creator.step[s]}
							</h2>
							{part[s]()}
							{s === "start" ? <Row className="justify-end py-2">{createButton()}</Row> : null}
						</Card>
					))}
					{errors}
					<Button className="min-h-control self-start" onClick={() => setAll(false)}>
						{t.projects.back}
					</Button>
				</div>
			</div>
		);

	const id = GUIDED[step] ?? "name";
	const ask = { ...t.creator.ask, ready: t.projects.start }[id];
	return (
		<div className={cn(page, "justify-center gap-9")}>
			<nav
				aria-label={t.creator.steps}
				className="flex flex-wrap items-center justify-center gap-2.5"
			>
				{GUIDED.map((s, i) => (
					<Fragment key={s}>
						{i > 0 ? <span aria-hidden="true" className="h-0.5 w-7 bg-n-8" /> : null}
						<button
							type="button"
							aria-current={i === step ? "step" : undefined}
							className={cn(
								"inline-flex min-h-control cursor-pointer items-center gap-2 font-semibold",
								i === step ? "text-accent-text" : i < step ? "text-n-12" : "text-n-10",
							)}
							onClick={() => go(i)}
						>
							<span
								aria-hidden="true"
								className={cn(
									"flex size-7 items-center justify-center rounded-full border-2 text-13",
									i === step
										? "border-accent bg-accent text-accent-fg"
										: i < step
											? "border-primary bg-primary text-primary-fg"
											: "border-n-8 bg-surface-1",
								)}
							>
								{i + 1}
							</span>
							{t.creator.guided[s]}
						</button>
					</Fragment>
				))}
			</nav>
			<h1 id="creator-question" ref={question} tabIndex={-1} className={QUESTION}>
				{ask}
			</h1>
			{id === "name" ? (
				<Card pad className="w-full max-w-130">
					<Input
						label={t.projects.name}
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && name.trim()) go(1);
						}}
						className="min-h-13 text-17"
					/>
				</Card>
			) : id === "kind" ? (
				options ? (
					<KindStep
						options={options}
						stack={stack}
						setStack={setStack}
						className={cn(
							TILE_GRID,
							COLUMN,
							"grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))]",
						)}
					/>
				) : null
			) : (
				<Card role="group" aria-labelledby="creator-question" className={cn(COLUMN, ROWS)}>
					{part[id === "tools" ? "remote" : id === "team" ? "team" : "start"]()}
				</Card>
			)}
			{errors}
			<div className="flex flex-wrap justify-center gap-2.5">
				<Button
					size="lg"
					className="min-w-35"
					onClick={() => (step === 0 ? leave() : go(step - 1))}
				>
					{t.projects.back}
				</Button>
				<Button size="lg" className="min-w-35" onClick={() => setAll(true)}>
					{t.workspace.moment.allSteps}
				</Button>
				{step === GUIDED.length - 1 ? (
					createButton(true)
				) : (
					<Button
						variant="primary"
						size="lg"
						className="min-w-55"
						// A project needs a name: the next steps build on it.
						disabled={id === "name" && !name.trim()}
						onClick={() => go(step + 1)}
					>
						{t.onboarding.continue}
					</Button>
				)}
			</div>
		</div>
	);
}
