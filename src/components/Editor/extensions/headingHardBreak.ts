import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

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
            const headingNode = $from.node(d);
            // Empty heading → default splitBlock (creates paragraph)
            if (headingNode.content.size === 0) {
              return false;
            }
            // Cursor at the very start of heading text:
            // Use a raw transaction to insert hard break and explicitly control
            // cursor position, preventing the cursor from jumping to the bottom.
            if ($from.parentOffset === 0) {
              const { tr, schema } = editor.state;
              const hardBreak = schema.nodes.hardBreak;
              if (!hardBreak) return false;
              const pos = $from.pos;
              const brNode = hardBreak.create();
              tr.insert(pos, brNode);
              tr.setSelection(
                TextSelection.create(tr.doc, pos + brNode.nodeSize)
              );
              tr.scrollIntoView();
              editor.view.dispatch(tr);
              return true;
            }
            // Cursor in the middle or at the end of heading text
            return editor.commands.setHardBreak();
          }
        }
        return false; // not in heading → default behavior
      },
    };
  },
});
