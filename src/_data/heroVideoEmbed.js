// Precomputes the Vimeo player embed src from media.json's heroVideo.
// This lives in the data cascade (a normal committed file) so index.njk
// doesn't depend on the vimeoSrc filter in .eleventy.js. Same parsing logic.
const media = require("./media.json");

function vimeoSrc(input) {
  if (!input) return "";
  const s = String(input).trim();
  let id = "", hash = "", m;
  if ((m = s.match(/player\.vimeo\.com\/video\/(\d+)/))) {
    id = m[1];
    const hp = s.match(/[?&]h=([A-Za-z0-9]+)/);
    if (hp) hash = hp[1];
  } else if ((m = s.match(/vimeo\.com\/(\d+)(?:\/([A-Za-z0-9]+))?/))) {
    id = m[1];
    if (m[2]) hash = m[2];
  } else if ((m = s.match(/^(\d+)(?:\/([A-Za-z0-9]+))?$/))) {
    id = m[1];
    if (m[2]) hash = m[2];
  }
  if (!id) return "";
  let src = "https://player.vimeo.com/video/" + id + "?";
  if (hash) src += "h=" + hash + "&";
  return src + "dnt=1&title=0&byline=0&portrait=0";
}

module.exports = vimeoSrc(media.heroVideo);
