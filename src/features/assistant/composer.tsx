import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode, RefObject } from "react";
import { useI18n } from "@/lib/i18n";
import type { AssistantMode, Permission } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { PaperAirplaneIcon } from "@/ui/icons";
import { GaugeView } from "./gauge";
import type { Assistant } from "./use-assistant";

const MODES: AssistantMode[] = ["ask", "plan", "agent"];
const PERMISSIONS: Permission[] = ["approve", "auto"];
const DEFAULT = "default";
// An `@` token that ends the text: the ref that the person typed.
const TOKEN = /(^|\s)@(\S+)$/;

/** The pickers of the thread, the input and the one primary action. */
export function Composer({
	a,
	inputRef,
}: {
	a: Assistant;
	inputRef: RefObject<HTMLTextAreaElement | null>;
}): ReactNode {
	const { t } = useI18n();
	const s = a.current?.thread.settings;
	const runner = a.runners.find((r) => r.runner === s?.runner);
	const pick = (list: string[]) => [
		{ value: DEFAULT, label: t.assistant.default },
		...list.map((v) => ({ value: v, label: v })),
	];
	const value = (v: string | null | undefined) => v ?? DEFAULT;
	const back = (v: string) => (v === DEFAULT ? null : v);
	/** A completed `@ref` leaves the text and joins the context. */
	const takeRef = (text: string, end: RegExpExecArray) => {
		a.setDraft(text.slice(0, end.index + (end[1]?.length ?? 0)));
		if (end[2]) void a.addRef(end[2]);
	};
	return (
		<div className="m-2 mt-0 flex flex-col gap-2 rounded-xl border bg-surface-2 p-2 shadow-1">
			{s ? (
				<div className="flex flex-wrap gap-1">
					<ToggleGroup
						aria-label={t.assistant.mode.label}
						value={[s.mode]}
						onValueChange={(v) => {
							// A pressed pill stays pressed: one mode is always on.
							if (v[0]) void a.setSettings({ mode: v[0] as AssistantMode });
						}}
						className="flex w-full items-center gap-0.5 rounded-full border bg-n-2 p-0.5"
					>
						{MODES.map((m) => (
							<Toggle
								key={m}
								value={m}
								className="h-6 flex-1 rounded-full px-2 text-12 text-n-11 transition-colors duration-(--duration-fast) hover:text-n-12 data-[pressed]:bg-accent-gradient data-[pressed]:text-accent-fg data-[pressed]:shadow-1"
							>
								{t.assistant.mode[m]}
							</Toggle>
						))}
					</ToggleGroup>
					<Select
						label={t.assistant.runner}
						value={s.runner}
						items={a.runners.map((r) => ({ value: r.runner, label: r.runner }))}
						onValueChange={(r) => void a.setSettings({ runner: r })}
					/>
					<Select
						label={t.assistant.model}
						value={value(s.model)}
						items={pick(runner?.models ?? [])}
						onValueChange={(v) => void a.setSettings({ model: back(v) })}
					/>
					<Select
						label={t.assistant.effort}
						value={value(s.effort)}
						items={pick(runner?.efforts ?? [])}
						onValueChange={(v) => void a.setSettings({ effort: back(v) })}
					/>
					<Select
						label={t.assistant.permission.label}
						value={s.permission}
						disabled={s.mode !== "agent"}
						items={PERMISSIONS.map((p) => ({ value: p, label: t.assistant.permission[p] }))}
						onValueChange={(p) => void a.setSettings({ permission: p as Permission })}
					/>
				</div>
			) : null}
			<Textarea
				ref={inputRef}
				label={t.assistant.message}
				rows={3}
				value={a.draft}
				onChange={(e) => {
					const text = e.target.value;
					const done = TOKEN.exec(text.trimEnd());
					// A space after the token ends it. Without it the person is still typing.
					if (done && /\s$/.test(text)) takeRef(text.trimEnd(), done);
					else a.setDraft(text);
				}}
				onKeyDown={(e) => {
					if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
					e.preventDefault();
					const token = TOKEN.exec(a.draft);
					if (token) takeRef(a.draft, token);
					else void a.send(a.draft, true);
				}}
			/>
			<div className="flex items-center justify-between gap-2">
				{a.current ? <GaugeView gauge={a.current.gauge} /> : <span />}
				<Button
					variant="primary"
					disabled={!a.current || a.busy || !a.draft.trim()}
					onClick={() => void a.send(a.draft, true)}
				>
					<PaperAirplaneIcon size={14} />
					{t.assistant.send}
				</Button>
			</div>
		</div>
	);
}
