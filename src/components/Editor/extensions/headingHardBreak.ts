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
            // If the heading is empty, exit the heading (create a paragraph below)
            const headingNode = $from.node(d);
            if (headingNode.content.size === 0) {
              return false; // let default splitBlock handle it → creates empty paragraph
            }
            return editor.commands.setHardBreak();
          }
        }
        return false; // not in heading → default behavior
      },
    };
  },
});
