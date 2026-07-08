module.exports = function (eleventyConfig) {
  // Copy static assets and the Decap CMS admin straight through to the build.
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/admin");

  // Mark a nav link active when the current page sits under it.
  eleventyConfig.addFilter("isActive", function (linkUrl, pageUrl) {
    if (!linkUrl || !pageUrl) return false;
    if (linkUrl === "/") return pageUrl === "/";
    return pageUrl.indexOf(linkUrl) === 0;
  });

  // Ordered, draft-free collections. Drafts are already excluded from
  // collections by the directory-data files; the filter here is belt-and-braces.
  const byOrder = (a, b) => (a.data.order || 0) - (b.data.order || 0);
  eleventyConfig.addCollection("guide", (c) =>
    c.getFilteredByTag("guide").filter((i) => !i.data.draft).sort(byOrder)
  );
  eleventyConfig.addCollection("caseStudy", (c) =>
    c.getFilteredByTag("caseStudy").filter((i) => !i.data.draft).sort(byOrder)
  );

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"]
  };
};
