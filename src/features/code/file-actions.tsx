import { useState } from "react";
import { message } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Dialog } from "@/ui/organisms/dialog";

/** What the dialog asks. `path` is the parent folder for a new item and the item for rename and delete. */
export type FileAction = {
	kind: "file" | "folder" | "rename" | "delete";
	path: string;
	folder?: boolean;
};

const join = (dir: string, name: string) => (dir ? `${dir}/${name.trim()}` : name.trim());
const parent = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));

/**
 * The name prompt of a new file, a new folder and a rename, and the confirm of a delete. The
 * button is the click: the command refuses a call with no click, and a read-only project refuses
 * all four. A delete moves the path to the system trash. Legacy source: `file-browser.tsx` and
 * `infrastructure/browse.rs`.
 */
export function FileActionDialog({
	action,
	onClose,
	onDone,
}: {
	action: FileAction;
	onClose: () => void;
	onDone: (action: FileAction, path: string) => void;
}) {
	const { t } = useI18n();
	const f = t.personal.files;
	const [name, setName] = useState(action.kind === "rename" ? action.path.split("/").pop() : "");
	const [error, setError] = useState<string | null>(null);
	const next = action.kind === "rename" ? join(parent(action.path), name ?? "") : "";
	const target =
		action.kind === "file" || action.kind === "folder" ? join(action.path, name ?? "") : next;
	const run = async () => {
		try {
			if (action.kind === "file") await unwrap(commands.filesCreateFile(target, true));
			else if (action.kind === "folder") await unwrap(commands.filesCreateFolder(target, true));
			else if (action.kind === "rename")
				await unwrap(commands.filesRename(action.path, target, true));
			else await unwrap(commands.filesDelete(action.path, true));
			onDone(action, target);
		} catch (e) {
			setError(message(e));
		}
	};
	const title =
		action.kind === "delete" ? format(f.deleteTitle, { path: action.path }) : f[action.kind];
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={title}
			actions={
				<Button
					variant="primary"
					disabled={action.kind !== "delete" && !name?.trim()}
					onClick={() => void run()}
				>
					{action.kind === "delete" ? f.trash : f.confirm}
				</Button>
			}
		>
			{action.kind === "delete" ? null : (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (name?.trim()) void run();
					}}
				>
					<Input label={f.name} value={name ?? ""} onChange={(e) => setName(e.target.value)} />
				</form>
			)}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}
