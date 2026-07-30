module.exports = {
  layout: "layouts/webinar.njk",
  tags: ["webinar"],
  eleventyComputed: {
    // Drafts neither render nor appear in collections.
    permalink: (data) =>
      data.draft ? false : `/webinars/${data.page.fileSlug}/`,
    eleventyExcludeFromCollections: (data) => data.draft === true,
  },
};
