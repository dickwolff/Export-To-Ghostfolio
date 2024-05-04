import * as fs from "fs";

interface Ghostfolio {

    /**
     * Validate an export file to Ghostfolio
     * 
     * @param path The path to the Ghostfolio export file.
     * @returns Wether the export file is valid and can be processed by Ghostfolio.
     */
    validate(path: string): Promise<boolean>;

    /**
     * Import an export file into Ghostfolio
     * 
     * @param path The path to the Ghostfolio export file.
     * @returns The amount of records imported.
     */
    import(path: string): Promise<number>;
}

class GhostfolioService implements Ghostfolio {

    private cachedBearerToken: string;

    constructor() {

        if (!process.env.GHOSTFOLIO_URL) {
            throw new Error("Ghostfolio URL not provided!");
        }

        if (!process.env.GHOSTFOLIO_SECRET) {
            throw new Error("Ghostfolio secret not provided!");
        }
    }

    /** @inheritdoc */
    public async validate(path: string, progress?: any, retryCount: number = 0): Promise<boolean> {

        // Check wether validation is allowed.
        if (!process.env.GHOSTFOLIO_VALIDATE) {
            throw new Error("Validate is not allowed by config!");
        }

        // Stop after retrycount 3, if it doesn't work now it probably never will...
        if (retryCount === 3) {
            throw new Error("Failed to validate export file because of authentication error..")
        }

        const fileToValidate = fs.readFileSync(path, { encoding: "utf-8" });

        // Try validation.
        const validationResult = await fetch(`${process.env.GHOSTFOLIO_URL}/api/v1/import?dryRun=true`, {
            method: "POST",
            headers: [["Authorization", `Bearer ${this.cachedBearerToken}`]],
            body: JSON.stringify(fileToValidate)
        });

        // Check if response was unauthorized. If so, refresh token and try again.
        if (validationResult.status === 401) {

            progress?.log(`[i] Ghostfolio access token is not valid! Retrying...\n`);

            await this.authenticate(true);
            return await this.validate(path, retryCount++);
        }

        // If status is 400, then import failed. 
        // Look in response for reasons and log those.
        if (validationResult.status === 400) {

            progress?.log(`[e] Validation failed!\n`);

            var response = await validationResult.json();
            response.message.forEach(message => {
                progress?.log(`[e]\t${message}\n`);
            });

            return false;
        }

        progress?.log(`[i] Validation was succesful!\n`);
        return validationResult.status === 201;
    }

    /** @inheritdoc */
    public async import(path: string, progress?: any, retryCount: number = 0): Promise<number> {

        // Check wether validation is allowed.
        if (!process.env.GHOSTFOLIO_IMPORT) {
            throw new Error("Auto import is not allowed by config!");
        }

        // Stop after retrycount 3, if it doesn't work now it probably never will...
        if (retryCount === 3) {
            throw new Error("Failed to automatically import export file because of authentication error..")
        }

        const fileToValidate = fs.readFileSync(path, { encoding: "utf-8" });

        // Try import.
        const validationResult = await fetch(`${process.env.GHOSTFOLIO_URL}/api/v1/import?dryRun=false`, {
            method: "POST",
            headers: [["Authorization", `Bearer ${this.cachedBearerToken}`]],
            body: JSON.stringify(fileToValidate)
        });

        // Check if response was unauthorized. If so, refresh token and try again.
        if (validationResult.status === 401) {
       
            progress?.log(`[i] Ghostfolio access token is not valid! Retrying...\n`);

            await this.authenticate(true);
            return await this.import(path, retryCount++);
        }

        var response = await validationResult.json();

        // If status is 400, then import failed. 
        // Look in response for reasons and log those.
        if (validationResult.status === 400) {
       
            progress?.log(`[e] Import failed!\n`);

            response.message.forEach(message => {
                progress?.log(`[e]\t${message}\n`);
            });

            // It failed, so throw erro and stop.
            throw new Error("Automatic import failed! See the logs for more details.");
        }

        progress?.log(`[i] Import was succesful!\n`);
        return response.activities.length;
    }

    private async authenticate(refresh: boolean = false): Promise<void> {

        // Only get bearer when it isn't set or has to be refreshed.
        if (!this.cachedBearerToken || refresh) {

            // Retrieve bearer token for authentication.
            const bearerResponse = await fetch(`${process.env.GHOSTFOLIO_URL}/api/v1/auth/anonymous/${process.env.GHOSTFOLIO_SECRET}`);
            const bearer = await bearerResponse.json();
            this.cachedBearerToken = bearer.authToken;
            return;
        }
    }
}

export {
    Ghostfolio,
    GhostfolioService
}
