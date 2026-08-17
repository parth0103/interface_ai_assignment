import { describe, expect, it } from "vitest";
import { findMembersById, getMemberByRecordId } from "../../apps/loan-portal/src/data.js";

describe("loan portal synthetic data", () => {
  it("provides the happy path member with an active pre-approved auto loan offer", () => {
    const results = findMembersById("24816");
    expect(results).toHaveLength(1);
    const member = getMemberByRecordId(results[0].recordId);
    expect(member?.displayName).toBe("Maya Chen");
    expect(member?.offers[0]).toMatchObject({
      offerId: "OFFER-4421",
      type: "auto_loan",
      status: "active",
      apr: "6.49%",
      maxAmount: "$25,000",
      termMonths: 60
    });
  });

  it("provides a member with no active pre-approved auto loan offer", () => {
    const member = getMemberByRecordId(findMembersById("99999")[0].recordId);
    expect(member?.displayName).toBe("Jordan Rivera");
    expect(member?.offers).toHaveLength(0);
  });

  it("provides an ambiguous member search result", () => {
    const results = findMembersById("77777");
    expect(results.map((result) => result.displayName)).toEqual(["Avery Patel", "Avery Patel"]);
    expect(results.map((result) => result.dobHint)).toEqual(["1984", "1991"]);
  });

  it("provides an offer that requires a disclosure warning path", () => {
    const member = getMemberByRecordId(findMembersById("55555")[0].recordId);
    expect(member?.displayName).toBe("Sam Morgan");
    expect(member?.flags).toContain("special_handling_notice");
  });
});
