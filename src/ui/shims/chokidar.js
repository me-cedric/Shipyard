// Browser stub: chokidar is only used by likec4's filesystem-watch path,
// which is never reached under LikeC4.fromSource().
const notAvailable = () => {
	throw new Error("file watching is not available in the browser");
};
export default { watch: notAvailable };
export const watch = notAvailable;
