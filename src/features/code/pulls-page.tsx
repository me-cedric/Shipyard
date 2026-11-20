import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useContext, useLayoutEffect, useMemo, useState } from "react";
import { type PrRowView, usePulls } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { foldWords } from "@/lib/refs";
import { pullHref } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { PageSwitchContext } from "@/ui/molecules/page-header";
import { FitSegmented } from "./fit-segmented";
import { NoPulls } from "./no-pulls";
import { withProject } from "./project-gate";
import { PullReviewPanel } from "./pulls-review";

/** The two choices of the bar. They live in the address, so Back and a reload keep them. */
type PullsSearch = { q?: string; filter?: "needs" };

/** The merged pull requests that show before "All merged pull requests". */
const MERGED_SHOWN = 3;

/** The checks pass and no review asks for a change: the merge box of the pull request can merge it. */
const mergeable = (r: PrRowView) =>
	r.state === "open" && !r.draft && r.ci === "passing" && r.review === "clear";

type Pill = { label: string; variant: "neutral" | "success" | "you" };

/** The one pill of a row: the state of a closed one, else the most urgent word. */
function usePill() {
	const { t } = useI18n();
	const x = t.flow.look.pulls;
	return (r: PrRowView): Pill => {
		if (r.state !== "open")
			return { label: t.forge.state[r.state as "merged"], variant: "neutral" };
		if (r.draft) return { label: t.forge.draft, variant: "neutral" };
		if (r.ci === "failing") return { label: x.checksFail, variant: "you" };
		if (r.review === "changes_requested") return { label: x.changesAsked, variant: "you" };
		if (r.ci === "pending") return { label: x.checksRun, variant: "neutral" };
		if (r.ci === "passing") return { label: x.checksPass, variant: "success" };
		return { label: t.forge.ci.none, variant: "neutral" };
	};
}

/** One row of 68 px: the title and one pill. A click selects it for the review panel. */
function Row({ r, on, onSelect }: { r: PrRowView; on: boolean; onSelect: () => void }) {
	const { t } = useI18n();
	const menu = useMenus();
	const navigate = useNavigate();
	const pill = usePill()(r);
	return (
		<div
			className={cn(
				"flex min-h-17 items-center gap-3 border-b border-n-4 last:border-b-0",
				on && "bg-accent-tint",
			)}
		>
			<ContextMenu
				items={menu("pull", {
					open: () => void navigate(pullHref(r.reference)),
					"copy-ref": () => copyText(r.reference),
				})}
			>
				<button
					type="button"
					aria-pressed={on}
					data-ask={r.reference}
					onClick={onSelect}
					className="flex min-h-17 min-w-0 flex-1 cursor-pointer items-center gap-3 px-6 text-left font-semibold"
				>
					<span className="min-w-0 flex-[1_1_200px] truncate text-n-12">{r.title}</span>
					<Badge variant={pill.variant}>{pill.label}</Badge>
				</button>
			</ContextMenu>
			{mergeable(r) ? (
				// The merge card of the page names the method and asks for the confirmation.
				<Link
					{...pullHref(r.reference)}
					aria-label={format(t.forge.now.merge, { number: r.number })}
					className={cn(buttonVariants({ variant: "primary" }), "mr-6 min-h-control")}
				>
					{t.forge.merge}
				</Link>
			) : null}
		</div>
	);
}

/** One card of a state: a heading and its rows. */
function StateCard({
	title,
	rows,
	picked,
	onPick,
	scroll,
	children,
}: {
	scroll?: boolean;
	title: string;
	rows: PrRowView[];
	picked?: string;
	onPick: (r: PrRowView) => void;
	children?: React.ReactNode;
}) {
	return (
		<Card className="py-2">
			<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">{title}</h2>
			{/* Four rows show: the other cards stay in view. A scroll area needs a keyboard stop (axe). */}
			<div
				tabIndex={scroll ? 0 : undefined}
				className={scroll ? "max-h-68 overflow-y-auto" : undefined}
			>
				{rows.map((r) => (
					<Row key={r.reference} r={r} on={picked === r.reference} onSelect={() => onPick(r)} />
				))}
			</div>
			{children}
		</Card>
	);
}

/** Code / Pull requests (screen 53): the three cards, and the review of the selected pull request on the right. */
export const PullRequestsPage = withProject(function PullRequestsView() {
	const { t } = useI18n();
	const x = t.flow.look.pulls;
	const p = t.forge.pullPage;
	const navigate = useNavigate();
	// The Code switch sits in the title row: the page claims it from the shell.
	const slot = useContext(PageSwitchContext);
	const claim = slot?.claim;
	useLayoutEffect(() => claim?.(), [claim]);
	const pulls = usePulls();
	const rows = pulls.data;
	const search: PullsSearch = useSearch({ strict: false });
	const filter = search.filter ?? "all";
	// The field keeps its own text: the address gives it back only on a reload.
	const [text, setText] = useState(search.q ?? "");
	const [picked, setPicked] = useState<string>();
	const [allMerged, setAllMerged] = useState(false);
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
	const open = shown.filter((r) => r.state === "open");
	const merged = shown.filter((r) => r.state === "merged");
	const closed = shown.filter((r) => r.state === "closed");
	const selected = shown.find((r) => r.reference === picked) ?? open[0] ?? shown[0];
	return (
		<section aria-label={t.forge.now.pulls} className="flex w-full flex-col gap-6 px-4 pb-10">
			<div className="flex flex-col">
				<BackLink label={t.ui.place.code} render={(props) => <Link to="/code/now" {...props} />} />
				<div className="flex flex-wrap items-center gap-4">
					{/* The hidden word names the place: the page is a section of Code. */}
					<h1 className="text-44 font-semibold text-n-12">
						<span className="sr-only">{t.ui.place.code}:</span> {t.forge.now.pulls}
					</h1>
					<span className="flex-1" />
					{slot?.node}
				</div>
			</div>
			{rows?.length === 0 ? (
				<NoPulls onNew={() => void navigate({ to: "/code/pull-requests/new" })} />
			) : rows ? (
				<>
					<div className="flex flex-wrap items-center gap-3">
						<Input
							label={x.search}
							type="search"
							className="mr-auto w-full max-w-105"
							value={text}
							onChange={(e) => {
								setText(e.target.value);
								go({ q: e.target.value || undefined }, true);
							}}
						/>
						<Link to="/code/pull-requests/new" className={buttonVariants({ variant: "primary" })}>
							{t.forge.newPull}
						</Link>
						<FitSegmented
							label={p.filter}
							value={filter}
							onValueChange={(v) => go({ filter: v === "all" ? undefined : v })}
							items={[
								{ value: "all", label: p.all },
								{ value: "needs", label: x.needsMine },
							]}
						/>
					</div>
					<div className="flex flex-wrap items-start gap-6">
						<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
							<StateCard
								scroll
								title={format(x.openCount, { count: open.length })}
								rows={open}
								picked={selected?.reference}
								onPick={(r) => setPicked(r.reference)}
							/>
							<StateCard
								title={t.forge.state.merged}
								rows={allMerged || text.trim() ? merged : merged.slice(0, MERGED_SHOWN)}
								picked={selected?.reference}
								onPick={(r) => setPicked(r.reference)}
							>
								{merged.length > MERGED_SHOWN && !text.trim() ? (
									<div className="px-6">
										<Button
											variant="ghost"
											className="text-accent"
											aria-expanded={allMerged}
											onClick={() => setAllMerged(!allMerged)}
										>
											{x.allMerged}
										</Button>
									</div>
								) : null}
							</StateCard>
							<StateCard
								title={t.forge.state.closed}
								rows={closed}
								picked={selected?.reference}
								onPick={(r) => setPicked(r.reference)}
							/>
						</div>
						<div className="flex min-w-0 flex-[2_1_320px] flex-col">
							{selected ? <PullReviewPanel key={selected.reference} r={selected} /> : null}
						</div>
					</div>
				</>
			) : null}
		</section>
	);
}, "pull-requests");
