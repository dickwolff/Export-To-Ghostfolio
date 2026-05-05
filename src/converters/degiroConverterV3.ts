import dayjs from "dayjs";
import {parse} from "csv-parse";
import {DeGiroRecord} from "../models/degiroRecord";
import {AbstractConverter} from "./abstractconverter";
import {SecurityService} from "../securityService";
import {GhostfolioExport} from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import {GhostfolioActivity} from "../models/ghostfolioActivity";
import {GhostfolioOrderType} from "../models/ghostfolioOrderType";
import {getTags} from "../helpers/tagHelpers";

interface AggregatedFill {
  totalQty: number;
  weightedUnitPrice: number;
  currency: string;
  totalFeeInAccountCurrency: number;
  /** FX rate to convert the account-currency fee to the activity currency when they differ. */
  fxRateToActivity: number;
  firstRecord: DeGiroRecord;
}

export class DeGiroConverterV3 extends AbstractConverter {
  // Account currency inferred from CSV balance-currency column; fallback is EUR.
  private accountCurrency: string = "EUR";

  constructor(securityService: SecurityService) {
    super(securityService);

    dayjs.extend(customParseFormat);
  }

  /**
   * @inheritdoc
   */
  public processFileContents(input: string, successCallback: any, errorCallback: any): void {

    // Parse the CSV and convert to Ghostfolio import format.
    parse(input, {
      delimiter: ",",
      fromLine: 2,
      columns: this.processHeaders(input),
      cast: (columnValue, context) => {

        // Custom mapping below.

        if (context.column === "currency" && columnValue === "GBX") {
          return "GBp";
        }

        return columnValue;
      }
    }, async (err, records: DeGiroRecord[]) => {

      try {

        // Check if parsing failed..
        if (err || records === undefined || records.length === 0) {
          let errorMsg = "An error occurred while parsing!";

          if (err) {
            errorMsg += ` Details: ${err.message}`

            // Detect common mistake: user exported Transactions.csv instead of Account.csv.
            if (err.message.indexOf("length is 12, got 19") > -1) {
              console.warn("[i] Detecting wrong input format. Have you exported the correct CSV file?");
              console.warn("[i] Export to Ghostfolio only supports Account.csv, not Transactions.csv!");
              console.warn("[i] See the export instructions in the README at https://git.new/JjA86vv");
            }
          }

          return errorCallback(new Error(errorMsg))
        }

        console.log("[i] Read CSV file. Start processing..");
        const result: GhostfolioExport = {
          meta: {
            date: new Date(),
            version: "v0"
          },
          activities: []
        };

        // Infer account currency from the balance-currency column; fallback stays EUR.
        this.accountCurrency = this.detectAccountCurrency(records);

        // Pre-scan: detect and suppress fully-cancelled dividend batches.
        //
        // DEGIRO sometimes reverses and re-issues a dividend payout on a later booking date
        // while keeping the original value date.  The re-booking batch contains four rows:
        //   −div (reversal), +tax (reversal), −tax (correction), +div (correction).
        // The reversal and correction rows always share the same booking date (B); the original
        // pair sits on an earlier booking date (A).
        //
        // Key used for matching: "isin|valueDate|absAmount|bookingDate" — unique per batch.
        // Pairing negative and positive rows that share all four fields cancels only the
        // re-booking batch, leaving the original batch on date A untouched.
        // A same-date storno (A == B) is also handled by the same logic.
        const cancelledDividendIndices = new Set<number>();

        const posDividendByBatchKey = new Map<string, number[]>();
        const negDividendByBatchKey = new Map<string, number[]>();
        const dividendKeywords = ["dividend", "dividende", "dywidenda"];

        for (let i = 0; i < records.length; i++) {
          const r = records[i];
          if (!r.isin || !r.amount) continue;
          const desc = r.description.toLocaleLowerCase();
          if (!dividendKeywords.some(kw => desc === kw)) continue;
          const absAmount = Math.abs(parseFloat(r.amount.replace(",", ".")));
          const key = `${r.isin}|${r.currencyDate}|${absAmount.toFixed(2)}|${r.date}`;
          const amount = parseFloat(r.amount.replace(",", "."));
          if (amount > 0) {
            if (!posDividendByBatchKey.has(key)) posDividendByBatchKey.set(key, []);
            posDividendByBatchKey.get(key).push(i);
          } else {
            if (!negDividendByBatchKey.has(key)) negDividendByBatchKey.set(key, []);
            negDividendByBatchKey.get(key).push(i);
          }
        }

        // For every negative (reversal) row, cancel it together with the matching positive
        // (correction) row on the same booking date.
        for (const [key, negIdxs] of negDividendByBatchKey) {
          const posIdxs = posDividendByBatchKey.get(key);
          if (!posIdxs) continue;
          const count = Math.min(negIdxs.length, posIdxs.length);
          for (let c = 0; c < count; c++) {
            cancelledDividendIndices.add(posIdxs[c]);
            cancelledDividendIndices.add(negIdxs[c]);
          }
        }

        // Also cancel the dividend tax rows that belong to a cancelled batch
        // (same isin / value date / booking date).
        if (cancelledDividendIndices.size > 0) {
          const cancelledBatchKeys = new Set<string>(
              [...cancelledDividendIndices].map(idx => {
              const r = records[idx];
                return `${r.isin}|${r.currencyDate}|${r.date}`;
              })
          );
          const dividendTaxKeywords = [
            "dividendbelasting",
            "impôts sur dividende",
            "podatek dywidendowy"
          ];
          for (let i = 0; i < records.length; i++) {
            if (cancelledDividendIndices.has(i)) continue;
            const r = records[i];
            if (!r.isin) continue;
            if (!cancelledBatchKeys.has(`${r.isin}|${r.currencyDate}|${r.date}`)) continue;
            const desc = r.description.toLocaleLowerCase();
            if (dividendTaxKeywords.some(kw => desc === kw)) {
              cancelledDividendIndices.add(i);
            }
          }
        }

        // Pre-scan: merge partial fills per orderId into a single weighted-average activity.
        const aggregatedFillsByOrderId = new Map<string, AggregatedFill>();
        const fillsByOrderId = new Map<string, DeGiroRecord[]>();
        const feesByOrderId = new Map<string, number>();     // Total fee/tax amount in account currency per order
        const fxRatesByOrderId = new Map<string, number>();  // FX rate for each order

        // Step 1: collect FX rates by Order ID for currency conversion.
        //
        // Priority:
        //   1. Explicit fx column on any FX Credit or FX Withdrawal row (most reliable).
        //   2. Derived rate: sum all account-currency FX Credit amounts and all foreign-currency
        //      trade amounts for the order, then compute foreignTotal / accountTotal.
        //      This is necessary for SELL orders whose FX Credit rows lack an explicit fx value.
        //      Summing across all fills avoids the multi-fill distortion where a per-fill FX
        //      Credit row (e.g. EUR 14.90 for 2 shares) would be paired with the full trade
        //      row (USD 374.96 for 43 shares), producing a wildly wrong rate.

        // Pass 1: explicit fx values (FX Credit or FX Withdrawal with a non-empty fx column).
        for (const r of records) {
          if (!r.orderId || !r.fx) continue;
          const desc = r.description.toLocaleLowerCase();
          if (desc.indexOf("fx credit") === -1 && desc.indexOf("fx withdrawal") === -1) continue;
          const fxRate = parseFloat(r.fx.replace(",", "."));
          if (!isNaN(fxRate) && fxRate > 0) {
            fxRatesByOrderId.set(r.orderId, fxRate);
          }
        }

        // Pass 2: derived rate for orders still missing an FX rate (typically SELL orders where
        // FX Credit rows have no explicit fx column).
        // Aggregate all FX Credit account-currency amounts and all trade foreign-currency amounts.
        for (const r of records) {
          if (!r.orderId || fxRatesByOrderId.has(r.orderId)) continue;
          if (r.description.toLocaleLowerCase().indexOf("fx credit") === -1) continue;
          if (r.currency !== this.accountCurrency || !r.amount) continue;

          // Collect all FX Credit account-currency rows for this order.
          const fxCreditRows = records.filter(t =>
              t.orderId === r.orderId &&
              t.description.toLocaleLowerCase().indexOf("fx credit") !== -1 &&
              t.currency === this.accountCurrency &&
              t.amount
          );
          // Collect all trade rows for this order in foreign currency.
          const tradeRows = records.filter(t =>
              t.orderId === r.orderId &&
              t.currency !== this.accountCurrency &&
              this.isBuyOrSellRecord(t) &&
              t.amount
          );
          if (fxCreditRows.length === 0 || tradeRows.length === 0) continue;

          const accountTotal = fxCreditRows.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount.replace(",", "."))), 0);
          const foreignTotal = tradeRows.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount.replace(",", "."))), 0);
          if (accountTotal > 0 && foreignTotal > 0) {
            const derived = foreignTotal / accountTotal;
            if (isFinite(derived) && derived > 0) {
              fxRatesByOrderId.set(r.orderId, parseFloat(derived.toFixed(4)));
            }
          }
        }

        // Step 2: collect all fees/taxes by Order ID
        for (const r of records) {
          if (r.orderId && (this.isTransactionFeeRecord(r, true) || this.isTransactionFeeRecord(r, false))) {
            const amount = Math.abs(parseFloat(r.amount.replace(",", ".")));
            const current = feesByOrderId.get(r.orderId) || 0;
            feesByOrderId.set(r.orderId, current + amount);
          }
        }

        // Step 3: merge partial fills
        for (const r of records) {
          if (r.orderId && this.isBuyOrSellRecord(r) && !this.isIgnoredRecord(r)) {
            let fills = fillsByOrderId.get(r.orderId);
            if (!fills) {
              fills = [];
              fillsByOrderId.set(r.orderId, fills);
            }
            fills.push(r);
          }
        }
        for (const [orderId, fills] of fillsByOrderId) {
          let totalQty = 0;
          let totalValue = 0;
          for (const r of fills) {
            const qty = this.parseQuantityFromDescription(r.description);
            // Extract unit price from description: text after "@" and before the next space
            const afterAt = r.description.split("@")[1] ?? "";
            const unitPriceStr = afterAt.split(" ")[0].replace(",", ".");
            const unitPrice = Number.parseFloat(unitPriceStr) || 0;
            totalQty += qty;
            totalValue += qty * unitPrice;
          }
          const weightedUnitPrice = totalQty > 0 ? Number.parseFloat((totalValue / totalQty).toFixed(3)) : 0;
          const totalFeeInAccountCurrency = feesByOrderId.get(orderId) || 0;
          const fxRate = fxRatesByOrderId.get(orderId) || 1;

          aggregatedFillsByOrderId.set(orderId, {
            totalQty,
            weightedUnitPrice,
            currency: fills[0].currency,
            totalFeeInAccountCurrency,
            fxRateToActivity: fxRate,
            firstRecord: fills[0]
          });

          if (fills.length > 1) {
            console.log(`[i] Order ${orderId} (${fills[0].isin}, ${fills[0].date}) has ${fills.length} fills. Merged into one activity: ${totalQty} shares @ ${weightedUnitPrice} ${fills[0].currency}.`);
          }
        }

        // Populate the progress bar.
        const bar1 = this.progress.create(records.length, 0);

        for (let idx = 0; idx < records.length; idx++) {
          const record = records[idx];

          // Check if the record should be ignored. 
          if (this.isIgnoredRecord(record)) {
            bar1.increment();
            continue;
          }

          // Skip all rows belonging to a fully-cancelled dividend (original + storno).
          if (cancelledDividendIndices.has(idx)) {
            bar1.increment();
            continue;
          }

          // Detect and skip DEGIRO dividend reversal (storno) records that have no matching
          // original in the same file (isolated reversal rows).
          if (this.isDividendReversalRecord(record)) {
            bar1.increment();
            continue;
          }

          // Look if the current record was already processed previously by checking the orderId.
          // Not all exports provide an order ID, so check for a buy/sell marking in those cases.
          // Dividend records never have an order ID, so check for a marking there.
          // If a match was found, skip the record and move next.
          if (result.activities.findIndex(a =>
            a.comment !== null &&
            a.comment !== "" &&
            (
              a.comment === record.orderId ||
              a.comment.startsWith(`Buy ${record.isin} @ ${record.date}T`) ||
              a.comment.startsWith(`Sell ${record.isin} @ ${record.date}T`) ||
              a.comment.startsWith(`Dividend ${record.isin} @ ${record.date}T`))
          ) > -1) {

            bar1.increment();
            continue;
          }

          // TODO: Is is possible to add currency? So VWRL.AS is retrieved for IE00B3RBWM25 instead of VWRL.L.
          // Maybe add yahoo-finance2 library that Ghostfolio uses, so I dont need to call Ghostfolio for this.

          // Platform fees do not have a security, add those immediately.
          if (this.isPlatformFees(record)) {

            const feeAmount = Math.abs(parseFloat(record.amount.replace(",", ".")));
            const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");

            result.activities.push({
              accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
              comment: null,
              fee: feeAmount,
              quantity: 1,
              type: GhostfolioOrderType.fee,
              unitPrice: 0,
              currency: record.currency,
              dataSource: "MANUAL",
              date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
              symbol: record.description,
              tags: getTags()
            });

            bar1.increment(1);
            continue;
          }

          // Interest does not have a security, add it immediately.
          if (this.isInterest(record)) {

            const interestAmount = Math.abs(parseFloat(record.amount.replace(",", ".")));
            const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");

            result.activities.push({
              accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
              comment: null,
              fee: 0,
              quantity: 1,
              type: GhostfolioOrderType.interest,
              unitPrice: interestAmount,
              currency: record.currency,
              dataSource: "MANUAL",
              date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
              symbol: record.description,
              tags: getTags()
            });

            bar1.increment(1);
            continue;
          }

          // Look for the security for the current record.
          let security: YahooFinanceRecord;
          try {
            security = await this.securityService.getSecurity(
              record.isin,
              null,
              record.product,
              record.currency,
              this.progress);
          }
          catch (err) {
            this.logQueryError(record.isin || record.product, idx);
            return errorCallback(err);
          }

          // Log whenever there was no match found.
          if (!security) {
            this.progress.log(`[i] No result found for ${record.isin || record.product} with currency ${record.currency}! Please add this manually..\n`);
            bar1.increment();
            continue;
          }

          // Look ahead in the remaining records if there is one with the same orderId.
          let matchingRecord = this.findMatchByOrderId(record, records.slice(idx + 1));

          // If there was no match by orderId, and there was no orderId present on the current record, look ahead in the remaining records to find a match by ISIN + Product.
          if (!matchingRecord && !record.orderId) {
            matchingRecord = this.findMatchByIsin(record, records.slice(idx + 1));
          }

          // Guard against division-by-zero in mapRecordToActivity:
          // skip with a warning rather than producing an invalid activity (unitPrice: NaN).
          // When partial fills are aggregated the total qty is always > 0, so bypass the guard.
          const buySellRecord = this.isBuyOrSellRecord(record)
              ? record
              : matchingRecord && this.isBuyOrSellRecord(matchingRecord)
                  ? matchingRecord
                  : undefined;

          const aggForGuard = buySellRecord?.orderId ? aggregatedFillsByOrderId.get(buySellRecord.orderId) : undefined;
          if (buySellRecord && !aggForGuard && this.parseQuantityFromDescription(buySellRecord.description) === 0) {
            this.progress.log(`[w] Could not parse share quantity from: "${buySellRecord.description}". Division by zero. Skipping record — add this activity manually.\n`);
            bar1.increment();
            continue;
          }

          // If this record is a transaction fee for an order already recorded (e.g. "Podatek od transakcji
          // we Włoszech" appearing after the main fee+buy pair has been consumed), add it to the existing
          // activity instead of discarding it.
          if (record.orderId && this.isTransactionFeeRecord(record, true)) {
            const existingActivity = result.activities.find(a => a.comment === record.orderId);
            if (existingActivity) {
              existingActivity.fee += Math.abs(Number.parseFloat(record.amount.replace(",", ".")));
              bar1.increment();
              continue;
            }
          }

          // If it's a standalone record, add it immediately.
          if (!matchingRecord) {

            if (this.isBuyOrSellRecord(record)) {
              // Use aggregated fill values when this orderId had multiple partial fills.
              const agg = record.orderId ? aggregatedFillsByOrderId.get(record.orderId) : undefined;
              result.activities.push(this.mapRecordToActivity(record, security, false, agg?.totalQty, agg?.weightedUnitPrice));
            }
            else {
              result.activities.push(this.mapDividendRecord(record, null, security));
            }
          }
          else {

            // This is a pair of records. Check which type of record it is and then combine the records into a Ghostfolio activity.

            // Check whether it is a buy/sell record set.
            if (this.isBuyOrSellRecordSet(record, matchingRecord)) {
              // Use aggregated fill values when this orderId had multiple partial fills.
              const agg = record.orderId ? aggregatedFillsByOrderId.get(record.orderId) : undefined;
              result.activities.push(this.combineRecords(record, matchingRecord, security, agg?.totalQty, agg?.weightedUnitPrice, agg?.totalFeeInAccountCurrency, agg?.fxRateToActivity));
            } else {
              result.activities.push(this.mapDividendRecord(record, matchingRecord, security));
            }
          }

          bar1.increment();
        }

        this.progress.stop();

        successCallback(result);
      }
      catch (error) {
        console.log("[e] An error occurred while processing the file contents. Stack trace:");
        console.log(error.stack);
        this.progress.stop();
        errorCallback(error);
      }
    });
  }

  /**
   * @inheritdoc
   */
  protected processHeaders(_: string): string[] {

    // Generic header mapping from the DEGIRO CSV export.
    const csvHeaders = [
      "date",
      "time",
      "currencyDate",
      "product",
      "isin",
      "description",
      "fx",
      "currency",
      "amount",
      "col1", // Not relevant column.
      "col2", // Not relevant column.
      "orderId"];

    return csvHeaders;
  }

  /**
   * @inheritdoc
   */
  public isIgnoredRecord(record: DeGiroRecord): boolean {

    if (record.description === "") {
      return true;
    }

    // Record without date/time/product/isin should also be ignored.
    if (!record.date && !record.time && !record.product && !record.isin) {
      return true;
    }

    const ignoredRecordTypes = [
      "ideal",
      "flatex",
      "cash sweep",
      "withdrawal",
      "productwijziging",
      "währungswechsel",
      "trasferisci",
      "deposito",
      "depozyt",
      "depósito",
      "credito",
      "credit",
      "prelievo",
      "creditering",
      "debitering",
      "rente",
      "interesse",
      "verrekening promotie",
      "operation de change",
      "versement de fonds",
      "débit",
      "debit",
      "ingreso",
      "retirada",
      "levantamento de divisa",
      "dito de divisa",
      "fonds monétaires",
      // Polish terms
      "przelew",
      "wpłata",
      "wypłata",
      "opłata abonamentu",
      "zmiana produktu",
      // FX records - these are paired with trade records and should be ignored
      "fx credit",
      "fx withdrawal"
    ];

    return ignoredRecordTypes.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  /**
   * Detects DEGIRO dividend reversal (storno) rows that were NOT already suppressed
   * by the pre-scan (i.e. isolated reversal rows with no matching correction in the file).
   *
   * Normal dividend pair:  dividend amount > 0  +  dividend tax amount < 0.
   * Reversal (storno) row: dividend amount < 0  OR dividend tax amount > 0.
   *
   * Exact-match on the description is required to avoid false positives
   * (e.g. "STOCK DIVIDEND: Koop..." is a BUY, not a dividend reversal).
   */
  private isDividendReversalRecord(record: DeGiroRecord): boolean {
    const desc = record.description.toLocaleLowerCase();
    const amount = record.amount ?? "";

    // Exact dividend description strings used by DEGIRO across locales.
    const dividendKeywords = [
      "dividend",               // Dutch / English
      "dividende",              // French / German
      "dywidenda"               // Polish
    ];

    // Exact dividend tax description strings used by DEGIRO across locales.
    const dividendTaxKeywords = [
      "dividendbelasting",      // Dutch
      "impôts sur dividende",   // French
      "podatek dywidendowy"     // Polish
    ];

    if (dividendKeywords.some(kw => desc === kw) && amount.startsWith("-")) {
      return true;
    }

    if (dividendTaxKeywords.some(kw => desc === kw) && Number.parseFloat(amount.replace(",", ".")) > 0) {
      return true;
    }

    return false;
  }

  private findMatchByOrderId(currentRecord: DeGiroRecord, records: DeGiroRecord[]): DeGiroRecord | undefined {
    if (!currentRecord.orderId) {
      return undefined;
    }

    const candidates = records.filter(r => r.orderId === currentRecord.orderId
      && r.date === currentRecord.date
      && !this.isIgnoredRecord(r)
    );

    // When the current record is a buy/sell fill, look for the transaction-fee record only.
    // Pairing fill+fill would cause the second fill to be misclassified as a dividend.
    if (this.isBuyOrSellRecord(currentRecord)) {
      const feeMatch = candidates.find(r => this.isTransactionFeeRecord(r, true));

      return feeMatch;
    }

    // When the current record is a fee, prefer the buy/sell record over another fee record
    // (e.g. to avoid pairing "Francuski podatek od transakcji" with the wrong row).
    if (this.isTransactionFeeRecord(currentRecord, true)) {
      return candidates.find(r => this.isBuyOrSellRecord(r)) ?? candidates[0];
    }

    return candidates[0];
  }

  private findMatchByIsin(currentRecord: DeGiroRecord, records: DeGiroRecord[]): DeGiroRecord | undefined {
    // For dividend rows, only pair with a dividend-tax row (same ISIN+product).
    // An unbounded search would accidentally pick up broker-fee rows from later trades.
    const isDividend = (() => {
      const desc = currentRecord.description.toLocaleLowerCase();
      return ["dividend", "dividende", "dywidenda"].some(kw => desc === kw);
    })();

    return records.find(r => {
      if (r.isin !== currentRecord.isin || r.product !== currentRecord.product) return false;
      if (isDividend) return this.isTransactionFeeRecord(r, false);
      return true;
    });
  }

  private mapRecordToActivity(record: DeGiroRecord, security?: YahooFinanceRecord, isTransactionFeeRecord: boolean = false, overrideQty?: number, overrideUnitPrice?: number): GhostfolioActivity {

    let numberShares, unitPrice, feeAmount = 0;
    let orderType;

    // If it is not a transaction fee record, get data from the record.
    if (!isTransactionFeeRecord) {

      // Get the amount of shares from the description, unless overridden by aggregated partial fills.
      numberShares = overrideQty ?? this.parseQuantityFromDescription(record.description);

      // For buy/sale records, only the total amount is recorded. So the unit price needs to be calculated.
      // When partial fills are aggregated, the weighted-average unit price is passed directly.
      const totalAmount = parseFloat(record.amount.replace(",", "."));
      unitPrice = overrideUnitPrice ?? parseFloat((Math.abs(totalAmount) / numberShares).toFixed(3));

      // If amount is negative (so money has been removed) or it's stock dividend (so free shares), thus it's a buy record.
      if (totalAmount < 0 || record.description.toLocaleLowerCase().indexOf("stock dividend") > -1) {
        orderType = GhostfolioOrderType.buy;
      } else {
        orderType = GhostfolioOrderType.sell;
      }
    }
    else {

      // Otherwise, get the transaction fee info.
      feeAmount = parseFloat(Math.abs(parseFloat(record.amount.replace(",", "."))).toFixed(3));
    }

    const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");

    // Create the record.
    return {
      accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
      comment: record.orderId ?? `${orderType === GhostfolioOrderType.buy ? "Buy" : "Sell"} ${record.isin} @ ${record.date}T${record.time}`,
      fee: feeAmount,
      quantity: numberShares,
      type: orderType,
      unitPrice: unitPrice,
      currency: record.currency ?? "",
      dataSource: "YAHOO",
      date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
      symbol: security.symbol ?? "",
      tags: getTags()
    };
  }

  private combineRecords(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord, security: YahooFinanceRecord, overrideQty?: number, overrideUnitPrice?: number, totalFeeInAccountCurrency?: number, fxRateToActivity?: number): GhostfolioActivity {

    // Set the default values for the records.
    let actionRecord = currentRecord;
    let txFeeRecord: DeGiroRecord | null = nextRecord;

    // Determine which of the two records is the action record (e.g. buy/sell) and which contains the transaction fees.
    // Firstly, check if the current record is the TxFee record.
    if (this.isTransactionFeeRecord(currentRecord, true)) {
      actionRecord = nextRecord;
      txFeeRecord = currentRecord;
    }

    // Map both records.
    const mappedActionRecord = this.mapRecordToActivity(actionRecord, security, false, overrideQty, overrideUnitPrice);
    const mappedTxFeeRecord = this.mapRecordToActivity(txFeeRecord, security, true);

    // Extract the fee from the transaction fee record and put it in the action record.
    // If we have aggregated order fees, use those and convert only when activity currency differs.
    if (totalFeeInAccountCurrency !== undefined && totalFeeInAccountCurrency > 0) {
      const activityCurrency = mappedActionRecord.currency;

      if (activityCurrency === this.accountCurrency) {
        mappedActionRecord.fee = Number.parseFloat(totalFeeInAccountCurrency.toFixed(2));
      } else {
        const rate = fxRateToActivity || 1;
        mappedActionRecord.fee = Number.parseFloat((totalFeeInAccountCurrency * rate).toFixed(2));
      }
    } else {
      // Fallback to the single transaction fee record if no aggregated fee
      mappedActionRecord.fee = mappedTxFeeRecord.fee;
    }

    return mappedActionRecord;
  }

  private detectAccountCurrency(records: DeGiroRecord[]): string {
    const counts = new Map<string, number>();

    for (const record of records) {
      const balanceCurrency = (record.col2 || "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(balanceCurrency)) {
        continue;
      }

      counts.set(balanceCurrency, (counts.get(balanceCurrency) || 0) + 1);
    }

    if (counts.size === 0) {
      return "EUR";
    }

    let detected = "EUR";
    let maxCount = -1;
    for (const [currency, count] of counts) {
      if (count > maxCount) {
        detected = currency;
        maxCount = count;
      }
    }

    return detected;
  }

  private mapDividendRecord(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord | null = null, security: YahooFinanceRecord): GhostfolioActivity {

    // It's a dividend set.
    // Set the default values for the records.
    let dividendRecord = currentRecord;
    let txFeeRecord: DeGiroRecord = nextRecord;

    // Determine which of the two records is the dividend record and which contains the transaction fees.
    // Firstly, check if the current record is the TxFee record.
    if (nextRecord && this.isTransactionFeeRecord(currentRecord, false)) {
      dividendRecord = nextRecord;
      txFeeRecord = currentRecord;
    }

    let unitPrice = Math.abs(parseFloat(dividendRecord.amount.replace(",", ".")));
    let fees = 0;
    if (txFeeRecord) {
      fees = Math.abs(parseFloat(txFeeRecord.amount.replace(",", ".")));
    }

    const date = dayjs(`${dividendRecord.date} ${dividendRecord.time}:00`, "DD-MM-YYYY HH:mm");

    // Create the record.
    return {
      accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
      comment: `Dividend ${dividendRecord.isin} @ ${currentRecord.date}T${currentRecord.time}`,
      fee: fees,
      quantity: 1,
      type: GhostfolioOrderType.dividend,
      unitPrice: unitPrice,
      currency: dividendRecord.currency,
      dataSource: "YAHOO",
      date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
      symbol: security.symbol,
      tags: getTags()
    };
  }

  private isBuyOrSellRecordSet(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord): boolean {
    return (this.isBuyOrSellRecord(currentRecord) && this.isTransactionFeeRecord(nextRecord, true)) ||
      (this.isTransactionFeeRecord(currentRecord, true) && this.isBuyOrSellRecord(nextRecord))
  }

  /**
   * Parses the share quantity from a DEGIRO description string.
   *
   * DEGIRO descriptions follow the pattern "<action> <qty> <name>@<unitPrice> <currency>".
   * The quantity is always an integer and may use a locale-specific thousands separator:
   *   - space  (Polish/French):  "Kupno 1 250 iShares..."
   *   - dot    (German/Italian): "Kauf 1.250 iShares..."
   *   - comma  (English):        "Buy 1,250 iShares..."
   *   - none:                    "Buy 600 iShares..."
   *
   * To avoid confusing the unit price (e.g. "at 2,888 EUR") with the quantity, only the
   * portion of the description before the first "@" is examined.
   *
   * The regex recognises a thousands separator only when it is followed by exactly three digits,
   * which rules out decimal separators such as "2.97" or "2,888". Multiple thousands separators
   * are supported, e.g. "1 234 567" (1,234,567).
   *
   * The quantity is anchored to the first word boundary (the action verb), so that
   * thousands-separated numbers embedded in the product name (e.g. "2 000" in
   * "Kupno 5 MSCI World 2 000 Index") are not mistaken for the quantity.
   */
  private parseQuantityFromDescription(description: string): number {
    const beforeAt = description.split("@")[0];

    // Anchor to the first number immediately after the leading verb token (e.g. "Kupno", "Koop", "Buy").
    const withSeparator = beforeAt.match(/^\S+\s+(\d{1,3}(?:[,. \u00A0\u202F]\d{3})+)(?!\d)/);
    if (withSeparator) {
      return parseInt(withSeparator[1].replace(/[,. \u00A0\u202F]/g, ""), 10);
    }

    // Fallback: plain integer (no separator) directly after the verb.
    const plain = beforeAt.match(/^\S+\s+(\d+)/);
    return plain ? parseInt(plain[1], 10) : 0;
  }

  private isBuyOrSellRecord(record: DeGiroRecord): boolean {

    if (!record) {
      return false;
    }

    const buySellRecordType = ["\@", "zu je"];

    return buySellRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isTransactionFeeRecord(record: DeGiroRecord, isBuyOrSellTransactionFeeRecord: boolean): boolean {

    if (!record) {
      return false;
    }

    // When a dividend transaction must be found, there should not be an orderid.
    if (!isBuyOrSellTransactionFeeRecord && record.orderId) {
      return false;
    }

    // Broker transaction cost phrases (various locales).
    const brokerFeeTerms = [
      "en\/of",                   // Dutch
      "and\/or",                  // English
      "und\/oder",                // German
      "e\/o",                     // Italian / Portuguese
      "adr\/gdr",                 // ADR/GDR admin fees
      "i\/lub",                   // Polish
      "comissões de transação",   // Portuguese
      "courtage et/ou",           // French
      "opłata transakcyjna"       // Polish
    ];

    // Dividend withholding tax phrases (various locales).
    const dividendTaxTerms = [
      "belasting",                // Dutch  (e.g. dividendbelasting)
      "ritenuta",                 // Italian
      "daň z dividendy",          // Czech
      "taxe sur les",             // French
      "impôts sur",               // French
      "podatek dywidendowy"       // Polish
    ];

    // Transaction (stamp / financial) tax phrases.
    // "podatek od transakcji" catches all locale variants:
    //   "polski podatek od transakcji", "francuski podatek od transakcji",
    //   "podatek od transakcji we włoszech", etc.
    const transactionTaxTerms = [
      "stamp duty",               // UK / Hong Kong
      "podatek od transakcji"     // Polish (all locale variants)
    ];

    const transactionFeeRecordType = [...brokerFeeTerms, ...dividendTaxTerms, ...transactionTaxTerms];

    return transactionFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isPlatformFees(record: DeGiroRecord): boolean {

    const platformFeeRecordType = ["aansluitingskosten", "connection fee", "costi di connessione", "verbindungskosten", "custo de conectividade", "frais de connexion", "juros", "corporate action"];

    return platformFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isInterest(record: DeGiroRecord): boolean {

    const interestRecordType = ["degiro courtesy"];

    return interestRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }
}
