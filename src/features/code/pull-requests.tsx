import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { type PrRowView, usePulls } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { foldWords } from "@/lib/refs";
import { pullHref } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { ArrowsRightLeftIcon, PlusIcon } from "@/ui/icons";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { NoPulls } from "./no-pulls";
import { OpenDialog } from "./open-pull";
import { withProject } from "./project-gate";
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
function StateChip({ status, label }: { status: Status; label: string }) {
	return (
		<Badge variant={TINT[status]}>
			<StatusDot status={status} label={label} className="size-2" />
			<span aria-hidden="true">{label}</span>
		</Badge>
	);
}

/** One pull request as a link to its page: number, title, draft mark, CI and review chips, date. */
function Row({ r }: { r: PrRowView }) {
	const { t } = useI18n();
	const menu = useMenus();
	const navigate = useNavigate();
	return (
		<ContextMenu
			items={menu("pull", {
				open: () => void navigate(pullHref(r.reference)),
				"copy-ref": () => copyText(r.reference),
			})}
		>
			<Link
				{...pullHref(r.reference)}
				data-ask={r.reference}
				className="flex w-full flex-wrap items-center gap-2 border-b px-3 py-2 text-ui transition-colors duration-(--duration-fast) last:border-b-0 hover:bg-n-3"
			>
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
	);
}

function PullRequestsView() {
	const { t } = useI18n();
	const p = t.forge.pullPage;
	const navigate = useNavigate();
	const pulls = usePulls();
	const [opening, setOpening] = useState(false);
	const rows = pulls.data;
	const search: PullsSearch = useSearch({ strict: false });
	const filter = search.filter ?? "all";
	// The field keeps its own text: the address gives it back only on a reload.
	const [text, setText] = useState(search.q ?? "");
	const go = (patch: PullsSearch, replace = false) =>
		void navigate({
			to: "/code/pull-requests",
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
	const icon = <ArrowsRightLeftIcon size={16} />;
	if (!rows) return <PageHeader icon={icon} title={t.tabs.code["pull-requests"]} />;
	if (rows.length === 0)
		return (
			<div className="flex flex-col">
				<PageHeader icon={icon} title={t.tabs.code["pull-requests"]} />
				<NoPulls onNew={() => setOpening(true)} />
				{opening ? <OpenDialog open onOpenChange={setOpening} /> : null}
			</div>
		);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={icon}
				title={t.tabs.code["pull-requests"]}
				count={rows.length}
				action={
					<Button variant="primary" onClick={() => setOpening(true)}>
						<PlusIcon size={14} />
						{t.forge.openPull}
					</Button>
				}
			/>
			<div className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-3">
				<Input
					label={p.search}
					type="search"
					className="w-64"
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
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
				{STATES.map((s) => {
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
			</div>
			{opening ? <OpenDialog open onOpenChange={setOpening} /> : null}
		</div>
	);
}

export const PullRequests = withProject(PullRequestsView, "pull-requests");
