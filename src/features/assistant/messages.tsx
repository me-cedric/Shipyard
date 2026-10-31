import { format, useI18n } from "@/lib/i18n";
import type { ChatMessage, FileDiff } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { LiveDot } from "@/ui/atoms/live-dot";
import { StatusDot } from "@/ui/atoms/status-dot";
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ChatBubbleIcon,
	CheckIcon,
	ChevronRightIcon,
	ClipboardIcon,
} from "@/ui/icons";
import { DiffView } from "@/ui/molecules/diff-view";
import { RefChip } from "@/ui/molecules/ref-chip";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { MermaidView } from "@/ui/organisms/mermaid-view";
import { parseReply, replyOptions } from "./reply";
import type { Assistant } from "./use-assistant";

/** A message as a bubble: the person on the right in the accent tint, the assistant on the left. */
const BUBBLE = {
	user: "flex max-w-[85%] flex-col gap-1 self-end rounded-2xl rounded-br-sm bg-accent-soft px-3 py-2 text-n-12",
	assistant:
		"flex max-w-[92%] flex-col gap-2 self-start rounded-2xl rounded-bl-sm border bg-surface-2 px-3 py-2 shadow-1",
};

const WRITES = /edit|write|patch/i;

/** The files that the tool calls changed: each target of a write tool, once. */
export const filesTouched = (steps: ChatMessage["trace"]) =>
	new Set(steps.filter((s) => WRITES.test(s.tool)).map((s) => s.target)).size;

/** The tool calls, one line each. */
function Steps({ steps }: { steps: ChatMessage["trace"] }) {
	return (
		<ul className="mt-1 flex flex-col gap-0.5 rounded-md border bg-n-2 p-1.5 font-mono text-11">
			{steps.map((s, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: the steps never reorder
				<li key={i} className="flex gap-2">
					<span>{s.tool}</span>
					<span className="min-w-0 flex-1 truncate">{s.target}</span>
					<span>{s.ms} ms</span>
				</li>
			))}
		</ul>
	);
}

/** One line when the turn ends. The person expands it to see each tool call. */
function Trace({ steps }: { steps: ChatMessage["trace"] }) {
	const { t } = useI18n();
	if (!steps.length) return null;
	const total = steps.reduce((sum, s) => sum + s.ms, 0);
	const files = filesTouched(steps);
	return (
		<details className="group text-12 text-n-11">
			<summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border bg-n-2 px-2 py-0.5 hover:text-n-12 [&::-webkit-details-marker]:hidden">
				<span
					aria-hidden="true"
					className="transition-transform duration-(--duration-fast) group-open:rotate-90"
				>
					<ChevronRightIcon size={10} />
				</span>
				{t.assistant.trace} · {format(t.assistant.tools, { count: steps.length })}
				{files ? ` · ${format(t.extras.assistant.filesTouched, { count: files })}` : ""} · {total}{" "}
				ms
			</summary>
			<Steps steps={steps} />
		</details>
	);
}

function Code({ lang, file, text }: { lang: string; file: string; text: string }) {
	const { t } = useI18n();
	return (
		<figure className="overflow-hidden rounded-md border bg-surface-0">
			<figcaption className="flex items-center gap-2 border-b bg-n-2 px-2 text-12 text-n-11">
				<span className="min-w-0 flex-1 truncate font-mono">{file}</span>
				<span>{lang}</span>
				<IconButton label={t.assistant.copyCode} className="size-6" onClick={() => copyText(text)}>
					<ClipboardIcon size={12} />
				</IconButton>
			</figcaption>
			<pre className="overflow-x-auto p-2 font-mono text-12">
				<code>{text}</code>
			</pre>
		</figure>
	);
}

function Reply({
	m,
	last,
	a,
	insert,
	canInsert,
	onOpenRef,
}: {
	m: ChatMessage;
	last: boolean;
	a: Assistant;
	insert: (text: string) => void;
	canInsert: boolean;
	onOpenRef: (ref: string) => void;
}) {
	const { t } = useI18n();
	const s = m.state;
	const options = last && s.state === "done" && !a.busy ? replyOptions(m.text) : [];
	return (
		<>
			<Trace steps={m.trace} />
			{parseReply(m.text).map((p, i) =>
				p.kind === "code" ? (
					p.lang === "mermaid" ? (
						// biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
						<MermaidView key={i} source={p.text} label={t.ui.diagram} />
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
						<Code key={i} {...p} />
					)
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
					<MarkdownView key={i} source={p.text} label={t.assistant.assistant} refs={false} />
				),
			)}
			{s.state === "waiting" ? (
				<div role="status" className="flex items-center gap-2 text-ui">
					<StatusDot status="warning" />
					<span className="min-w-0 flex-1 truncate">
						{format(t.assistant.waiting, { permission: s.permission })}
					</span>
					{last ? (
						<Button variant="primary" disabled={a.busy} onClick={() => void a.grant()}>
							<CheckIcon size={14} />
							{t.assistant.grant}
						</Button>
					) : null}
				</div>
			) : null}
			{s.state === "failed" ? (
				<div className="flex items-center gap-2 text-ui">
					<p role="alert" className="min-w-0 flex-1 text-danger-text">
						{s.message}
					</p>
					{last ? (
						<Button disabled={a.busy} onClick={() => void a.retry()}>
							<ArrowPathIcon size={14} />
							{t.assistant.retry}
						</Button>
					) : null}
				</div>
			) : null}
			{m.refs.length ? (
				<ul className="flex flex-wrap gap-1">
					{m.refs.map((r) => (
						<li key={r}>
							<RefChip refId={r} state="resolved" onOpen={onOpenRef} />
						</li>
					))}
				</ul>
			) : null}
			{s.state === "done" && m.text ? (
				<div className="-mb-1 flex gap-0.5">
					<Button
						variant="ghost"
						className="h-6 px-1.5 text-12 text-n-11"
						onClick={() => copyText(m.text)}
					>
						<ClipboardIcon size={12} />
						{t.assistant.copy}
					</Button>
					<Button
						variant="ghost"
						className="h-6 px-1.5 text-12 text-n-11"
						disabled={!canInsert}
						onClick={() => insert(m.text)}
					>
						<ArrowDownTrayIcon size={12} />
						{t.assistant.insert}
					</Button>
					<Button
						variant="ghost"
						className="h-6 px-1.5 text-12 text-n-11"
						onClick={() =>
							a.setDraft(`${a.draft ? `${a.draft}\n` : ""}${m.text.replace(/^/gm, "> ")}\n`)
						}
					>
						<ChatBubbleIcon size={12} />
						{t.extras.assistant.quote}
					</Button>
				</div>
			) : null}
			{options.length ? (
				<ul aria-label={t.assistant.options} className="flex flex-wrap gap-1.5 pt-1">
					{options.map((o) => (
						<li key={o}>
							<button
								type="button"
								onClick={() => void a.send(o)}
								className="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-left text-12 text-n-12 transition-colors duration-(--duration-fast) hover:bg-accent-subtle"
							>
								{o}
							</button>
						</li>
					))}
				</ul>
			) : null}
		</>
	);
}

function Changed({ files }: { files: FileDiff[] }) {
	const { t } = useI18n();
	if (!files.length) return null;
	return (
		<section aria-label={t.assistant.changed} className="flex flex-col gap-1 border-t pt-2">
			<h3 className="text-12 font-medium">{t.assistant.changed}</h3>
			{files.map((f) => (
				<details key={f.path} className="text-12">
					<summary className="cursor-pointer font-mono">{f.path}</summary>
					<DiffView
						text={f.text}
						binary={f.binary}
						truncated={f.truncated}
						label={format(t.assistant.diff, { name: f.path })}
						binaryLabel={t.assistant.diffBinary}
						truncatedLabel={t.assistant.diffTruncated}
					/>
				</details>
			))}
		</section>
	);
}

/** The transcript of the open thread. The log role tells assistive tools about each new reply. */
export function Messages({
	a,
	insert,
	canInsert,
	onOpenRef,
}: {
	a: Assistant;
	insert: (text: string) => void;
	canInsert: boolean;
	onOpenRef: (ref: string) => void;
}) {
	const { t } = useI18n();
	const list = a.current?.thread.messages ?? [];
	const lastAsk = list.findLastIndex((m) => m.role === "user");
	return (
		<div
			role="log"
			aria-label={t.assistant.messages}
			className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
		>
			{list.map((m, i) => (
				<article
					// biome-ignore lint/suspicious/noArrayIndexKey: the transcript only grows
					key={i}
					aria-label={m.role === "user" ? t.assistant.you : t.assistant.assistant}
					className={m.role === "user" ? BUBBLE.user : BUBBLE.assistant}
				>
					<h3 className="sr-only">{m.role === "user" ? t.assistant.you : t.assistant.assistant}</h3>
					{m.role === "user" ? (
						<>
							<p className="whitespace-pre-wrap text-ui">{m.text}</p>
							{i === lastAsk && !a.busy ? (
								<Button
									variant="ghost"
									className="h-6 self-end px-1.5 text-12"
									onClick={() => void a.send(m.text, false, m.quotes)}
								>
									<ArrowPathIcon size={12} />
									{t.extras.assistant.redo}
								</Button>
							) : null}
						</>
					) : (
						<Reply
							m={m}
							last={i === list.length - 1}
							a={a}
							insert={insert}
							canInsert={canInsert}
							onOpenRef={onOpenRef}
						/>
					)}
				</article>
			))}
			{a.pending !== null && a.running === (a.current?.thread.id ?? null) ? (
				<>
					<article className={BUBBLE.user}>
						<h3 className="sr-only">{t.assistant.you}</h3>
						<p className="whitespace-pre-wrap text-ui">{a.pending}</p>
					</article>
					<p
						role="status"
						className={cn(BUBBLE.assistant, "flex-row items-center text-12 text-n-11")}
					>
						<StatusDot status="active" />
						{t.assistant.working}
						<LiveDot className="h-3.5 w-1.5 rounded-xs" />
					</p>
					{a.liveSteps.length ? (
						<section aria-label={t.extras.assistant.live} className="text-12 text-n-11">
							<Steps steps={a.liveSteps} />
						</section>
					) : null}
				</>
			) : null}
			<Changed files={a.changed} />
		</div>
	);
}
