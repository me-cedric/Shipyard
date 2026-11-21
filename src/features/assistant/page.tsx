import { useRouter } from "@tanstack/react-router";
import { useContext, useRef } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";
import { Switch } from "@/ui/atoms/switch";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { CodexTrust } from "./codex-trust";
import { Composer } from "./composer";
import { useEditorTarget } from "./insert";
import { Messages } from "./messages";
import { NoCli, useRunnersMissing } from "./no-cli";
import { usePermission } from "./permission";
import { SelectionCard } from "./selection-actions";
import { Threads } from "./threads";
import { type Assistant, AssistantContext, MAX_WIDTH, MIN_WIDTH } from "./use-assistant";

const HEAD = "px-6 pt-3.5 pb-1.5 font-semibold text-13 text-n-11";
const LINE = "flex min-h-15 flex-wrap items-center gap-3 px-6 [&+&]:border-t [&+&]:border-n-4";

/**
 * The switches of "The assistant may". Edit files alone is the level Auto; Run commands alone is
 * the level Bypass, for a tool that has it. Both off is Edit with approval. A warning shows first.
 */
function May({ a }: { a: Assistant }) {
	const { t } = useI18n();
	const { levels, pick, dialogs } = usePermission(a);
	const level = a.current?.thread.settings.permission;
	if (!level) return null;
	const p = t.assistant.page;
	return (
		<Card className="py-2">
			<h2 className={HEAD}>{p.may}</h2>
			<div className={LINE}>
				<span className="flex-1 font-medium">{p.editAlone}</span>
				<Switch
					iconOnly
					label={p.editAlone}
					checked={level === "auto" || level === "bypass"}
					disabled={!levels.includes("auto")}
					onCheckedChange={(on) =>
						on ? pick("auto") : void a.setSettings({ permission: "approve" })
					}
				/>
			</div>
			{levels.includes("bypass") ? (
				<div className={LINE}>
					<span className="flex-1 font-medium">{p.runAlone}</span>
					<Switch
						iconOnly
						label={p.runAlone}
						checked={level === "bypass"}
						onCheckedChange={(on) =>
							on ? pick("bypass") : void a.setSettings({ permission: "auto" })
						}
					/>
				</div>
			) : null}
			{dialogs}
		</Card>
	);
}

/** The side and the width of the small panel. */
function PanelCard({ a }: { a: Assistant }) {
	const { t } = useI18n();
	const p = t.assistant.page;
	return (
		<Card className="py-2">
			<h2 className={HEAD}>{p.panel}</h2>
			<div className={LINE}>
				<span className="flex-1 font-medium">{p.side}</span>
				<div className="flex-none">
					<Segmented
						label={p.side}
						value={a.side}
						onValueChange={a.setSide}
						items={[
							{ value: "left", label: p.left },
							{ value: "right", label: p.right },
						]}
					/>
				</div>
			</div>
			<label className={LINE}>
				<span className="flex-1 font-medium">{t.assistant.width}</span>
				<input
					type="range"
					min={MIN_WIDTH}
					max={MAX_WIDTH}
					step={20}
					value={a.width}
					aria-valuetext={`${a.width} px`}
					// The pref is written when the person lets go, not on each step.
					onChange={(e) => a.setWidth(Number(e.target.value), false)}
					onPointerUp={() => a.setWidth(a.width)}
					onKeyUp={() => a.setWidth(a.width)}
					className="min-h-control w-32 accent-accent"
				/>
			</label>
		</Card>
	);
}

/**
 * The Ask page, the full assistant: the threads, the conversation with the composer, and the tools.
 * "Small bar" goes back to the side panel. spec:app-redesign#REQ-005
 */
export function AssistantPage() {
	const { t } = useI18n();
	const a = useContext(AssistantContext);
	const { openRef, setAssistantOpen } = useShell();
	const router = useRouter();
	const page = useRef<HTMLDivElement>(null);
	const input = useRef<HTMLTextAreaElement>(null);
	const editor = useEditorTarget(page);
	const missing = useRunnersMissing();
	if (!a) return null;
	return (
		<div ref={page} data-selection-page className="flex h-full min-h-0 flex-col">
			<PageHeader
				title={t.assistant.page.title}
				action={
					<Button
						onClick={() => {
							setAssistantOpen(true);
							// A page that opened first has no way back: it goes to the start.
							if (router.history.canGoBack()) router.history.back();
							else void router.navigate({ to: "/" });
						}}
					>
						{t.assistant.page.smallBar}
					</Button>
				}
			/>
			<div className="grid min-h-0 flex-1 grid-cols-[250px_minmax(0,3fr)_minmax(280px,1.5fr)] gap-6 px-4 pb-6">
				{/* A scroll area clips sideways too: the room keeps the outline of the open thread and the focus ring whole. */}
				<div className="-m-1 min-h-0 overflow-y-auto p-1">
					<Threads a={a} full />
				</div>
				<div className="flex min-h-0 min-w-0 flex-col gap-4">
					<Messages
						a={a}
						full
						insert={editor.insert}
						canInsert={editor.canInsert}
						onOpenRef={openRef}
					/>
					{a.alert ? (
						<p role="alert" className="rounded-field bg-warning-soft px-4 py-2 text-warning-text">
							{format(t.assistant.alert, { name: a.alert })}
						</p>
					) : null}
					{a.error ? (
						<p role="alert" className="rounded-field bg-danger-soft px-4 py-2 text-danger-text">
							{a.error}
						</p>
					) : null}
					{missing.none ? (
						<NoCli runners={missing.runners} />
					) : (
						<Composer a={a} inputRef={input} full onOpenRef={openRef} />
					)}
				</div>
				<div className="-m-1 flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-1">
					<SelectionCard a={a} />
					<May a={a} />
					{a.current?.thread.settings.runner === "codex" ? <CodexTrust card /> : null}
					<PanelCard a={a} />
				</div>
			</div>
		</div>
	);
}
