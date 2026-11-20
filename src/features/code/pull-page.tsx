import { Link, useNavigate } from "@tanstack/react-router";
import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useContext,
	useRef,
	useState,
} from "react";
import { type PullDetail, usePull } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { toFailure } from "@/lib/ipc";
import { pullHref, pullNumberOf } from "@/lib/shell";
import { useDraftCount } from "@/lib/shell/drafts";
import { useViewState } from "@/lib/shell/view-state";
import { Button } from "@/ui/atoms/button";
import { linkClass } from "@/ui/atoms/link-button";
import { ArrowsRightLeftIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { AgentReview } from "./agent-review";
import { focusPullTitle } from "./focus-title";
import type { LineBox } from "./inline-comment";
import { ArchiveBar, MergeCard, MergeSummary } from "./merge-box";
import { PrAi } from "./pr-ai";
import { PullChecksCard, PullFocus, PullReviewCard } from "./pull-cards";
import { Conversation } from "./pull-conversation";
import { PullFiles } from "./pull-files";
import { PullChecks, PullCommits } from "./pull-lists";
import { ReviewBar } from "./review-bar";
import { type ReviewDraft, SubmitReview } from "./submit-review";

type PullState = {
	pullId: string;
	pull: ReturnType<typeof usePull>;
	/** The pull request of this page, or null while it loads, fails or does not exist. */
	d: PullDetail | null;
	kept: string;
	setKept: (text: string) => void;
	notice: string | null;
	boxes: LineBox[];
	setBoxes: Dispatch<SetStateAction<LineBox[]>>;
	openReview: (fromBox: boolean, text?: string) => void;
	onOpenFiles: () => void;
	/** The slot in the title row where the changed files page draws its More. */
	moreHost: HTMLElement | null;
	setMoreHost: (el: HTMLElement | null) => void;
};

const Ctx = createContext<PullState | null>(null);

/** The pull request of the open feature, or null when the feature has none. */
export const usePullState = () => useContext(Ctx);

/**
 * Reads one pull request and keeps what a person typed over a change of section: the comment draft,
 * the pending review, the boxes under diff lines. The parts of the feature page draw it with `PullPart`
 * (ux-declutter REQ-041, flow REQ-012). The Submit review dialog lives here.
 */
export function PullWorkspace({
	pullId,
	children,
}: {
	pullId: string;
	/** Not read: the count of the pending review opens the changed files page, where the line comments are. */
	onOpenFiles?: () => void;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const pull = usePull(pullNumberOf(pullId));
	// The comment draft stays in the page: a change of section keeps it. It belongs to one pull request.
	const [keptDraft, setKeptDraft] = useState({ id: pullId, text: "" });
	// The Submit review dialog: opened from the bar or from the write box (with its text). Its text and
	// verdict stay here, like the write box draft: closing the dialog loses nothing. They clear after a submit.
	const [review, setReview] = useState<{ fromBox: boolean } | null>(null);
	const [held, setHeld] = useState<ReviewDraft & { id: string }>({
		id: pullId,
		text: "",
		verdict: "comment",
		posted: [],
	});
	const draft: ReviewDraft =
		held.id === pullId ? held : { text: "", verdict: "comment", posted: [] };
	const [notice, setNotice] = useState<string | null>(null);
	const [moreHost, setMoreHost] = useState<HTMLElement | null>(null);
	// The open boxes under diff lines keep their text in the view memory of the project: a collapsed file,
	// a section, Collapse all and the way to the changed files page and back lose nothing.
	const [boxes, setStored] = useViewState<LineBox[]>(`pull-boxes:${pullId}`, []);
	const latest = useRef(boxes);
	latest.current = boxes;
	const setBoxes: Dispatch<SetStateAction<LineBox[]>> = (next) => {
		latest.current = typeof next === "function" ? next(latest.current) : next;
		setStored(latest.current);
	};
	// A box with text counts in the close guard, as the pending review does.
	useDraftCount(boxes.some((b) => b.text.trim() !== ""));
	// The connection part of the id must be the one of the pull request: `pr:other:44` is not #44 here.
	const d = pull.data && pullHref(pull.data.reference).params.pullId === pullId ? pull.data : null;
	const value: PullState = {
		pullId,
		pull,
		d,
		kept: keptDraft.id === pullId ? keptDraft.text : "",
		setKept: (text) => setKeptDraft({ id: pullId, text }),
		notice,
		moreHost,
		setMoreHost,
		boxes,
		setBoxes,
		openReview: (fromBox, text) => {
			if (text) setHeld({ ...draft, id: pullId, text });
			setReview({ fromBox });
		},
		onOpenFiles: () =>
			d &&
			void navigate({ to: "/flow/feature/$featureId/files", params: { featureId: d.reference } }),
	};
	return (
		<Ctx.Provider value={value}>
			{children}
			{review && d ? (
				<SubmitReview
					d={d}
					draft={draft}
					onChange={(patch) => setHeld({ ...draft, ...patch, id: pullId })}
					onClose={() => setReview(null)}
					onSent={(o, left) => {
						if (review.fromBox) setKeptDraft({ id: pullId, text: "" });
						// The verdict is out: what stays pending goes later as a comment review.
						setHeld({ id: pullId, text: "", verdict: "comment", posted: left });
						const r = t.forge.pullReview;
						const n = o.failed.length;
						setNotice(
							[
								o.inBody === 0
									? null
									: o.inBody === 1
										? r.inBodyOne
										: format(r.inBodyMany, { count: o.inBody }),
								n === 0 ? null : n === 1 ? r.failedOne : format(r.failedMany, { count: n }),
							]
								.filter(Boolean)
								.join(". ") || null,
						);
						setReview(null);
						focusPullTitle();
					}}
				/>
			) : null}
		</Ctx.Provider>
	);
}

/**
 * The top of every section of a pull request (REQ-049): a failed read with its retry, and the
 * pending review bar, which shows only while a comment waits. The count opens Changes.
 */
export function PullReviewBar() {
	const { t } = useI18n();
	const s = usePullState();
	if (!s?.d) return null;
	const { pull } = s;
	// With data on screen a failed refetch (after a write, offline) keeps the page: its error shows at the top.
	const failed = pull.error && toFailure(pull.error).code !== "forge_missing";
	return (
		<>
			{failed ? (
				<div className="flex flex-wrap items-center gap-2">
					<ErrorNotice error={pull.error} />
					<Button onClick={() => void pull.refetch()}>{t.routeError.retry}</Button>
				</div>
			) : null}
			<ReviewBar d={s.d} onSubmit={() => s.openReview(false)} onOpenFiles={s.onOpenFiles} />
		</>
	);
}

/**
 * The parts of a pull request. Changes: the merge summary, one file open in place, the Review, Checks
 * and merge cards. Files (the changed files page): the files, the commits, the spec archive. Checks.
 * Chat: description and conversation.
 */
export type PullPartName = "changes" | "files" | "checks" | "chat";

/** The changed files. The commits and the spec archive wait in More and show under the files. */
function FilesPart({ d, s, notice }: { d: PullDetail; s: PullState; notice: ReactNode }) {
	const { t } = useI18n();
	const [shown, setShown] = useState({ commits: false, archive: false });
	const toggle = (id: "commits" | "archive", label: string) => ({
		id,
		label,
		checked: shown[id],
		onSelect: () => setShown((x) => ({ ...x, [id]: !x[id] })),
	});
	return (
		<div className="flex flex-col gap-6">
			{notice}
			<PullFiles
				openFirst
				menuHost={s.moreHost}
				detail={d}
				boxes={s.boxes}
				setBoxes={s.setBoxes}
				menu={[
					toggle("commits", t.forge.commits),
					...(d.state === "open" ? [toggle("archive", t.forge.archiveChange)] : []),
				]}
			/>
			{shown.commits ? <PullCommits d={d} /> : null}
			{shown.archive ? <ArchiveBar number={d.number} /> : null}
		</div>
	);
}

/** One part of the pull request, or its loading, error or missing state. */
export function PullPart({ part }: { part: PullPartName }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const s = usePullState();
	if (!s) return null;
	const { pull, d } = s;
	if (pull.isPending) return <Loading />;
	// Only a not-found answer of the code host says "No such pull request". Any other failure keeps its own sentence and a retry.
	// With data on screen a failed refetch (after a write, offline) keeps the page: its error shows at the top.
	const failed = pull.error && toFailure(pull.error).code !== "forge_missing";
	if (failed && !pull.data)
		return (
			<div className="flex flex-col items-start gap-3">
				<ErrorNotice error={pull.error} />
				<Button onClick={() => void pull.refetch()}>{t.routeError.retry}</Button>
			</div>
		);
	if (!d)
		return (
			<EmptyState
				title={t.forge.pullPage.notFound}
				icon={<ArrowsRightLeftIcon size={28} />}
				action={{
					label: t.forge.now.pulls,
					onClick: () => void navigate({ to: "/code/now" }),
				}}
			/>
		);
	if (part === "checks") return <PullChecks d={d} />;
	if (part === "chat")
		return (
			<div className="flex flex-col gap-4">
				{d.description.trim() ? (
					<div className="rounded-lg border bg-surface-1 p-3 shadow-1 [overflow-wrap:anywhere]">
						<MarkdownView source={d.description} label={t.forge.description} reading />
					</div>
				) : null}
				<div className="flex flex-wrap items-center gap-2">
					<AgentReview d={d} />
					<PrAi d={d} />
				</div>
				<Conversation
					d={d}
					draft={s.kept}
					setDraft={s.setKept}
					onReview={(text) => s.openReview(true, text)}
				/>
			</div>
		);
	const notice = s.notice ? (
		<p role="status" className="text-ui text-n-11">
			{s.notice}
		</p>
	) : null;
	if (part === "files") return <FilesPart d={d} s={s} notice={notice} />;
	const x = t.flow.look.pull;
	return (
		<div className="flex flex-col gap-6">
			{notice}
			<MergeSummary d={d} />
			<div className="flex flex-wrap items-start gap-6">
				<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
					<PullFocus d={d} />
					<Link
						to="/flow/feature/$featureId/files"
						params={{ featureId: d.reference }}
						className={linkClass}
					>
						{d.commits.length === 1
							? x.commitsOne
							: format(x.commitsMany, { count: d.commits.length })}
					</Link>
				</div>
				<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
					<PullReviewCard d={d} />
					<PullChecksCard d={d} />
					<MergeCard key={`merge-${d.number}${d.state}${d.draft}`} d={d} />
				</div>
			</div>
		</div>
	);
}
