import { DeGiroConverter } from "./degiroConverter";

describe("degiroConverter", () => {

    it("should construct", () => {

      // Act
      const sut = new DeGiroConverter();

      // Asssert
      expect(sut).toBeTruthy();
    });
});
