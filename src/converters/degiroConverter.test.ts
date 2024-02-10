import { DeGiroConverter } from "./degiroConverter";
import { YahooFinanceService } from "../yahooFinanceService";

describe("degiroConverter", () => {

    it("should construct", () => {

      // Act
      const sut = new DeGiroConverter(new YahooFinanceService());

      // Assert
      expect(sut).toBeTruthy();
    });

    // This converter is replaced by V2, so no sense in unit testing this any further.
});
