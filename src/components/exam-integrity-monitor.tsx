"use client";

import { useEffect, useRef } from "react";
import { recordExamIntegrityEventAction } from "@/app/actions/assessments";

export function ExamIntegrityMonitor({ attemptId }: { attemptId: string }) {
  const sent = useRef(new Set<string>());

  useEffect(() => {
    const record = (type: "FOCUS_LOSS" | "COPY" | "PASTE" | "VISIBILITY_HIDDEN") => {
      if (sent.current.has(type)) return;
      sent.current.add(type);
      void recordExamIntegrityEventAction(attemptId, type);
    };

    const onBlur = () => record("FOCUS_LOSS");
    const onVisibility = () => {
      if (document.visibilityState === "hidden") record("VISIBILITY_HIDDEN");
    };
    const onCopy = () => record("COPY");
    const onPaste = () => record("PASTE");

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);

    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [attemptId]);

  return null;
}
