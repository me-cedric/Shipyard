import { Popover } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Action } from "@/features/shell/actions";
import { hiddenSection } from "@/features/shell/places";
import { type Changes, useChanges, useWatchNotice } from "@/lib/code";
import { useErrorNotice } from "@/lib/errors";
import { format, type Messages, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { AnimatedIcon } from "@/ui/atoms/animated-icon";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { linkClass } from "@/ui/atoms/link-button";
import { ArrowPathIcon } from "@/ui/icons";
import { BranchSelector } from "./branch-selector";
import { flatRows } from "./tree";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * The sync state of the repository in words. One state shows, in this order: a failed sync, changed
 * files, no upstream, commits to get, commits to send, in sync.
 */
export function syncState(
	t: Messages,
	changes: Changes,
	failed: boolean,
): { text: string; tone: Tone } {
	const changed = flatRows(changes).length;
	if (failed) return { text: t.forge.mark.error, tone: "danger" };
	if (changed)
		return {
			text: format(t.count, { name: t.shell.changedFiles, count: changed }),
			tone: "warning",
		};
	if (!changes.upstream) return { text: t.forge.mark.noRemote, tone: "neutral" };
	if (changes.behind)
		return { text: format(t.code.behind, { count: changes.behind }), tone: "info" };
	if (changes.ahead) return { text: format(t.code.ahead, { count: changes.ahead }), tone: "info" };
	return { text: t.forge.mark.inSync, tone: "success" };
}

/**
 * The one sync mark at the right end of the top row (`spec:app-redesign#REQ-022`): a tag with the
 * state of the repository. It opens a card with what waits as links to Code / Now, the working
 * branch, the actions Sync, Fetch, Push and Commit, the watch notice and the sync failure. The
 * actions come from the registry of the shell, so the palette and the shortcut run the same ones.
 */
export function SyncMark({
	sync,
	fetch,
	push,
	commit,
}: {
	sync: Action;
	fetch: Action;
	push: Action;
	commit: Action;
}) {
	const { t, lang } = useI18n();
	const [open, setOpen] = useState(false);
	const changes = useChanges().data;
	const { syncing, syncFailure } = useShell();
	const failed = useErrorNotice(syncFailure);
	const watch = useWatchNotice().data?.changes[0];
	// The links to the changes show with Code / Now (`spec:app-redesign#REQ-006`).
	const { can, level } = useRights();
	const seesCode = !hiddenSection(level, "code", "now");
	const state = changes ? syncState(t, changes, !!syncFailure) : null;
	const changed = changes ? flatRows(changes).length : 0;
	const n = (v: number) => v.toLocaleString(lang);
	// "Changes: {added} lines added, {removed} removed": the text around the two numbers.
	const lines = t.shell.lines.split(/\{added\}|\{removed\}/);
	const notice = watch
		? format(t.code.notice, {
				count: watch.count,
				branch: watch.name,
				author: watch.author,
				subject: watch.subject,
			})
		: null;
	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger
				// The name holds the visible text (WCAG 2.5.3).
				aria-label={state ? `${t.forge.mark.label}: ${state.text}` : t.forge.mark.label}
				className="ml-auto inline-flex min-h-control shrink-0 items-center rounded-full"
			>
				<Badge variant={state?.tone} dot>
					{state?.text ?? t.forge.mark.label}
				</Badge>
			</Popover.Trigger>
			{/* The one live region of the notice and the failure. It stays while the card opens, so each text is spoken one time. */}
			<span className="sr-only">
				{notice ? <span role="status">{notice}</span> : null}
				{failed ? <span role="alert">{failed.message}</span> : null}
			</span>
			<Popover.Portal>
				<Popover.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
					<Popover.Popup
						aria-label={t.forge.mark.label}
						className="flex w-88 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg border border-n-6 bg-surface-3 p-4 text-ui shadow-3"
					>
						{/* The link below says the same words when the state is the changed files. */}
						{state && !(seesCode && state.tone === "warning") ? (
							<p className="font-semibold">{state.text}</p>
						) : null}
						{seesCode && changed ? (
							// The count of changed files. A click opens the changes.
							<Link to="/code/now" className={linkClass} onClick={() => setOpen(false)}>
								{format(t.count, { name: t.shell.changedFiles, count: changed })}
							</Link>
						) : null}
						{seesCode && changes && (changes.added > 0 || changes.removed > 0) ? (
							// Lines added and removed since the last commit. A click opens the changes.
							// The visible numbers sit inside the spoken sentence (WCAG 2.5.3, label in name).
							<Link to="/code/now" className={linkClass} onClick={() => setOpen(false)}>
								<span className="sr-only">{lines[0]?.trim()}</span>{" "}
								<span className="font-mono text-success-text">+{n(changes.added)}</span>{" "}
								<span className="sr-only">{lines[1]?.trim()}</span>{" "}
								<span className="font-mono text-danger-text">−{n(changes.removed)}</span>{" "}
								<span className="sr-only">{lines[2]?.trim()}</span>
							</Link>
						) : null}
						<BranchSelector />
						<div className="flex flex-wrap gap-2">
							<Button variant="primary" onClick={sync.run} disabled={sync.disabled}>
								<AnimatedIcon icon={ArrowPathIcon} size={14} spin={syncing} />
								{sync.label}{" "}
								{changes && (changes.ahead || changes.behind) ? (
									// The visible numbers sit inside the spoken name (WCAG 2.5.3): the marks are hidden.
									<span className="flex gap-1 font-mono text-12">
										{changes.ahead ? (
											<span>
												<span aria-hidden="true">↑{changes.ahead}</span>
												<span className="sr-only">
													{format(t.code.ahead, { count: changes.ahead })}
												</span>
											</span>
										) : null}{" "}
										{changes.behind ? (
											<span>
												<span aria-hidden="true">↓{changes.behind}</span>
												<span className="sr-only">
													{format(t.code.behind, { count: changes.behind })}
												</span>
											</span>
										) : null}
									</span>
								) : null}
							</Button>
							{[fetch, push].map((a) => (
								<Button key={a.id} onClick={a.run} disabled={a.disabled}>
									{a.label}
								</Button>
							))}
							{seesCode && commit.disabled && changed > 0 && can("code.write") ? (
								// Nothing is chosen yet: the page of the changes is where the files are picked.
								<Link
									to="/code/changes"
									className={`${linkClass} inline-flex min-h-control items-center`}
									onClick={() => setOpen(false)}
								>
									{commit.label}
								</Link>
							) : (
								<Button
									disabled={commit.disabled}
									onClick={() => {
										// The commit dialog takes the place of the card.
										setOpen(false);
										commit.run();
									}}
								>
									{commit.label}
								</Button>
							)}
						</div>
						{notice ? <p>{notice}</p> : null}
						{failed ? <p className="text-danger-text">{failed.message}</p> : null}
						{failed?.action ? (
							<Button
								className="self-start"
								disabled={failed.action.busy}
								onClick={() => void failed.action?.run()}
							>
								{failed.action.label}
							</Button>
						) : null}
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
