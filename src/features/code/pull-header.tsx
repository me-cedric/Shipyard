import { useMemo, useState } from "react";
import { webUrl } from "@/features/factory/runs/run-summary";
import { type PullDetail, useForgeActions } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { copyText, openUrl } from "@/lib/menus";
import { RightButton, useRights } from "@/lib/rights";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CheckIcon, ChevronDownIcon } from "@/ui/icons";
import { countsOf } from "@/ui/molecules/diff-file-list";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MenuButton } from "@/ui/molecules/menu-button";
import { useRun } from "./use-run";

/** The state of a pull request as a word and a status: Open, Draft, Merged or Closed. */
const MARK = {
	open: ["success", "success"],
	draft: ["idle", "neutral"],
	merged: ["info", "info"],
	closed: ["danger", "danger"],
} as const;

/** The head of the page (REQ-041): title, state, branches, lines, and the actions of the state. */
export function PullHeader({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const p = t.forge.pullPage;
	const { ready, close } = useForgeActions();
	const { gate } = useRights();
	const { failure, run } = useRun();
	const [closing, setClosing] = useState(false);
	const mark = d.state === "open" && d.draft ? "draft" : (d.state as keyof typeof MARK);
	const [status, variant] = MARK[mark] ?? MARK.open;
	const word = mark === "draft" ? t.forge.draft : t.forge.state[d.state as "open"];
	// Parsing every patch is not cheap: count again only when the files change.
	const lines = useMemo(
		() =>
			d.files.reduce(
				(sum, f) => {
					const n = countsOf(f.patch ?? "");
					return { added: sum.added + n.added, removed: sum.removed + n.removed };
				},
				{ added: 0, removed: 0 },
			),
		[d.files],
	);
	const link = webUrl(d.url);
	return (
		<header className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<h1 className="min-w-0 flex-1 text-20 font-semibold text-n-12">
					{d.title} <span className="font-mono text-n-10">#{d.number}</span>
				</h1>
				<Badge variant={variant}>
					<StatusDot status={status} label={word} className="size-2" />
					{word}
				</Badge>
				{mark === "draft" ? (
					<RightButton right="code.write" onClick={() => void run(() => ready(d.number))}>
						<CheckIcon size={14} />
						{t.forge.markReady}
					</RightButton>
				) : null}
				{closing ? (
					<Button
						variant="danger"
						autoFocus
						onBlur={() => setClosing(false)}
						onClick={() =>
							void run(async () => {
								setClosing(false);
								await close(d.number, "");
							})
						}
					>
						{format(p.confirmClose, { number: d.number })}
					</Button>
				) : (
					<MenuButton
						iconOnly
						label={t.ui.more}
						icon={<ChevronDownIcon size={14} />}
						items={[
							{
								id: "browser",
								label: p.openInBrowser,
								disabled: !link,
								onSelect: () => link && openUrl(link),
							},
							{
								id: "copy",
								label: t.context.copyRef,
								onSelect: () => void copyText(d.reference),
							},
							...(d.state === "open"
								? [
										{
											id: "close",
											label: t.forge.close,
											danger: true,
											...gate("code.write"),
											onSelect: () => setClosing(true),
										},
									]
								: []),
						]}
					/>
				)}
			</div>
			<p className="flex flex-wrap items-center gap-2 text-12 text-n-11">
				<Avatar name={d.author} className="size-5" />
				{d.author}
				<Badge className="font-mono">{d.sourceBranch}</Badge>→
				<Badge className="font-mono">{d.targetBranch}</Badge>
				<span className="ml-2 flex items-center gap-2 font-mono">
					<span title={p.linesAdded} className="text-success-text">
						+{lines.added}
					</span>
					<span title={p.linesRemoved} className="text-danger-text">
						−{lines.removed}
					</span>
				</span>
			</p>
			<ErrorNotice error={failure} />
		</header>
	);
}
