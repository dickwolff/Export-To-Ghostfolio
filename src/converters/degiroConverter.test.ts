import { YahooFinanceService } from "../yahooFinanceService";
import { DeGiroConverter } from "./degiroConverter";

describe("degiroConverter", () => {

    it("should construct", () => {

      // Act
      const sut = new DeGiroConverter(new YahooFinanceService());

      // Asssert
      expect(sut).toBeTruthy();
    });
});
