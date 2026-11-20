import { Link, useNavigate } from "@tanstack/react-router";
import { useActions } from "@/features/shell/actions";
import { WithProject } from "@/features/shell/no-project";
import { type PrRowView, usePulls } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { pullHref, useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { linkClass } from "@/ui/atoms/link-button";
import { CodeBracketIcon, ShieldCheckIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { BranchSelector } from "./branch-selector";
import { FilesCard } from "./changes";

import { PullList } from "./pull-requests";

/** The checks pass and no review asks for a change: the merge box of the pull request can merge it. */
const mergeable = (r: PrRowView) => !r.draft && r.ci === "passing" && r.review === "clear";

/** The one state of an open pull request, in plain words: what stops it first, else that its checks pass. */
function StatePill({ r }: { r: PrRowView }) {
	const { t } = useI18n();
	const n = t.forge.now;
	if (r.draft) return <Badge>{t.forge.draft}</Badge>;
	if (r.ci === "failing") return <Badge variant="you">{n.checksFail}</Badge>;
	if (r.review === "changes_requested") return <Badge variant="you">{n.changesAsked}</Badge>;
	if (r.ci === "passing") return <Badge variant="success">{n.checksPass}</Badge>;
	if (r.ci === "pending") return <Badge>{n.checksRun}</Badge>;
	return null;
}

/** One open pull request as a link to its page: the title and one state. Merge shows when it is allowed. */
function PullRow({ r }: { r: PrRowView }) {
	const { t } = useI18n();
	const menu = useMenus();
	const navigate = useNavigate();
	return (
		<Row className="min-h-16 hover:bg-n-3">
			<ContextMenu
				items={menu("pull", {
					open: () => void navigate(pullHref(r.reference)),
					"copy-ref": () => copyText(r.reference),
				})}
			>
				<Link
					{...pullHref(r.reference)}
					data-ask={r.reference}
					className="flex min-h-control min-w-0 flex-1 flex-wrap items-center gap-3"
				>
					<span aria-hidden="true" className="contents">
						<Avatar name={r.title} />
					</span>
					<span className="mr-auto min-w-0 font-semibold">{r.title}</span>
					<StatePill r={r} />
				</Link>
			</ContextMenu>
			{mergeable(r) ? (
				// The merge box of the page names the method and asks for the confirmation.
				<Link
					{...pullHref(r.reference)}
					aria-label={format(t.forge.now.merge, { number: r.number })}
					className={buttonVariants({ variant: "primary" })}
				>
					{t.forge.merge}
				</Link>
			) : null}
		</Row>
	);
}

/**
 * The pull requests of Code / Now: the open ones, one row each. "Merged and closed" opens the page
 * Pull requests (screen 53), with its search and its filter. A project with no pull request shows
 * the full list, which says how to get the first one.
 */
function PullsCard() {
	const { t } = useI18n();
	const rows = usePulls().data;
	if (!rows) return null;
	const card = "min-w-0 flex-[1_1_420px] rounded-lg bg-surface-2 shadow-2";
	if (rows.length === 0)
		return (
			<div className={cn(card, "p-6")}>
				<PullList />
			</div>
		);
	return (
		<section aria-labelledby="code-now-pulls" className={cn(card, "pb-2")}>
			<h2 id="code-now-pulls" className="px-6 pt-5.5 pb-2 text-17 font-semibold text-n-12">
				{t.forge.now.pulls}
			</h2>
			{rows
				.filter((r) => r.state === "open")
				.map((r) => (
					<PullRow key={r.reference} r={r} />
				))}
			<Row>
				<Link to="/code/pull-requests" className={linkClass}>
					{t.forge.now.past}
				</Link>
			</Row>
		</section>
	);
}

/** The page of an open project. */
function Page() {
	const { t } = useI18n();
	const { setFilesOpen, terminalOpen } = useShell();
	const { terminal } = useActions();
	const pulls = usePulls().data;
	return (
		<div className="flex flex-col">
			<PageHeader title={t.ui.place.code} action={<BranchSelector />} />
			<div className="flex flex-col gap-6 px-4 pb-10">
				<div className="flex flex-wrap items-start gap-6">
					<FilesCard />
					<PullsCard />
				</div>
				<Card className="flex flex-wrap items-center gap-4 px-6 py-5">
					<ShieldCheckIcon size={28} />
					<h2 className="flex-[1_1_240px] text-20 font-semibold text-n-12">{t.forge.now.health}</h2>
					<Link
						to="/flow/health"
						aria-label={`${t.forge.now.open} ${t.forge.now.health}`}
						className={buttonVariants()}
					>
						{t.forge.now.open}
					</Link>
				</Card>
				{/* The branch, the terminal and the files left the old top bar: they stay here, with the new pull request; the branch sits in the header. */}
				<div className="flex flex-wrap items-center gap-2.5">
					<Button aria-pressed={terminalOpen} disabled={terminal.disabled} onClick={terminal.run}>
						{terminal.label}
					</Button>
					<Button onClick={() => setFilesOpen(true)}>{t.forge.files}</Button>
					{/* The full list has this button itself, and a project with no pull request offers the first one. */}
					{pulls?.length ? (
						<Link to="/code/pull-requests/new" className={buttonVariants()}>
							{t.forge.openPull}
						</Link>
					) : null}
				</div>
			</div>
		</div>
	);
}

/**
 * Code / Now (`spec:app-redesign#REQ-022`, adr:0023), the short summary: the files to commit with the
 * commit box, the pull requests, the door to the product health, and the actions that left the old top
 * bar (the working branch, the terminal, the files) with the new pull request.
 */
export function CodeNow() {
	const { t } = useI18n();
	return (
		<WithProject title={t.ui.place.code} icon={<CodeBracketIcon size={16} />}>
			<Page />
		</WithProject>
	);
}
