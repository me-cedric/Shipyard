import { cn } from "@/lib/utils";
import { BRANDS, type Brand } from "./brands";

/** The brand of an id, a name or a URL: `claude`, `Claude Code`, `jira-cloud`, `https://openrouter.ai/api`. */
export function brandOf(text: string | null | undefined): Brand | undefined {
	if (!text) return undefined;
	// A URL names its product by its host, not by its path.
	const host = /^[a-z]+:\/\/([^/]+)/i.exec(text)?.[1];
	const words = ` ${(host ?? text)
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.join(" ")} `;
	return Object.values(BRANDS).find((b) => b.words.some((w) => words.includes(` ${w} `)));
}

/** The name of an AI tool from its id. An unknown id stays as it is. */
const RUNNER_NAME: Record<string, string> = {
	claude: "Claude Code",
	codex: "Codex",
	copilot: "GitHub Copilot",
	gemini: "Gemini CLI",
	opencode: "OpenCode",
};
export const runnerName = (id: string) => RUNNER_NAME[id] ?? id;

/** A dark brand colour disappears on the dark theme: it keeps the text colour. */
function shown(hex: string) {
	const n = Number.parseInt(hex.slice(1), 16);
	const light = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
	return light < 60 ? undefined : hex;
}

/**
 * The logo of a product, in the text colour, or in its brand colour with `colored`. A product with
 * no logo shows its first letter. With no `label` the logo is hidden from assistive technology:
 * put it next to the product name.
 */
export function BrandIcon({
	name,
	size = 16,
	label,
	colored,
	className,
}: {
	/** An id, a name or a URL. */
	name: string;
	size?: number;
	/** The accessible name, when no visible text names the product. */
	label?: string;
	colored?: boolean;
	className?: string;
}) {
	const brand = brandOf(name);
	// Hidden next to its visible name; named when it stands alone.
	const a11y = label
		? ({ role: "img", "aria-label": label } as const)
		: ({ "aria-hidden": true } as const);
	if (!brand) {
		return (
			<span
				{...a11y}
				style={{ width: size, height: size, fontSize: Math.round(size * 0.7) }}
				className={cn(
					"inline-flex shrink-0 items-center justify-center rounded-sm bg-n-4 font-mono leading-none text-n-11",
					className,
				)}
			>
				{Array.from((label ?? name).trim())[0]?.toUpperCase()}
			</span>
		);
	}
	const logo = (
		<svg
			aria-hidden="true"
			data-brand={brand.title}
			viewBox="0 0 24 24"
			width={size}
			height={size}
			fill={(colored && shown(brand.hex)) || "currentColor"}
			className={cn("shrink-0", !label && className)}
		>
			<path d={brand.path} />
		</svg>
	);
	return label ? (
		<span role="img" aria-label={label} className={cn("inline-flex shrink-0", className)}>
			{logo}
		</span>
	) : (
		logo
	);
}
