import { KnowledgeActions } from "@/features/knowledge";
import { CreateWorkItem } from "@/features/work";
import type { RefActions } from "@/lib/shell";

/** The refs that a person turns into a work item with one click (`work` REQ-029). */
const ITEM_KINDS = new Set([
	"adr",
	"diagram",
	"flow",
	"screen",
	"api",
	"data",
	"model",
	"spec",
	"change",
	"q",
]);

/** The inspector actions of a ref. This is the one place that joins Shell, Knowledge and Work. */
export const refActions: RefActions = (refId, title) => (
	<div className="flex flex-col gap-2">
		<KnowledgeActions refId={refId} />
		{ITEM_KINDS.has(refId.split(":")[0] ?? "") ? (
			<CreateWorkItem refId={refId} title={title} />
		) : null}
	</div>
);
