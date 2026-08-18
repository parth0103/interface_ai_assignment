import { describe, expect, it } from "vitest";
import { redactParams, substituteParams } from "../../src/shared/params.js";

describe("parameter helpers", () => {
  it("substitutes double-brace params inside strings", () => {
    expect(substituteParams("member {{member_id}} uses {{vehicle_type}}", {
      member_id: "24816",
      vehicle_type: "used"
    })).toBe("member 24816 uses used");
  });

  it("leaves non-template values unchanged", () => {
    expect(substituteParams(60, { member_id: "24816" })).toBe(60);
    expect(substituteParams({ value: "{{member_id}}" }, { member_id: "24816" })).toEqual({ value: "24816" });
  });

  it("redacts sensitive run parameters", () => {
    expect(redactParams({ member_id: "24816", vehicle_type: "used", token: "secret" })).toEqual({
      member_id: "****16",
      vehicle_type: "used",
      token: "[REDACTED]"
    });
  });
});
