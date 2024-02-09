import { YahooFinanceService } from "../yahooFinanceService";
import { SchwabConverter } from "./schwabConverter";

describe("SchwabConverter", () => {

    it("should construct", () => {

      // Act
      const sut = new SchwabConverter(new YahooFinanceService());

      // Asssert
      expect(sut).toBeTruthy();
    });
});
