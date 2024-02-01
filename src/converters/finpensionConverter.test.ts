import { FinpensionConverter } from "./finpensionConverter";

describe("finpensionConverter", () => {

    it("should construct", () => {

      // Act
      const sut = new FinpensionConverter();

      // Asssert
      expect(sut).toBeTruthy();
    });
});
