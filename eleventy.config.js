// WorkInFlow site starter: Eleventy config.
// Only .njk and .md are templates. Plain .html (e.g. src/admin) is copied as-is.

const markdownIt = require("markdown-it");
const md = markdownIt({ html: true, linkify: true });

module.exports = function (eleventyConfig) {
  // --- Passthrough copy ---------------------------------------------------
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/admin");
  eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });
  eleventyConfig.addPassthroughCopy({ "src/favicon.png": "favicon.png" });

  // --- Collections --------------------------------------------------------
  // Guides: every Markdown file in src/guides, sorted by `order` then title.
  eleventyConfig.addCollection("guides", (api) =>
    api
      .getFilteredByGlob("src/guides/*.md")
      .sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99) || a.data.title.localeCompare(b.data.title))
  );

  // Logos: data-only Markdown files in src/logos (no pages are written).
  eleventyConfig.addCollection("logos", (api) =>
    api.getFilteredByGlob("src/logos/*.md").sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99))
  );

  // --- Filters ------------------------------------------------------------
  eleventyConfig.addFilter("absoluteUrl", (path, base) => {
    try {
      return new URL(path, base).href;
    } catch {
      return path;
    }
  });

  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));

  // YouTube ID from a full URL or a bare ID.
  eleventyConfig.addFilter("youtubeId", (v) => {
    if (!v) return "";
    const m = String(v).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : String(v).trim();
  });

  // Render a Markdown string from frontmatter (e.g. a gated guide's preview).
  eleventyConfig.addFilter("md", (s) => (s ? md.render(String(s)) : ""));

  eleventyConfig.addFilter("head", (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : arr));

  eleventyConfig.addShortcode("year", () => String(new Date().getFullYear()));

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
