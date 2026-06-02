import { Extension } from "@tiptap/core";

/**
 * Custom TipTap extension that intercepts the Enter key inside heading nodes
 * and inserts a hard break (<br>) instead of splitting the heading into two.
 *
 * Default TipTap behavior: Enter in a heading → splitBlock → two separate headings.
 * With this extension: Enter in a heading → setHardBreak → line break within heading.
 *
 * Falls through to default behavior for:
 * - Non-heading nodes (paragraphs, etc.)
 * - Empty headings (creates a new paragraph instead)
 * - Cursor at the very beginning of a heading (splits heading instead)
 */
export const HeadingHardBreak = Extension.create({
  name: "headingHardBreak",

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;

        // Walk up the node tree to find a heading ancestor
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === "heading") {
            const headingNode = $from.node(d);
            // Empty heading → default splitBlock (creates paragraph)
            if (headingNode.content.size === 0) {
              return false;
            }
            // Cursor at the very start of heading text → default splitBlock
            // (prevents cursor jumping to bottom after setHardBreak at position 0)
            if ($from.parentOffset === 0) {
              return false;
            }
            return editor.commands.setHardBreak();
          }
        }
        return false; // not in heading → default behavior
      },
    };
  },
});
