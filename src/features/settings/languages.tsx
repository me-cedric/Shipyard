import { useState } from "react";
import { format, LANGS, useI18n } from "@/lib/i18n";
import { baseMessages, packFaults, starterPack } from "@/lib/i18n/packs";
import {
	commands,
	type LanguagePack,
	pickTheme as pickJson,
	saveAs,
	toFailure,
	unwrap,
} from "@/lib/ipc";
import { logError } from "@/lib/log";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Segmented } from "@/ui/atoms/segmented";
import { ArrowDownTrayIcon, TrashIcon } from "@/ui/icons";
import { Dialog } from "@/ui/organisms/dialog";
import { Fold } from "./connections/fold";
import { SetupRow, Toggle } from "./parts";

const PACK = "pack:";

type Pending = { pack: LanguagePack } | { faults: string };

/** Import with a check, export the English base, remove, mark (REQ-005 to REQ-008). */
export function useLanguageFiles() {
	const { t, pack, setPacks, setPack, setLang } = useI18n();
	const p = t.prefs;
	const [pending, setPending] = useState<Pending | null>(null);

	const importPack = async () => {
		const path = await pickJson();
		if (!path) return;
		try {
			const read = await unwrap(commands.languageRead(path));
			const faults = packFaults(read.messages);
			setPending(faults.length ? { faults: faults.join("\n") } : { pack: read });
		} catch (e) {
			setPending({ faults: toFailure(e).details });
		}
	};
	const add = async (next: LanguagePack) => {
		setPacks(await unwrap(commands.languageAdd(next)));
		setPack(next.code);
		setPending(null);
	};
	const exportBase = async () => {
		const path = await saveAs("shipyard-language", "json");
		if (path) await unwrap(commands.languageExport(path, starterPack(p.newLanguage)));
	};
	const remove = async (code: string) => {
		setPacks(await unwrap(commands.languageRemove(code)));
		if (pack === code) setLang("en");
	};

	const total = Object.keys(baseMessages()).length;
	const dialog = (
		<Dialog
			open={pending !== null}
			onOpenChange={(open) => !open && setPending(null)}
			title={pending && "pack" in pending ? pending.pack.name : p.languageFaults}
			actions={
				pending && "pack" in pending ? (
					<Button onClick={() => add(pending.pack).catch(logError)}>{p.addLanguage}</Button>
				) : null
			}
		>
			{pending && "pack" in pending ? (
				<p className="text-14 text-n-12">
					{format(p.translated, {
						count: Object.keys(pending.pack.messages).length,
						total,
					})}
				</p>
			) : null}
			{pending && "faults" in pending ? (
				<ul className="flex max-h-80 flex-col gap-1 overflow-auto font-mono text-12 text-danger-text">
					{pending.faults.split("\n").map((f, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: two faults can have the same text
						<li key={i}>{f}</li>
					))}
				</ul>
			) : null}
		</Dialog>
	);

	return { importPack, exportBase, remove, dialog };
}

/** The built-in languages and each installed pack as one choice, then the import of a pack. The files are under a row. */
export function LanguageRows() {
	const { t, lang, pack, packs, setLang, setPack, marked, setMarked } = useI18n();
	const p = t.prefs;
	const { importPack, exportBase, remove, dialog } = useLanguageFiles();
	const items = [
		...LANGS.map((l) => ({ value: l as string, label: t.lang[l] })),
		...packs.map((x) => ({ value: PACK + x.code, label: x.name })),
	];
	return (
		<>
			<div className="flex min-h-15 flex-wrap items-center gap-3 px-6 py-2.5">
				<div className="min-w-0 flex-[1_1_20rem]">
					<Segmented
						label={p.language}
						value={pack ? PACK + pack : lang}
						onValueChange={(v) => {
							if (v.startsWith(PACK)) setPack(v.slice(PACK.length));
							else setLang(LANGS.find((l) => l === v) ?? "en");
						}}
						items={items}
					/>
				</div>
				<Button variant="secondary" onClick={() => importPack().catch(logError)}>
					{t.personal.setup.importLanguage}
				</Button>
			</div>
			<Fold label={p.languageFiles}>
				<SetupRow label={p.exportLanguage}>
					<Button variant="secondary" onClick={() => exportBase().catch(logError)}>
						<ArrowDownTrayIcon size={14} />
						{p.exportLanguage}
					</Button>
				</SetupRow>
				{pack ? (
					<SetupRow label={p.markUntranslated}>
						<Toggle label={p.markUntranslated} checked={marked} onCheckedChange={setMarked} />
					</SetupRow>
				) : null}
				{packs.map((x) => (
					<SetupRow key={x.code} label={x.name}>
						<IconButton
							label={format(p.removeLanguage, { name: x.name })}
							onClick={() => remove(x.code).catch(logError)}
						>
							<TrashIcon size={14} />
						</IconButton>
					</SetupRow>
				))}
			</Fold>
			{dialog}
		</>
	);
}
