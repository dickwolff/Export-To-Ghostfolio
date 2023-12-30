import { Trading212Converter } from "./trading212Converter";

describe("trading212Converter", () => {

    it("should construct", () => {

      // Act
      const sut = new Trading212Converter();

      // Asssert
      expect(sut).toBeTruthy();
    });
});
