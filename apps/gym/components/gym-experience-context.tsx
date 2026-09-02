"use client";

import type { GeneratedSession, RoutineStatus } from "@adaptive-world/contracts";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type EquipmentSearchIntent = {
  query?: string;
  categories?: readonly string[];
  maxWidthCm?: number;
  maxDepthCm?: number;
  accessible?: boolean;
};

type GymExperience = {
  contextActive: boolean | null;
  searchIntent: EquipmentSearchIntent | null;
  searchRevision: number;
  personalizedRoutine: GeneratedSession | null;
  savedRoutineRef: string | null;
  /** Latest Routine Pro status observed by a WebMCP tool, so the page mirrors it. */
  routineProStatus: { status: RoutineStatus; revision: number } | null;
  announcement: string;
  setContextActive: (active: boolean) => void;
  applyEquipmentSearch: (intent: EquipmentSearchIntent, count: number) => void;
  openEquipment: (slug: string) => void;
  applyPersonalizedRoutine: (session: GeneratedSession, savedRoutineRef: string) => void;
  applyRoutineProStatus: (status: RoutineStatus) => void;
};

const GymExperienceContext = createContext<GymExperience | null>(null);

export function GymExperienceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [contextActive, setContextActiveState] = useState<boolean | null>(null);
  const [searchIntent, setSearchIntent] = useState<EquipmentSearchIntent | null>(null);
  const [searchRevision, setSearchRevision] = useState(0);
  const [personalizedRoutine, setPersonalizedRoutine] = useState<GeneratedSession | null>(null);
  const [savedRoutineRef, setSavedRoutineRef] = useState<string | null>(null);
  const [routineProStatus, setRoutineProStatus] = useState<GymExperience["routineProStatus"]>(null);
  const [announcement, setAnnouncement] = useState("");

  const setContextActive = useCallback((active: boolean) => {
    setContextActiveState(active);
  }, []);

  const applyEquipmentSearch = useCallback(
    (intent: EquipmentSearchIntent, count: number) => {
      setSearchIntent(intent);
      setSearchRevision((value) => value + 1);
      setAnnouncement(`WebMCP applied equipment filters. ${count} matches are available.`);
      router.push("/equipment");
    },
    [router],
  );

  const openEquipment = useCallback(
    (slug: string) => {
      setAnnouncement("WebMCP opened the verified equipment record.");
      router.push(`/equipment/${slug}`);
    },
    [router],
  );

  const applyPersonalizedRoutine = useCallback(
    (session: GeneratedSession, routineRef: string) => {
      setPersonalizedRoutine(session);
      setSavedRoutineRef(routineRef);
      setAnnouncement("Your personalized routine is visible and saved to Passport.");
      router.push("/session");
    },
    [router],
  );

  const applyRoutineProStatus = useCallback((status: RoutineStatus) => {
    setRoutineProStatus((current) => ({ status, revision: (current?.revision ?? 0) + 1 }));
    if (status.orderStatus && status.orderStatus !== "fulfilled") {
      setAnnouncement(
        "Payment confirmation is being recovered. We will not submit another payment.",
      );
    }
  }, []);

  const value = useMemo<GymExperience>(
    () => ({
      contextActive,
      searchIntent,
      searchRevision,
      personalizedRoutine,
      savedRoutineRef,
      routineProStatus,
      announcement,
      setContextActive,
      applyEquipmentSearch,
      openEquipment,
      applyPersonalizedRoutine,
      applyRoutineProStatus,
    }),
    [
      announcement,
      applyEquipmentSearch,
      applyPersonalizedRoutine,
      applyRoutineProStatus,
      openEquipment,
      contextActive,
      personalizedRoutine,
      routineProStatus,
      savedRoutineRef,
      searchIntent,
      searchRevision,
      setContextActive,
    ],
  );

  return (
    <GymExperienceContext.Provider value={value}>
      {children}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </GymExperienceContext.Provider>
  );
}

export function useGymExperience(): GymExperience {
  const value = useContext(GymExperienceContext);
  if (!value) throw new Error("useGymExperience must be used inside GymExperienceProvider");
  return value;
}
