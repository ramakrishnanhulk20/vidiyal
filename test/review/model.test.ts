import { afterEach, describe, expect, it } from "vitest";
import { deskModel } from "../../src/review/model.js";
import { AnthropicClient, OpenAiCompatibleClient } from "../../src/vendor/llm.js";

const KEYS = ["QWEN_API_KEY", "ANTHROPIC_API_KEY"] as const;
const before = Object.fromEntries(KEYS.map((name) => [name, process.env[name]]));

function set(values: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const name of KEYS) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

afterEach(() => {
  set(Object.fromEntries(KEYS.map((name) => [name, before[name]])));
});

describe("deskModel", () => {
  it("takes Qwen when both keys are set, so a host whose Anthropic credit ended keeps answering", () => {
    set({ QWEN_API_KEY: "q", ANTHROPIC_API_KEY: "a" });
    expect(deskModel()).toBeInstanceOf(OpenAiCompatibleClient);
  });

  it("falls back to Claude on a host with no Qwen key", () => {
    set({ ANTHROPIC_API_KEY: "a" });
    expect(deskModel()).toBeInstanceOf(AnthropicClient);
  });

  it("is null with no key, which leaves notes ungraded and lets the evidence table write the answer", () => {
    set({});
    expect(deskModel()).toBeNull();
  });
});
