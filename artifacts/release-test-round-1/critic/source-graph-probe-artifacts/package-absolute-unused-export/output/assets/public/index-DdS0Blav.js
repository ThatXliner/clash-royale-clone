//#region \0rolldown/runtime.js
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
//#endregion
//#region \0vite/modulepreload-polyfill.js
function init_modulepreload_polyfill() {
	return (init_modulepreload_polyfill = __esmMin((() => {
		(function polyfill() {
			const relList = document.createElement("link").relList;
			if (relList && relList.supports && relList.supports("modulepreload")) return;
			for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
			new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					if (mutation.type !== "childList") continue;
					for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
				}
			}).observe(document, {
				childList: true,
				subtree: true
			});
			function getFetchOpts(link) {
				const fetchOpts = {};
				if (link.integrity) fetchOpts.integrity = link.integrity;
				if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
				if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
				else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
				else fetchOpts.credentials = "same-origin";
				return fetchOpts;
			}
			function processPreload(link) {
				if (link.ep) return;
				link.ep = true;
				const fetchOpts = getFetchOpts(link);
				fetch(link.href, fetchOpts);
			}
		})();
	})))();
}
//#endregion
//#region ../../../../../../private/var/folders/7l/qx4ns2fn79n6g7l7c1b5p0100000gp/T/release-source-graph-probes-P8fvzH/package-absolute-unused-export/public/index.html
function init_public() {
	return (init_public = __esmMin((() => {
		init_modulepreload_polyfill();
	})))();
}
//#endregion
init_public();
