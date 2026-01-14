/**
 * Get tags from the GHOSTFOLIO_TAG_IDS environment variable.
 * Tags should be provided as a comma-separated list of UUIDs.
 *
 * @returns An array of tag UUIDs.
 */
function getTags(): string[] {
    const tagsEnv = process.env.GHOSTFOLIO_TAG_IDS;

    if (!tagsEnv || tagsEnv.trim() === "") {
        return [];
    }

    // Split by comma and trim whitespace from each tag
    return tagsEnv.split(",").map(tag => tag.trim()).filter(tag => tag !== "");
}

export {
    getTags
}

