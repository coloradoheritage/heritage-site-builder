declare module "sanitize-html" {
  type Options = {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    allowedStyles?: Record<string, Record<string, RegExp[]>>;
    allowedSchemes?: string[];
  };
  export default function sanitizeHtml(input: string, options?: Options): string;
}
