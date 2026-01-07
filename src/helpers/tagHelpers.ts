/**
 * Get tags from the GHOSTFOLIO_TAGS environment variable.
 * Tags should be provided as a comma-separated list of UUIDs.
 *
 * @returns An array of tag UUIDs.
 */
function getTags(): string[] {
    const tagsEnv = process.env.GHOSTFOLIO_TAGS;

    if (!tagsEnv || tagsEnv.trim() === "") {
        return [];
    }

    // Split by comma and trim whitespace from each tag
    return tagsEnv.split(",").map(tag => tag.trim()).filter(tag => tag !== "");
}

export {
    getTags
}

