import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ComponentType, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, isTauri, pickFolder, unwrap } from "@/lib/ipc";
import { ROLES, type Role, usePrefs } from "@/lib/prefs";
import { outcomeError, type ProjectOutcome, useProjectActions, useProjects } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { StatusDot } from "@/ui/atoms/status-dot";
import {
	AcademicCapIcon,
	ArrowDownTrayIcon,
	ChatBubbleIcon,
	CodeBracketIcon,
	DocumentTextIcon,
	FolderOpenIcon,
	PlusIcon,
	ShieldCheckIcon,
	Squares2X2Icon,
	UserCircleIcon,
	ViewColumnsIcon,
} from "@/ui/icons";
import { STATE_DOT } from "@/ui/molecules/project-switcher";
import logo from "../../../docs/assets/logo.svg";

type Step = "start" | "clone" | "create";

type IconProps = { size?: number };
const ROLE_ICON: Record<Role, ComponentType<IconProps>> = {
	pm: ViewColumnsIcon,
	architect: Squares2X2Icon,
	developer: CodeBracketIcon,
	qa: ShieldCheckIcon,
	ba: DocumentTextIcon,
	lead: ChatBubbleIcon,
	junior: AcademicCapIcon,
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

/** `~/Projects` on this machine: the default parent folder of a new project. */
async function projectsHome() {
	if (!isTauri()) return "/mock/Projects";
	const { homeDir, join } = await import("@tauri-apps/api/path");
	return join(await homeDir(), "Projects");
}

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

/** The first run: the role as named cards, then three starts. Open a local folder is the one primary action. */
export function FirstRun() {
	const { t } = useI18n();
	const { role, setPrefs } = usePrefs();
	const { openFolder, clone, create, switchTo } = useProjectActions();
	const qc = useQueryClient();
	const router = useRouter();
	const recent = [...(useProjects().data ?? [])]
		.sort((a, b) => b.lastUsed - a.lastUsed)
		.slice(0, 5);
	const [step, setStep] = useState<Step>("start");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [url, setUrl] = useState("");
	const [folder, setFolder] = useState("");
	const [name, setName] = useState("");
	// A folder without Git: the error offers to make it a project.
	const [plain, setPlain] = useState<string | null>(null);
	useEffect(() => {
		void projectsHome().then((home) => setFolder((f) => f || home));
	}, []);

	const run = async (start: () => Promise<ProjectOutcome | null>) => {
		setBusy(true);
		setError(null);
		setPlain(null);
		try {
			const outcome = await start();
			setError(outcome && outcomeError(t, outcome));
			if (outcome?.status === "not-repository") setPlain(outcome.message);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
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

	const back = (
		<Button variant="ghost" onClick={() => setStep("start")}>
			{t.projects.back}
		</Button>
	);

	const big =
		"h-28 w-full flex-col items-start justify-between whitespace-normal rounded-xl p-4 text-left text-14";
	const tile = "flex size-9 items-center justify-center rounded-lg";

	return (
		<div className="flex flex-col items-center px-8 py-12">
			<div className="flex w-full max-w-3xl flex-col gap-8">
				<div className="flex items-center gap-4">
					<span className="flex size-12 items-center justify-center rounded-xl border bg-surface-2 shadow-glow">
						<img src={logo} alt="" className="size-8" />
					</span>
					<h1 className="flex-1 text-20 font-semibold text-n-12">{t.ui.welcome}</h1>
				</div>
				{step === "start" ? (
					<section aria-labelledby="first-run-role" className="flex flex-col gap-2">
						<h2
							id="first-run-role"
							className="flex items-center gap-2 text-14 font-medium text-n-12"
						>
							<span
								aria-hidden="true"
								className="flex size-5 items-center justify-center rounded-full bg-n-4 font-mono text-11"
							>
								1
							</span>
							{t.prefs.role}
						</h2>
						<div
							role="radiogroup"
							aria-labelledby="first-run-role"
							className="grid grid-cols-2 gap-2 sm:grid-cols-4"
						>
							{([...ROLES, "none"] as const).map((r) => {
								const Icon = ROLE_ICON[r];
								return (
									<label
										key={r}
										className="flex h-12 cursor-pointer items-center gap-2.5 rounded-lg border bg-surface-2 px-3 text-ui text-n-12 shadow-1 transition-colors duration-(--duration-fast) hover:bg-n-3 has-checked:border-accent has-checked:bg-accent-soft has-checked:shadow-glow has-focus-visible:outline-2 has-focus-visible:outline-accent"
									>
										<input
											type="radio"
											name="role"
											value={r}
											checked={role === r}
											onChange={() => setPrefs({ role: r })}
											className="sr-only"
										/>
										<Icon size={16} />
										<span className="min-w-0 truncate">{t.role[r]}</span>
									</label>
								);
							})}
						</div>
					</section>
				) : null}
				{step === "start" ? (
					<section aria-labelledby="first-run-start" className="flex flex-col gap-2">
						<h2
							id="first-run-start"
							className="flex items-center gap-2 text-14 font-medium text-n-12"
						>
							<span
								aria-hidden="true"
								className="flex size-5 items-center justify-center rounded-full bg-n-4 font-mono text-11"
							>
								2
							</span>
							{t.projects.switcher}
						</h2>
						<div className="grid gap-3 sm:grid-cols-3">
							<button
								type="button"
								disabled={busy}
								onClick={() => run(openFolder)}
								className={cn(
									big,
									"border-transparent bg-accent-gradient text-accent-fg shadow-glow hover:brightness-110",
								)}
							>
								<span aria-hidden="true" className={cn(tile, "bg-surface-0/25")}>
									<FolderOpenIcon size={20} />
								</span>
								{t.projects.open}
							</button>
							<button
								type="button"
								onClick={() => setStep("clone")}
								className={cn(big, "bg-surface-2 text-n-12")}
							>
								<span aria-hidden="true" className={cn(tile, "bg-info-soft text-info-text")}>
									<ArrowDownTrayIcon size={20} />
								</span>
								{t.projects.clone}
							</button>
							<button
								type="button"
								onClick={() => setStep("create")}
								className={cn(big, "bg-surface-2 text-n-12")}
							>
								<span aria-hidden="true" className={cn(tile, "bg-success-soft text-success-text")}>
									<PlusIcon size={20} />
								</span>
								{t.projects.create}
							</button>
						</div>
					</section>
				) : (
					<div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-xl border bg-surface-1 p-4 shadow-2">
						<h2 className="flex items-center gap-2 text-14 font-medium text-n-12">
							{step === "clone" ? <ArrowDownTrayIcon size={16} /> : <PlusIcon size={16} />}
							{step === "clone" ? t.projects.clone : t.projects.create}
						</h2>
						{step === "clone" ? (
							<>
								<Input
									label={t.projects.address}
									placeholder={t.projects.address}
									value={url}
									onChange={(e) => setUrl(e.target.value)}
								/>
								<FolderField path={folder} onPick={setFolder} />
								<div className="flex justify-between">
									{back}
									<Button
										variant="primary"
										disabled={busy || !url.trim() || !folder || !repoName(url)}
										onClick={() => run(() => clone(url.trim(), `${folder}/${repoName(url)}`))}
									>
										{t.projects.cloneRun}
									</Button>
								</div>
							</>
						) : (
							<>
								<Input
									label={t.projects.name}
									placeholder={t.projects.name}
									value={name}
									onChange={(e) => setName(e.target.value)}
								/>
								<FolderField path={folder} onPick={setFolder} />
								<div className="flex justify-between">
									{back}
									<Button
										variant="primary"
										disabled={busy || !name.trim() || !folder}
										onClick={() =>
											run(() => create(`${folder}/${folderOf(name)}`, name.trim(), keyOf(name)))
										}
									>
										{t.projects.createRun}
									</Button>
								</div>
							</>
						)}
					</div>
				)}
				{error ? (
					<div className="flex items-center gap-3">
						<p role="alert" className="flex-1 text-ui text-danger-text">
							{error}
						</p>
						{plain ? (
							<Button variant="primary" disabled={busy} onClick={() => void makeProject(plain)}>
								{t.projects.makeProject}
							</Button>
						) : null}
					</div>
				) : null}
				{step === "start" && recent.length ? (
					<section aria-labelledby="recent-projects" className="flex flex-col gap-2">
						<h2 id="recent-projects" className="text-12 font-medium text-n-11">
							{t.projects.recent}
						</h2>
						<ul aria-label={t.projects.recent} className="grid gap-2 sm:grid-cols-2">
							{recent.map((p) => (
								<li
									key={p.id}
									className="flex items-center gap-3 rounded-lg border bg-surface-2 px-3 py-2 shadow-1 transition-shadow duration-(--duration-base) hover:shadow-2"
								>
									<span
										aria-hidden="true"
										className={cn(tile, "bg-n-3 font-mono text-14 text-n-12")}
									>
										{p.name.slice(0, 1).toUpperCase()}
									</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<Button
											variant="ghost"
											title={p.path}
											className="h-auto justify-start p-0 text-ui hover:bg-transparent hover:underline"
											onClick={() => run(() => switchTo(p.id))}
										>
											<StatusDot status={STATE_DOT[p.state]} label={t.projects.state[p.state]} />
											{p.name}
										</Button>
										<span className="truncate font-mono text-11 text-n-10">{p.path}</span>
									</span>
								</li>
							))}
						</ul>
					</section>
				) : null}
			</div>
		</div>
	);
}
