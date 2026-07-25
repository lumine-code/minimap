const { coalesce } = require("../lib/utils");

describe("utils", () => {
  describe("coalesce()", () => {
    beforeEach(() => {
      jasmine.useRealClock();
    });

    it("collapses a burst into a single call", async () => {
      let calls = 0;
      const coalesced = coalesce(() => calls++);

      coalesced();
      coalesced();
      coalesced();
      expect(calls).toBe(0);

      await null;
      expect(calls).toBe(1);
    });

    it("runs before the next task, so its work makes the same frame", async () => {
      // This is the whole point of using it over a debounce: the theme switch wraps its stylesheet
      // swap in a View Transition, and the minimap has to re-read the colors within that same task
      // to redraw as part of the cross-fade.
      const order = [];
      const coalesced = coalesce(() => order.push("coalesced"));

      setTimeout(() => order.push("task"), 0);
      coalesced();

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(order).toEqual(["coalesced", "task"]);
    });

    it("re-arms after running", async () => {
      let calls = 0;
      const coalesced = coalesce(() => calls++);

      coalesced();
      await null;
      coalesced();
      await null;
      expect(calls).toBe(2);
    });

    it("passes through the arguments of the first call in a burst", async () => {
      let seen;
      const coalesced = coalesce((...args) => (seen = args));

      coalesced("a", 1);
      coalesced("b", 2);

      await null;
      expect(seen).toEqual(["a", 1]);
    });
  });
});
