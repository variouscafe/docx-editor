/**
 * 이미지 바이트 메타 스니핑 — DOM/캔버스 없이 헤더에서 치수를 읽는다.
 * 외부 URL 이미지 export(치수 미보유 → 480×360 왜곡)와 업로드 치수 검증(클라이언트
 * 신고값 불신)에 사용. 매직바이트 기반이라 확장자/content-type 위조와 무관.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/** PNG(IHDR) · GIF(논리 화면 크기) · JPEG(SOF 마커) 치수 스니핑. 실패 시 null. */
export function sniffImageSize(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10) return null;

  // PNG — 시그니처 후 첫 청크 IHDR: width/height big-endian @16/@20
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    if (bytes.length < 24) return null;
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // GIF — "GIF8…" 후 논리 화면 크기 little-endian @6/@8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // JPEG — SOF0~SOF15(중간 C4/DHT·CC/JPG 제외) 마커 스캔
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2;
    while (pos + 9 < bytes.length) {
      if (bytes[pos] !== 0xff) {
        pos++;
        continue;
      }
      const marker = bytes[pos + 1];
      // 스탠드얼론 마커(길이 필드 없음)
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        pos += 2;
        continue;
      }
      const segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        // segLen(2) + precision(1) 뒤 height(2), width(2) big-endian
        const height = (bytes[pos + 5] << 8) | bytes[pos + 6];
        const width = (bytes[pos + 7] << 8) | bytes[pos + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if (segLen <= 0) return null; // 손상 파일 — 무한 스캔 방지
      pos += 2 + segLen;
    }
  }

  return null;
}
