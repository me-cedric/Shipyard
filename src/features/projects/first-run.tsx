import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { pickFolder } from "@/lib/ipc";
import { ROLES, type Role, usePrefs } from "@/lib/prefs";
import { outcomeError, type ProjectOutcome, useProjectActions } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ArrowDownTrayIcon, FolderOpenIcon, PlusIcon } from "@/ui/icons";

type Step = "start" | "clone" | "create";

/** `https://host/team/repo.git` and `git@host:team/repo.git` both give `repo`. */
const repoName = (url: string) =>
	url
		.trim()
		.replace(/\/+$/, "")
		.split(/[/:]/)
		.pop()
		?.replace(/\.git$/, "") ?? "";

function FolderField({ path, onPick }: { path: string; onPick: (path: string) => void }) {
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

/** The first run: the role, then three starts. Open a local folder is the one primary action. */
export function FirstRun() {
	const { t } = useI18n();
	const { role, setPrefs } = usePrefs();
	const { openFolder, clone, create } = useProjectActions();
	const [step, setStep] = useState<Step>("start");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [url, setUrl] = useState("");
	const [folder, setFolder] = useState("");
	const [name, setName] = useState("");
	const [key, setKey] = useState("");

	const run = async (start: () => Promise<ProjectOutcome | null>) => {
		setBusy(true);
		setError(null);
		try {
			const outcome = await start();
			setError(outcome && outcomeError(t, outcome));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const back = (
		<Button variant="ghost" onClick={() => setStep("start")}>
			{t.projects.back}
		</Button>
	);

	return (
		<div className="flex flex-col items-center p-8">
			<h1 className="sr-only">{t.space.home}</h1>
			<div className="flex w-80 flex-col gap-3">
				{step === "start" ? (
					<>
						<Select
							label={t.prefs.role}
							value={role}
							onValueChange={(v) => setPrefs({ role: v as Role })}
							items={(["none", ...ROLES] as const).map((r) => ({ value: r, label: t.role[r] }))}
							className="w-full"
						/>
						<Button variant="primary" disabled={busy} onClick={() => run(openFolder)}>
							<FolderOpenIcon size={14} />
							{t.projects.open}
						</Button>
						<Button onClick={() => setStep("clone")}>
							<ArrowDownTrayIcon size={14} />
							{t.projects.clone}
						</Button>
						<Button onClick={() => setStep("create")}>
							<PlusIcon size={14} />
							{t.projects.create}
						</Button>
					</>
				) : null}
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
				) : null}
				{step === "create" ? (
					<>
						<Input
							label={t.projects.name}
							placeholder={t.projects.name}
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<Input
							label={t.projects.key}
							placeholder={t.projects.key}
							value={key}
							onChange={(e) => setKey(e.target.value.toUpperCase())}
						/>
						<FolderField path={folder} onPick={setFolder} />
						<div className="flex justify-between">
							{back}
							<Button
								variant="primary"
								disabled={busy || !name.trim() || !key || !folder}
								onClick={() => run(() => create(folder, name.trim(), key))}
							>
								{t.projects.createRun}
							</Button>
						</div>
					</>
				) : null}
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
			</div>
		</div>
	);
}
