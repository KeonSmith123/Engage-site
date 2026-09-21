module.exports = {
  layout: "layouts/case-study.njk",
  tags: ["caseStudy"],
  eleventyComputed: {
    permalink: (data) =>
      data.draft ? false : `/case-studies/${data.page.fileSlug}/`,
    eleventyExcludeFromCollections: (data) => data.draft === true,
  },
};
