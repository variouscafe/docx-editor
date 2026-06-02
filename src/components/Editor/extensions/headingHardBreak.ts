import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const headingBreakKey = new PluginKey("headingBreakFix");

/**
 * Insert a hard break at the given position and place the cursor after it.
 * Uses a raw transaction for full control over cursor positioning.
 */
function insertHardBreakWithCursor(editor: any, from: number): boolean {
  const { tr, schema } = editor.state;
  const hardBreak = schema.nodes.hardBreak;
  if (!hardBreak) return false;

  const brNode = hardBreak.create();
  tr.insert(from, brNode);

  // Cursor goes right after the hardBreak node
  const cursorPos = from + brNode.nodeSize;
  tr.setSelection(TextSelection.create(tr.doc, cursorPos));
  tr.scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

/**
 * Custom TipTap extension that intercepts the Enter key inside heading nodes
 * and inserts a hard break (<br>) instead of splitting the heading into two.
 *
 * All cases use raw transactions with explicit cursor positioning to prevent
 * the cursor from jumping to unexpected positions.
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
            // All positions: insert hardBreak via raw transaction with explicit cursor
            return insertHardBreakWithCursor(editor, $from.pos);
          }
        }
        return false; // not in heading → default behavior
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingBreakKey,
        props: {
          /**
           * Fix cursor positioning when clicking near hard breaks in headings.
           * ProseMirror sometimes resolves clicks after <br> to the wrong position.
           * This handler detects clicks near hardBreak nodes in headings and
           * places the cursor at the correct position.
           */
          handleClick(view, pos) {
            const $pos = view.state.doc.resolve(pos);
            const parentNode = $pos.parent;

            // Check if we're inside a heading
            let inHeading = false;
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type.name === "heading") {
                inHeading = true;
                break;
              }
            }
            if (!inHeading) return false;

            // Check if there's a hardBreak in this node
            let hasHardBreak = false;
            parentNode.forEach((node: ProseMirrorNode) => {
              if (node.type.name === "hardBreak") hasHardBreak = true;
            });
            if (!hasHardBreak) return false;

            // Check if cursor is right after a hardBreak — fix position if needed
            const nodeBefore = $pos.nodeBefore;
            if (nodeBefore && nodeBefore.type.name === "hardBreak") {
              const fixedPos = $pos.pos;
              const sel = TextSelection.create(view.state.doc, fixedPos);
              if (!sel.eq(view.state.selection)) {
                view.dispatch(view.state.tr.setSelection(sel));
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});
