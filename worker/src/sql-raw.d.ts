/** Vite `?raw` import — 파일 내용을 문자열로 가져온다(마이그레이션 SQL 적용용). */
declare module "*?raw" {
  const content: string;
  export default content;
}
