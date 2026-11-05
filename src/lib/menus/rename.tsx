import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type LinkFile, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Dialog } from "@/ui/organisms/dialog";

type Job = { path: string; onDone: (ref: string, path: string) => void };

/** The extension stays: `.drawio.svg` is one extension. */
const extOf = (name: string) =>
	name.endsWith(".drawio.svg")
		? ".drawio.svg"
		: name.includes(".")
			? name.slice(name.lastIndexOf("."))
			: "";

/**
 * Rename of a file-backed item: the new name (the extension is locked), then a review of every
 * file whose links change, with the exact lines. Apply moves the file and rewrites the links in one
 * step. `onDone` gets the new ref and the new path, so the caller can follow the item.
 */
function RenameDialog({ job, onClose }: { job: Job; onClose: () => void }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const u = t.ui.item;
	const dir = job.path.includes("/") ? job.path.slice(0, job.path.lastIndexOf("/") + 1) : "";
	const file = job.path.slice(dir.length);
	const ext = extOf(file);
	const [stem, setStem] = useState(file.slice(0, file.length - ext.length));
	const [review, setReview] = useState<LinkFile[] | null>(null);
	const [error, setError] = useState<unknown>(null);
	const name = stem.trim();
	const target = `${dir}${name}${ext}`;
	const valid = name !== "" && !/[/\\]/.test(name) && target !== job.path;
	const run = async (step: () => Promise<void>) => {
		try {
			setError(null);
			await step();
		} catch (e) {
			setError(e);
		}
	};
	const check = () =>
		run(async () => setReview(await unwrap(commands.filesRenameReview(job.path, target))));
	const apply = () =>
		run(async () => {
			// Apply writes only what the person read: a plan that changed goes back to the review.
			const now = await unwrap(commands.filesRenameReview(job.path, target));
			if (JSON.stringify(now) !== JSON.stringify(review)) {
				setReview(now);
				throw u.renameChanged;
			}
			const ref = await unwrap(commands.filesRenameLinks(job.path, target, true));
			for (const k of ["design", "knowledge", "refs", "specs"])
				void qc.invalidateQueries({ queryKey: [k] });
			job.onDone(ref, target);
			onClose();
		});
	return (
		<Dialog
			open
			wide={review !== null}
			onOpenChange={(o) => !o && onClose()}
			title={format(u.renameTitle, { path: job.path })}
			actions={
				review ? (
					<>
						<Button variant="ghost" onClick={() => setReview(null)}>
							{u.renameBack}
						</Button>
						<Button variant="primary" onClick={() => void apply()}>
							{u.rename}
						</Button>
					</>
				) : (
					<Button variant="primary" disabled={!valid} onClick={() => void check()}>
						{u.renameReview}
					</Button>
				)
			}
		>
			{review ? (
				<div className="flex max-h-96 flex-col gap-2 overflow-auto text-ui">
					<p>{review.length ? u.renameLinks : u.renameNone}</p>
					{review.map((f) => (
						<section key={f.path} aria-label={f.path} className="flex flex-col gap-1">
							<h3 className="font-medium">{f.path}</h3>
							{f.lines.map((l) => (
								<div key={l.line} className="font-mono text-n-11">
									<p className="text-danger-text">
										{l.line} - {l.before}
									</p>
									<p>
										{l.line} + {l.after}
									</p>
								</div>
							))}
						</section>
					))}
				</div>
			) : (
				<form
					className="flex items-end gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid) void check();
					}}
				>
					<Input label={u.renameName} value={stem} onChange={(e) => setStem(e.target.value)} />
					<span className="pb-1 text-ui text-n-11">{ext}</span>
				</form>
			)}
			{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
		</Dialog>
	);
}

/**
 * `start(path, onDone)` opens the dialog. Render `dialog` once in the view. A read-only project
 * takes no rename: `locked` is true then, and the menu leaves the action out.
 */
export function useRename(): {
	start: (path: string, onDone: Job["onDone"]) => void;
	dialog: ReactNode;
	locked: boolean;
} {
	const [job, setJob] = useState<Job | null>(null);
	const { profile } = usePrefs();
	const start = useCallback((path: string, onDone: Job["onDone"]) => setJob({ path, onDone }), []);
	return {
		start,
		locked: profile.readOnly,
		dialog: job ? <RenameDialog job={job} onClose={() => setJob(null)} /> : null,
	};
}
