import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { MARK, useBare } from "@/features/shell/bare";
import { format, useI18n } from "@/lib/i18n";
import { commands, pickFolder, unwrap } from "@/lib/ipc";
import { ROLES, type Role, usePrefs } from "@/lib/prefs";
import { outcomeError, type ProjectOutcome, useProjectActions, useProjects } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { StatusDot } from "@/ui/atoms/status-dot";
import { StepBar } from "@/ui/atoms/step-bar";
import {
	ArrowDownTrayIcon,
	BookOpenIcon,
	ChatBubbleIcon,
	CodeBracketIcon,
	CpuChipIcon,
	DocumentTextIcon,
	FolderOpenIcon,
	PlusIcon,
	ShieldCheckIcon,
	Squares2X2Icon,
	SwatchIcon,
	UserCircleIcon,
	ViewColumnsIcon,
} from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Option } from "@/ui/molecules/option";
import { STATE_DOT } from "@/ui/molecules/project-switcher";
import { TILE_GRID, Tile } from "@/ui/molecules/tile";
import { useCloneFolder } from "./clone-folder";
import { NewProjectDialog } from "./new-project/new-project-dialog";
import { RepoPicker } from "./repo-picker";

type Step = "role" | "start" | "clone";

type IconProps = { size?: number };
const ROLE_ICON: Record<Role, ComponentType<IconProps>> = {
	po: ChatBubbleIcon,
	pm: ViewColumnsIcon,
	architect: Squares2X2Icon,
	techlead: CpuChipIcon,
	ba: DocumentTextIcon,
	developer: CodeBracketIcon,
	qa: ShieldCheckIcon,
	designer: SwatchIcon,
	viewer: BookOpenIcon,
	none: UserCircleIcon,
};

/** The project key from the name, as the app derives it: six letters or digits, a letter first. */
export const keyOf = (name: string) => {
	const key = name
		.replace(/[^a-z0-9]/gi, "")
		.toUpperCase()
		.slice(0, 6);
	return /^[A-Z]/.test(key) ? key : `P${key}`.slice(0, 6);
};

/** The folder name of a new project: `My App` gives `my-app`. */
export const folderOf = (name: string) =>
	name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "project";

/** `https://host/team/repo.git` and `git@host:team/repo.git` both give `repo`. */
export const repoName = (url: string) =>
	url
		.trim()
		.replace(/\/+$/, "")
		.split(/[/:]/)
		.pop()
		?.replace(/\.git$/, "") ?? "";

export function FolderField({ path, onPick }: { path: string; onPick: (path: string) => void }) {
	const { t } = useI18n();
	return (
		<div className="flex gap-2">
			<Input label={t.projects.folder} placeholder={t.projects.folder} value={path} readOnly />
			<Button
				className="min-h-control"
				onClick={async () => {
					const picked = await pickFolder();
					if (picked) onPick(picked);
				}}
			>
				<FolderOpenIcon size={14} />
				{t.projects.choose}
			</Button>
		</div>
	);
}

/**
 * One start of a project (open, clone, switch): the busy flag, the error line, and the offer to make
 * a project of a folder with no Git. The first run and the Projects page share it.
 */
export function useProjectStart() {
	const { t } = useI18n();
	const qc = useQueryClient();
	const router = useRouter();
	const [error, setError] = useState<unknown>(null);
	const [busy, setBusy] = useState(false);
	// A folder without Git: the error offers to make it a project.
	const [plain, setPlain] = useState<string | null>(null);
	const run = async (start: () => Promise<ProjectOutcome | null | undefined>) => {
		setBusy(true);
		setError(null);
		setPlain(null);
		try {
			const outcome = await start();
			setError(outcome && outcomeError(t, outcome));
			if (outcome?.status === "not-repository") setPlain(outcome.message);
		} catch (e) {
			setError(e);
		} finally {
			setBusy(false);
		}
	};
	const makeProject = (path: string) =>
		run(async () => {
			// The click on the button is the consent for the first commit.
			const o = await unwrap(commands.projectsInit(path, true));
			if (o.project) {
				router.history.push(o.project.lastView ?? "/");
				await qc.invalidateQueries();
			}
			return o;
		});
	return { run, error, busy, plain, makeProject };
}

/** The error line of a start, with Make it a project for a folder with no Git. */
export function StartError({ start }: { start: ReturnType<typeof useProjectStart> }) {
	const { t } = useI18n();
	const { error, plain, busy, makeProject } = start;
	if (!error) return null;
	return (
		<div className="flex items-center gap-3">
			<ErrorNotice error={error} className="flex-1 text-ui text-danger-text" />
			{plain ? (
				<Button
					variant="primary"
					className="min-h-control"
					disabled={busy}
					onClick={() => void makeProject(plain)}
				>
					{t.projects.makeProject}
				</Button>
			) : null}
		</div>
	);
}

/** The columns of the tiles of the first run: three in the 780 px column. */
const GRID = cn(
	TILE_GRID,
	"w-full max-w-195 grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))]",
);

/**
 * The first run: a bare page with one question for each step. The role, then the start (open a
 * folder, clone, create), then the address of the clone. The page shows without the shell.
 */
export function FirstRun() {
	useBare();
	const { t } = useI18n();
	const { role, loaded, setPrefs } = usePrefs();
	const { openFolder, clone, switchTo } = useProjectActions();
	const qc = useQueryClient();
	const start = useProjectStart();
	const { run, busy } = start;
	const projects = useProjects().data;
	const recent = [...(projects ?? [])].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 5);
	// The role step shows only for a person with no saved role and no project. Nothing shows before the prefs and the list load.
	const [chosen, setStep] = useState<Step | null>(null);
	const step: Step | null =
		chosen ?? (loaded && projects ? (role !== "none" || projects.length ? "start" : "role") : null);
	// The role counts as a step only when the role step showed.
	const sawRole = useRef(false);
	if (step === "role") sawRole.current = true;
	const steps: Step[] = sawRole.current ? ["role", "start", "clone"] : ["start", "clone"];
	// A click on a tile picks the role, from the saved one. Continue saves it.
	const [picked, setPick] = useState<Role | null>(null);
	const pick = picked ?? role;
	// After a change of step the keyboard focus moves to the question.
	const question = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		if (chosen) question.current?.focus();
	}, [chosen]);
	const [url, setUrl] = useState("");
	const [folder, setFolder] = useCloneFolder();
	const [creating, setCreating] = useState(false);
	if (!step) return null;

	return (
		<div className="flex min-h-full flex-col items-center justify-center gap-9 px-4 py-12">
			<span aria-hidden="true" className={MARK} />
			<StepBar
				total={steps.length}
				current={steps.indexOf(step) + 1}
				label={format(t.factory.stepOf, { n: steps.indexOf(step) + 1, total: steps.length })}
				className="gap-2 *:w-11"
			/>
			<h1
				id="first-run-question"
				ref={question}
				tabIndex={-1}
				className="text-center text-44 font-semibold text-n-12 outline-none"
			>
				{step === "role" ? t.projects.job : step === "start" ? t.projects.start : t.projects.clone}
			</h1>
			{step === "role" ? (
				<>
					{/* biome-ignore lint/a11y/useSemanticElements: a fieldset needs a legend, and the question is the h1 */}
					<div role="group" aria-labelledby="first-run-question" className={GRID}>
						{([...ROLES, "none"] as const).map((r) => {
							const Icon = ROLE_ICON[r];
							return (
								<Tile
									key={r}
									icon={<Icon size={24} />}
									label={t.role[r]}
									selected={pick === r}
									onClick={() => setPick(r)}
								/>
							);
						})}
					</div>
					<Button
						variant="primary"
						size="lg"
						className="min-w-55"
						onClick={() => {
							setPrefs({ role: pick });
							setStep("start");
						}}
					>
						{t.onboarding.continue}
					</Button>
				</>
			) : step === "start" ? (
				<>
					{/* biome-ignore lint/a11y/useSemanticElements: a fieldset needs a legend, and the question is the h1 */}
					<div role="group" aria-labelledby="first-run-question" className={GRID}>
						<Tile
							icon={<FolderOpenIcon size={24} />}
							label={t.projects.open}
							disabled={busy}
							onClick={() => run(openFolder)}
						/>
						<Tile
							icon={<ArrowDownTrayIcon size={24} />}
							label={t.projects.clone}
							onClick={() => setStep("clone")}
						/>
						<Tile
							icon={<PlusIcon size={24} />}
							label={t.projects.create}
							onClick={() => setCreating(true)}
						/>
					</div>
					{recent.length ? (
						<section
							aria-labelledby="recent-projects"
							className="flex w-full max-w-195 flex-col gap-3"
						>
							<h2 id="recent-projects" className="text-17 font-semibold text-n-12">
								{t.projects.recent}
							</h2>
							<ul aria-label={t.projects.recent} className="flex flex-col gap-2.5">
								{recent.map((p) => (
									<li key={p.id}>
										<Option
											title={p.path}
											disabled={busy}
											onClick={() => run(() => switchTo(p.id))}
										>
											<StatusDot status={STATE_DOT[p.state]} label={t.projects.state[p.state]} />
											{p.name}
										</Option>
									</li>
								))}
							</ul>
						</section>
					) : null}
				</>
			) : (
				<Card pad className="flex w-full max-w-md flex-col gap-3">
					<RepoPicker folder={folder} onDone={() => void qc.invalidateQueries()} />
					<Input
						label={t.projects.address}
						placeholder={t.projects.address}
						value={url}
						onChange={(e) => setUrl(e.target.value)}
					/>
					<FolderField path={folder} onPick={setFolder} />
					<div className="flex justify-between">
						<Button variant="ghost" onClick={() => setStep("start")}>
							{t.projects.back}
						</Button>
						<Button
							variant="primary"
							disabled={busy || !url.trim() || !folder || !repoName(url)}
							onClick={() => run(() => clone(url.trim(), `${folder}/${repoName(url)}`))}
						>
							{t.projects.cloneRun}
						</Button>
					</div>
				</Card>
			)}
			<StartError start={start} />
			<NewProjectDialog open={creating} onClose={() => setCreating(false)} />
		</div>
	);
}
