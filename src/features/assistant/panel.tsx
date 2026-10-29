import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { IconButton } from "@/ui/atoms/icon-button";
import { ChatBubbleIcon, ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from "@/ui/icons";
import { Composer } from "./composer";
import { ContextBar } from "./context";
import { SendToFactory } from "./factory-dialog";
import { useEditorTarget } from "./insert";
import { Messages } from "./messages";
import { Threads } from "./threads";
import { type Assistant, MAX_WIDTH, MIN_WIDTH } from "./use-assistant";

const STEP = 16;

/**
 * The width handle. A drag or an arrow key resizes. The edge that faces the main view moves: on the
 * right side the left arrow widens the panel.
 */
function Resizer({ a }: { a: Assistant }) {
	const { t } = useI18n();
	const start = useRef<{ x: number; width: number } | null>(null);
	const sign = a.side === "right" ? -1 : 1;
	const onKey = (e: KeyboardEvent) => {
		const step = e.key === "ArrowRight" ? STEP : e.key === "ArrowLeft" ? -STEP : 0;
		if (step) a.setWidth(a.width + step * sign);
		else if (e.key === "Home") a.setWidth(MIN_WIDTH);
		else if (e.key === "End") a.setWidth(MAX_WIDTH);
		else return;
		e.preventDefault();
	};
	const onMove = (e: PointerEvent) => {
		if (start.current)
			a.setWidth(start.current.width + (e.clientX - start.current.x) * sign, false);
	};
	return (
		// biome-ignore lint/a11y/useSemanticElements: a window splitter is a focusable separator
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={t.assistant.width}
			aria-valuemin={MIN_WIDTH}
			aria-valuemax={MAX_WIDTH}
			aria-valuenow={a.width}
			tabIndex={0}
			onKeyDown={onKey}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture?.(e.pointerId);
				start.current = { x: e.clientX, width: a.width };
			}}
			onPointerMove={onMove}
			onPointerUp={() => {
				start.current = null;
				a.setWidth(a.width);
			}}
			className={cn(
				"absolute inset-y-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-accent-subtle",
				a.side === "right" ? "left-0" : "right-0",
			)}
		/>
	);
}

/** The assistant panel (spec `assistant`). The shell mounts it once, so it exists in every space. */
export function AssistantPanel({
	assistant: a,
	open,
	onClose,
	onOpenRef,
}: {
	assistant: Assistant;
	open: boolean;
	onClose: () => void;
	onOpenRef: (ref: string) => void;
}) {
	const { t } = useI18n();
	const panel = useRef<HTMLElement>(null);
	const input = useRef<HTMLTextAreaElement>(null);
	const editor = useEditorTarget(panel);
	// Opening puts the focus in the input (REQ-001).
	useEffect(() => {
		if (open) input.current?.focus();
	}, [open]);
	const other = a.side === "right" ? "left" : "right";
	return (
		<aside
			ref={panel}
			aria-label={t.assistant.panelLabel}
			inert={!open}
			data-open={open}
			style={{ width: a.width }}
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				const text = e.dataTransfer.getData("text/plain").trim();
				if (text) void a.addRef(text);
			}}
			className={cn(
				"relative min-h-0 shrink-0 flex-col bg-n-1",
				a.side === "right" ? "border-l" : "border-r",
				open ? "flex" : "hidden",
			)}
		>
			<Resizer a={a} />
			<div className="flex items-center gap-1 border-b pr-1 pl-3">
				<span aria-hidden="true">
					<ChatBubbleIcon size={14} />
				</span>
				<h1 className="min-w-0 flex-1 truncate text-ui font-medium">{t.assistant.title}</h1>
				<SendToFactory a={a} />
				<IconButton
					label={format(t.assistant.side.move, { side: t.assistant.side[other] })}
					onClick={() => a.setSide(other)}
				>
					{other === "left" ? <ChevronLeftIcon size={14} /> : <ChevronRightIcon size={14} />}
				</IconButton>
				<IconButton label={t.assistant.close} onClick={onClose}>
					<XMarkIcon size={14} />
				</IconButton>
			</div>
			<Threads a={a} />
			<Messages a={a} insert={editor.insert} canInsert={editor.canInsert} onOpenRef={onOpenRef} />
			{a.alert ? (
				<p role="alert" className="border-t px-2 py-1 text-12 text-warning-text">
					{format(t.assistant.alert, { name: a.alert })}
				</p>
			) : null}
			{a.error ? (
				<p role="alert" className="border-t px-2 py-1 text-12 text-danger-text">
					{a.error}
				</p>
			) : null}
			<ContextBar a={a} onOpenRef={onOpenRef} />
			<Composer a={a} inputRef={input} />
		</aside>
	);
}
