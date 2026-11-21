import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useContext, useLayoutEffect } from "react";
import { useFeature } from "@/features/flow/feature/use-feature";
import { useI18n } from "@/lib/i18n";
import { ArrowsRightLeftIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { PageSwitchContext } from "@/ui/molecules/page-header";
import { PullPart, PullReviewBar, PullWorkspace, usePullState } from "./pull-page";

/** The title of the page: the one of the feature, else the one of the pull request. Discard and Submit review give it the focus. */
function Title({ title }: { title: string }) {
	const pull = usePullState();
	return (
		<div className="flex items-center gap-4">
			<h1
				tabIndex={-1}
				data-run-title
				className="mr-auto rounded-sm text-44 font-semibold text-n-12 focus-visible:shadow-glow focus-visible:outline-none"
			>
				{title || (pull?.d?.title ?? "")}
			</h1>
			{/* The More of the files draws here (accepted: the More button ends the title row). */}
			<span ref={pull?.setMoreHost} />
		</div>
	);
}

/**
 * `/flow/feature/$featureId/files`: the changed files of the pull request of a feature, as a page of
 * its own with the way back to Changes. The ref of any part of the feature finds it.
 */
export function PullFilesPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { featureId } = useParams({ from: "/flow/feature/$featureId/files" });
	const { feature, parts, pending } = useFeature(featureId);
	// The page shows no switch of the place: it claims the slot and draws nothing.
	const claim = useContext(PageSwitchContext)?.claim;
	useLayoutEffect(() => claim?.(), [claim]);
	if (pending) return <Loading />;
	const pullId = parts.pr?.replace(/^pr:/, "").replace(/:(\d+)$/, "-$1");
	if (!feature || !pullId)
		return (
			<EmptyState
				title={t.forge.pullPage.notFound}
				icon={<ArrowsRightLeftIcon size={28} />}
				action={{ label: t.flow.views.flow, onClick: () => void navigate({ to: "/flow/flow" }) }}
			/>
		);
	return (
		<PullWorkspace pullId={pullId}>
			<section
				aria-label={t.flow.look.pull.files}
				className="flex w-full flex-col gap-6 px-4 pb-10"
			>
				<div className="flex flex-col">
					<BackLink
						label={t.flow.look.pull.back}
						render={(props) => (
							<Link
								to="/flow/feature/$featureId"
								params={{ featureId }}
								search={{ section: "changes" }}
								{...props}
							/>
						)}
					/>
					<Title title={feature.title} />
				</div>
				<PullReviewBar />
				<PullPart part="files" />
			</section>
		</PullWorkspace>
	);
}
