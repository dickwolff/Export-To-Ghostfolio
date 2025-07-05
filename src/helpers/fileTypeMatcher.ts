/**
 * File type matcher service for detecting broker CSV formats
 * Based on CSV header patterns
 */
export class FileTypeMatcher {
    private static headers: Map<string, string> = new Map([
        [`Datum;Konto;Typ av transaktion;Värdepapper/beskrivning;Antal;Kurs;Belopp;Transaktionsvaluta;Courtage (SEK);Valutakurs;Instrumentvaluta;ISIN;Resultat`, "avanza"],
        [`Timezone,Date,Time,Type,Currency,Amount,Quote Currency,Quote Price,Received / Paid Currency,Received / Paid Amount,Fee currency,Fee amount,Status,Transaction ID,Address`, "bitvavo"],
        [`Transaction Time (CET),Transaction Category,Transaction Type,Asset Id,Asset Name,Asset Currency,Transaction Currency,Currency Pair,Exchange Rate,Transaction Amount,Trade Amount,Trade Price,Trade Quantity,Cash Balance Amount,Profit And Loss Amount,Profit And Loss Currency`, "bux"],
        [`ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes`, "coinbase"],
        [`"Type","Buy","Cur.","Sell","Cur.","Fee","Cur.","Exchange","Group","Comment","Date","Tx-ID"`, "cointracking"],
        [`Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id`, "degiro"],
        [`Date,Way,Base amount,Base currency (name),Base type,Quote amount,Quote currency,Exchange,Sent/Received from,Sent to,Fee amount,Fee currency (name),Broker,Notes`, "delta"],
        [`Data operazione,Data valuta,Tipo operazione,Ticker,Isin,Protocollo,Descrizione,Quantità,Importo euro,Importo Divisa,Divisa,Riferimento ordine`, "directa"],
        [`Date,Type,Details,Amount,Units,Realized Equity Change,Realized Equity,Balance,Position ID,Asset type,NWA`, "etoro"],
        [`Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance`, "finpension"],
        [`Title,Type,Timestamp,Account Currency,Total Amount,Buy / Sell,Ticker,ISIN,Price per Share in Account Currency,Stamp Duty,Quantity,Venue,Order ID,Order Type,Instrument Currency,Total Shares Amount,Price per Share,FX Rate,Base FX Rate,FX Fee (BPS),FX Fee Amount,Dividend Ex Date,Dividend Pay Date,Dividend Eligible Quantity,Dividend Amount Per Share,Dividend Gross Distribution Amount,Dividend Net Distribution Amount,Dividend Withheld Tax Percentage,Dividend Withheld Tax Amount`, "freetrade"],
        [`"Buy/Sell","TradeDate","ISIN","Quantity","TradePrice","TradeMoney","CurrencyPrimary","IBCommission","IBCommissionCurrency"`, "ibkr"],
        [`"Type","SettleDate","ISIN","Description","Amount","CurrencyPrimary"`, "ibkr"],
        [`Trades Date,Exchange,Symbol,Side,Trades Count,Average Price,Total Volume,Total Value,Total Fees,Account ID,Account Name`, "investimental"],
        [`"datetime";"date";"time";"price";"shares";"amount";"tax";"fee";"realizedgains";"type";"broker";"assettype";"identifier";"wkn";"originalcurrency";"currency";"fxrate";"holding";"holdingname";"holdingnickname";"exchange";"avgholdingperiod"`, "parqet"],
        [`Portefeuille;Naam;Datum;Type mutatie;Valuta mutatie;Volume;Koers;Valuta koers;Valuta kosten €;Waarde;Bedrag;Isin code;Tijd;Beurs`, "rabobank"],
        [`Symbol,Type,Quantity,Price,Value,Fees,Date`, "revolut"],
        [`Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate`, "revolut"],
        [`Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,Instrument currency,Exchange Description,Instrument Symbol,Event,Amount,Order ID,Conversion Rate`, "saxo"],
        [`Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount`, "schwab"],
        [`Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency`, "swissquote"],
        [`Datum;Transactietype;Waarde (netto);Opmerking;ISIN;Aantal;Kosten;Belasting`, "traderepublic"],
        [`Date;Type;Value;Note;ISIN;Shares;Fees;Taxes`, "traderepublic"],
        [`Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee`, "trading212"],
        [`ID;Type;Time;Symbol;Comment;Amount`, "xtb"]
    ]);

    /**
     * Detect file type based on CSV content
     * @param fileContent The full CSV content
     * @returns The detected converter type or null if not detected
     */
    public static detectFileType(fileContent: string): string | null {
        const firstLine = fileContent.split('\n')[0].trim();
        if (!firstLine) return null;

        // Use closest-match algorithm (simplified implementation)
        const closestMatch = this.findClosestMatch(firstLine, Array.from(this.headers.keys()));
        
        if (closestMatch) {
            let converter = this.headers.get(closestMatch);
            
            // Apply DEGIRO V3 logic if environment variable is set
            if (converter === "degiro" && `${process.env.DEGIRO_FORCE_V3}` === "true") {
                converter = "degiro-v3";
            }
            
            return converter || null;
        }

        return null;
    }

    /**
     * Get all header patterns
     * @returns Map of header patterns to converter names
     */
    public static getHeaders(): Map<string, string> {
        return new Map(this.headers);
    }

    /**
     * Get list of all supported converters
     * @returns Array of converter names
     */
    public static getSupportedConverters(): string[] {
        return Array.from(new Set(this.headers.values()));
    }

    /**
     * Find the closest matching header pattern
     * @param target The target string to match
     * @param candidates Array of candidate strings
     * @returns The closest matching string or null
     */
    private static findClosestMatch(target: string, candidates: string[]): string | null {
        let bestMatch: string | null = null;
        let bestScore = 0;
        
        for (const candidate of candidates) {
            const similarity = this.calculateSimilarity(target, candidate);
            if (similarity > bestScore) {
                bestScore = similarity;
                bestMatch = candidate;
            }
        }
        
        // Only return a match if similarity is above a threshold
        return bestScore > 0.7 ? bestMatch : null;
    }

    /**
     * Calculate similarity between two strings
     * @param str1 First string
     * @param str2 Second string
     * @returns Similarity score between 0 and 1
     */
    private static calculateSimilarity(str1: string, str2: string): number {
        const shorter = str1.length < str2.length ? str1 : str2;
        const longer = str1.length < str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.getEditDistance(shorter, longer);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance between two strings
     * @param str1 First string
     * @param str2 Second string
     * @returns Edit distance
     */
    private static getEditDistance(str1: string, str2: string): number {
        const matrix: number[][] = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }
}
