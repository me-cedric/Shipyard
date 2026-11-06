import { type ReactNode, useEffect, useRef, useState } from "react";
import { eventSentence } from "@/features/home/event-sentence";
import { format, useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import {
	CommandLineIcon,
	CpuChipIcon,
	DocumentTextIcon,
	MagnifyingGlassIcon,
	PencilIcon,
	PuzzlePieceIcon,
} from "@/ui/icons";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { pretty } from "./run-live";
import { firstLine, type Item, toolKind, transcript } from "./unit-transcript";

const ICON = {
	read: DocumentTextIcon,
	edit: PencilIcon,
	bash: CommandLineIcon,
	search: MagnifyingGlassIcon,
	mcp: PuzzlePieceIcon,
	other: CpuChipIcon,
};
const RESULT_LINES = 8;

function Raw({ raw }: { raw: string[] }) {
	const { t } = useI18n();
	return (
		<details className="text-12 text-n-11">
			<summary className="w-fit cursor-pointer select-none rounded-sm focus-visible:shadow-glow">
				{t.home.details}
			</summary>
			<pre className="overflow-x-auto font-mono text-11 whitespace-pre-wrap">
				{raw.map(pretty).join("\n")}
			</pre>
		</details>
	);
}

function Tool({ item }: { item: Extract<Item, { type: "tool" }> }) {
	const { t } = useI18n();
	const x = t.factory.transcript;
	const Icon = ICON[toolKind(item.name)];
	const lines = item.result?.output.split("\n") ?? [];
	return (
		<details className="rounded-md border bg-surface-1 text-ui">
			<summary className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 focus-visible:shadow-glow">
				<span aria-hidden="true" className="text-n-11">
					<Icon size={14} />
				</span>
				<span className="shrink-0 font-medium text-n-12">{item.name.replace(/^mcp__/, "")}</span>
				<span className="min-w-0 flex-1 truncate font-mono text-12 text-n-11">
					{firstLine(item.target)}
				</span>
				<StatusDot
					status={item.result ? (item.result.ok ? "success" : "danger") : "active"}
					label={item.result ? (item.result.ok ? x.ok : x.failed) : x.waiting}
				/>
			</summary>
			<div className="flex flex-col gap-1 border-t px-2 py-1">
				{lines.length > 0 && item.result?.output ? (
					<pre className="overflow-x-auto font-mono text-11 whitespace-pre-wrap text-n-11">
						{lines.slice(0, RESULT_LINES).join("\n")}
						{lines.length > RESULT_LINES
							? `\n${format(x.more, { count: String(lines.length - RESULT_LINES) })}`
							: ""}
					</pre>
				) : null}
				<Raw raw={item.raw} />
			</div>
		</details>
	);
}

function Card({ event, ticket }: { event: RunLogEvent_Serialize; ticket: string }) {
	const { t } = useI18n();
	const x = t.factory.transcript;
	const label =
		event.kind === "question" || event.kind === "answer"
			? x.question
			: event.kind === "report"
				? x.report
				: x.note;
	return (
		<div
			className={cn(
				"flex flex-col gap-1 rounded-md border px-3 py-2 text-ui",
				event.kind === "report" ? "bg-surface-2" : "bg-surface-1",
			)}
		>
			<span className="text-12 font-medium text-n-11">{label}</span>
			<span className="break-words text-n-12">
				{eventSentence(t.home.event, t.factory.state, { ...event, key: ticket })}
			</span>
			<Raw raw={[event.payload]} />
		</div>
	);
}

function Row({
	item,
	ticket,
	events,
}: {
	item: Item;
	ticket: string;
	events: RunLogEvent_Serialize[];
}): ReactNode {
	const { t } = useI18n();
	if (item.type === "text")
		return (
			<div className="flex flex-col gap-1">
				<MarkdownView source={item.text} label={t.factory.transcript.message} refs={false} />
				<Raw raw={item.raw} />
			</div>
		);
	if (item.type === "tool") return <Tool item={item} />;
	if (item.type === "error")
		return (
			<div
				role="alert"
				className="flex flex-col gap-1 rounded-md border px-3 py-2 text-ui text-danger"
			>
				{format(t.home.event.error, { text: item.text })}
				<Raw raw={item.raw} />
			</div>
		);
	const event = events.find((e) => e.id === item.id);
	return event ? <Card event={event} ticket={ticket} /> : null;
}

/** The events of one unit as a live chat: the AI tool's text, its tool calls and its questions. */
export function UnitTranscript({
	events,
	ticket,
	running,
}: {
	events: RunLogEvent_Serialize[];
	ticket: string;
	running: boolean;
}) {
	const { t } = useI18n();
	const x = t.factory.transcript;
	const { items, turns, tokens } = transcript(events);
	const box = useRef<HTMLDivElement>(null);
	const [pinned, setPinned] = useState(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the count of items is the trigger
	useEffect(() => {
		if (pinned && running && box.current) box.current.scrollTop = box.current.scrollHeight;
	}, [pinned, running, items.length]);
	return (
		<div className="relative border-t">
			{turns + tokens > 0 ? (
				<p className="px-3 py-1 text-12 text-n-11">
					{format(x.counter, { turns: String(turns), tokens: tokens.toLocaleString() })}
				</p>
			) : null}
			<div
				ref={box}
				role="log"
				aria-label={x.label}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs the keyboard
				tabIndex={0}
				onScroll={(e) => {
					const b = e.currentTarget;
					setPinned(b.scrollHeight - b.scrollTop - b.clientHeight < 24);
				}}
				className="flex max-h-80 flex-col gap-2 overflow-y-auto px-3 py-2 focus-visible:shadow-glow"
			>
				{items.map((item) => (
					<Row key={`${item.type}-${item.id}`} item={item} ticket={ticket} events={events} />
				))}
			</div>
			{running && !pinned ? (
				<div className="absolute right-3 bottom-2">
					<Button
						variant="ghost"
						onClick={() => {
							setPinned(true);
							if (box.current) box.current.scrollTop = box.current.scrollHeight;
						}}
					>
						{x.jump}
					</Button>
				</div>
			) : null}
		</div>
	);
}
