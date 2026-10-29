import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type Status, StatusDot } from "../atoms/status-dot";
import { Tooltip } from "../atoms/tooltip";
import { BookOpenIcon, CodeBracketIcon, CpuChipIcon, DocumentTextIcon, InboxIcon } from "../icons";

export type RefState = "resolved" | "unresolved" | "broken";

// Distinct shape and colour per state, taken from StatusDot.
const STATE_DOT: Record<RefState, Status> = {
	resolved: "success",
	unresolved: "warning",
	broken: "danger",
};

const KIND_ICON: Record<string, ReactNode> = {
	wi: <InboxIcon size={12} />,
	spec: <DocumentTextIcon size={12} />,
	adr: <BookOpenIcon size={12} />,
	code: <CodeBracketIcon size={12} />,
	run: <CpuChipIcon size={12} />,
};

export function RefChip({
	refId,
	state,
	title,
	onOpen,
	className,
}: {
	refId: string;
	state: RefState;
	title?: string;
	onOpen?: (refId: string) => void;
	className?: string;
}) {
	const { t } = useI18n();
	const kind = refId.split(":")[0] ?? "";
	const stateLabel = t.ref[state];
	// The ref holds the kind. The name adds the title, then the state.
	const name = [refId, title, stateLabel].filter(Boolean).join(", ");
	return (
		<Tooltip label={title ? `${title} · ${stateLabel}` : stateLabel}>
			<button
				type="button"
				data-state={state}
				aria-label={name}
				// An unresolved chip has no entity to open.
				onClick={() => state !== "unresolved" && onOpen?.(refId)}
				className={cn(
					"inline-flex h-5 items-center gap-1.5 rounded-sm border border-n-7 bg-n-2 px-1.5 font-mono text-11 text-n-12 transition-colors duration-(--duration-fast) hover:bg-n-4",
					className,
				)}
			>
				<span aria-hidden="true" className="text-n-10">
					{KIND_ICON[kind] ?? <DocumentTextIcon size={12} />}
				</span>
				<span>{refId}</span>
				<span aria-hidden="true">
					<StatusDot status={STATE_DOT[state]} className="size-2" />
				</span>
			</button>
		</Tooltip>
	);
}
