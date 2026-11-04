import { useEffect, useRef } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { IconButton } from "@/ui/atoms/icon-button";
import { ChevronLeftIcon, ChevronRightIcon, SparklesIcon, XMarkIcon } from "@/ui/icons";
import { Splitter } from "@/ui/molecules/splitter";
import { Composer } from "./composer";
import { ContextBar } from "./context";
import { SendToFactory } from "./factory-dialog";
import { useEditorTarget } from "./insert";
import { Messages } from "./messages";
import { NoCli, useRunnersMissing } from "./no-cli";
import { Threads } from "./threads";
import { type Assistant, MAX_WIDTH, MIN_WIDTH } from "./use-assistant";

const DEFAULT_WIDTH = 400;

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
	const missing = useRunnersMissing();
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
				"relative min-h-0 shrink-0 flex-col bg-surface-3/85 shadow-3 backdrop-blur-xl",
				a.side === "right" ? "border-l" : "border-r",
				open ? "flex" : "hidden",
			)}
		>
			<Splitter
				label={t.assistant.width}
				value={a.width}
				min={MIN_WIDTH}
				max={MAX_WIDTH}
				invert={a.side === "right"}
				onChange={a.setWidth}
				onReset={() => a.setWidth(DEFAULT_WIDTH)}
				className={a.side === "right" ? "left-0" : "right-0"}
			/>
			<div className="flex h-11 shrink-0 items-center gap-2 border-b pr-1 pl-3">
				<span
					aria-hidden="true"
					className="flex size-6 items-center justify-center rounded-md bg-accent-gradient text-accent-fg shadow-glow"
				>
					<SparklesIcon size={14} />
				</span>
				<h1 className="min-w-0 flex-1 truncate text-14 font-medium text-n-12">
					{t.assistant.title}
				</h1>
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
				<p
					role="alert"
					className="mx-2 mb-2 rounded-md bg-warning-soft px-2 py-1 text-12 text-warning-text"
				>
					{format(t.assistant.alert, { name: a.alert })}
				</p>
			) : null}
			{a.error ? (
				<p
					role="alert"
					className="mx-2 mb-2 rounded-md bg-danger-soft px-2 py-1 text-12 text-danger-text"
				>
					{a.error}
				</p>
			) : null}
			<ContextBar a={a} onOpenRef={onOpenRef} />
			{missing.none ? <NoCli runners={missing.runners} /> : <Composer a={a} inputRef={input} />}
		</aside>
	);
}
