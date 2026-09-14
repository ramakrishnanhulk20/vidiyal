import { describe, expect, it } from "vitest";
import { open, seal, SealError, type Sealed } from "../../src/vendor/tenant/seal.js";

// One round trip through the vendored copy of Kaaval's seal, to prove the copy in
// src/vendor/tenant works in this repo. It does NOT cover the tampered field, the wrong
// key, the input checks or key rotation: those tests live in kaaval/test/tenant/seal.test.ts
// against the original, which is the file to edit first.

// Shaped like a Bitget key, but obviously not one: a secrets sweep should never have to
// stop and think about a test fixture.
const SECRET = "not-a-real-bitget-api-key-0123456789";
const KEY = "1".repeat(64);

describe("the vendored seal", () => {
  it("gives back exactly what was sealed, and hides it in between", () => {
    const sealed: Sealed = seal(SECRET, KEY);

    expect(sealed.v).toBe(1);
    expect(sealed.iv).toHaveLength(24);
    expect(sealed.tag).toHaveLength(32);
    expect(sealed.data).not.toContain(SECRET);
    expect(open(sealed, KEY)).toBe(SECRET);
    expect(() => open(sealed, "2".repeat(64))).toThrow(SealError);
  });
});
