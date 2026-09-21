// Precomputes the hero video's player embed src from media.json's heroVideo.
// Accepts a YouTube URL (preferred) or a legacy Vimeo URL, so this can be
// flipped between providers without touching index.njk. Lives in the data
// cascade (a normal committed file) so index.njk doesn't depend on the
// vimeoSrc/ytId filters in .eleventy.js. Same parsing logic as those filters.
const media = require("./media.json");

function ytId(input) {
  const s = String(input).trim();
  const m =
    s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/) ||
    s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : "";
}

function vimeoSrc(input) {
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

function embedSrc(input) {
  if (!input) return "";
  const s = String(input).trim();
  if (/youtu/.test(s)) {
    const id = ytId(s);
    if (id) return "https://www.youtube.com/embed/" + id + "?rel=0&modestbranding=1";
  }
  return vimeoSrc(s);
}

module.exports = embedSrc(media.heroVideo);
