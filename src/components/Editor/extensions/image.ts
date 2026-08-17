import Image from "@tiptap/extension-image";
import { Extension, type Editor, type NodeViewRendererProps } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { API_URL } from "@/api/client";
import { uploadImage, trackImageUpload, type UploadImageResult } from "@/api/uploads";
import { normalizeImageFile } from "@/utils/imageFile";
import { caretPosFromPoint } from "@/utils/caretPos";
import i18n from "@/i18n";
import { toast } from "sonner";

/** 상대 경로(/api/images/…) → 표시용 절대 URL. JSON 저장값은 상대 경로 유지(도메인 독립). */
export function resolveImageSrc(src: string): string {
  return src.startsWith("/") ? API_URL + src : src;
}

/**
 * 블록 이미지 노드 — R2 업로드 src + 하단 캡션(설명).
 * - width/height attrs 는 패키지 내장. 치수를 삽입 시점에 지정 → 브라우저가 로드 전에
 *   aspect-ratio 박스를 예약해 MeasurePagination 측정이 로드 타이밍과 무관하게 안정.
 * - 캡션은 attrs.caption 에 저장하고 NodeView(figure/figcaption) 로 인라인 편집.
 *   contentEditable 자식 + stopEvent 로 PM 개입을 차단해 일반 텍스트처럼 타이핑.
 * - resize 옵션 off — React node view 가 페이지네이션 DOM 측정 모델과 충돌.
 */
export const EditorImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // 업로드 진행 상관 id — 삽입(blob: src) → 업로드 완료(src 교체) 짝짓기용. 미완료 노드 표시.
      "data-upload-id": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-upload-id") || null,
        renderHTML: (attrs) => {
          const v = attrs["data-upload-id"];
          return v ? { "data-upload-id": v } : {};
        },
      },
      // 이미지 하단 설명(캡션). 마크다운 왕복: content_md 의 ![alt](src) alt 와 상호변환.
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-caption") || el.getAttribute("alt") || null,
        renderHTML: (attrs) => {
          const v = attrs.caption;
          return v ? { "data-caption": v } : {};
        },
      },
    };
  },
  // 직렬화(clipboard/getHTML)용 — 저장값(상대 경로) 그대로. 표시용 절대 URL 변환은 NodeView 가 담당.
  renderHTML({ HTMLAttributes }) {
    return ["img", HTMLAttributes];
  },
  addNodeView() {
    return ({ node, view, getPos, editor }: NodeViewRendererProps): NodeView => {
        const figure = document.createElement("figure");
        figure.className = "rm-image-figure";
        // 프레임(이미지 박스) — 핸들이 콘텐츠 폭(figure)이 아닌 실제 이미지 모서리에 붙도록
        // 이미지를 fit-content 래퍼로 감싼다(중앙 정렬 포함).
        const frame = document.createElement("div");
        frame.className = "rm-image-frame";
        const img = document.createElement("img");
        frame.appendChild(img);
        const caption = document.createElement("figcaption");
        caption.className = "rm-image-caption";
        caption.setAttribute("data-placeholder", i18n.t("editor.imageCaptionPlaceholder"));
        figure.appendChild(frame);
        figure.appendChild(caption);

        // 편집 가능 여부 — NodeView 생성 시점엔 PM 이 view.editable 을 아직 확정 전(초기 true)
        // 이므로 options.editable(뷰 생성 전 확정)을 소스로 쓰고, 'create'·'update'(setEditable)
        // 이벤트에서 재보정한다.
        const isEditable = () => {
          // 옵션 타입은 boolean 로 선언돼 있으나 함수형도 허용 — 런타임 방어 겸 처리.
          const e = editor.options.editable as boolean | ((state: typeof view.state) => boolean);
          return typeof e === "function" ? e(view.state) : !!e;
        };
        const syncEditable = () => {
          caption.setAttribute("contenteditable", isEditable() ? "true" : "false");
        };
        syncEditable();
        editor.on("create", syncEditable);
        editor.on("update", syncEditable);

        const applyAttrs = () => {
          const src = String(node.attrs.src ?? "");
          // 빈 src 대입 금지 — "" 는 페이지 URL 로 해석돼 스퓨리어스 요청/깨진 아이콘 유발.
          if (src) img.src = resolveImageSrc(src);
          else img.removeAttribute("src");
          const alt = node.attrs.alt ? String(node.attrs.alt) : "";
          if (alt) img.setAttribute("alt", alt);
          else img.removeAttribute("alt");
          const w = Number(node.attrs.width);
          const h = Number(node.attrs.height);
          if (w > 0) img.setAttribute("width", String(w));
          else img.removeAttribute("width");
          if (h > 0) img.setAttribute("height", String(h));
          else img.removeAttribute("height");
          const title = node.attrs.title ? String(node.attrs.title) : "";
          if (title) img.setAttribute("title", title);
          else img.removeAttribute("title");
          // 캡션 텍스트 — DOM 이 이미 같으면 건드리지 않는다(캐럿 위치 보존).
          const text = typeof node.attrs.caption === "string" ? node.attrs.caption : "";
          if (caption.textContent !== text) caption.textContent = text;
          // 빈 캡션 클래스 — placeholder 표시/숨김은 CSS 가 담당(읽기 전용 숨김 포함).
          caption.classList.toggle("rm-image-caption-empty", !text);
        };
        applyAttrs();

        // 캡션 타이핑 → attrs 동기화. setNodeMarkup 은 NodeView 를 재사용(update)하므로
        // DOM 을 다시 쓰지 않고, textContent 가 이미 같아 캐럿이 유지된다.
        // (읽기 전용 방어 — contenteditable=false 면 발생하지 않아야 함)
        caption.addEventListener("input", () => {
          if (!isEditable()) return;
          const pos = getPos();
          if (typeof pos !== "number") return;
          view.dispatch(
            view.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              caption: caption.textContent ?? "",
            })
          );
        });
        // 캡션은 1줄 — Enter 줄바꿈 차단.
        caption.addEventListener("keydown", (e) => {
          if (e.key === "Enter") e.preventDefault();
        });
        // 캡션 붙여넣기 — 개행 제거한 평문만 삽입.
        caption.addEventListener("paste", (e) => {
          e.preventDefault();
          const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\s*\n+\s*/g, " ");
          if (text) document.execCommand("insertText", false, text);
        });

        // ── 크기 조절: 코너 핸들 드래그(비율 고정) ──────────────────────────────
        // pointer events 로 마우스/터치 통합, 핸들은 touch-action:none 으로 드래그 중 스크롤 차단.
        // 드래그 중엔 img 스타일만 즉시 변경(visual feedback)하고, pointerup 에 setNodeMarkup
        // 1회 커밋 → 트랜잭션/페이지네이션 재측정 스팸 방지 + undo 1스텝.
        const MIN_W = 40;
        const handles: HTMLElement[] = [];
        for (const pos of ["nw", "ne", "sw", "se"] as const) {
          const h = document.createElement("div");
          h.className = `rm-image-handle rm-image-handle-${pos}`;
          h.addEventListener("pointerdown", (e) => {
            if (!isEditable() || e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            try {
              h.setPointerCapture(e.pointerId);
            } catch {
              /* 이미 해제된 포인터 — 무시 */
            }
            const dirX = pos === "nw" || pos === "sw" ? -1 : 1;
            const startX = e.clientX;
            const startW = img.clientWidth || Number(node.attrs.width) || MIN_W;
            const w0 = Number(node.attrs.width) || startW;
            const h0 = Number(node.attrs.height);
            const aspect = w0 > 0 && h0 > 0 ? h0 / w0 : 1;
            const maxW = figure.clientWidth || startW; // figure = 콘텐츠 폭(셀 안이면 셀 폭)
            let lastW = startW;
            const onMove = (ev: PointerEvent) => {
              lastW = Math.max(MIN_W, Math.min(Math.round(startW + dirX * (ev.clientX - startX)), maxW));
              img.style.width = `${lastW}px`;
            };
            const finish = () => {
              h.removeEventListener("pointermove", onMove);
              h.removeEventListener("pointerup", finish);
              h.removeEventListener("pointercancel", finish);
              img.style.width = "";
              if (lastW === startW) return; // 변화 없음 — no-op 트랜잭션 방지
              const p = getPos();
              if (typeof p !== "number") return;
              view.dispatch(
                view.state.tr.setNodeMarkup(p, undefined, {
                  ...node.attrs,
                  width: lastW,
                  height: Math.round(lastW * aspect),
                })
              );
            };
            h.addEventListener("pointermove", onMove);
            h.addEventListener("pointerup", finish);
            h.addEventListener("pointercancel", finish);
          });
          frame.appendChild(h);
          handles.push(h);
        }

        return {
          dom: figure,
          update(newNode: PMNode) {
            if (newNode.type.name !== "image") return false;
            node = newNode;
            applyAttrs();
            return true;
          },
          selectNode() {
            figure.classList.add("ProseMirror-selectednode");
          },
          deselectNode() {
            figure.classList.remove("ProseMirror-selectednode");
          },
          // 캡션·핸들 이벤트는 PM 개입 차단(브라우저 기본 처리/자체 드래그 로직에 맡김).
          stopEvent(e: Event) {
            const t = e.target;
            if (!(t instanceof Node)) return false;
            return caption.contains(t) || handles.some((h) => h.contains(t));
          },
          // 캡션·핸들 DOM 변경은 PM observer 가 무시하도록('selection' 포함).
          ignoreMutation(mutation: { type: string; target: Node }) {
            return (
              mutation.type === "selection" ||
              caption.contains(mutation.target) ||
              handles.some((h) => h.contains(mutation.target))
            );
          },
          destroy() {
            editor.off("create", syncEditable);
            editor.off("update", syncEditable);
          },
        } satisfies NodeView;
    };
  },
}).configure({ inline: false, allowBase64: false });

/** 이미지 크기 프리셋(본문 폭 기준 비율) — 툴바 버튼용. 모바일에서 드래그 대신 원터치. */
export const IMAGE_SIZE_PRESETS = [0.25, 0.5, 0.75, 1] as const;

/** 에디터 콘텐츠 폭(px) — PM 루트 clientWidth 에서 좌우 패딩(마진) 제외. */
export function imageContentWidthPx(editor: Editor): number {
  const dom = editor.view.dom;
  const win = dom.ownerDocument.defaultView;
  const cs = win?.getComputedStyle(dom);
  const pad = cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 0;
  return Math.max(1, dom.clientWidth - (Number.isFinite(pad) ? pad : 0));
}

/** 선택된 이미지의 크기를 본문 폭 기준 pct(0.25~1) 로 설정(비율 유지). */
export function applyImageSizePreset(editor: Editor, pct: number): void {
  const cw = imageContentWidthPx(editor);
  const attrs = editor.getAttributes("image");
  const w0 = Number(attrs.width) || cw;
  const h0 = Number(attrs.height);
  const aspect = w0 > 0 && h0 > 0 ? h0 / w0 : 0.75;
  const w = Math.round(cw * pct);
  editor
    .chain()
    .updateAttributes("image", { width: w, height: Math.round(w * aspect) })
    .run();
}

/** data-transfer 에서 이미지 파일만 추출(clipboardData.files 우선, items 폴백). */
function imageFilesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  if (dt.files && dt.files.length > 0) {
    return Array.from(dt.files).filter((f) => f.type.startsWith("image/"));
  }
  return Array.from(dt.items ?? [])
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter((f): f is File => !!f);
}

/**
 * 업로드 완료 → 대기 노드(blob: src)를 최종 URL 로 교체. data-upload-id 로 탐색(편집/undo 에 강건).
 * - 루프로 state 를 재판독해 한 건씩 교체 — 같은 uploadId 노드가 2개 이상(대기 노드 복붙)이어도
 *   dispatch 직전 캡처한 stale state 로 이중 dispatch 하는 일 없이 모두 교체된다.
 * - 트랜잭션은 히스토리에서 제외 — Undo 1회로 삽입째 제거되고, Undo 로 죽은 blob: src 가
 *   부활해 자동저장으로 영속화되는 일이 없다.
 * - 치수는 노드 현재값 우선: 업로드 중 사용자가 리사이즈했다면 자연 치수로 되돌리지 않는다.
 */
export function swapPendingImageSrc(editor: Editor, uploadId: string, res: UploadImageResult): void {
  if (editor.isDestroyed) return; // 업로드 중 페이지 이동 — dispatch 불가
  for (;;) {
    const { state } = editor;
    let pos: number | null = null;
    state.doc.descendants((node, p) => {
      if (node.type.name !== "image" || node.attrs["data-upload-id"] !== uploadId) return true;
      pos = p;
      return false;
    });
    if (pos == null) break;
    const node = state.doc.nodeAt(pos);
    if (!node) break;
    editor.view.dispatch(
      state.tr
        .setNodeMarkup(pos, undefined, {
          ...node.attrs,
          src: res.url,
          width: node.attrs.width ?? res.width,
          height: node.attrs.height ?? res.height,
          "data-upload-id": null,
        })
        .setMeta("addToHistory", false)
    );
  }
  // 못 찾으면(업로드 중 사용자가 삭제/undo) → 고아 업로드. v1 은 GC 없이 둠.
}

/** 업로드 실패 → 대기 노드 제거 + blob URL 해제. swap 과 동일한 루프·히스토리 제외 원칙. */
export function removePendingImage(editor: Editor, uploadId: string, objUrl: string): void {
  if (editor.isDestroyed) return;
  for (;;) {
    const { state } = editor;
    let pos: number | null = null;
    let size = 0;
    state.doc.descendants((node, p) => {
      if (node.type.name !== "image" || node.attrs["data-upload-id"] !== uploadId) return true;
      pos = p;
      size = node.nodeSize;
      return false;
    });
    if (pos == null) break;
    try {
      editor.view.dispatch(state.tr.delete(pos, pos + size).setMeta("addToHistory", false));
    } catch {
      /* 문서가 이미 바뀐 경우 등 — 남은 blob 노드는 저장 경로 살균(stripBlobImages)이 제거 */
      break;
    }
  }
  URL.revokeObjectURL(objUrl);
}

/** 에디터별 미해제 object URL 추적 — 업로드 성공 후에도 undo/redo 로 재참조될 수 있어
 *  즉시 해제하지 않고, 에디터 파괴(되돌릴 수 없는 시점)에 일괄 revoke 한다(누수 상한). */
const liveObjectUrls = new WeakMap<Editor, Set<string>>();
function trackObjectUrl(editor: Editor, url: string): void {
  let set = liveObjectUrls.get(editor);
  if (!set) {
    set = new Set();
    liveObjectUrls.set(editor, set);
    editor.once("destroy", () => {
      for (const u of set!) URL.revokeObjectURL(u);
      liveObjectUrls.delete(editor);
    });
  }
  set.add(url);
}

/**
 * 파일들 → 정규화 → 즉시 placeholder 노드(blob: src + 치수) 삽입 → 백그라운드 업로드.
 * 성공 시 src 교체, 실패 시 노드 제거+토스트. paste/drop/툴바 버튼이 공유.
 * 삽입 기준점은 진입 시점에 1회 고정 — 정규화 대기 중 캐럿 이동/타이핑으로 파일들이
 * 제각각 위치로 흩어지는 것을 방지하고(붙여넣은 순서도 유지), 삽입 성공분만큼 전진.
 */
export function insertImagesFromFiles(editor: Editor, files: File[], pos?: number): void {
  void (async () => {
    let insertAt = pos ?? editor.state.selection.from;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      let norm;
      try {
        norm = await normalizeImageFile(file);
      } catch {
        toast.error(i18n.t("editor.imageUnsupported"));
        continue;
      }
      const objUrl = URL.createObjectURL(norm.blob);
      trackObjectUrl(editor, objUrl);
      const uploadId = crypto.randomUUID();
      try {
        editor
          .chain()
          .insertContentAt(insertAt, {
            type: "image",
            attrs: {
              src: objUrl,
              alt: "",
              caption: "",
              width: norm.width,
              height: norm.height,
              "data-upload-id": uploadId,
            },
          })
          .run();
      } catch {
        /* 삽입 불가 컨텍스트 — 선택 위치로 재시도 없이 스킵(다음 파일은 선택점 기준) */
        URL.revokeObjectURL(objUrl);
        continue;
      }
      insertAt += 1; // 블록 이미지 노드 크기 — 다음 파일은 방금 삽입된 이미지 바로 뒤
      const pipeline = (async () => {
        try {
          const res = await uploadImage(norm.blob, norm.width, norm.height);
          swapPendingImageSrc(editor, uploadId, res);
        } catch {
          removePendingImage(editor, uploadId, objUrl);
          toast.error(i18n.t("editor.imageUploadFailed"));
        }
      })();
      trackImageUpload(pipeline);
    }
  })();
}

/**
 * 이미지 paste/drop 처리 익스텐션.
 * 표 익스텐션들 뒤에 등록 → 수식 셀 보호 핸들러(tableFormulaPlugin)가 먼저 가로채도록.
 * (ProseMirror 은 등록 순서대로 handle* 호출, 먼저 truthy 를 반환한 쪽이 처리.)
 */
export const ImageUpload = Extension.create({
  name: "imageUpload",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("imageUpload"),
        props: {
          handlePaste(view, event) {
            if (!view.editable) return false;
            const files = imageFilesFromDataTransfer(event.clipboardData);
            if (!files.length) return false;
            event.preventDefault();
            insertImagesFromFiles(editor, files, view.state.selection.from);
            return true;
          },
          handleDrop(view, event, _slice, moved) {
            if (moved || !view.editable) return false;
            const files = imageFilesFromDataTransfer(event.dataTransfer);
            if (!files.length) return false;
            event.preventDefault();
            // transform:scale 안의 에디터 — PM posAtCoords 왜곡 → caretPosFromPoint 로 보정.
            const pos =
              caretPosFromPoint(view, event.clientX, event.clientY) ?? view.state.selection.from;
            insertImagesFromFiles(editor, files, pos);
            return true;
          },
        },
      }),
    ];
  },
});
