import {
	Link,
	useCanGoBack,
	useNavigate,
	useParams,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { useRuns } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/menus";
import { IconButton } from "@/ui/atoms/icon-button";
import { ChevronLeftIcon, ClipboardIcon, CpuChipIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { RunDetail } from "./run-detail";

export { runHref } from "@/lib/shell";

/** Factory / Runs / `$runId`: one run as a page, under the Factory tab bar (ux-declutter REQ-027, REQ-028). */
export function RunPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { runId } = useParams({ from: "/factory/runs/$runId" });
	const { unit, tab } = useSearch({ from: "/factory/runs/$runId" });
	const runs = useRuns(runId);
	const router = useRouter();
	const toRuns = () => void navigate({ to: "/factory/runs" });
	// A person who came from another page (History with a search, Sessions, Home) goes back to it; a deep link goes to Runs.
	const canBack = useCanGoBack();
	const back = () => (canBack ? router.history.back() : toRuns());
	if (runs.isPending) return <Loading />;
	const run = runs.data?.find((r) => r.id === runId);
	if (!run)
		return (
			<EmptyState
				title={t.empty.run}
				icon={<CpuChipIcon size={28} />}
				action={{ label: t.factory.runs, onClick: toRuns }}
			/>
		);
	return (
		<section
			aria-label={run.key}
			className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-5"
			onKeyDown={(e) => {
				if (e.key === "Escape" && !e.defaultPrevented) back();
			}}
		>
			<div className="flex items-center justify-between gap-2">
				<Link
					to="/factory/runs"
					activeOptions={{ exact: true }}
					aria-keyshortcuts="Escape"
					onClick={(e) => {
						if (canBack && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
							e.preventDefault();
							back();
						}
					}}
					className="inline-flex items-center gap-1 text-ui text-accent-text hover:underline"
				>
					<ChevronLeftIcon size={14} />
					{canBack ? t.ui.back : t.factory.runs}
				</Link>
				<IconButton label={t.context.copyRef} onClick={() => copyText(`run:${runId}`)}>
					<ClipboardIcon size={14} />
				</IconButton>
			</div>
			<RunDetail
				key={runId}
				id={runId}
				unit={unit}
				// A link to a session opens the Workflow tab, unless the address names a tab.
				tab={tab ?? (unit ? "workflow" : "activity")}
				onTab={(v) =>
					void navigate({
						to: "/factory/runs/$runId",
						params: { runId },
						search: v === "activity" ? {} : { tab: v },
						replace: true,
					})
				}
			/>
		</section>
	);
}
