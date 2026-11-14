import { notFound } from "next/navigation";
import SoundBoard from "@/dev/sounds/SoundBoard";

// Dev-only board of the gameplay sound effects, for the owner's ear (FS-AND39 R15). A production
// build answers 404 here: Next inlines NODE_ENV at build time, so the route itself is gone.
export default function SoundsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SoundBoard />;
}
