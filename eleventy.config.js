const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

module.exports = function (eleventyConfig) {
    eleventyConfig.addPassthroughCopy({ "src/css": "css" });
    eleventyConfig.addPassthroughCopy({ "src/js": "js" });
    eleventyConfig.addPassthroughCopy({ "src/images": "images" });
    eleventyConfig.addWatchTarget("src/css/");
    eleventyConfig.addWatchTarget("src/js/");

    // Cache-Busting: {% assetHash "src/css/style.css" %}
    eleventyConfig.addShortcode("assetHash", (relPath) => {
        try {
            const buf = fs.readFileSync(path.join(__dirname, relPath));
            return crypto.createHash("md5").update(buf).digest("hex").slice(0, 8);
        } catch (e) {
            return Date.now().toString();
        }
    });

    return {
        dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    };
};
