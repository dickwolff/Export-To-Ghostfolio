import { SchwabConverter } from "./schwabConverter";

describe("SchwabConverter", () => {

    it("should construct", () => {

      // Act
      const sut = new SchwabConverter();

      // Asssert
      expect(sut).toBeTruthy();
    });
});
