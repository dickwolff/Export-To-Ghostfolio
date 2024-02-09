import { YahooFinanceService } from "../yahooFinanceService";
import { FinpensionConverter } from "./finpensionConverter";

describe("finpensionConverter", () => {

    it("should construct", () => {

      // Act
      const sut = new FinpensionConverter(new YahooFinanceService());

      // Asssert
      expect(sut).toBeTruthy();
    });
});
