import { EtoroConverter } from "./etoroConverter";

describe("etoroConverter", () => {

    it("should construct", () => {

      // Act
      const sut = new EtoroConverter();

      // Asssert
      expect(sut).toBeTruthy();
    });
});
