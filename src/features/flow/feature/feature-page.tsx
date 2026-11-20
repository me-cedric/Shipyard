import {
	Link,
	useCanGoBack,
	useMatchRoute,
	useNavigate,
	useParams,
	useRouter,
	useRouterState,
	useSearch,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { withProject } from "@/features/code/project-gate";
import { PullReviewBar, PullWorkspace, usePullState } from "@/features/code/pull-page";
import { RunScope, useRunScope } from "@/features/factory/runs/run-detail";
import { webUrl } from "@/features/factory/runs/run-summary";
import { useI18n } from "@/lib/i18n";
import type { FlowFeature_Serialize as Feature } from "@/lib/ipc/bindings";
import { copyText, openUrl } from "@/lib/menus";
import { useWorkItems } from "@/lib/sync";
import { ClipboardIcon, CpuChipIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { MenuButton, type MenuButtonItem } from "@/ui/molecules/menu-button";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { StageLine } from "@/ui/molecules/stage-line";
import { SECTIONS, type Section, sectionOfRef } from "../sections";
import { Brief, Changes, Chat, Checks, Design, StartAgent } from "./parts";
import { Side } from "./side";
import { keyOf } from "./start";
import { HappenedContext, useHappenedState } from "./stop-card";
import { Requests, Story } from "./story";
import { EditTitle, TicketCards } from "./ticket-page";
import { type Parts, useFeature } from "./use-feature";

/** The ref of a pull request from the id of its address: `github-demo-142` is `pr:github-demo:142`. */
const pullRefOf = (pullId: string) => `pr:${pullId.replace(/-(\d+)$/, ":$1")}`;

type View = {
	/** The ref that the address names. */
	partRef: string;
	section: Section;
	onSection: (s: Section) => void;
	unit?: string;
	/** A link of before that opens the requests and the sessions. */
	details?: boolean;
	/** The address asks for the ticket page, also for a ticket with a spec or a pull request. */
	ticket?: boolean;
};

/**
 * One feature as a page (`spec:app-redesign#REQ-012`, picture 003): back to Flow, the title, the stage
 * line, the switch of six sections and the open section. The ref of any part finds the feature.
 */
function FeatureView({ partRef, ...view }: View) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { feature, parts, pending } = useFeature(partRef);
	if (pending) return <Loading />;
	if (!feature)
		return (
			<EmptyState
				title={
					partRef.startsWith("pr:")
						? t.forge.pullPage.notFound
						: partRef.startsWith("run:")
							? t.empty.run
							: t.empty.nothing
				}
				icon={<CpuChipIcon size={28} />}
				action={{ label: t.flow.views.flow, onClick: () => void navigate({ to: "/flow/flow" }) }}
			/>
		);
	const pullId = parts.pr?.replace(/^pr:/, "").replace(/:(\d+)$/, "-$1");
	return (
		<RunBoundary run={parts.run}>
			<PullBoundary pullId={pullId} onOpenFiles={() => view.onSection("changes")}>
				<Page feature={feature} parts={parts} partRef={partRef} {...view} />
			</PullBoundary>
		</RunBoundary>
	);
}

/**
 * The frame and the open section. A plan in review (picture 024) and the ticket page (picture 026)
 * show no switch: their sections are in More.
 */
function Page({
	feature,
	parts,
	partRef,
	section,
	onSection,
	unit,
	details,
	ticket,
}: View & { feature: Feature; parts: Parts }) {
	const { t } = useI18n();
	const x = t.flow.feature;
	const navigate = useNavigate();
	const router = useRouter();
	const canBack = useCanGoBack();
	// A card of Flow opened this page: going back is going to Flow, so the link says so.
	const fromFlow = useRouterState({ select: (r) => r.location.state.from === "flow" });
	const scope = useRunScope();
	// A pull request that no feature lists has no title of its own: the code host gives it.
	const pull = usePullState();
	const key = keyOf(parts.ticket);
	const item = useWorkItems({}).data?.find((i) => i.key === key);
	const fromList = !!useMatchRoute()({ to: "/code/pull-requests/$pullId" });
	const toFlow = () => void navigate({ to: fromList ? "/code/pull-requests" : "/flow/flow" });
	const planning = scope?.run.state === "PlanReview";
	// The ticket page: a ticket of the issue tracker with no spec and no pull request, and no agent
	// that can go on.
	const ticketPage =
		!!item &&
		(ticket || (!parts.change && !parts.pr && (parts.run ? scope?.run.state === "Blocked" : true)));
	const mode = planning ? "plan" : ticketPage ? "ticket" : undefined;
	const happened = useHappenedState();
	const url = webUrl(scope?.run.url ?? item?.url ?? "");
	const menu: MenuButtonItem[] = [
		...(mode
			? SECTIONS.map((s) => ({ id: s, label: x.section[s], onSelect: () => onSection(s) }))
			: []),
		...(happened.available
			? [
					{
						id: "happened",
						label: t.flow.stop.whatHappened,
						onSelect: () => happened.setOpen(!happened.open),
					},
				]
			: []),
		...(url
			? [{ id: "ticket", label: t.flow.look.page.openTicket, onSelect: () => openUrl(url) }]
			: []),
		{
			id: "copy",
			label: t.context.copyRef,
			icon: <ClipboardIcon size={16} />,
			onSelect: () => copyText(parts.run ?? parts.pr ?? parts.change ?? parts.ticket ?? partRef),
		},
	];
	return (
		<HappenedContext.Provider value={happened}>
			<section
				// The region has the key of the run, else the title. The page shows no key.
				aria-label={scope?.run.key ?? feature.title}
				className="flex w-full flex-col gap-6 px-4 pb-10"
				onKeyDown={(e) => {
					// Escape goes back: to the page that the person came from, else to Flow.
					if (e.key !== "Escape" || e.defaultPrevented) return;
					if (canBack) router.history.back();
					else toFlow();
				}}
			>
				<div className="flex flex-col">
					{/* A pull request address goes back to the list that opened it, with its search and filter. */}
					{/* The link and Escape go to the same place: the page that the person came from, else Flow. */}
					<BackLink
						label={
							fromList ? t.forge.now.pulls : canBack && !fromFlow ? t.ui.back : t.flow.views.flow
						}
						render={(props) => (
							<Link
								to={fromList ? "/code/pull-requests" : "/flow/flow"}
								aria-keyshortcuts="Escape"
								onClick={(e) => {
									if (!canBack || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
									e.preventDefault();
									router.history.back();
								}}
								{...props}
							/>
						)}
					/>
					<div className="flex flex-wrap items-center gap-4">
						<h1
							tabIndex={-1}
							data-run-title
							className="mr-auto min-w-0 rounded-sm text-44 font-semibold text-n-12 focus-visible:shadow-glow focus-visible:outline-none"
						>
							{feature.title || (pull?.d?.title ?? "")}
						</h1>
						{mode === "ticket" && item ? <EditTitle item={item} /> : null}
						<MenuButton iconOnly label={t.ui.more} icon={<MoreIcon />} items={menu} />
					</div>
				</div>
				{/* The stage line shows on Story, Brief, Changes, the plan and the ticket page; Design, Checks and Chat show none. */}
				{mode || section === "story" || section === "brief" || section === "changes" ? (
					// The plan in review shows the stage dot only: its card says what waits.
					<StageLine stage={feature.stage} mark={planning ? null : feature.mark} />
				) : null}
				{mode ? null : (
					<SectionSwitch
						label={x.sections}
						items={SECTIONS.map((s) => ({ id: s, label: x.section[s], current: s === section }))}
						onSelect={(id) => onSection(id as Section)}
					/>
				)}
				<PullReviewBar />
				<div role="tabpanel" aria-label={x.section[section]} className="flex flex-col gap-4">
					{section === "story" ? (
						<div className="flex flex-wrap items-start gap-6">
							<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
								{scope ? (
									<Story
										scope={scope}
										ticket={mode !== "ticket"}
										bare={!!mode}
										onFiles={() => onSection("changes")}
									>
										{mode === "ticket" && item ? <TicketCards item={item} /> : null}
									</Story>
								) : mode === "ticket" && item ? (
									<TicketCards item={item} />
								) : (
									<EmptyState title={x.noRun} extra={<StartAgent parts={parts} />} />
								)}
							</div>
							<div className="min-w-0 flex-[2_1_300px]">
								<Side feature={feature} parts={parts} mode={mode} onSection={onSection} />
							</div>
						</div>
					) : null}
					{section === "brief" ? <Brief parts={parts} onBack={toFlow} /> : null}
					{section === "design" ? <Design parts={parts} /> : null}
					{section === "changes" ? <Changes parts={parts} /> : null}
					{section === "checks" ? <Checks parts={parts} ci={feature.checks} /> : null}
					{section === "chat" ? <Chat parts={parts} /> : null}
					{/* A link that names a session opens on Chat, with the requests and the sessions. */}
					{section === "chat" && scope && (unit !== undefined || details) ? (
						<Requests scope={scope} unit={unit} />
					) : null}
				</div>
			</section>
		</HappenedContext.Provider>
	);
}

/** Three dots: the mark of the More menu. */
function MoreIcon() {
	return (
		<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
			<circle cx="3" cy="8" r="1.25" />
			<circle cx="8" cy="8" r="1.25" />
			<circle cx="13" cy="8" r="1.25" />
		</svg>
	);
}

function RunBoundary({ run, children }: { run?: string; children: ReactNode }) {
	return run ? <RunScope id={run.replace(/^run:/, "")}>{children}</RunScope> : children;
}

function PullBoundary({
	pullId,
	onOpenFiles,
	children,
}: {
	pullId?: string;
	onOpenFiles: () => void;
	children: ReactNode;
}) {
	return pullId ? (
		<PullWorkspace pullId={pullId} onOpenFiles={onOpenFiles}>
			{children}
		</PullWorkspace>
	) : (
		children
	);
}

/** `/flow/feature/$featureId`: the feature that the ref of one of its parts names. */
export function FeaturePage() {
	const { featureId } = useParams({ from: "/flow/feature/$featureId" });
	const { section, unit, ticket } = useSearch({ from: "/flow/feature/$featureId" });
	const navigate = useNavigate();
	const base = sectionOfRef(featureId);
	return (
		<FeatureView
			key={featureId}
			partRef={featureId}
			// A link that names a session opens on Chat.
			section={section ?? (unit ? "chat" : base)}
			onSection={(s) =>
				void navigate({
					to: "/flow/feature/$featureId",
					params: { featureId },
					search: s === base ? {} : { section: s },
					replace: true,
					// A section change keeps where the page came from: its back link still names it.
					state: (prev) => prev,
				})
			}
			unit={unit}
			ticket={ticket}
		/>
	);
}

/**
 * `/flow/runs/$runId` of before: the same page, opened on Story (or Changes with `tab=changes`).
 * `tab=workflow` and `unit` open Chat with the requests and sessions. A change of section stays on this address.
 */
export function RunAddress() {
	const { runId } = useParams({ from: "/flow/runs/$runId" });
	const { unit, tab, section } = useSearch({ from: "/flow/runs/$runId" });
	const navigate = useNavigate();
	const ref = `run:${runId}`;
	return (
		<FeatureView
			key={ref}
			partRef={ref}
			section={
				section ?? (tab === "changes" ? "changes" : tab === "workflow" || unit ? "chat" : "story")
			}
			onSection={(s) =>
				void navigate({
					to: "/flow/runs/$runId",
					params: { runId },
					search: s === "story" ? {} : { section: s },
					replace: true,
					// A section change keeps where the page came from: its back link still names it.
					state: (prev) => prev,
				})
			}
			unit={unit}
			details={tab === "workflow"}
		/>
	);
}

/** `/code/pull-requests/$pullId` of before: the same page, opened on Changes (Checks with `tab=checks`). */
export const PullAddress = withProject(function PullAddressView() {
	const { pullId } = useParams({ from: "/code/pull-requests/$pullId" });
	const { tab, section } = useSearch({ from: "/code/pull-requests/$pullId" });
	const navigate = useNavigate();
	const ref = pullRefOf(pullId);
	return (
		<FeatureView
			key={ref}
			partRef={ref}
			section={section ?? (tab === "checks" ? "checks" : "changes")}
			onSection={(s) =>
				void navigate({
					to: "/code/pull-requests/$pullId",
					params: { pullId },
					search: s === "changes" ? {} : { section: s },
					replace: true,
					// A section change keeps where the page came from: its back link still names it.
					state: (prev) => prev,
				})
			}
		/>
	);
}, "pull-requests");
