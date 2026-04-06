/**
 * Represents a CSV record that was skipped during conversion,
 * together with the reason it was not imported.
 */
export interface SkippedRecord {

    /** 1-based line number in the original input file (including header row). */
    lineNumber: number;

    /** The raw CSV line as it appeared in the input file. */
    rawLine: string;

    /** Human-readable reason why this record was not imported. */
    reason: string;
}
