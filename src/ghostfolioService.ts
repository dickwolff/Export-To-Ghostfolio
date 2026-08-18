/* istanbul ignore file */

import * as fs from "fs";

export default class GhostfolioService {

    private cachedBearerToken: string | null = null;

    constructor() {

        if (!process.env.GHOSTFOLIO_URL) {
            throw new Error("Ghostfolio URL not provided!");
        }

        if (!process.env.GHOSTFOLIO_SECRET) {
            throw new Error("Ghostfolio secret not provided!");
        }
    }

    /**
      * Validate an export file to Ghostfolio
      * 
      * @param path The path to the Ghostfolio export file.
      * @returns Wether the export file is valid and can be processed by Ghostfolio.
      */
    public async validate(path: string, retryCount: number = 0): Promise<boolean> {

        // Check wether validation is allowed.
        if (!process.env.GHOSTFOLIO_VALIDATE) {
            throw new Error("Validate is not allowed by config!");
        }

        // Stop after retrycount 3, if it doesn't work now it probably never will...
        if (retryCount >= 3) {
            throw new Error("Failed to validate export file because of authentication error..")
        }

        // Read file and prepare request body.
        const fileToValidate = fs.readFileSync(path, { encoding: "utf-8" });
        const requestBody = {
            activities: JSON.parse(fileToValidate).activities
        }

        if (!this.cachedBearerToken) {
            await this.authenticate();
        }

        // Try validation.
        const validationResult = await fetch(`${process.env.GHOSTFOLIO_URL}/api/v1/import?dryRun=true`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.cachedBearerToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        // Check if response was unauthorized. If so, refresh token and try again.
        if (validationResult.status === 401) {
            await this.authenticate(true);
            return await this.validate(path, retryCount + 1);
        }

        // If status is 400, then import failed.
        // Look in response for reasons and log those.
        if (validationResult.status === 400) {
            console.log(`[e] Validation failed!`);

            const response = await validationResult.json();
            if (response?.message) {
                response.message.forEach((message: string) => {
                    console.log(`[e]\t${message}`);
                });
            }

            return false;
        }

        return validationResult.status === 200 || validationResult.status === 201 || validationResult.status === 204;
    }

    /**
      * Import an export file into Ghostfolio
      * 
      * @param path The path to the Ghostfolio export file.
      * @returns The amount of records imported.
      */
    public async import(path: string, retryCount: number = 0): Promise<number> {

        // Check wether validation is allowed.
        if (!process.env.GHOSTFOLIO_IMPORT) {
            throw new Error("Auto import is not allowed by config!");
        }

        // Stop after retrycount 3, if it doesn't work now it probably never will...
        if (retryCount >= 3) {
            throw new Error("Failed to automatically import export file because of authentication error..")
        }

        // Read file and prepare request body.
        const fileToValidate = fs.readFileSync(path, { encoding: "utf-8" });
        const requestBody = {
            activities: JSON.parse(fileToValidate).activities
        }

        if (!this.cachedBearerToken) {
            await this.authenticate();
        }

        // Try import.
        const importResult = await fetch(`${process.env.GHOSTFOLIO_URL}/api/v1/import?dryRun=false`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.cachedBearerToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        // Check if response was unauthorized. If so, refresh token and try again.
        if (importResult.status === 401) {
            await this.authenticate(true);
            return await this.import(path, retryCount + 1);
        }

        const response = await importResult.json();

        // If status is 400, then import failed.
        // Look in response for reasons and log those.
        if (importResult.status === 400) {
            console.log(`[e] Import failed!`);

            if (response?.message) {
                response.message.forEach((message: string) => {
                    console.log(`[e]\t${message}`);
                });
            }

            // It failed, so throw erro and stop.
            throw new Error("Automatic import failed! See the logs for more details.");
        }

        return response?.activities?.length ?? 0;
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
