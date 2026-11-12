import {
	Link,
	useCanGoBack,
	useNavigate,
	useParams,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { usePull } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { toFailure } from "@/lib/ipc";
import { pullHref, pullNumberOf } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { ArrowsRightLeftIcon, ChevronLeftIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { withProject } from "./project-gate";
import { PullFiles } from "./pull-files";
import { PullHeader } from "./pull-header";
import { PullChecks, PullCommits } from "./pull-lists";
import { PullOverview } from "./pull-overview";

type PullTab = "overview" | "commits" | "checks" | "files";

/** Code / Pull requests / `$pullId`: one pull request as a page, under the Code tab bar (ux-declutter REQ-041). */
function PullPageView() {
	const { t } = useI18n();
	const p = t.forge.pullPage;
	const navigate = useNavigate();
	const router = useRouter();
	const { pullId } = useParams({ from: "/code/pull-requests/$pullId" });
	const { tab = "overview" } = useSearch({ from: "/code/pull-requests/$pullId" });
	const number = pullNumberOf(pullId);
	const pull = usePull(number);
	const toList = () => void navigate({ to: "/code/pull-requests" });
	// A person who came from the list goes back to it with its search and filter; a deep link goes to the list.
	const canBack = useCanGoBack();
	const back = () => (canBack ? router.history.back() : toList());
	if (pull.isPending) return <Loading />;
	// Only a not-found answer of the code host says "No such pull request". Any other failure keeps its own sentence and a retry.
	if (pull.error && toFailure(pull.error).code !== "forge_missing")
		return (
			<div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-3 p-5">
				<ErrorNotice error={pull.error} />
				<Button onClick={() => void pull.refetch()}>{t.routeError.retry}</Button>
			</div>
		);
	// The connection part of the id must be the one of the pull request: `pr:other:44` is not #44 here.
	const d = pull.data && pullHref(pull.data.reference).params.pullId === pullId ? pull.data : null;
	if (!d)
		return (
			<EmptyState
				title={p.notFound}
				icon={<ArrowsRightLeftIcon size={28} />}
				action={{ label: t.tabs.code["pull-requests"], onClick: toList }}
			/>
		);
	const named = (name: string, count: number) => format(t.count, { name, count });
	const tabs: { value: PullTab; label: string }[] = [
		{ value: "overview", label: p.overview },
		{ value: "commits", label: named(t.forge.commits, d.commits.length) },
		{ value: "checks", label: named(t.forge.checks, d.checks.length) },
		{ value: "files", label: named(p.filesChanged, d.files.length) },
	];
	return (
		<section aria-label={d.title} className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-5">
			<Link
				to="/code/pull-requests"
				activeOptions={{ exact: true }}
				onClick={(e) => {
					if (canBack && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
						e.preventDefault();
						back();
					}
				}}
				className="inline-flex items-center gap-1 self-start text-ui text-accent-text hover:underline"
			>
				<ChevronLeftIcon size={14} />
				{canBack ? t.ui.back : t.tabs.code["pull-requests"]}
			</Link>
			<PullHeader key={`${d.number}${d.state}${d.draft}`} d={d} />
			<ViewTabs
				label={p.views}
				value={tab}
				onValueChange={(v) =>
					void navigate({
						to: "/code/pull-requests/$pullId",
						params: { pullId },
						search: v === "overview" ? {} : { tab: v },
						replace: true,
					})
				}
				tabs={tabs}
			/>
			<div role="tabpanel" aria-label={tabs.find((x) => x.value === tab)?.label}>
				{tab === "overview" ? <PullOverview d={d} /> : null}
				{tab === "commits" ? <PullCommits d={d} /> : null}
				{tab === "checks" ? <PullChecks d={d} /> : null}
				{tab === "files" ? <PullFiles detail={d} /> : null}
			</div>
		</section>
	);
}

export const PullPage = withProject(PullPageView, "pull-requests");
