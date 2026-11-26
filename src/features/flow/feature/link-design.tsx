import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useDesignList } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { commands, toFailure } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { type Change, useSpecsActions } from "@/lib/specs";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Dialog } from "@/ui/organisms/dialog";

/** The kinds that the Diagrams card lists. */
export const DIAGRAMS = ["diagram", "model", "api", "data", "flow"];
/** The refs of design items in a text. */
export const DESIGN_REF = /\b(?:screen|diagram|model|api|data|flow):[\w-]+/g;

const HEADING = "## Design items";
// The heading may be on the first line, and the file may use CRLF.
const HEADING_LINE = /^## Design items[ \t]*\r?$/m;
/** Longer than this, the list gets a search field. */
const LONG = 8;

export const proposalPath = (c: Change) => `${c.path}/proposal.md`;

/** The text with `ref` on a new line under the design heading, or `null` when it is there already. */
export function addRef(text: string, ref: string): string | null {
	if (new Set(text.match(DESIGN_REF)).has(ref)) return null;
	const m = HEADING_LINE.exec(text);
	if (!m) return `${text.trimEnd()}\n\n${HEADING}\n\n- ${ref}\n`;
	const from = m.index + m[0].length;
	const next = text.indexOf("\n## ", from);
	const end = next < 0 ? text.length : next;
	return `${text.slice(0, end).trimEnd()}\n- ${ref}\n${next < 0 ? "" : text.slice(end)}`;
}

/** Links a screen or a diagram of the Library to the feature: its ref goes in the proposal of the change. */
export function LinkDesign({ kind, change }: { kind: "screen" | "diagram"; change: Change }) {
	const { t } = useI18n();
	const b = t.flow.look.brief;
	const act = useSpecsActions();
	const { failure, busy, run } = useGuard();
	const [open, setOpen] = useState(false);
	const [find, setFind] = useState("");
	const [picked, setPicked] = useState<string | null>(null);
	const all = (useDesignList().data?.artifacts ?? []).filter((a) =>
		kind === "screen" ? a.kind === "screen" : DIAGRAMS.includes(a.kind),
	);
	const q = find.toLowerCase();
	const shown = all.filter((a) => `${a.title} ${a.reference}`.toLowerCase().includes(q));
	const label = kind === "screen" ? b.linkScreen : b.linkDiagram;
	// A run with no work clears the failure of the last one.
	const reset = (o: boolean) => {
		setOpen(o);
		setPicked(null);
		setFind("");
		void run(async () => {});
	};
	const link = () =>
		run(async () => {
			if (!picked) return;
			const path = proposalPath(change);
			const read = await commands.specsRead(path);
			// A change with no proposal yet gets one.
			if (read.status === "error" && !/no such file|not found/i.test(toFailure(read.error).details))
				throw toFailure(read.error);
			const now = read.status === "ok" ? read.data : null;
			const text = addRef(now?.text ?? `# ${change.title}\n`, picked);
			if (text !== null) {
				const w = await act.write(path, text, now?.stamp ?? null, !now);
				if (w.conflict) throw new Error(t.specs.question.conflict);
			}
			reset(false);
		});
	return (
		<>
			<RightButton right="specs.edit" onClick={() => setOpen(true)}>
				{label}
			</RightButton>
			<Dialog
				open={open}
				onOpenChange={reset}
				title={label}
				actions={
					<RightButton
						right="specs.edit"
						variant="primary"
						disabled={!picked}
						busy={busy}
						onClick={() => void link()}
					>
						{b.link}
					</RightButton>
				}
			>
				{all.length > LONG ? (
					<Input label={t.common.search} value={find} onChange={(e) => setFind(e.target.value)} />
				) : null}
				{shown.length ? (
					<div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
						{shown.map((a) => (
							<Button
								key={a.reference}
								role="radio"
								aria-checked={picked === a.reference}
								variant={picked === a.reference ? "primary" : "secondary"}
								className="justify-start"
								onClick={() => setPicked(a.reference)}
							>
								{a.title || a.reference}
							</Button>
						))}
					</div>
				) : (
					<p className="text-n-11">{b.nothingToLink}</p>
				)}
				<ErrorNotice error={failure} />
			</Dialog>
		</>
	);
}
