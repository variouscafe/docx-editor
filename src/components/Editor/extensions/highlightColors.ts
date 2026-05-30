import Highlight from "@tiptap/extension-highlight";

export const HighlightExtension = Highlight.configure({
  multicolor: true,
  HTMLAttributes: {
    class: "highlight",
  },
});

export const highlightColors = [
  { name: "Yellow", color: "#fef08a" },
  { name: "Green", color: "#bbf7d0" },
  { name: "Blue", color: "#bfdbfe" },
  { name: "Red", color: "#fecaca" },
  { name: "Purple", color: "#e9d5ff" },
];
