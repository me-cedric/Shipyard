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
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { ArrowDownTrayIcon, LanguageIcon, TrashIcon } from "@/ui/icons";
import { Dialog } from "@/ui/organisms/dialog";

const PACK = "pack:";

/** The built-in languages, then each installed language pack (spec `languages`, REQ-001, REQ-006). */
export function LanguageSelect() {
	const { t, lang, pack, packs, setLang, setPack } = useI18n();
	return (
		<Select
			label={t.prefs.language}
			value={pack ? PACK + pack : lang}
			onValueChange={(v) => {
				if (v.startsWith(PACK)) setPack(v.slice(PACK.length));
				else setLang(LANGS.find((l) => l === v) ?? "en");
			}}
			items={[
				...LANGS.map((l) => ({ value: l, label: t.lang[l] })),
				...packs.map((p) => ({ value: PACK + p.code, label: p.name })),
			]}
		/>
	);
}

type Pending = { pack: LanguagePack } | { faults: string };

/** Settings / Me: import with a check, export the English base, remove, mark (REQ-005 to REQ-008). */
export function useLanguageRows() {
	const { t, pack, packs, setPacks, setPack, setLang, marked, setMarked } = useI18n();
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

	return [
		{
			id: "language-files",
			icon: <LanguageIcon size={14} />,
			label: p.languageFiles,
			control: (
				<span className="flex items-center gap-2">
					<Button variant="ghost" onClick={() => importPack().catch(logError)}>
						{p.importLanguage}
					</Button>
					<Button variant="ghost" onClick={() => exportBase().catch(logError)}>
						<ArrowDownTrayIcon size={14} />
						{p.exportLanguage}
					</Button>
					{dialog}
				</span>
			),
		},
		...(pack
			? [
					{
						id: "language-marks",
						icon: <LanguageIcon size={14} />,
						label: p.markUntranslated,
						control: (
							<Switch
								label={p.markUntranslated}
								iconOnly
								checked={marked}
								onCheckedChange={setMarked}
							/>
						),
					},
				]
			: []),
		...packs.map((x) => ({
			id: `language-${x.code}`,
			icon: <LanguageIcon size={14} />,
			label: x.name,
			control: (
				<IconButton
					label={format(p.removeLanguage, { name: x.name })}
					onClick={() => remove(x.code).catch(logError)}
				>
					<TrashIcon size={14} />
				</IconButton>
			),
		})),
	];
}
