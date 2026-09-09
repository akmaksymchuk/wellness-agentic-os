export type KnowledgeChunk = {
  file: string;
  heading: string;
  content: string;
};

const HEADING_PATTERN = /^##\s+(.+)$/gm;

export function chunkMarkdown(file: string, markdown: string): KnowledgeChunk[] {
  const headings = Array.from(markdown.matchAll(HEADING_PATTERN));
  return headings
    .map((heading, index) => {
      const start = heading.index ?? 0;
      const end = headings[index + 1]?.index ?? markdown.length;
      return {
        file,
        heading: heading[1].trim(),
        content: markdown.slice(start, end).trim(),
      };
    })
    .filter((chunk) => chunk.heading.length > 0 && chunk.content.length > 0);
}
