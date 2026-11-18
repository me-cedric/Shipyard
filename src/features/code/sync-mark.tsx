import { Link } from "@tanstack/react-router";
import type { Action } from "@/features/shell/actions";
import { type Changes, useChanges } from "@/lib/code";
import { format, type Messages, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { AnimatedIcon } from "@/ui/atoms/animated-icon";
import { Badge } from "@/ui/atoms/badge";
import { ArrowPathIcon } from "@/ui/icons";
import { SplitButton } from "@/ui/molecules/split-button";
import { BranchSelector } from "./branch-selector";

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
	const changed =
		changes.staged.length +
		changes.unstaged.length +
		changes.untracked.length +
		changes.conflicted.length;
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
 * The one sync mark of the top bar (`spec:app-redesign#REQ-022`): the working branch, the state of
 * the repository as a link to Code / Now, and the one Sync with Fetch and Push behind its arrow.
 * The three actions come from the registry of the shell, so the palette and the shortcut run the same ones.
 */
export function SyncMark({ sync, fetch, push }: { sync: Action; fetch: Action; push: Action }) {
	const { t } = useI18n();
	const changes = useChanges().data;
	const { syncing, syncFailure } = useShell();
	const state = changes ? syncState(t, changes, !!syncFailure) : null;
	return (
		<>
			<BranchSelector />
			{state ? (
				<Link
					to="/code/now"
					aria-label={`${t.forge.mark.label}: ${state.text}`}
					className="shrink-0"
				>
					<Badge variant={state.tone}>{state.text}</Badge>
				</Link>
			) : null}
			<SplitButton
				label={sync.label}
				icon={<AnimatedIcon icon={ArrowPathIcon} size={14} spin={syncing} />}
				onClick={sync.run}
				disabled={sync.disabled}
				after={
					changes && (changes.ahead || changes.behind) ? (
						// The visible numbers sit inside the spoken name (WCAG 2.5.3): the marks are hidden.
						<span className="flex gap-1 font-mono text-12">
							{changes.ahead ? (
								<span>
									<span aria-hidden="true">↑{changes.ahead}</span>
									<span className="sr-only">{format(t.code.ahead, { count: changes.ahead })}</span>
								</span>
							) : null}{" "}
							{changes.behind ? (
								<span className="text-info-text">
									<span aria-hidden="true">↓{changes.behind}</span>
									<span className="sr-only">
										{format(t.code.behind, { count: changes.behind })}
									</span>
								</span>
							) : null}
						</span>
					) : null
				}
				moreLabel={t.workspace.view.syncMore}
				moreDisabled={fetch.disabled}
				items={[fetch, push].map((a) => ({
					id: a.id,
					label: a.label,
					disabled: a.disabled,
					onSelect: a.run,
				}))}
			/>
		</>
	);
}
