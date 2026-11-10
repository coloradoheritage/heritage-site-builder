/**
 * Blog posts that staff have saved but not published carry `draft: true`. They live only in the private
 * draft document; this removes them from anything that becomes (or is served as) the public site content.
 * Pure and dependency-free so it can be tested on its own.
 */
export function withoutDraftPosts<T extends Record<string, unknown>>(content: T): T {
  const news = content.news;
  if (!Array.isArray(news) || !news.some((post) => post && typeof post === "object" && (post as { draft?: unknown }).draft === true)) {
    return content;
  }
  return { ...content, news: news.filter((post) => !(post && typeof post === "object" && (post as { draft?: unknown }).draft === true)) };
}
