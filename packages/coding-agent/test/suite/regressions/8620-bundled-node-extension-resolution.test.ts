import { afterAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
	const originalBundledNode = Object.getOwnPropertyDescriptor(globalThis, "PI_BUNDLED_NODE");
	Object.defineProperty(globalThis, "PI_BUNDLED_NODE", {
		configurable: true,
		value: true,
	});
	return {
		originalBundledNode,
		createJiti: vi.fn((_id: unknown, _options: unknown) => ({
			import: vi.fn(async () => () => {}),
		})),
	};
});

vi.mock("jiti/static", () => ({ createJiti: state.createJiti }));
vi.mock("node:fs", async (importOriginal) => {
	const fs = await importOriginal<typeof import("node:fs")>();
	return {
		...fs,
		existsSync: (path: Parameters<typeof fs.existsSync>[0]) => String(path).includes("/dist/") || fs.existsSync(path),
	};
});

import { loadExtensions } from "../../../src/core/extensions/loader.ts";

interface JitiOptionsProbe {
	alias?: Record<string, string>;
	tryNative?: boolean;
	virtualModules?: Record<string, unknown>;
}

afterAll(() => {
	if (state.originalBundledNode) {
		Object.defineProperty(globalThis, "PI_BUNDLED_NODE", state.originalBundledNode);
	} else {
		Reflect.deleteProperty(globalThis, "PI_BUNDLED_NODE");
	}
});

describe("bundled Node extension loading", () => {
	// Regression test for https://github.com/earendil-works/pi/issues/8620
	it("resolves import.meta.resolve through filesystem aliases while keeping virtual imports", async () => {
		const result = await loadExtensions(["/extension.ts"], "/");

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(1);
		expect(state.createJiti).toHaveBeenCalledOnce();

		const options = state.createJiti.mock.calls[0][1] as JitiOptionsProbe;
		expect(options.tryNative).toBe(false);
		expect(options.virtualModules?.["@earendil-works/pi-coding-agent"]).toBeDefined();
		expect(options.alias?.["@earendil-works/pi-coding-agent"]).toMatch(/index\.js$/);
	});
});
