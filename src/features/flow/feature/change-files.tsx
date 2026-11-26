import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ChangeDetail } from "@/features/specs/change-detail";
import { useI18n } from "@/lib/i18n";
import { useChanges } from "@/lib/specs";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { useFeature } from "./use-feature";

/** `/flow/feature/$featureId/spec`: the files of the change of a feature, with the way back to its Brief. */
export function ChangeFilesPage() {
	const { t } = useI18n();
	const { featureId } = useParams({ from: "/flow/feature/$featureId/spec" });
	const { file, view } = useSearch({ from: "/flow/feature/$featureId/spec" });
	const navigate = useNavigate();
	const { feature, parts, pending } = useFeature(featureId);
	const changes = useChanges();
	const change = changes.data?.find((c) => `change:${c.id}` === parts.change);
	const toBrief = () =>
		void navigate({
			to: "/flow/feature/$featureId",
			params: { featureId },
			search: { section: "brief" },
		});
	if (pending || changes.isPending) return <Loading />;
	if (!change)
		return (
			<EmptyState
				title={t.flow.feature.noSpec}
				action={{ label: t.flow.feature.openBrief, onClick: toBrief }}
			/>
		);
	return (
		<ChangeDetail
			key={change.id}
			change={change}
			title={feature?.title}
			file={file}
			view={view}
			onBack={toBrief}
		/>
	);
}
