import { getTags } from "./tagHelpers";

describe("tagHelpers", () => {

    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe("getTags()", () => {

        it("should return empty array when GHOSTFOLIO_TAG_IDS is not set", () => {
            delete process.env.GHOSTFOLIO_TAG_IDS;

            const result = getTags();

            expect(result).toEqual([]);
        });

        it("should return empty array when GHOSTFOLIO_TAG_IDS is empty string", () => {
            process.env.GHOSTFOLIO_TAG_IDS = "";

            const result = getTags();

            expect(result).toEqual([]);
        });

        it("should return empty array when GHOSTFOLIO_TAG_IDS is whitespace only", () => {
            process.env.GHOSTFOLIO_TAG_IDS = "   ";

            const result = getTags();

            expect(result).toEqual([]);
        });

        it("should return single tag when one UUID is provided", () => {
            process.env.GHOSTFOLIO_TAG_IDS = "da358a78-3663-4969-91ad-89282e106832";

            const result = getTags();

            expect(result).toEqual(["da358a78-3663-4969-91ad-89282e106832"]);
        });

        it("should return multiple tags when comma-separated UUIDs are provided", () => {
            process.env.GHOSTFOLIO_TAG_IDS = "da358a78-3663-4969-91ad-89282e106832,4ea81352-3b84-4dfa-acdb-fec6ce0f7230";

            const result = getTags();

            expect(result).toEqual([
                "da358a78-3663-4969-91ad-89282e106832",
                "4ea81352-3b84-4dfa-acdb-fec6ce0f7230"
            ]);
        });

        it("should trim whitespace from tags", () => {
            process.env.GHOSTFOLIO_TAG_IDS = " da358a78-3663-4969-91ad-89282e106832 , 4ea81352-3b84-4dfa-acdb-fec6ce0f7230 ";

            const result = getTags();

            expect(result).toEqual([
                "da358a78-3663-4969-91ad-89282e106832",
                "4ea81352-3b84-4dfa-acdb-fec6ce0f7230"
            ]);
        });

        it("should filter out empty strings from result", () => {
            process.env.GHOSTFOLIO_TAG_IDS = "da358a78-3663-4969-91ad-89282e106832,,4ea81352-3b84-4dfa-acdb-fec6ce0f7230";

            const result = getTags();

            expect(result).toEqual([
                "da358a78-3663-4969-91ad-89282e106832",
                "4ea81352-3b84-4dfa-acdb-fec6ce0f7230"
            ]);
        });

        it("should handle tags with only whitespace between commas", () => {
            process.env.GHOSTFOLIO_TAG_IDS = "da358a78-3663-4969-91ad-89282e106832,   ,4ea81352-3b84-4dfa-acdb-fec6ce0f7230";

            const result = getTags();

            expect(result).toEqual([
                "da358a78-3663-4969-91ad-89282e106832",
                "4ea81352-3b84-4dfa-acdb-fec6ce0f7230"
            ]);
        });
    });
});

