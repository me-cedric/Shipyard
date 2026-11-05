import { screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { BrandIcon, brandOf, runnerName } from "./brand-icon";

describe("BrandIcon (spec:visual-cues#REQ-001, REQ-002)", () => {
	it("finds the brand of an id, a name or a URL", () => {
		expect(brandOf("claude")?.title).toBe("Claude");
		expect(brandOf("Claude Code")?.title).toBe("Claude");
		expect(brandOf("GitHub Copilot")?.title).toBe("GitHub Copilot");
		expect(brandOf("jira-cloud")?.title).toBe("Jira");
		expect(brandOf("https://openrouter.ai/api/v1")?.title).toBe("OpenRouter");
		expect(brandOf("Google Cloud")?.title).toBe("Google Cloud");
		expect(brandOf("Google Chrome")?.title).toBe("Google Chrome");
		expect(brandOf("https://gitlab.example.com/acme/linear")?.title).toBe("GitLab");
		expect(brandOf("azure-dev-ops")).toBeUndefined();
		expect(brandOf("")).toBeUndefined();
	});

	it("draws a known logo in the text colour and hides it next to its name", () => {
		const { container } = renderApp(<BrandIcon name="github" />);
		const svg = container.querySelector("svg");
		expect(svg).toHaveAttribute("data-brand", "GitHub");
		expect(svg).toHaveAttribute("fill", "currentColor");
		expect(svg).toHaveAttribute("aria-hidden", "true");
	});

	it("draws the brand colour on request, but not a near-black one", () => {
		const { container } = renderApp(
			<>
				<BrandIcon name="gitlab" colored />
				<BrandIcon name="github" colored />
			</>,
		);
		const [gitlab, github] = container.querySelectorAll("svg");
		expect(gitlab).toHaveAttribute("fill", "#FC6D26");
		expect(github).toHaveAttribute("fill", "currentColor");
	});

	it("shows the first letter of an unknown product", () => {
		const { container } = renderApp(<BrandIcon name="acme-tool" />);
		expect(container.querySelector("[data-brand]")).toBeNull();
		expect(container.firstElementChild).toHaveTextContent("A");
		expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
	});

	it("names a logo that stands alone", () => {
		renderApp(<BrandIcon name="github" label="GitHub" />);
		expect(screen.getByRole("img", { name: "GitHub" })).toBeInTheDocument();
		renderApp(<BrandIcon name="opencode" label="OpenCode" />);
		expect(screen.getByRole("img", { name: "OpenCode" })).toHaveTextContent("O");
	});

	it("names an AI tool from its id", () => {
		expect(runnerName("claude")).toBe("Claude Code");
		expect(runnerName("qwen")).toBe("qwen");
	});
});
