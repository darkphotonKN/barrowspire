import { notFound } from "next/navigation";
import Gallery from "@/dev/gallery/Gallery";

// Dev-only shelf of the client's reusable visual pieces (FS-1819Q). A production build answers
// 404 here: Next inlines NODE_ENV at build time, so the route itself is gone, not just unlinked.
export default function GalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
