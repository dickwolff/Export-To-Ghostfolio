import { FileTypeMatcher } from "../helpers/fileTypeMatcher";

describe("fileTypeMatcher", () => {

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("detectFileType()", () => {
        it("should return null for empty content", () => {
            
            // Arrange
            const emptyContent = "";

            // Act
            const result = FileTypeMatcher.detectFileType(emptyContent);

            // Assert
            expect(result).toBeNull();
        });

        it("should return null for unrecognized CSV header", () => {
           
            // Arrange
            const unknownHeader = "Unknown,Header,Format,That,Does,Not,Match,Any,Converter";
            const csvContent = `${unknownHeader}\ndata,data,data,data,data,data,data,data,data`;

            // Act
            const result = FileTypeMatcher.detectFileType(csvContent);

            // Assert
            expect(result).toBeNull();
        });

        it("should detect Delta onverter with header match", () => {
          
            // Arrange
            const exactDeltaHeader = "Date,Way,Base amount,Base currency (name),Base type,Quote amount,Quote currency,Exchange,Sent/Received from,Sent to,Fee amount,Fee currency (name),Broker,Notes";

            // Act
            const result = FileTypeMatcher.detectFileType(exactDeltaHeader);

            // Assert
            expect(result).toBe("delta");
        });
    });
});
