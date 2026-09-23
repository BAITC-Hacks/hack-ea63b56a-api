import { describe, expect, it } from "vitest";
import { formSchema } from "./form";

const valid = { city: "Алматы", date: "2026-10-15", eventFormat: "корпоратив", category: "Ведущий", budgetKzt: 900000 };

describe("event request validation", () => {
  it("accepts required fields and omits optional fields", () => {
    expect(formSchema.safeParse(valid).success).toBe(true);
  });
  it.each(["2026-09-22", "2027-01-01", "2026-11-31", "2026-10-15x"])("rejects date %s", (date) => {
    expect(formSchema.safeParse({ ...valid, date }).success).toBe(false);
  });
  it("rejects invalid budget and duration", () => {
    expect(formSchema.safeParse({ ...valid, budgetKzt: 0 }).success).toBe(false);
    expect(formSchema.safeParse({ ...valid, budgetKzt: 1.5 }).success).toBe(false);
    expect(formSchema.safeParse({ ...valid, durationHours: 25 }).success).toBe(false);
  });
});
