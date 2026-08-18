import { describe, expect, it } from "vitest";
import { INTENT_ASSETS } from "./capability-templates";
import { challengeToIntentDraft } from "./challenge-draft";

describe("challengeToIntentDraft", () => {
  it("copies only the human goal and typed capability parameters", () => {
    expect(challengeToIntentDraft({
      displayGoal: "Exchange 10 USDG for at least 9.95 USDt0.",
      policyTemplate: {
        version: 1,
        capabilityTemplateId: "exact-input-swap",
        parameters: {
          inputToken: INTENT_ASSETS[0].address,
          outputToken: INTENT_ASSETS[1].address,
          amount: "10",
          minimum: "9.95",
        },
      },
    })).toEqual({
      goal: "Exchange 10 USDG for at least 9.95 USDt0.",
      values: {
        templateId: "exact-input-swap",
        inputToken: INTENT_ASSETS[0].address,
        outputToken: INTENT_ASSETS[1].address,
        amount: "10",
        minimum: "9.95",
      },
    });
  });

  it("rejects unknown fields instead of carrying challenge authority forward", () => {
    expect(() => challengeToIntentDraft({
      displayGoal: "Malicious challenge",
      policyTemplate: {
        version: 1,
        capabilityTemplateId: "aave-supply",
        parameters: {
          inputToken: INTENT_ASSETS[0].address,
          amount: "10",
          owner: "0x1111111111111111111111111111111111111111",
        },
      },
    })).toThrow("Challenge policy template is invalid");
  });
});
