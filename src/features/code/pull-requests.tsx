import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type PrRowView, usePulls } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { foldWords } from "@/lib/refs";
import { pullHref } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { PlusIcon } from "@/ui/icons";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { Panel } from "@/ui/molecules/panel";
import { NoPulls } from "./no-pulls";
import { CI_STATUS, REVIEW_STATUS } from "./status";

const STATES = ["open", "merged", "closed"] as const;

/** The two choices of the bar. They live in the address, so Back and a reload keep them. */
type PullsSearch = { q?: string; filter?: "needs" };

const TINT = {
	success: "success",
	warning: "warning",
	danger: "danger",
	info: "info",
	active: "info",
	idle: "neutral",
} as const;

/** A status as a tinted chip: the shape names the state, the text repeats it. */
export function StateChip({ status, label }: { status: Status; label: string }) {
	return (
		<Badge variant={TINT[status]}>
			<StatusDot status={status} label={label} className="size-2" />
			<span aria-hidden="true">{label}</span>
		</Badge>
	);
}

/** The checks pass and no review asks for a change: the merge box of the pull request can merge it. */
const mergeable = (r: PrRowView) =>
	r.state === "open" && !r.draft && r.ci === "passing" && r.review === "clear";

/** One pull request as a link to its page: number, title, draft mark, CI and review chips, date. Merge shows when it is allowed. */
function Row({ r }: { r: PrRowView }) {
	const { t } = useI18n();
	const menu = useMenus();
	const navigate = useNavigate();
	return (
		<div className="mx-2 flex items-center gap-2 rounded-md pr-3 transition-colors duration-(--duration-fast) hover:bg-n-3 [&+&]:border-t">
			<ContextMenu
				items={menu("pull", {
					open: () => void navigate(pullHref(r.reference)),
					"copy-ref": () => copyText(r.reference),
				})}
			>
				<Link
					{...pullHref(r.reference)}
					data-ask={r.reference}
					className="flex min-h-control min-w-0 flex-1 flex-wrap items-center gap-2 px-3 py-2 text-ui"
				>
					{r.author ? <Avatar name={r.author} size="s" /> : null}
					<span className="shrink-0 font-mono text-12 text-n-11">#{r.number}</span>
					<span className="min-w-0 flex-1 truncate text-n-12">{r.title}</span>
					{r.draft ? <Badge>{t.forge.draft}</Badge> : null}
					<StateChip status={CI_STATUS[r.ci] ?? "idle"} label={t.forge.ci[r.ci as "none"]} />
					<StateChip
						status={REVIEW_STATUS[r.review] ?? "idle"}
						label={t.forge.review[r.review as "clear"]}
					/>
					<span className="font-mono text-12 text-n-11">{r.updated.slice(0, 10)}</span>
				</Link>
			</ContextMenu>
			{mergeable(r) ? (
				// The merge box of the page names the method and asks for the confirmation.
				<Link
					{...pullHref(r.reference)}
					aria-label={format(t.forge.now.merge, { number: r.number })}
					className={cn(buttonVariants({ variant: "primary" }), "min-h-control")}
				>
					{t.forge.merge}
				</Link>
			) : null}
		</div>
	);
}

/** The pull requests of Code / Now: the search, the filter Needs me, the open ones, then the merged and the closed ones. */
export function PullList() {
	const { t } = useI18n();
	const p = t.forge.pullPage;
	const navigate = useNavigate();
	const pulls = usePulls();
	// The form is a page of its own: `/code/pull-requests/new`.
	const openNew = () => void navigate({ to: "/code/pull-requests/new" });
	// The merged and the closed pull requests stay folded until the person asks.
	const [past, setPast] = useState(false);
	const rows = pulls.data;
	const search: PullsSearch = useSearch({ strict: false });
	const filter = search.filter ?? "all";
	// The field keeps its own text: the address gives it back only on a reload.
	const [text, setText] = useState(search.q ?? "");
	const go = (patch: PullsSearch, replace = false) =>
		void navigate({
			to: ".",
			search: (prev: PullsSearch) => ({ ...prev, ...patch }),
			replace,
		} as never);
	// The search and the filter read the list in memory. Needs review: open, not a draft, no request for changes.
	const shown = useMemo(() => {
		const q = foldWords(text);
		return (rows ?? []).filter(
			(r) =>
				q.every((w) => foldWords(`#${r.number} ${r.reference} ${r.title}`).join(" ").includes(w)) &&
				(filter === "all" ||
					(r.state === "open" && !r.draft && r.lane === "in_review" && r.review === "clear")),
		);
	}, [rows, text, filter]);
	if (!rows) return null;
	// A search reads each state: a deep link to a merged pull request shows its row.
	const all = past || text.trim() !== "";
	return (
		<section aria-labelledby="code-now-pulls" className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-3">
				<h2 id="code-now-pulls" className="flex-1 text-16 font-semibold text-n-12">
					{t.forge.now.pulls}
				</h2>
				{rows.length ? (
					<Button variant="primary" className="min-h-control" onClick={openNew}>
						<PlusIcon size={14} />
						{t.forge.openPull}
					</Button>
				) : null}
			</div>
			{rows.length === 0 ? (
				<NoPulls onNew={openNew} />
			) : (
				<>
					<div className="flex flex-wrap items-center gap-3">
						<Input
							label={p.search}
							type="search"
							className="min-h-control w-64"
							value={text}
							onChange={(e) => {
								setText(e.target.value);
								go({ q: e.target.value || undefined }, true);
							}}
						/>
						<div className="w-60">
							<Segmented
								label={p.filter}
								value={filter}
								onValueChange={(v) => go({ filter: v === "all" ? undefined : v })}
								items={[
									{ value: "all", label: p.all },
									{ value: "needs", label: p.needsReview },
								]}
							/>
						</div>
					</div>
					{(all ? STATES : STATES.slice(0, 1)).map((s) => {
						const items = shown.filter((r) => r.state === s);
						return (
							<Panel
								key={s}
								title={t.forge.state[s]}
								count={items.length}
								tone={s === "open" ? "accent" : s === "merged" ? "success" : "neutral"}
								flush
								className="shrink-0"
							>
								{items.map((r) => (
									<Row key={r.reference} r={r} />
								))}
							</Panel>
						);
					})}
					<Button
						variant="ghost"
						className="min-h-control self-start"
						aria-expanded={all}
						onClick={() => setPast(!all)}
					>
						{t.forge.now.past}
					</Button>
				</>
			)}
		</section>
	);
}
