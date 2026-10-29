// Browser stub: fdir is only used to crawl the filesystem in fromWorkspace().
class fdir {
	withFullPaths() {
		return this;
	}
	withBasePath() {
		return this;
	}
	glob() {
		return this;
	}
	exclude() {
		return this;
	}
	crawl() {
		return {
			sync: () => [],
			withPromise: async () => [],
		};
	}
}

export { fdir };
export default { fdir };
