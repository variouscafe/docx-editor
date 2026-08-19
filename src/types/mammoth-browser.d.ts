/** mammoth 브라우저 번들(UMD, 타입 미포함) — importDocument 에서 lazy import. */
declare module "mammoth/mammoth.browser.js" {
  export interface MammothResult {
    value: string;
    messages: { type: string; message: string }[];
  }
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: { styleMap?: string[] },
  ): Promise<MammothResult>;
  export function convertToMarkdown(
    input: { arrayBuffer: ArrayBuffer },
    options?: { styleMap?: string[] },
  ): Promise<MammothResult>;
}
