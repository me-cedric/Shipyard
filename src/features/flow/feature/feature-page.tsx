import {
	Link,
	useCanGoBack,
	useNavigate,
	useParams,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { withProject } from "@/features/code/project-gate";
import { PullReviewBar, PullWorkspace, usePullState } from "@/features/code/pull-page";
import { RunScope, useRunScope } from "@/features/factory/runs/run-detail";
import { useScrollClear, webUrl } from "@/features/factory/runs/run-summary";
import { useI18n } from "@/lib/i18n";
import { copyText, openUrl } from "@/lib/menus";
import { IconButton } from "@/ui/atoms/icon-button";
import { ChevronLeftIcon, ClipboardIcon, CpuChipIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { StageLine } from "@/ui/molecules/stage-line";
import { SECTIONS, type Section, sectionOfRef } from "../sections";
import { Brief, Changes, Chat, Checks, Design, StartAgent } from "./parts";
import { Side } from "./side";
import { Story } from "./story";
import { type Parts, useFeature } from "./use-feature";

/** The ref of a pull request from the id of its address: `github-demo-142` is `pr:github-demo:142`. */
const pullRefOf = (pullId: string) => `pr:${pullId.replace(/-(\d+)$/, ":$1")}`;

/** The title of the page: the key of the ticket (a link when it has a web address) and the title. */
function Title({ title, parts }: { title: string; parts: Parts }) {
	const scope = useRunScope();
	const key = scope?.run.key ?? parts.ticket?.replace(/^wi:/, "");
	// A pull request that no feature lists has no title of its own: the code host gives it.
	const pull = usePullState();
	const shown = title || (pull?.d?.title ?? "");
	const url = scope ? webUrl(scope.run.url) : undefined;
	return (
		<h1
			tabIndex={-1}
			data-run-title
			className="flex min-w-0 items-center gap-2 rounded-sm text-20 font-semibold text-n-12 focus-visible:shadow-glow focus-visible:outline-none"
		>
			{key && url ? (
				<a
					href={url}
					// Click, middle click and modifier click all open it in the browser of the person.
					onClick={(e) => {
						e.preventDefault();
						openUrl(url);
					}}
					onAuxClick={(e) => {
						e.preventDefault();
						openUrl(url);
					}}
					className="shrink-0 rounded-sm font-mono text-12 font-normal text-accent-text hover:underline focus-visible:shadow-glow"
				>
					{key}
				</a>
			) : key ? (
				<span className="shrink-0 font-mono text-12 font-normal text-n-11">{key}</span>
			) : null}
			<span className="min-w-0 truncate">{shown}</span>
		</h1>
	);
}

type View = {
	/** The ref that the address names. */
	partRef: string;
	section: Section;
	onSection: (s: Section) => void;
	unit?: string;
	/** Opens the requests and the sessions of the Story. */
	details?: boolean;
};

/**
 * One feature as a page (`spec:app-redesign#REQ-012`): back to Flow, the title, the stage line, the switch
 * of six sections and the open section. The ref of any part finds the feature.
 */
function FeatureView({ partRef, section, onSection, unit, details }: View) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const router = useRouter();
	const head = useRef<HTMLElement>(null);
	useScrollClear(head);
	const { feature, parts, pending } = useFeature(partRef);
	const toFlow = () => void navigate({ to: "/flow/flow" });
	// A person who came from another page (a list, Today) goes back to it; a deep link goes to Flow.
	const canBack = useCanGoBack();
	const back = () => (canBack ? router.history.back() : toFlow());
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
				action={{ label: t.flow.views.flow, onClick: toFlow }}
			/>
		);
	const pullId = parts.pr?.replace(/^pr:/, "").replace(/:(\d+)$/, "-$1");
	const x = t.flow.feature;
	return (
		<RunBoundary run={parts.run}>
			<PullBoundary pullId={pullId} onOpenFiles={() => onSection("changes")}>
				<Frame
					title={feature.title}
					onKeyDown={(e) => {
						if (e.key === "Escape" && !e.defaultPrevented) back();
					}}
				>
					<header
						ref={head}
						className="sticky top-0 z-10 flex flex-col gap-3 rounded-lg border bg-surface-1 p-3 shadow-1"
					>
						<div className="flex items-center justify-between gap-2">
							<Link
								to="/flow/flow"
								activeOptions={{ exact: true }}
								aria-keyshortcuts="Escape"
								onClick={(e) => {
									if (canBack && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
										e.preventDefault();
										back();
									}
								}}
								className="inline-flex min-h-control items-center gap-1 text-ui text-accent-text hover:underline"
							>
								<ChevronLeftIcon size={14} />
								{canBack ? t.ui.back : t.flow.views.flow}
							</Link>
							<IconButton
								label={t.context.copyRef}
								className="min-h-control"
								onClick={() =>
									copyText(parts.run ?? parts.pr ?? parts.change ?? parts.ticket ?? partRef)
								}
							>
								<ClipboardIcon size={14} />
							</IconButton>
						</div>
						<Title title={feature.title} parts={parts} />
						<StageLine stage={feature.stage} mark={feature.mark} />
						<SectionSwitch
							label={x.sections}
							items={SECTIONS.map((s) => ({ id: s, label: x.section[s], current: s === section }))}
							onSelect={(id) => onSection(id as Section)}
						/>
					</header>
					<PullReviewBar />
					<div role="tabpanel" aria-label={x.section[section]} className="flex flex-col gap-4">
						{section === "story" ? (
							<StoryLayout
								feature={feature}
								parts={parts}
								unit={unit}
								details={details}
								onSection={onSection}
							/>
						) : null}
						{section === "brief" ? <Brief parts={parts} onBack={toFlow} /> : null}
						{section === "design" ? <Design parts={parts} /> : null}
						{section === "changes" ? <Changes parts={parts} /> : null}
						{section === "checks" ? <Checks parts={parts} ci={feature.checks} /> : null}
						{section === "chat" ? <Chat parts={parts} /> : null}
					</div>
				</Frame>
			</PullBoundary>
		</RunBoundary>
	);
}

/** The page: a region named by the key of the run, else by the title. Escape goes back. */
function Frame({
	title,
	onKeyDown,
	children,
}: {
	title: string;
	onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
	children: ReactNode;
}) {
	const scope = useRunScope();
	return (
		<section
			aria-label={scope?.run.key ?? title}
			className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-5"
			onKeyDown={onKeyDown}
		>
			{children}
		</section>
	);
}

/** The Story and its side column. A feature with no run offers to start an agent. */
function StoryLayout({
	feature,
	parts,
	unit,
	details,
	onSection,
}: {
	feature: NonNullable<ReturnType<typeof useFeature>["feature"]>;
	parts: Parts;
	unit?: string;
	details?: boolean;
	onSection: (s: Section) => void;
}) {
	const scope = useRunScope();
	return (
		<div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_20rem]">
			<div className="min-w-0">
				{scope ? <Story scope={scope} unit={unit} details={details} /> : <NoRun parts={parts} />}
			</div>
			<Side feature={feature} hasChange={!!parts.change} onSection={onSection} />
		</div>
	);
}

function NoRun({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	return <EmptyState title={t.flow.feature.noRun} extra={<StartAgent parts={parts} />} />;
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
	const { section, unit } = useSearch({ from: "/flow/feature/$featureId" });
	const navigate = useNavigate();
	const base = sectionOfRef(featureId);
	return (
		<FeatureView
			key={featureId}
			partRef={featureId}
			section={section ?? base}
			onSection={(s) =>
				void navigate({
					to: "/flow/feature/$featureId",
					params: { featureId },
					search: s === base ? {} : { section: s },
					replace: true,
				})
			}
			unit={unit}
		/>
	);
}

/**
 * `/flow/runs/$runId` of before: the same page, opened on Story (or Changes with `tab=changes`).
 * `tab=workflow` and `unit` open the requests and sessions. A change of section stays on this address.
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
			section={section ?? (tab === "changes" ? "changes" : "story")}
			onSection={(s) =>
				void navigate({
					to: "/flow/runs/$runId",
					params: { runId },
					search: s === "story" ? {} : { section: s },
					replace: true,
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
				})
			}
		/>
	);
}, "pull-requests");
