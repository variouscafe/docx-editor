import { describe, it, expect } from "vitest";
import { sniffImageSize } from "./imageMeta.js";

/** 실제 이미지 파일 없이 헤더만 합성해 스니퍼를 검증한다. */

function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG 시그니처
  b.set([0, 0, 0, 13], 8); // IHDR 길이
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  b[16] = (width >>> 24) & 0xff;
  b[17] = (width >>> 16) & 0xff;
  b[18] = (width >>> 8) & 0xff;
  b[19] = width & 0xff;
  b[20] = (height >>> 24) & 0xff;
  b[21] = (height >>> 16) & 0xff;
  b[22] = (height >>> 8) & 0xff;
  b[23] = height & 0xff;
  return b;
}

function jpegHeader(width: number, height: number): Uint8Array {
  // SOI(2) + APP0(길이 16) + SOF0
  const sof = 2 + 2 + 16;
  const b = new Uint8Array(sof + 17);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xe0; // APP0
  b[4] = 0;
  b[5] = 16; // 세그먼트 길이
  b[sof] = 0xff;
  b[sof + 1] = 0xc0; // SOF0
  b[sof + 2] = 0;
  b[sof + 3] = 17; // 세그먼트 길이
  b[sof + 4] = 8; // precision
  b[sof + 5] = (height >> 8) & 0xff;
  b[sof + 6] = height & 0xff;
  b[sof + 7] = (width >> 8) & 0xff;
  b[sof + 8] = width & 0xff;
  return b;
}

function gifHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(13);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // "GIF89a"
  b[6] = width & 0xff;
  b[7] = (width >> 8) & 0xff;
  b[8] = height & 0xff;
  b[9] = (height >> 8) & 0xff;
  return b;
}

describe("sniffImageSize", () => {
  it("PNG IHDR 치수(big-endian)", () => {
    expect(sniffImageSize(pngHeader(1920, 500))).toEqual({ width: 1920, height: 500 });
    expect(sniffImageSize(pngHeader(1, 65535))).toEqual({ width: 1, height: 65535 });
  });

  it("JPEG SOF 치수(마커 스캔)", () => {
    expect(sniffImageSize(jpegHeader(800, 600))).toEqual({ width: 800, height: 600 });
    expect(sniffImageSize(jpegHeader(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it("GIF 논리 화면 치수(little-endian)", () => {
    expect(sniffImageSize(gifHeader(300, 200))).toEqual({ width: 300, height: 200 });
  });

  it("미지원·손상 바이트는 null", () => {
    expect(sniffImageSize(new Uint8Array(20))).toBeNull();
    expect(sniffImageSize(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0]))).toBeNull(); // SOF 조각
  });
});
