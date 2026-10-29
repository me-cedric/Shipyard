import { format, useI18n } from "@/lib/i18n";
import css from "@/ui/tokens/tokens.css?raw";

/** The colour tokens of the first `:root` block of `src/ui/tokens`, grouped by family. */
const ROOT = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
const GROUPS = ["neutral", "accent", "success", "warning", "danger", "info"] as const;
type Group = (typeof GROUPS)[number];

export const TOKENS = [...ROOT.matchAll(/--([\w-]+):\s*([^;]+);/g)]
	.filter((m) => m[2]?.includes("oklch("))
	.map((m) => {
		const name = m[1] ?? "";
		const family = name.startsWith("n-") ? "neutral" : (name.split("-")[0] as Group);
		return { name: `--${name}`, value: m[2]?.trim() ?? "", family };
	});

/**
 * Design / Screens: the tokens of the app. No Figma connection exists, so this is the one token
 * source (REQ-024, Q-101). The view only reads: it changes no file.
 */
export function TokenView() {
	const { t } = useI18n();
	const s = t.design.screens;
	return (
		// The region scrolls, so the keyboard needs to reach it (axe `scrollable-region-focusable`).
		<section
			aria-label={s.tokens}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must take the focus
			tabIndex={0}
			className="min-h-0 overflow-auto"
		>
			{GROUPS.map((g) => {
				const rows = TOKENS.filter((x) => x.family === g);
				return (
					<div key={g}>
						<h3 className="py-1 text-12 font-medium text-n-11">
							{format(t.count, { name: s.tokenGroups[g], count: rows.length })}
						</h3>
						<ul>
							{rows.map((r) => (
								<li key={r.name} className="flex h-row items-center gap-2 border-b text-12">
									<span
										aria-hidden="true"
										className="size-4 shrink-0 rounded-sm border"
										style={{ background: `var(${r.name})` }}
									/>
									<span className="font-mono">{r.name}</span>
									<span className="min-w-0 flex-1 truncate font-mono text-n-11" title={r.value}>
										{r.value}
									</span>
								</li>
							))}
						</ul>
					</div>
				);
			})}
		</section>
	);
}
