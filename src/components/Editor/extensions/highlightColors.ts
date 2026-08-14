import Highlight from "@tiptap/extension-highlight";

export const HighlightExtension = Highlight.configure({
  multicolor: true,
  HTMLAttributes: {
    class: "highlight",
  },
});

// 형광펜 색 팔레트. name 은 코드상 폴백 라벨이며, 화면 표시명(툴팁/aria-label)은
// key 로 지정된 i18n 키(`toolbar.colors.*`)를 통해 각 로케일로 번역된다.
export const highlightColors = [
  { name: "Yellow", key: "toolbar.colors.yellow", color: "#fef08a" },
  { name: "Green", key: "toolbar.colors.green", color: "#bbf7d0" },
  { name: "Blue", key: "toolbar.colors.blue", color: "#bfdbfe" },
  { name: "Red", key: "toolbar.colors.red", color: "#fecaca" },
  { name: "Purple", key: "toolbar.colors.purple", color: "#e9d5ff" },
];
