import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { cn } from "@/lib/utils";
import { type Status, StatusDot } from "../atoms/status-dot";
import { Tooltip } from "../atoms/tooltip";
import { BookOpenIcon, CodeBracketIcon, CpuChipIcon, DocumentTextIcon, InboxIcon } from "../icons";
import { ContextMenu } from "./context-menu";

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
	text,
	onOpen,
	className,
}: {
	refId: string;
	state: RefState;
	title?: string;
	/** A shorter text in place of a long ref, such as the ticket of a run. */
	text?: string;
	onOpen?: (refId: string) => void;
	className?: string;
}) {
	const { t } = useI18n();
	const menu = useMenus();
	const kind = refId.split(":")[0] ?? "";
	const stateLabel = t.ref[state];
	// The ref holds the kind. The name starts with the visible text, then adds the title and the state.
	const name = [text, refId, title, stateLabel].filter(Boolean).join(", ");
	return (
		<ContextMenu
			items={menu("ref", {
				// An unresolved chip has no entity to open.
				open: state !== "unresolved" && onOpen ? () => onOpen(refId) : undefined,
				"copy-ref": () => copyText(refId),
			})}
		>
			<Tooltip label={title ? `${title} · ${stateLabel}` : stateLabel}>
				<button
					type="button"
					data-state={state}
					aria-label={name}
					// A drop on the assistant panel adds the ref to its context.
					draggable
					onDragStart={(e) => e.dataTransfer.setData("text/plain", refId)}
					// An unresolved chip has no entity to open.
					onClick={() => state !== "unresolved" && onOpen?.(refId)}
					className={cn(
						"inline-flex h-5 max-w-full min-w-0 items-center gap-1.5 rounded-sm border border-n-7 bg-n-2 px-1.5 font-mono text-11 text-n-12 transition-colors duration-(--duration-fast) hover:bg-n-4",
						className,
					)}
				>
					<span aria-hidden="true" className="text-n-10">
						{KIND_ICON[kind] ?? <DocumentTextIcon size={12} />}
					</span>
					<span className="min-w-0 truncate">{text ?? refId}</span>
					<span aria-hidden="true">
						<StatusDot status={STATE_DOT[state]} className="size-2" />
					</span>
				</button>
			</Tooltip>
		</ContextMenu>
	);
}
