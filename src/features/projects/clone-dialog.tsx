import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { outcomeError, useProjectActions } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Dialog } from "@/ui/organisms/dialog";
import { FolderField, repoName } from "./first-run";

/** Clones a repository into a folder and opens it. The switcher menu opens it. */
export function CloneDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const { clone } = useProjectActions();
	const [url, setUrl] = useState("");
	const [folder, setFolder] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const run = async () => {
		setBusy(true);
		setError(null);
		try {
			const message = outcomeError(t, await clone(url.trim(), `${folder}/${repoName(url)}`));
			if (message) setError(message);
			else onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onClose();
			}}
			title={t.projects.clone}
			actions={
				<Button
					variant="primary"
					disabled={busy || !url.trim() || !folder || !repoName(url)}
					onClick={run}
				>
					{t.projects.cloneRun}
				</Button>
			}
		>
			<Input
				label={t.projects.address}
				placeholder={t.projects.address}
				value={url}
				onChange={(e) => setUrl(e.target.value)}
			/>
			<FolderField path={folder} onPick={setFolder} />
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}
