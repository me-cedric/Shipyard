import { KnowledgeActions } from "@/features/knowledge/explain";
import { NextStepAction } from "@/features/specs/next-step";
import type { RefActions } from "@/lib/shell";

/** The inspector actions of a ref: the one next step along the loop, then Explain and Open in graph. */
export const refActions: RefActions = (refId, title) => (
	<div className="flex flex-col gap-2">
		<NextStepAction refId={refId} title={title} />
		<KnowledgeActions refId={refId} />
	</div>
);
