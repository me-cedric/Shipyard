// Browser stub: nano-spawn shells out to the `dot` binary. In the browser
// likec4 uses the WASM graphviz layouter, so this is never called.
export class SubprocessError extends Error {}
const spawn = async () => {
	throw new Error("subprocess spawning is not available in the browser");
};
export default spawn;
