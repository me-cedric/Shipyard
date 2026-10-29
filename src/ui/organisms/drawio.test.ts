import { isDrawioXml, svgDataUri, xmlFromDrawioSvg } from "./drawio";

const BOARD = `<svg xmlns="http://www.w3.org/2000/svg" content="&lt;mxfile&gt;&lt;diagram name=&quot;a&amp;amp;b&quot;/&gt;&lt;/mxfile&gt;"><rect/></svg>`;

describe("drawio", () => {
	it("reads the model out of a .drawio.svg", () => {
		expect(xmlFromDrawioSvg(BOARD)).toBe('<mxfile><diagram name="a&amp;b"/></mxfile>');
	});
	it("answers empty for a plain SVG or a broken file", () => {
		expect(xmlFromDrawioSvg('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe("");
		expect(xmlFromDrawioSvg("<svg")).toBe("");
	});
	it("tells a draw.io XML from another text", () => {
		expect(isDrawioXml("<mxfile><diagram/></mxfile>")).toBe(true);
		expect(isDrawioXml("<html/>")).toBe(false);
		expect(isDrawioXml("<mxfile")).toBe(false);
	});
	it("encodes the SVG for an image", () => {
		expect(svgDataUri("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
	});
});
