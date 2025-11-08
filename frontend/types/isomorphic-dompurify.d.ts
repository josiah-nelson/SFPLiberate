declare module 'isomorphic-dompurify' {
  type DOMPurifyConfig = Record<string, unknown>;

  interface DOMPurifyLike {
    sanitize(input: string, config?: DOMPurifyConfig): string;
  }

  const DOMPurify: DOMPurifyLike;
  export default DOMPurify;
}
