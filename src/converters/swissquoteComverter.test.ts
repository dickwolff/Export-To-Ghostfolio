import { SwissquoteConverter } from "./swissquoteConverter";

describe("swissquoteConverter", () => {

    it("should construct", () => {

      // Act
      const sut = new SwissquoteConverter();

      // Asssert
      expect(sut).toBeTruthy();
    });
});
