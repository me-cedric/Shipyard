import { CreateWorkItem } from "@/features/work";
import type { RefActions } from "@/lib/shell";

/** The refs that a person turns into a work item with one click (`work` REQ-029). */
const ITEM_KINDS = new Set([
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

/** The inspector actions of a ref. This is the one place that joins Shell and Work. */
export const refActions: RefActions = (refId, title) =>
	ITEM_KINDS.has(refId.split(":")[0] ?? "") ? (
		<div>
			<CreateWorkItem refId={refId} title={title} />
		</div>
	) : null;
