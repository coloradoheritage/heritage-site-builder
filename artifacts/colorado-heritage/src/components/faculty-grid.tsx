import { Link } from "wouter";
import type { CmsStaff } from "@workspace/api-client-react";
import { fixText, mediaUrl } from "../lib/cms";
import { portraitPosition, staffProfilePath } from "../../directory-helpers.mjs";

export function Initials({ name }: { name: string }) {
  const letters = name.split(/\s+/).filter((p) => !/^(mrs?|miss|ms|pastor|dr)\.?$/i.test(p)).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <span className="cms-initials" aria-hidden="true">{letters || "CH"}</span>;
}

/** Centered square-portrait cards; focal point comes from the saved photo position. */
export function FacultyGrid({ staff }: { staff: CmsStaff[] }) {
  if (!staff.length) return <div className="cb-empty"><strong>Profiles are coming soon.</strong><p>Contact the office to learn about our people.</p></div>;
  return <ul className="cms-faculty-grid" data-testid="faculty-grid">
    {staff.map((person) => <li key={person.slug}>
      <Link href={staffProfilePath(person)} className="cms-faculty-card" data-testid={`faculty-card-${person.slug}`}>
        <span className="cms-faculty-photo">{person.photo ? <img src={mediaUrl(person.photo)} alt={person.alt || `Portrait of ${person.name}`} style={{ objectPosition: portraitPosition(person) }} loading="lazy" /> : <Initials name={person.name} />}</span>
        <strong>{person.name}</strong>
        <small>{fixText(person.role)}</small>
        <span className="cb-more" aria-hidden="true">View bio →</span>
      </Link>
    </li>)}
  </ul>;
}
