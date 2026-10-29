import type { ImgHTMLAttributes } from "react";
import schoolPhotos from "../../../api-server/src/data/school-photos.json";
import { mediaUrl } from "../lib/cms";

export { schoolPhotos };

/** Original editorial URLs stay editable; known school photos get responsive WebP variants. */
export function SiteImage({ src = "", sizes = "(min-width: 900px) 760px, calc(100vw - 40px)", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const photo = schoolPhotos.find(p => p.url === src || p.variants.some(v => v.url === src));
  return <img {...props} src={mediaUrl(src)} sizes={photo ? sizes : undefined}
    srcSet={photo?.variants.map(v => `${mediaUrl(v.url)} ${v.width}w`).join(", ")}
    width={photo?.width} height={photo?.height} />;
}

export function PagePhoto({ markdown }: { markdown?: string }) {
  const image = markdown?.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/m);
  return image ? <figure className="cb-page-image"><SiteImage src={image[2]} alt={image[1]} loading="lazy" /></figure> : null;
}
