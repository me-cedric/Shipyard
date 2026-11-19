import { format, useI18n } from "@/lib/i18n";
import {
	openDefault,
	openUrl,
	revealPath,
	useAsk,
	useCopy,
	useMenus,
	useRename,
	useTrash,
} from "@/lib/menus";
import { useBacklinks, useResolvedRef } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { CheckIcon } from "@/ui/icons";
import { BacklinkList } from "@/ui/molecules/backlink-list";
import { RefChip } from "@/ui/molecules/ref-chip";
import { ItemFacts, OpenActions } from "./item-facts";
import { docTarget } from "./ref-page";

/**
 * The card that explains a link, one shape for every ref: the kind, the name, what it is, the path
 * with its preview and last change, the items linked to it or "Nothing links here", Open and
 * Explain, the ref with Copy the ref, then the other actions.
 */
export function RefDetail({ refId, onOpen }: { refId: string; onOpen: (ref: string) => void }) {
	const resolved = useResolvedRef(refId).data;
	const backlinks = useBacklinks(refId).data ?? [];
	const { refActions } = useShell();
	const { t } = useI18n();
	// A document is its path. Another item shows the place that the index holds, when it has one.
	const place = resolved?.location ?? (refId.startsWith("doc:") ? refId.slice(4) : null);
	const url = place && /^https?:\/\//.test(place) ? place : null;
	const path = url ? null : place;
	const menu = useMenus();
	const { copied, copy } = useCopy();
	const trash = useTrash();
	const rename = useRename();
	const askItems = useAsk();
	// The same table as the right-click menu. Open is the button of `OpenActions`; Copy the ref has its own box.
	const actions = menu("ref", {
		"open-browser": url ? () => openUrl(url) : undefined,
		reveal: path ? () => revealPath(path) : undefined,
		"open-default": path ? () => openDefault(path) : undefined,
		// Only the files of the docs folder: a source file of the code graph stays.
		rename:
			path?.startsWith("docs/") && !rename.locked ? () => rename.start(path, onOpen) : undefined,
		delete: path?.startsWith("docs/") ? () => void trash(path, refId) : undefined,
	});
	const kind = refId.slice(0, refId.indexOf(":"));
	const kindName = (k: string) => (t.refKind as Record<string, string>)[k] ?? k;
	return (
		<div className="flex flex-col gap-4.5">
			{rename.dialog}
			{/* The close button of the card sits on the right of the kind. */}
			<Badge variant="accent" className="mt-2 self-start">
				{kindName(kind)}
			</Badge>
			<p className="text-30 font-semibold text-n-12">
				{resolved?.title ?? refId.slice(kind.length + 1)}
			</p>
			<p className="text-17">{t.inspector.state[resolved?.state ?? "unresolved"]}</p>
			{path ? (
				<ItemFacts
					path={path}
					docs={docTarget(refId) !== undefined}
					title={resolved?.title ?? undefined}
				/>
			) : null}
			<section aria-label={t.inspector.linked} className="flex flex-col">
				{/* Nothing links here: the empty text stands alone, with no heading. */}
				{backlinks.length === 0 ? (
					<BacklinkList groups={[]} onOpen={onOpen} />
				) : (
					<h3 className="pb-1.5 text-13 font-semibold text-n-11">{t.inspector.linked}</h3>
				)}
				{backlinks.map((g) => (
					<section key={g.kind} aria-label={kindName(g.kind)} className="border-n-6 [&+&]:border-t">
						<h4 className="sr-only">
							{format(t.count, { name: kindName(g.kind), count: g.items.length })}
						</h4>
						<ul>
							{g.items.map((i) => (
								<li key={i.source} className="flex min-h-15 flex-wrap items-center gap-x-3">
									<Badge aria-hidden="true">{kindName(g.kind)}</Badge>
									<span className="min-w-0 flex-1 truncate font-semibold">{i.title}</span>
									<RefChip
										refId={i.source}
										state="resolved"
										title={i.title ?? undefined}
										onOpen={onOpen}
									/>
								</li>
							))}
						</ul>
					</section>
				))}
			</section>
			<OpenActions refId={refId} />
			{refActions?.(refId, resolved?.title ?? refId)}
			<div className="flex flex-wrap items-center gap-3 rounded-field bg-n-3 py-2.5 pr-2.5 pl-4">
				<span className="mr-auto flex min-w-0">
					<RefChip
						refId={refId}
						state={resolved?.state ?? "unresolved"}
						title={resolved?.title ?? undefined}
					/>
				</span>
				<Button onClick={() => void copy(refId)}>
					{copied ? <CheckIcon size={14} /> : null}
					{copied ? t.ui.item.copied : t.inspector.copyRef}
				</Button>
			</div>
			<div className="flex flex-wrap gap-2">
				{/* The inspector has its own Explain button (`refActions`): the Ask group skips it here. */}
				{[...actions, ...askItems(refId, path).filter((a) => a.id !== "ask-explain")].map((a) => (
					<Button key={a.id} variant="ghost" onClick={a.onSelect}>
						{a.label}
					</Button>
				))}
			</div>
		</div>
	);
}
