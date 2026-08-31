import dayjs from "dayjs";
import { parse } from "csv-parse";
import { DeGiroRecord } from "../models/degiroRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioActivity } from "../models/ghostfolioActivity";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { getTags } from "../helpers/tagHelpers";

export class DeGiroConverterV3 extends AbstractConverter {

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

            // Temporary error check for Transactions.csv
            if (err.message.indexOf("length is 12, got 19")) {
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

        // Populate the progress bar.
        const bar1 = this.progress.create(records.length, 0);

        // Cache of pre-computed sibling fee shares. Populated when a fee row is paired
        // with a buy/sell and there are multiple partial-fill siblings under the same
        // orderId+day. When a later sibling iterates as standalone, it looks up its
        // proportional slice here instead of emitting fee=0.
        const siblingFeeShare = new Map<string, number>();

        for (let idx = 0; idx < records.length; idx++) {
          const record = records[idx];

          // Check if the record should be ignored. 
          if (this.isIgnoredRecord(record)) {
            bar1.increment();
            continue;
          }

          // Look if the current record was already processed previously by checking the orderId.
          // Not all exports provide an order ID, so check for a buy/sell marking in those cases.
          // Dividend records never have an order ID, so check for a marking there.
          // If a match was found, skip the record and move next.
          // Dedup: skip only if we've already emitted an activity for this exact
          // record (same orderId + same description). This lets partial fills
          // (multiple Achat rows sharing an orderId+time but different quantities)
          // each produce their own activity.
          const recordSignature = record.orderId ? `${record.orderId}|${record.description}` : "";
          if (recordSignature && result.activities.findIndex(a =>
            a.comment !== null && a.comment !== "" &&
            (a.comment === recordSignature || a.comment.includes(recordSignature))
          ) > -1) {

            bar1.increment();
            continue;
          }

          // For records without an orderId (dividends, splits), fall back to the
          // isin+date+time comment prefix guard — but ONLY for the record type that
          // uses the corresponding comment prefix. Previously a co-located buy/sell
          // row (e.g. Rachat: Vente on the same date/isin/time as a dividend tax
          // reversal) was wrongly deduped by matching the 'Dividend ...' prefix.
          const isDividendRecord = this.isTransactionFeeRecord(record, false) ||
            record.description.toLocaleLowerCase().indexOf("dividend") > -1;
          const isStockSplit = this.isStockSplitRecord(record);
          if (!record.orderId && result.activities.findIndex(a =>
            a.comment !== null &&
            a.comment !== "" &&
            (
              (isDividendRecord && a.comment.startsWith(`Dividend ${record.isin} @ ${record.date}T`)) ||
              (isStockSplit && a.comment.startsWith(`Split-sell ${record.isin} @ ${record.date}T`)) ||
              (isStockSplit && a.comment.startsWith(`Split-buy ${record.isin} @ ${record.date}T`)))
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
              symbol: `GF_${record.description}`,
              tags: getTags()
            });

            bar1.increment(1);
            continue;
          }

          // Manual FX broker fees: DeGiro emits '-10,00 EUR' broker fee rows on manual FX
          // conversions with product='EUR/USD' and a placeholder ISIN like 'EURUSD......'.
          // There is no real security to attach these to (no matching Achat/Vente row),
          // so pairing fails and the row was silently dropped. Emit them as standalone FEE
          // activities so the fee is visible in Ghostfolio.
          if (this.isTransactionFeeRecord(record, true)
              && record.isin && /^EURUSD\.+$/i.test(record.isin)) {

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
              symbol: `GF_Manual FX fee (${record.product})`,
              tags: getTags()
            });

            bar1.increment(1);
            continue;
          }

          // Stock splits ('Ajustement fractionnement') come as two rows sharing date+ISIN+time,
          // one debit (+N post-split shares) and one credit (-M pre-split shares). Ghostfolio has
          // no split activity type; represent it as SELL M @ oldPx + BUY N @ newPx (cash-neutral,
          // cost basis preserved, share count correct).
          if (this.isStockSplitRecord(record)) {
            const sibling = this.findSplitSibling(record, records.slice(idx + 1));
            if (sibling) {
              // Look up security using this record's currency (both legs share currency).
              let splitSecurity: YahooFinanceRecord;
              try {
                splitSecurity = await this.securityService.getSecurity(
                  record.isin, null, record.product, record.currency, this.progress);
              } catch (err) {
                this.logQueryError(record.isin || record.product, idx);
                return errorCallback(err);
              }
              if (!splitSecurity) {
                this.progress.log(`[i] No result found for ${record.isin || record.product} with currency ${record.currency}! Please add this manually..\n`);
                bar1.increment(2);
                continue;
              }
              const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");
              // Debit row has negative amount, credit row has positive.
              const debitRow = parseFloat(record.amount.replace(/\s/g, "").replace(",", ".")) < 0 ? record : sibling;
              const creditRow = debitRow === record ? sibling : record;
              const debitParsed = this.parseSplitDescription(debitRow.description);
              const creditParsed = this.parseSplitDescription(creditRow.description);
              if (debitParsed && creditParsed) {
                // Debit shares = post-split (added), credit shares = pre-split (removed).
                // (In DeGiro FR: debit side has the higher qty and lower price; credit side the opposite.)
                const postSplitQty = debitParsed.qty;
                const postSplitPx = debitParsed.px;
                const preSplitQty = creditParsed.qty;
                const preSplitPx = creditParsed.px;

                // SELL pre-split holding.
                result.activities.push({
                  accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                  comment: `Split-sell ${record.isin} @ ${record.date}T${record.time}`,
                  fee: 0,
                  quantity: preSplitQty,
                  type: GhostfolioOrderType.sell,
                  unitPrice: preSplitPx,
                  currency: record.currency,
                  dataSource: "YAHOO",
                  date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                  symbol: splitSecurity.symbol,
                  tags: getTags()
                });
                // BUY post-split holding.
                result.activities.push({
                  accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                  comment: `Split-buy ${record.isin} @ ${record.date}T${record.time}`,
                  fee: 0,
                  quantity: postSplitQty,
                  type: GhostfolioOrderType.buy,
                  unitPrice: postSplitPx,
                  currency: record.currency,
                  dataSource: "YAHOO",
                  date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                  symbol: splitSecurity.symbol,
                  tags: getTags()
                });
                bar1.increment(2);
                continue;
              }
            }
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
              symbol: `GF_${record.description}`,
              tags: getTags()
            });

            bar1.increment(1);
            continue;
          }

          // Look ahead in the remaining records if there is one with the same orderId.
          let matchingRecord = this.findMatchByOrderId(record, records.slice(idx + 1));

          // If there was no match by orderId, and there was no orderId present on the current record, look ahead in the remaining records to find a match by ISIN + Product.
          // But skip this fallback for corporate-action rows (Fusion / Rachat /
          // Modification instrument). They already have an orderId of “” and are
          // structurally independent events; pairing them by isin+product with a
          // co-located tax/dividend row causes mapDividendRecord to be called on
          // the Vente/Achat row, which then emits its POSITIVE amount as a
          // phantom DIVIDEND unitPrice.
          if (!matchingRecord && !record.orderId && !this.isCorporateActionRecord(record)) {
            matchingRecord = this.findMatchByIsin(record, records.slice(idx + 1));
          }

          // When the current record is a fee/tax row paired with a buy/sell, use the
          // buy/sell record's currency for the security lookup. Otherwise a fee row in
          // EUR paired with a USD Achat would poison the lookup and match the wrong
          // exchange-suffixed variant (e.g. ELFA.DE instead of ELF for US26856L1035).
          let securityLookupRecord = record;
          if (matchingRecord && this.isBuyOrSellRecordSet(record, matchingRecord)) {
            if (this.isBuyOrSellRecord(matchingRecord)) {
              securityLookupRecord = matchingRecord;
            }
          }

          // Look for the security for the current record.
          let security: YahooFinanceRecord;
          try {
            security = await this.securityService.getSecurity(
              securityLookupRecord.isin,
              null,
              securityLookupRecord.product,
              securityLookupRecord.currency,
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

          // If it's a standalone record, add it immediately.
          if (!matchingRecord) {

            if (this.isBuyOrSellRecord(record)) {
              const activity = this.mapRecordToActivity(record, security);
              // Pick up a pre-computed proportional fee share left by an earlier
              // fee-pair iteration (partial fill under same orderId+day).
              if (record.orderId) {
                const key = `${record.orderId}|${record.description}`;
                if (siblingFeeShare.has(key)) {
                  activity.fee = siblingFeeShare.get(key);
                  siblingFeeShare.delete(key);
                }
              }
              result.activities.push(activity);
            }
            else {
              result.activities.push(this.mapDividendRecord(record, null, security));
            }
          }
          else {

            // This is a pair of records. Check which type of record it is and then combine the records into a Ghostfolio activity.

            // Check wether it is a buy/sell record set.
            if (this.isBuyOrSellRecordSet(record, matchingRecord)) {
              const activity = this.combineRecords(record, matchingRecord, security);

              // Partial-fill fee split: if this fee is shared across multiple buy/sell
              // siblings under the same orderId+day, split the fee proportionally by
              // share count so no sibling ends up fee=0.
              // Determine the fee row and the buy/sell action row of this pair.
              const feeRow = this.isTransactionFeeRecord(record, true) ? record : matchingRecord;
              const actionRow = feeRow === record ? matchingRecord : record;
              // Find all buy/sell siblings under the same orderId+day (including actionRow itself).
              // Look in the full record list, not just remaining, so earlier siblings
              // (already emitted as standalone by an earlier iteration) are still counted.
              const siblings = actionRow.orderId ? this.findBuySellSiblings(actionRow, records) : [actionRow];
              if (siblings.length > 1) {
                const totalFee = Math.abs(parseFloat(feeRow.amount.replace(",", ".")));
                const totalQty = siblings.reduce((s, r) => s + this.parseSharesFromDescription(r), 0);
                const actionQty = this.parseSharesFromDescription(actionRow);
                if (totalQty > 0) {
                  activity.fee = parseFloat(((totalFee * actionQty) / totalQty).toFixed(3));
                  // Retro-apply to any already-emitted sibling activities, and forward-cache
                  // the proportional share for siblings that will iterate later.
                  for (const sib of siblings) {
                    if (sib === actionRow) { continue; }
                    const sibQty = this.parseSharesFromDescription(sib);
                    const sibFee = parseFloat(((totalFee * sibQty) / totalQty).toFixed(3));
                    let retroApplied = false;
                    for (const emitted of result.activities) {
                      if (emitted.comment && sib.orderId && emitted.comment.includes(sib.orderId)
                          && emitted.quantity === sibQty
                          && (emitted.type === GhostfolioOrderType.buy || emitted.type === GhostfolioOrderType.sell)
                          && (emitted.fee || 0) === 0) {
                        emitted.fee = sibFee;
                        retroApplied = true;
                        break;
                      }
                    }
                    if (!retroApplied && sib.orderId) {
                      siblingFeeShare.set(`${sib.orderId}|${sib.description}`, sibFee);
                    }
                  }
                }
              }

              // Tag the emitted activity with signatures for BOTH the current record
              // and the paired sibling so the dedup guard skips the sibling when its
              // own iteration comes (prevents double-emitting the Achat as standalone).
              const currentSig = record.orderId ? `${record.orderId}|${record.description}` : "";
              const siblingSig = matchingRecord.orderId ? `${matchingRecord.orderId}|${matchingRecord.description}` : "";
              if (currentSig && siblingSig) {
                activity.comment = `${currentSig}\n${siblingSig}`;
              }
              result.activities.push(activity);
            } else {
              const activity = this.mapDividendRecord(record, matchingRecord, security);
              const currentSig = record.orderId ? `${record.orderId}|${record.description}` : "";
              const siblingSig = matchingRecord.orderId ? `${matchingRecord.orderId}|${matchingRecord.description}` : "";
              if (currentSig && siblingSig) {
                activity.comment = `${activity.comment}\n${currentSig}\n${siblingSig}`;
              }
              result.activities.push(activity);
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
      "credito",
      "credit",
      "prelievo",
      "creditering",
      "debitering",
      "rente",
      "interesse",
      "verrekening promotie",
      "operation de change",
      "opération de change",
      "versement de fonds",
      "débit",
      "debit",
      "depósito",
      "ingreso",
      "retirada",
      "levantamento de divisa",
      "dito de divisa",
      "fonds monétaires",
      // 'Modification instrument' rows are internal bookkeeping (e.g. a ticker/ISIN
      // rename or a 'non tradeable' variant swap) that DeGiro emits as a paired
      // Achat + Vente at price 0. They never move cash or change your real
      // holdings, so both sides must be ignored to avoid emitting phantom SELL/BUY.
      "modification instrument"];

    return ignoredRecordTypes.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private findMatchByOrderId(currentRecord: DeGiroRecord, records: DeGiroRecord[]): DeGiroRecord | undefined {
    // Require a non-empty orderId. Otherwise two unrelated rows both lacking an
    // orderId would match on `undefined === undefined` and get spuriously paired
    // (e.g. a dividend-tax reversal getting paired with a corporate-action SELL
    // that shares the same isin+date+time).
    if (!currentRecord.orderId) { return undefined; }
    // For fee↔buy/sell pairing we do NOT require exact time equality: DeGiro sometimes
    // emits a later fill under the same orderId a few minutes after the fee row
    // (e.g. fee at 18:40, second BUY at 18:50). Requiring same time would orphan
    // that BUY. Same-time equality is only enforced when both sides are buy/sell
    // rows, to keep partial-fill siblings independent.
    const currentIsBuySell = this.isBuyOrSellRecord(currentRecord);
    return records.find(r => r.orderId === currentRecord.orderId
      && dayjs(r.date, "DD-MM-YYYY").isSame(dayjs(currentRecord.date, "DD-MM-YYYY"), 'day')
      && !this.isIgnoredRecord(r)
      // Don't pair two same-side buy/sell rows (partial fills sharing an orderId):
      // each must be emitted as its own activity, otherwise combineRecords or
      // mapDividendRecord will drop one of them.
      && !(currentIsBuySell && this.isBuyOrSellRecord(r))
      // Between two buy/sell rows enforce same time (unused today because of the
      // guard above, but keep it defensive). For fee/tax↔buy pairing, same-day is enough.
      && (currentIsBuySell || this.isBuyOrSellRecord(r) ? true : r.time === currentRecord.time)
    );
  }

  // Find all sibling buy/sell records (same orderId+description prefix, same day)
  // so a single shared fee can be split proportionally by quantity across a partial fill.
  private findBuySellSiblings(anchor: DeGiroRecord, allRecords: DeGiroRecord[]): DeGiroRecord[] {
    if (!anchor.orderId || !this.isBuyOrSellRecord(anchor)) { return [anchor]; }
    return allRecords.filter(r =>
      r.orderId === anchor.orderId
      && this.isBuyOrSellRecord(r)
      && dayjs(r.date, "DD-MM-YYYY").isSame(dayjs(anchor.date, "DD-MM-YYYY"), 'day')
      && r.isin === anchor.isin
    );
  }

  private parseSharesFromDescription(record: DeGiroRecord): number {
    try {
      const m = record.description.match(/([\d*\.?\,?\d*]+)/);
      return m ? parseFloat(m[0]) : 0;
    } catch { return 0; }
  }

  private findMatchByIsin(currentRecord: DeGiroRecord, records: DeGiroRecord[]): DeGiroRecord | undefined {
    return records.find(r => r.isin === currentRecord.isin && r.product === currentRecord.product
      // Don't cross-pair a corporate-action share receipt/redemption row with a
      // co-located dividend/tax row: they share isin+product+date but describe
      // independent events. Pairing turns a dividend-tax reversal into a phantom
      // fee on the buy/sell and re-emits the buy/sell as a duplicate standalone.
      && !(this.isCorporateActionRecord(currentRecord) !== this.isCorporateActionRecord(r))
    );
  }

  private isCorporateActionRecord(record: DeGiroRecord): boolean {
    if (!record || !record.description) { return false; }
    const desc = record.description.toLocaleLowerCase();
    return desc.startsWith("fusion") ||
      desc.startsWith("rachat") ||
      desc.startsWith("modification instrument");
  }

  private mapRecordToActivity(record: DeGiroRecord, security?: YahooFinanceRecord, isTransactionFeeRecord: boolean = false): GhostfolioActivity {

    let numberShares, unitPrice, feeAmount = 0;
    let orderType;

    // If it is not a transaction fee record, get data from the record.
    if (!isTransactionFeeRecord) {

      // Get the amount of shares from the description.
      const numberSharesFromDescription = record.description.match(/([\d*\.?\,?\d*]+)/)[0];
      numberShares = parseFloat(numberSharesFromDescription);

      // For buy/sale records, only the total amount is recorded. So the unit price needs to be calculated.
      const totalAmount = parseFloat(record.amount.replace(",", "."));
      unitPrice = parseFloat((Math.abs(totalAmount) / numberShares).toFixed(3));

      // Detect buy vs sell.
      // Money out (amount < 0)                  -> buy
      // Stock dividend (free shares, amount=0)  -> buy
      // Corporate action share receipts (Fusion / Rachat / Modification instrument)
      //   emit an 'Achat N ...' row with amount=0 because no cash moves. Without
      //   this branch, amount=0 falls into the SELL default and a share receipt is
      //   inverted into a phantom SELL of the acquirer.
      const desc = record.description.toLocaleLowerCase();
      const isCorporateActionPrefix = desc.startsWith("fusion") ||
        desc.startsWith("rachat") ||
        desc.startsWith("modification instrument");
      const isCorporateActionBuy = isCorporateActionPrefix && / achat /.test(desc);
      if (totalAmount < 0 || desc.indexOf("stock dividend") > -1 || isCorporateActionBuy) {
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

  private combineRecords(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord, security: YahooFinanceRecord): GhostfolioActivity {

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
    const mappedActionRecord = this.mapRecordToActivity(actionRecord, security);
    const mappedTxFeeRecord = this.mapRecordToActivity(txFeeRecord, security, true);

    // Extract the fee from the transaction fee record and put it in the action record.
    mappedActionRecord.fee = mappedTxFeeRecord.fee;

    return mappedActionRecord;
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

  private isBuyOrSellRecord(record: DeGiroRecord): boolean {

    if (!record) {
      return false;
    }

    const buySellRecordType = ["\@", "zu je"]//, "acquisto"];

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

    const transactionFeeRecordType = ["en\/of", "and\/or", "und\/oder", "e\/o", "adr\/gdr", "ritenuta", "belasting", "daň z dividendy", "taxe sur les", "impôts sur", "comissões de transação", "courtage et/ou"];

    return transactionFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isPlatformFees(record: DeGiroRecord): boolean {

    const platformFeeRecordType = ["aansluitingskosten", "connection fee", "costi di connessione", "verbindungskosten", "custo de conectividade", "frais de connexion", "juros", "corporate action"];

    return platformFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isInterest(record: DeGiroRecord): boolean {

    const platformFeeRecordType = ["degiro courtesy"];

    return platformFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isStockSplitRecord(record: DeGiroRecord): boolean {
    if (!record || !record.description) return false;
    const stockSplitMarkers = ["ajustement fractionnement", "stock split", "aktiensplit", "frazionamento"];
    return stockSplitMarkers.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private findSplitSibling(record: DeGiroRecord, remaining: DeGiroRecord[]): DeGiroRecord | null {
    return remaining.find(r =>
      r.isin === record.isin &&
      r.date === record.date &&
      r.time === record.time &&
      this.isStockSplitRecord(r)) || null;
  }

  private parseSplitDescription(description: string): { qty: number; px: number } | null {
    // Match: "Ajustement fractionnement: 30 NVIDIA Corporation @ 120,888 USD (US67066G1040)"
    // Also:  "Ajustement fractionnement: 3 NVIDIA Corporation @ 1 208,88 USD (US67066G1040)"
    // Quantity is the first integer, price is the number after '@' (allowing thin/regular spaces
    // as thousands separators and comma as decimal separator).
    const m = description.match(/:\s*([0-9]+)\s.+@\s*([0-9\s\u00A0.,]+?)\s+[A-Z]{3}/);
    if (!m) return null;
    const qty = parseInt(m[1], 10);
    const pxStr = m[2].replace(/[\s\u00A0]/g, "").replace(",", ".");
    const px = parseFloat(pxStr);
    if (isNaN(qty) || isNaN(px)) return null;
    return { qty, px };
  }
}
