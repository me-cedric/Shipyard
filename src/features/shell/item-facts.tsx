import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { useDay } from "@/lib/prefs";
import { rememberSelection, requestEdit } from "@/lib/shell/selection";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Skeleton } from "@/ui/atoms/skeleton";
import { BookOpenIcon, ClipboardIcon, PencilIcon } from "@/ui/icons";
import { blocks } from "@/ui/organisms/markdown-view";
import { docTarget, refPage, refSelection } from "./ref-page";

const OUTLINE_MAX = 8;

/** The first heading and paragraph of a Markdown file, and its outline (levels 1 to 3). */
function Preview({ path, docs }: { path: string; docs: boolean }) {
	const { t } = useI18n();
	// The knowledge folders read through the store that edits them; any other file is a working copy file.
	const text = useQuery({
		queryKey: ["item", "text", docs, path],
		queryFn: async () =>
			(docs
				? await unwrap(commands.docReadOne(path))
				: await unwrap(commands.codeFileRead(path, null))
			).text,
	}).data;
	if (!text) return null;
	const parts = blocks(text);
	const title = parts.find((b) => b.type === "h");
	const lead = parts.find((b) => b.type === "p");
	// `at` is the place of the heading in the text, so a repeated heading keeps a key of its own.
	const outline = parts
		.flatMap((b, at) => (b.type === "h" ? [{ ...b, at }] : []))
		.slice(0, OUTLINE_MAX);
	return (
		<div className="flex flex-col gap-2">
			{title?.type === "h" ? <p className="text-ui font-medium text-n-12">{title.text}</p> : null}
			{lead?.type === "p" ? <p className="line-clamp-4 text-ui text-n-11">{lead.text}</p> : null}
			{outline.length > 1 ? (
				<nav aria-label={t.inspector.outline}>
					<ul className="flex flex-col gap-0.5 border-l border-n-6 text-12 text-n-11">
						{outline.map((h) => (
							<li key={h.at} className={h.level === 1 ? "pl-2" : h.level === 2 ? "pl-4" : "pl-6"}>
								<span className="block truncate">{h.text}</span>
							</li>
						))}
					</ul>
				</nav>
			) : null}
		</div>
	);
}

/** Who changed the file last and when, from git. */
function LastChange({ path }: { path: string }) {
	const { t } = useI18n();
	const day = useDay();
	const last = useQuery({
		queryKey: ["git", "last-change", path],
		queryFn: () => unwrap(commands.gitLastChange(path)),
	});
	if (last.isPending) return <Skeleton className="h-4 w-2/3" />;
	if (last.error) return null;
	const c = last.data;
	return (
		<p className="text-12 text-n-11">
			{c
				? format(t.inspector.changedBy, {
						name: c.author_name,
						date: day(new Date(c.time * 1000).toISOString()),
					})
				: t.inspector.notCommitted}
		</p>
	);
}

/**
 * What an item shows when it has a place on disk: the path to copy, and for a file of the project
 * a preview, the outline and the last change.
 */
export function ItemFacts({ path, docs }: { path: string; docs: boolean }) {
	const { t } = useI18n();
	// A path outside the repository (a project folder) has no preview and no history.
	const inRepo = !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path);
	return (
		<div className="flex flex-col gap-3">
			<div className="flex min-w-0 items-center gap-1">
				<code className="min-w-0 flex-1 truncate text-12 text-n-11" title={path}>
					{path}
				</code>
				<IconButton label={t.inspector.copyPath} onClick={() => copyText(path)}>
					<ClipboardIcon size={14} />
				</IconButton>
			</div>
			{inRepo && path.endsWith(".md") ? <Preview path={path} docs={docs} /> : null}
			{inRepo ? <LastChange path={path} /> : null}
		</div>
	);
}

/** Open goes to the page of the item. A handbook page also offers Edit: only its page reads the request. */
export function OpenActions({ refId }: { refId: string }) {
	const { t } = useI18n();
	const router = useRouter({ warn: false });
	const doc = docTarget(refId);
	const page = doc?.page ?? refPage(refId);
	if (!router || !page) return null;
	const editable = doc?.page === "/knowledge/handbook";
	const go = (edit: boolean) => {
		const open = doc ? ([doc.scope, doc.id] as const) : refSelection(t, refId);
		if (open) rememberSelection(...open);
		if (edit && doc && editable) requestEdit(doc.id);
		void router.navigate({ to: page });
	};
	return (
		<div className="flex flex-wrap gap-2">
			<Button variant="ghost" onClick={() => go(false)}>
				<BookOpenIcon size={14} />
				{t.inspector.open}
			</Button>
			{editable ? (
				<Button variant="ghost" onClick={() => go(true)}>
					<PencilIcon size={14} />
					{t.inspector.edit}
				</Button>
			) : null}
		</div>
	);
}
