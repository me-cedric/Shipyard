import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { AskedQuestion_Serialize, QuestionChoice } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { Button } from "../atoms/button";
import { Input } from "../atoms/input";
import { StatusDot } from "../atoms/status-dot";

export type FoldPreview = { lines: string[]; onFold: () => void; disabled?: boolean };

const STATE_VARIANT = { open: "warning", answered: "success", withdrawn: "neutral" } as const;

/**
 * One question of a run (questions-loop REQ-008, REQ-011, REQ-015, REQ-020). Digits pick an option
 * and Enter sends. The recommended option has a circle and a green border. An unclear reply shows
 * above the options: the person decides on this card. An answered spec question offers its fold.
 */
export function QuestionCard({
	question: q,
	meta,
	fold,
	onAnswer,
}: {
	question: AskedQuestion_Serialize;
	/** The run chip and the ticket key. */
	meta?: ReactNode;
	fold?: FoldPreview;
	onAnswer: (choice: QuestionChoice) => void;
}) {
	const { t } = useI18n();
	const h = t.home;
	const open = q.state === "open";
	const group = useId();
	const [n, setN] = useState<number | null>(q.recommended >= 1 ? q.recommended : null);
	const [text, setText] = useState("");
	const choice: QuestionChoice | null = text.trim()
		? { kind: "text", text: text.trim() }
		: n !== null
			? { kind: "option", n }
			: null;
	const send = () => choice && onAnswer(choice);
	const pick = (i: number) => {
		setN(i);
		setText("");
	};
	const onKeyDown = (e: KeyboardEvent) => {
		if (!open) return;
		if (e.key === "Enter") {
			e.preventDefault();
			send();
		} else if (
			!(e.target instanceof HTMLInputElement && e.target.type === "text") &&
			/^[1-9]$/.test(e.key)
		) {
			if (Number(e.key) <= q.options.length) pick(Number(e.key));
		}
	};
	const given = q.answer?.choice;
	return (
		<section
			aria-label={q.id}
			onKeyDown={onKeyDown}
			className="flex flex-col gap-2 border-b px-3 py-2"
		>
			<div className="flex items-center gap-2">
				{meta}
				<Badge variant={STATE_VARIANT[q.state]} className="ml-auto">
					{h.state[q.state]}
				</Badge>
			</div>
			<p className="text-ui font-medium">{q.question}</p>
			{q.unclear ? (
				<p
					role="note"
					aria-label={h.unclear}
					className="rounded-md border border-warning px-2 py-1 text-ui"
				>
					{q.unclear}
				</p>
			) : null}
			{q.edited ? <p className="text-12 text-warning-text">{h.edited}</p> : null}
			{open ? (
				<>
					<fieldset aria-label={q.question} className="flex flex-col gap-1">
						{q.options.map((label, i) => {
							const num = i + 1;
							const recommended = num === q.recommended;
							return (
								<label
									key={label}
									className={cn(
										"flex items-center gap-2 rounded-md border px-2 py-1 text-ui transition-colors duration-(--duration-fast) hover:bg-n-3",
										recommended ? "border-success" : "border-n-7",
									)}
								>
									<input
										type="radio"
										name={group}
										checked={n === num && !text.trim()}
										onChange={() => pick(num)}
									/>
									<span className="font-mono text-n-11">{num}</span>
									<span className="flex-1">{label}</span>
									{recommended ? <StatusDot status="success" label={h.recommended} /> : null}
								</label>
							);
						})}
					</fieldset>
					<div className="flex items-center gap-2">
						{q.free_text ? (
							<Input
								label={h.answer}
								value={text}
								onChange={(e) => {
									setText(e.target.value);
									if (e.target.value.trim()) setN(null);
								}}
							/>
						) : null}
						<Button variant="primary" className="ml-auto" disabled={!choice} onClick={send}>
							{h.send}
						</Button>
					</div>
				</>
			) : given ? (
				<p className="text-ui text-n-11">
					{given.kind === "option" ? q.options[given.n - 1] : given.text}
				</p>
			) : null}
			{fold ? (
				<div className="flex items-end gap-2">
					<fieldset
						aria-label={t.specs.question.preview}
						className="flex flex-1 flex-col gap-1 font-mono text-12"
					>
						{fold.lines.map((l) => (
							<span
								key={l}
								className={l.startsWith("-") ? "text-danger-text" : "text-success-text"}
							>
								{l}
							</span>
						))}
					</fieldset>
					<Button variant="primary" disabled={fold.disabled} onClick={fold.onFold}>
						{t.specs.question.fold}
					</Button>
				</div>
			) : null}
		</section>
	);
}
