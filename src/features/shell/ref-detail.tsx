import { useState } from "react";
import { useI18n } from "@/lib/i18n";
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
import { ItemFacts, OpenActions } from "./item-facts";
import { docTarget } from "./ref-page";

/**
 * The card that explains a link, one shape for every ref: the kind, the name, what it is, the path
 * with its preview and last change, the items linked to it or "Nothing links here", Open and
 * Explain, the ref with Copy the ref, then More with the other actions.
 */
export function RefDetail({ refId, onOpen }: { refId: string; onOpen: (ref: string) => void }) {
	const resolved = useResolvedRef(refId).data;
	const backlinks = useBacklinks(refId).data ?? [];
	const { refActions, explain } = useShell();
	const [more, setMore] = useState(false);
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
				<ul className="flex flex-col divide-y divide-n-6">
					{backlinks.flatMap((g) =>
						g.items.map((i) => (
							<li key={i.source}>
								{/* One line: the kind and the title. The name adds the state. */}
								<button
									type="button"
									aria-label={[kindName(g.kind), i.title, t.ref.resolved]
										.filter(Boolean)
										.join(", ")}
									onClick={() => onOpen(i.source)}
									className="flex min-h-control w-full min-w-0 cursor-pointer items-center gap-3 text-left"
								>
									<Badge aria-hidden="true">{kindName(g.kind)}</Badge>
									<span className="min-w-0 flex-1 truncate font-semibold">{i.title}</span>
								</button>
							</li>
						)),
					)}
				</ul>
			</section>
			<div className="flex flex-wrap items-start gap-2">
				<div className="flex min-w-0 flex-wrap items-start gap-2">
					<OpenActions refId={refId} />
				</div>
				<Button onClick={() => explain(refId)}>{t.inspector.explain}</Button>
			</div>
			<div className="flex flex-wrap items-center gap-3 rounded-field bg-n-3 py-2.5 pr-2.5 pl-4">
				<code className="mr-auto min-w-0 flex-1 truncate text-12 text-n-12" title={refId}>
					{refId}
				</code>
				<Button onClick={() => void copy(refId)}>
					{copied ? <CheckIcon size={14} /> : null}
					{copied ? t.ui.item.copied : t.inspector.copyRef}
				</Button>
			</div>
			<div className="flex flex-col gap-2">
				<Button className="self-start" aria-expanded={more} onClick={() => setMore(!more)}>
					{t.ui.more}
				</Button>
				{more ? (
					<>
						{refActions?.(refId, resolved?.title ?? refId)}
						<div className="flex flex-wrap gap-2">
							{/* The Explain button sits beside Open: the Ask group skips it here. */}
							{[...actions, ...askItems(refId, path).filter((a) => a.id !== "ask-explain")].map(
								(a) => (
									<Button key={a.id} variant="ghost" onClick={a.onSelect}>
										{a.label}
									</Button>
								),
							)}
						</div>
					</>
				) : null}
			</div>
		</div>
	);
}
