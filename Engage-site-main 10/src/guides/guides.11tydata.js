module.exports = {
  layout: "layouts/guide.njk",
  tags: ["guide"],
  eleventyComputed: {
    // Drafts neither render nor appear in collections.
    permalink: (data) =>
      data.draft ? false : `/guides/${data.page.fileSlug}/`,
    eleventyExcludeFromCollections: (data) => data.draft === true,
  },
};
