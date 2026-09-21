// Webinar collection defaults + precomputed video fields.
// The YouTube parsing lives HERE (a normal committed file) rather than as a
// Nunjucks filter in .eleventy.js, so templates never depend on the root
// dotfile being present on the branch.
function ytId(input) {
  if (!input) return "";
  const s = String(input).trim();
  const m =
    s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/) ||
    s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : "";
}
function ytStart(input, explicit) {
  if (explicit || explicit === 0) return parseInt(explicit, 10) || 0;
  if (!input) return 0;
  const m = String(input).match(/[?&](?:t|start)=(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

module.exports = {
  layout: "layouts/webinar.njk",
  tags: ["webinar"],
  eleventyComputed: {
    // Drafts neither render nor appear in collections.
    permalink: (data) =>
      data.draft ? false : `/webinars/${data.page.fileSlug}/`,
    eleventyExcludeFromCollections: (data) => data.draft === true,
    videoId: (data) => ytId(data.youtube),
    videoStart: (data) => ytStart(data.youtube, data.start),
  },
};
