import { defineComponent } from "convex/server";
import { v } from "convex/values";

export default defineComponent("e2b", {
  env: {
    E2B_API_KEY: v.string(),
    E2B_NAMESPACE: v.optional(v.string()),
    E2B_DOMAIN: v.optional(v.string()),
  },
});
