declare module "sanitize-html" {
  interface IOptions {
    allowedTags?: string[] | false;
    allowedAttributes?: Record<string, string[]> | false;
    allowedSchemes?: string[];
    allowProtocolRelative?: boolean;
    allowedStyles?: Record<string, unknown>;
    transformTags?: Record<string, unknown>;
    disallowedTagsMode?: "discard" | "escape" | "recursiveEscape";
    [key: string]: unknown;
  }
  interface SanitizeHtml {
    (dirty: string, options?: IOptions): string;
    simpleTransform(
      tag: string,
      attributes: Record<string, string>,
      merge?: boolean
    ): unknown;
  }
  const sanitizeHtml: SanitizeHtml;
  export default sanitizeHtml;
}
