import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/** Add a word: the word and its meaning go into `docs/glossary.md` (`spec:library-functions#REQ-005`). */
export function AddWord() {
	const { t } = useI18n();
	const f = t.library.fn.learn;
	const qc = useQueryClient();
	const { failure, run } = useGuard();
	const [open, setOpen] = useState(false);
	const [term, setTerm] = useState("");
	const [meaning, setMeaning] = useState("");
	if (!open)
		return (
			<span>
				<Button variant="ghost" className="-ml-4.75 min-h-control" onClick={() => setOpen(true)}>
					{f.addWord}
				</Button>
			</span>
		);
	const save = () =>
		run(async () => {
			await unwrap(commands.glossaryAddWord(term, meaning, true));
			await qc.invalidateQueries({ queryKey: ["knowledge"] });
			setTerm("");
			setMeaning("");
			setOpen(false);
		});
	return (
		<form
			className="flex flex-col gap-2"
			onKeyDown={(e) => {
				if (e.key === "Escape") setOpen(false);
			}}
			onSubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<Input label={f.word} caption value={term} onChange={(e) => setTerm(e.target.value)} />
			<Input
				label={f.meaning}
				caption
				value={meaning}
				onChange={(e) => setMeaning(e.target.value)}
			/>
			<ErrorNotice error={failure} />
			<div className="flex gap-2">
				<RightButton
					right="knowledge.edit"
					type="submit"
					variant="primary"
					disabled={!term.trim() || !meaning.trim()}
				>
					{f.add}
				</RightButton>
				<Button variant="ghost" onClick={() => setOpen(false)}>
					{t.knowledge.learn.cancel}
				</Button>
			</div>
		</form>
	);
}
