/**
 * 이미지 파일 정규화 — 업로드 가능한 형태로 변환.
 * BE/DOCX 는 jpg/png/gif 만 받으므로(매직바이트 스니프 + docx ImageRun 제약) webp/heic/
 * 초대형 이미지는 canvas 로 JPEG 재인코딩한다(최장변 2400px 다운스케일, EXIF 제거).
 * png/jpeg/gif 소형은 원본 그대로(무손실).
 */
const MAX_SIDE = 2400;
const MAX_BYTES = 10 * 1024 * 1024;
const PASS_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);

export interface NormalizedImage {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}

/** 디코드 실패(지원 안 하는 형식) 시 throw — 호출부가 토스트로 안내. */
async function decodeDims(file: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation 명시 — 구형 브라우저는 기본이 'none' 이라 EXIF 회전이 무시돼
      // 치수/재인코딩 결과가 미리보기와 어긋날 수 있다(옵션 무시 구현에서도 무해).
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const dims = { width: bmp.width, height: bmp.height };
      bmp.close();
      return dims;
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** 원본을 (w×h) 로 그려 JPEG 인코딩. 흰 배경 채움(JPEG 무알파 — 투명 픽셀 검정 방지). */
async function drawJpeg(file: Blob, w: number, h: number): Promise<Blob> {
  const canvas = makeCanvas(w, h);
  const ctx = (canvas as HTMLCanvasElement).getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  let drawn = false;
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      drawn = true;
    } catch {
      /* fall through to <img> */
    }
  }
  if (!drawn) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image decode failed"));
        img.src = url;
      });
      ctx.drawImage(img, 0, 0, w, h);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    (canvas as HTMLCanvasElement).toBlob(resolve, "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("jpeg encode failed");
  return blob;
}

/**
 * 파일 → 업로드용 blob + 자연 치수(에디터 노드 attrs 로 즉시 사용 — 로드 전 박스 예약).
 * - png/jpeg/gif && ≤2400px && ≤10MB → 원본 통과
 * - 그 외(webp/heic/초대형) → JPEG 재인코딩(필요 시 다운스케일)
 */
export async function normalizeImageFile(file: File | Blob): Promise<NormalizedImage> {
  const dims = await decodeDims(file); // 지원 불가 형식이면 throw
  const longest = Math.max(dims.width, dims.height);
  if (PASS_TYPES.has(file.type) && longest <= MAX_SIDE && file.size <= MAX_BYTES) {
    return { blob: file, mime: file.type, width: dims.width, height: dims.height };
  }
  const scale = longest > MAX_SIDE ? MAX_SIDE / longest : 1;
  const w = Math.max(1, Math.round(dims.width * scale));
  const h = Math.max(1, Math.round(dims.height * scale));
  const blob = await drawJpeg(file, w, h);
  return { blob, mime: "image/jpeg", width: w, height: h };
}
