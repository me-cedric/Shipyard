import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
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
import { TrashIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Dialog } from "@/ui/organisms/dialog";
import { useCloneFolder } from "../clone-folder";
import { folderOf, keyOf } from "../first-run";
import { BriefStep, ProjectStep, type RemoteKind, RemoteStep, StartStep, TeamStep } from "./steps";

const STEPS = ["project", "brief", "team", "remote", "start"] as const;
/** The team role that fits the role of the person in the app. */
/** The team role of the first member: the personal role, `developer` when none is set. */
const TEAM_ROLE = (r: string) => (r === "none" ? "developer" : r);

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

function Body({ onClose }: { onClose: () => void }) {
	const { t, lang } = useI18n();
	const { role } = usePrefs();
	const qc = useQueryClient();
	const router = useRouter();
	const [step, setStep] = useState(0);
	// All steps on one page, for a person who knows the answers.
	const [all, setAll] = useState(false);
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

	const create = async () => {
		setBusy(true);
		setError(null);
		try {
			const r = await unwrap(commands.creatorCreate(plan, true));
			const message = outcomeError(t, r.outcome);
			if (message) return setError(message);
			setResult(r);
			setIssues(preview.data?.issues ?? []);
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
		onClose();
	};

	const last = step === STEPS.length - 1;
	// Each step by its id: the guided way shows one, All steps shows the five.
	const part: Record<(typeof STEPS)[number], () => ReactNode> = {
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
				connect={() => {
					// The connections of This project, with the add form on the code host.
					askForm("connection:forge");
					router.history.push("/setup/project?page=connections");
					onClose();
				}}
			/>
		),
		start: () => <StartStep preview={preview.data} start={start} setStart={setChosen} />,
	};
	return (
		<Dialog
			full
			open
			onOpenChange={(o) => {
				// A created project stays: the close button opens it. A running Create keeps the dialog.
				if (!o && !busy) void (result ? finish() : onClose());
			}}
			title={t.creator.title}
			actions={
				result ? (
					<Button variant="primary" className="min-h-control" onClick={() => void finish()}>
						{t.creator.open}
					</Button>
				) : (
					<Button
						variant="primary"
						className="min-h-control"
						// The files and the starts of Create are the ones of the current answers.
						disabled={
							busy || !ready || preview.isError || !preview.data || preview.isPlaceholderData
						}
						onClick={() => void create()}
					>
						{busy ? t.creator.creating : t.creator.create}
					</Button>
				)
			}
		>
			<div className="flex h-full min-h-0 flex-col gap-3">
				{result ? (
					<Created
						result={result}
						start={start}
						runError={runError}
						runStarted={runStarted}
						issues={issues}
						setIssues={setIssues}
					/>
				) : (
					<>
						<nav aria-label={t.creator.steps} className="flex flex-wrap gap-1">
							{STEPS.map((s, i) => (
								<Button
									key={s}
									variant="ghost"
									aria-current={!all && i === step ? "step" : undefined}
									className="min-h-control aria-[current=step]:font-semibold"
									onClick={() => {
										setAll(false);
										setStep(i);
									}}
								>
									<span
										aria-hidden="true"
										className={cn(
											"flex size-6 items-center justify-center rounded-full text-12",
											!all && i === step
												? "bg-accent text-accent-fg"
												: i < step
													? "bg-n-12 text-n-1"
													: "border-2 border-n-8",
										)}
									>
										{i + 1}
									</span>
									{t.creator.step[s]}
								</Button>
							))}
						</nav>
						<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-1">
							{STEPS.map((s, i) => {
								const body = all || i === step ? part[s]() : null;
								return body ? (
									<section key={s} aria-labelledby={`creator-${s}`} className="flex flex-col gap-3">
										<h2 id={`creator-${s}`} className="text-20 font-semibold text-n-12">
											{t.creator.step[s]}
										</h2>
										{body}
									</section>
								) : null;
							})}
						</div>
						{preview.isError ? <ErrorNotice error={preview.error} /> : null}
						{error ? <ErrorNotice error={error} /> : null}
						<div className="flex justify-between gap-2">
							<Button
								variant="ghost"
								className="min-h-control"
								disabled={all || step === 0}
								onClick={() => setStep(step - 1)}
							>
								{t.projects.back}
							</Button>
							<Button className="min-h-control" aria-pressed={all} onClick={() => setAll(!all)}>
								{t.workspace.moment.allSteps}
							</Button>
							<Button
								className="min-h-control"
								disabled={all || last}
								onClick={() => setStep(step + 1)}
							>
								{t.creator.next}
							</Button>
						</div>
					</>
				)}
			</div>
		</Dialog>
	);
}

/** The project creator (spec `project-creator`). It starts afresh at each opening. */
export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	return open ? <Body onClose={onClose} /> : null;
}
