import { FinpensionConverter } from "./finpensionConverter";


describe("finpensionConverter", () => {

    it("should construct", () => {
      const sut = new FinpensionConverter();

      expect(sut).toBeTruthy();
    });
});
