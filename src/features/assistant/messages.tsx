import { format, useI18n } from "@/lib/i18n";
import type { ChatMessage, FileDiff } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowDownTrayIcon, ArrowPathIcon, CheckIcon, ClipboardIcon } from "@/ui/icons";
import { DiffView } from "@/ui/molecules/diff-view";
import { RefChip } from "@/ui/molecules/ref-chip";
import { parseReply, replyOptions } from "./reply";
import type { Assistant } from "./use-assistant";

/** One line when the turn ends. The person expands it to see each tool call. */
function Trace({ steps }: { steps: ChatMessage["trace"] }) {
	const { t } = useI18n();
	if (!steps.length) return null;
	const total = steps.reduce((sum, s) => sum + s.ms, 0);
	return (
		<details className="text-12 text-n-11">
			<summary className="cursor-pointer">
				{t.assistant.trace} · {format(t.assistant.tools, { count: steps.length })} · {total} ms
			</summary>
			<ul className="flex flex-col font-mono text-11">
				{steps.map((s, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the steps never reorder
					<li key={i} className="flex gap-2">
						<span>{s.tool}</span>
						<span className="min-w-0 flex-1 truncate">{s.target}</span>
						<span>{s.ms} ms</span>
					</li>
				))}
			</ul>
		</details>
	);
}

function Code({ lang, file, text }: { lang: string; file: string; text: string }) {
	const { t } = useI18n();
	return (
		<figure className="rounded-md border border-n-7">
			<figcaption className="flex items-center gap-2 border-b border-n-7 px-2 text-12 text-n-11">
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
					// biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
					<Code key={i} {...p} />
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
					<p key={i} className="whitespace-pre-wrap text-ui">
						{p.text}
					</p>
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
				<div className="flex gap-1">
					<Button variant="ghost" onClick={() => copyText(m.text)}>
						<ClipboardIcon size={14} />
						{t.assistant.copy}
					</Button>
					<Button variant="ghost" disabled={!canInsert} onClick={() => insert(m.text)}>
						<ArrowDownTrayIcon size={14} />
						{t.assistant.insert}
					</Button>
				</div>
			) : null}
			{options.length ? (
				<ul aria-label={t.assistant.options} className="flex flex-col items-start gap-1">
					{options.map((o) => (
						<li key={o}>
							<Button onClick={() => void a.send(o)}>{o}</Button>
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
	return (
		<div
			role="log"
			aria-label={t.assistant.messages}
			className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2"
		>
			{list.map((m, i) => (
				<article
					// biome-ignore lint/suspicious/noArrayIndexKey: the transcript only grows
					key={i}
					aria-label={m.role === "user" ? t.assistant.you : t.assistant.assistant}
					className="flex flex-col gap-1"
				>
					<h3 className="text-11 text-n-10">
						{m.role === "user" ? t.assistant.you : t.assistant.assistant}
					</h3>
					{m.role === "user" ? (
						<p className="whitespace-pre-wrap text-ui">{m.text}</p>
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
			{a.pending !== null ? (
				<article className="flex flex-col gap-1">
					<h3 className="text-11 text-n-10">{t.assistant.you}</h3>
					<p className="whitespace-pre-wrap text-ui">{a.pending}</p>
					<p role="status" className="flex items-center gap-2 text-12 text-n-11">
						<StatusDot status="active" />
						{t.assistant.working}
					</p>
				</article>
			) : null}
			<Changed files={a.changed} />
		</div>
	);
}
