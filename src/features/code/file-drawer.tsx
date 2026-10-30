import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { rememberSelection } from "@/lib/shell/selection";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import {
	ChevronDownIcon,
	ChevronRightIcon,
	ClipboardIcon,
	CodeBracketIcon,
	DocumentTextIcon,
	FolderOpenIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
	XMarkIcon,
} from "@/ui/icons";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { type FileAction, FileActionDialog } from "./file-actions";
import { FileDialog } from "./viewer";

/** Search results that show at once. The search narrows the rest. */
const MAX_FOUND = 200;

export type FileRowItem = { path: string; name: string; depth: number; folder: boolean };

/** The rows of the tree: folders first, each level by name, the children of an open folder only. */
export function fileRows(paths: string[], open: ReadonlySet<string>): FileRowItem[] {
	type Node = Map<string, Node | null>;
	const root: Node = new Map();
	for (const p of paths) {
		let node = root;
		// A path with a trailing slash is a folder with no file yet (a new folder).
		const empty = p.endsWith("/");
		const parts = p.replace(/\/$/, "").split("/");
		parts.forEach((part, i) => {
			if (i === parts.length - 1) node.set(part, node.get(part) ?? (empty ? new Map() : null));
			else {
				const next = node.get(part) ?? new Map();
				node.set(part, next);
				node = next;
			}
		});
	}
	const rows: FileRowItem[] = [];
	const walk = (node: Node, prefix: string, depth: number) => {
		const entries = [...node].sort(
			([a, x], [b, y]) => Number(y !== null) - Number(x !== null) || a.localeCompare(b),
		);
		for (const [name, child] of entries) {
			const path = `${prefix}${name}`;
			rows.push({ path, name, depth, folder: child !== null });
			if (child && open.has(path)) walk(child, `${path}/`, depth + 1);
		}
	};
	walk(root, "", 0);
	return rows;
}

/** The letters of `query` in order in `path`, case-insensitive: the ⌘P match. A name match ranks first. */
export function findFiles(paths: string[], query: string): string[] {
	const q = query.toLowerCase().replace(/\s+/g, "");
	const fits = (text: string) => {
		let i = 0;
		for (const ch of text) if (ch === q[i]) i++;
		return i === q.length;
	};
	const name = (p: string) => p.slice(p.lastIndexOf("/") + 1).toLowerCase();
	return paths
		.filter((p) => fits(p.toLowerCase()))
		.sort(
			(a, b) =>
				Number(!name(a).includes(q)) - Number(!name(b).includes(q)) ||
				a.length - b.length ||
				a.localeCompare(b),
		);
}

/**
 * The working copy as files, in a drawer beside the view. ⌘P opens it on the search. A file opens
 * in the viewer; its menu shows it in Code / Changes, copies its path, makes a new file or folder,
 * renames it or moves it to the trash. Each write is one click and a read-only project takes none
 * (`file-actions.tsx`). Legacy source: `src/components/file-browser.tsx` and
 * `src-tauri/src/infrastructure/browse.rs`; Shipyard lists the files once, the ignore rules
 * applied, so the search covers the whole tree.
 */
export function FileDrawer({ onClose }: { onClose: () => void }) {
	const { t } = useI18n();
	const f = t.panels.files;
	const navigate = useNavigate();
	const active = useActiveProject().data;
	const files = useQuery({
		queryKey: ["code", "files", active?.id],
		queryFn: () => unwrap(commands.codeFileList()),
		enabled: Boolean(active),
	});
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
	const [viewing, setViewing] = useState<string | null>(null);
	const [action, setAction] = useState<FileAction | null>(null);
	// New folders with no file yet: git lists none, so the drawer keeps them until it closes.
	const [made, setMade] = useState<string[]>([]);
	const qc = useQueryClient();
	const readOnly = usePrefs().profile.readOnly;
	const search = useRef<HTMLInputElement>(null);
	useEffect(() => search.current?.focus(), []);
	const paths = useMemo(
		() => [...(files.data ?? []), ...made.map((m) => `${m}/`)],
		[files.data, made],
	);
	const found = useMemo(() => (query.trim() ? findFiles(paths, query) : null), [paths, query]);
	const rows = useMemo(() => fileRows(paths, open), [paths, open]);
	const toggle = (path: string) => {
		const next = new Set(open);
		if (!next.delete(path)) next.add(path);
		setOpen(next);
	};
	const reveal = (path: string) => {
		rememberSelection("code:changes", path);
		void navigate({ to: "/code/changes" });
	};
	const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));
	/** The write items of a row. A folder makes new items inside, a file beside it. */
	const writeItems = (path: string, folder: boolean) => {
		if (readOnly) return [];
		const here = folder ? path : parentOf(path);
		return [
			{
				id: "new-file",
				label: t.personal.files.newFile,
				icon: <PlusIcon size={14} />,
				onSelect: () => setAction({ kind: "file", path: here }),
			},
			{
				id: "new-folder",
				label: t.personal.files.newFolder,
				icon: <FolderOpenIcon size={14} />,
				onSelect: () => setAction({ kind: "folder", path: here }),
			},
			{
				id: "rename",
				label: t.personal.files.rename,
				icon: <PencilIcon size={14} />,
				onSelect: () => setAction({ kind: "rename", path, folder }),
			},
			{
				id: "delete",
				label: t.personal.files.delete,
				icon: <TrashIcon size={14} />,
				onSelect: () => setAction({ kind: "delete", path, folder }),
			},
		];
	};
	const done = (a: FileAction, path: string) => {
		if (a.kind === "folder") setMade((m) => [...m, path]);
		if (a.kind === "folder" || a.kind === "file")
			setOpen((o) => new Set([...o, a.path].filter(Boolean)));
		setAction(null);
		void qc.invalidateQueries({ queryKey: ["code"] });
	};
	const fileRow = (path: string, label: string, depth: number, dir = "") => (
		<li key={path}>
			<ContextMenu
				items={[
					{
						id: "open",
						label: f.open,
						icon: <DocumentTextIcon size={14} />,
						onSelect: () => setViewing(path),
					},
					{
						id: "reveal",
						label: f.reveal,
						icon: <CodeBracketIcon size={14} />,
						onSelect: () => reveal(path),
					},
					{
						id: "copy",
						label: f.copy,
						icon: <ClipboardIcon size={14} />,
						onSelect: () => copyText(path),
					},
					...writeItems(path, false),
				]}
			>
				<button
					type="button"
					title={path}
					onClick={() => setViewing(path)}
					style={{ paddingLeft: 8 + depth * 12 }}
					className="flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-ui text-n-12 transition-colors duration-(--duration-fast) hover:bg-n-3"
				>
					<span className="flex shrink-0 text-n-10">
						<DocumentTextIcon size={14} />
					</span>
					<span className="min-w-0 flex-1 truncate">
						{label}
						{dir ? <span className="ml-2 text-12 text-n-11">{dir}</span> : null}
					</span>
				</button>
			</ContextMenu>
		</li>
	);
	return (
		<aside
			aria-label={f.title}
			className="z-10 my-2 ml-2 flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1"
		>
			<div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
				<span className="flex text-n-10">
					<FolderOpenIcon size={14} />
				</span>
				<h2 className="flex-1 truncate text-ui font-medium text-n-12">{active?.name ?? f.title}</h2>
				{readOnly ? null : (
					<>
						<IconButton
							label={t.personal.files.newFile}
							onClick={() => setAction({ kind: "file", path: "" })}
						>
							<PlusIcon size={14} />
						</IconButton>
						<IconButton
							label={t.personal.files.newFolder}
							onClick={() => setAction({ kind: "folder", path: "" })}
						>
							<FolderOpenIcon size={14} />
						</IconButton>
					</>
				)}
				<IconButton label={f.close} onClick={onClose}>
					<XMarkIcon size={14} />
				</IconButton>
			</div>
			<form
				className="shrink-0 p-2"
				onSubmit={(e) => {
					e.preventDefault();
					const first = found?.[0];
					if (first) setViewing(first);
				}}
			>
				<Input
					ref={search}
					label={f.search}
					placeholder={f.search}
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape" && !query) onClose();
					}}
				/>
			</form>
			{files.error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{String(files.error)}
				</p>
			) : null}
			<ul aria-label={f.title} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
				{found
					? found
							.slice(0, MAX_FOUND)
							.map((p) =>
								fileRow(p, p.slice(p.lastIndexOf("/") + 1), 0, p.slice(0, p.lastIndexOf("/"))),
							)
					: rows.map((r) =>
							r.folder ? (
								<li key={r.path}>
									<ContextMenu items={writeItems(r.path, true)}>
										<button
											type="button"
											aria-expanded={open.has(r.path)}
											onClick={() => toggle(r.path)}
											style={{ paddingLeft: 4 + r.depth * 12 }}
											className="flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-ui text-n-12 transition-colors duration-(--duration-fast) hover:bg-n-3"
										>
											{open.has(r.path) ? (
												<span className="flex shrink-0 text-n-10">
													<ChevronDownIcon size={12} />
												</span>
											) : (
												<span className="flex shrink-0 text-n-10">
													<ChevronRightIcon size={12} />
												</span>
											)}
											<span className="flex shrink-0 text-accent-text">
												<FolderOpenIcon size={14} />
											</span>
											<span className="min-w-0 flex-1 truncate">{r.name}</span>
										</button>
									</ContextMenu>
								</li>
							) : (
								fileRow(r.path, r.name, r.depth)
							),
						)}
				{found && found.length > MAX_FOUND ? (
					<li className="px-2 py-1 text-12 text-n-10">
						{format(f.more, { count: found.length - MAX_FOUND })}
					</li>
				) : null}
				{(found ?? rows).length === 0 && files.data ? (
					<li className="px-2 py-2 text-ui text-n-10">{f.none}</li>
				) : null}
			</ul>
			{viewing ? <FileDialog path={viewing} onClose={() => setViewing(null)} /> : null}
			{action ? (
				<FileActionDialog action={action} onClose={() => setAction(null)} onDone={done} />
			) : null}
		</aside>
	);
}
