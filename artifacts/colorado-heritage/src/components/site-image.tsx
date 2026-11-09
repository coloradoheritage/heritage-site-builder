import type { ImgHTMLAttributes } from "react";
import schoolPhotos from "../../../api-server/src/data/school-photos.json";
import { mediaUrl, splitImageTarget } from "../lib/cms";

export { schoolPhotos };

/** Original editorial URLs stay editable; known school photos get responsive WebP variants. */
export function SiteImage({ src = "", sizes = "(min-width: 900px) 760px, calc(100vw - 40px)", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const photo = schoolPhotos.find(p => p.url === src || p.variants.some(v => v.url === src));
  return <img {...props} src={mediaUrl(src)} sizes={photo ? sizes : undefined}
    srcSet={photo?.variants.map(v => `${mediaUrl(v.url)} ${v.width}w`).join(", ")}
    width={photo?.width} height={photo?.height} />;
}

export function PagePhoto({ markdown }: { markdown?: string }) {
  const image = markdown?.match(/^!\[([^\]]*)\]\(((?:[^)"]|"[^"]*")+)\)\s*$/m);
  const target = image ? splitImageTarget(image[2]) : null;
  return image && target ? <figure className="cb-page-image"><SiteImage src={target.src} alt={image[1]} loading="lazy" />{target.caption && <figcaption className="chess-caption">{target.caption}</figcaption>}</figure> : null;
}
