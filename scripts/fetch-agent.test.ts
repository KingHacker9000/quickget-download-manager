import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExtensionOrigin, normalizeExtensionOrigins } from "./fetch-agent";

test("normalizeExtensionOrigin formats raw extension id", () => {
  assert.equal(
    normalizeExtensionOrigin("cggdadenihpmfnealcpjflneipnjhjnc"),
    "chrome-extension://cggdadenihpmfnealcpjflneipnjhjnc/"
  );
});

test("normalizeExtensionOrigin preserves full origin and trailing slash", () => {
  assert.equal(
    normalizeExtensionOrigin("chrome-extension://cggdadenihpmfnealcpjflneipnjhjnc"),
    "chrome-extension://cggdadenihpmfnealcpjflneipnjhjnc/"
  );
  assert.equal(
    normalizeExtensionOrigin("chrome-extension://cggdadenihpmfnealcpjflneipnjhjnc/"),
    "chrome-extension://cggdadenihpmfnealcpjflneipnjhjnc/"
  );
});

test("normalizeExtensionOrigins deduplicates and drops empty entries", () => {
  const actual = normalizeExtensionOrigins([
    " cggdadenihpmfnealcpjflneipnjhjnc ",
    "chrome-extension://cggdadenihpmfnealcpjflneipnjhjnc/",
    "",
    "  "
  ]);
  assert.deepEqual(actual, ["chrome-extension://cggdadenihpmfnealcpjflneipnjhjnc/"]);
});
