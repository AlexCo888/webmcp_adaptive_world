import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SavedRoutineView } from "@/components/views/saved-routine-view";
import { getSavedRoutineDetail } from "@/lib/saved-routines";
import { requireActor } from "@/lib/session";

export const metadata: Metadata = { title: "Saved routine" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("owner");
  const { id } = await params;
  const routine = await getSavedRoutineDetail(actor, id);
  if (!routine) notFound();
  return <SavedRoutineView routine={routine} />;
}
