const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

module.exports = function (eleventyConfig) {
    eleventyConfig.addPassthroughCopy({ "src/css": "css" });
    eleventyConfig.addPassthroughCopy({ "src/js": "js" });
    eleventyConfig.addPassthroughCopy({ "src/images": "images" });
    eleventyConfig.addPassthroughCopy({ "src/fonts": "fonts" });
    eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
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

    // JS inline einbetten (wird vom Server mit dem HTML per gzip komprimiert)
    // {% inlineJs "src/js/main.js" %}
    eleventyConfig.addShortcode("inlineJs", (relPath) => {
        return fs.readFileSync(path.join(__dirname, relPath), "utf-8")
            .replace(/^\s*\/\/.*$/gm, "")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\n\s+/g, "\n")
            .replace(/\n+/g, "\n")
            .trim();
    });

    // CSS minifiziert inline einbetten: spart eine render-blockierende Anfrage.
    // {% inlineCss "src/css/style.css" %}
    eleventyConfig.addShortcode("inlineCss", (relPath) => {
        return fs.readFileSync(path.join(__dirname, relPath), "utf-8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\s+/g, " ")
            .replace(/\s*([{}:;,>])\s*/g, "$1")
            .replace(/;}/g, "}")
            .trim();
    });

    return {
        dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    };
};
