import type { Event } from "@prisma/client";

export type TimeTravelRiskFlag = { category: string; severity: string; note: string };

export type TimeTravelState = {
  applicantStatus: string | null;
  isStudent: boolean;
  studentStatus: string | null;
  checkIns: number;
  riskFlags: TimeTravelRiskFlag[];
  currentCompany: string | null;
  currentRole: string | null;
};

const EMPTY_STATE: TimeTravelState = {
  applicantStatus: null,
  isStudent: false,
  studentStatus: null,
  checkIns: 0,
  riskFlags: [],
  currentCompany: null,
  currentRole: null,
};

/** Folds a prefix of one person's merged event history into "what their
 * record looked like at that point" — the same events the staff timeline
 * already renders, just accumulated into a snapshot instead of described
 * one at a time. Deliberately approximate on career position (it takes the
 * most recent CAREER_EVENT_ADDED payload rather than re-running the real
 * isCurrent projection in lib/alumni-career.ts) — good enough to watch a
 * record evolve, not a replacement for the authoritative projection. */
export function reduceTimelineAt(events: Event[], uptoIndex: number): TimeTravelState {
  let state = EMPTY_STATE;
  for (let i = 0; i <= uptoIndex && i < events.length; i++) {
    state = applyEvent(state, events[i]);
  }
  return state;
}

function applyEvent(state: TimeTravelState, event: Event): TimeTravelState {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  switch (event.type) {
    case "APPLICANT_STATUS_CHANGED":
      return { ...state, applicantStatus: String(p.toStatus ?? state.applicantStatus) };
    case "STUDENT_ONBOARDED":
      return { ...state, isStudent: true, studentStatus: "ONBOARDING" };
    case "STUDENT_STATUS_CHANGED":
      return { ...state, isStudent: true, studentStatus: String(p.toStatus ?? state.studentStatus) };
    case "MENTOR_LOG_CREATED":
      return { ...state, checkIns: state.checkIns + 1 };
    case "RISK_FLAG_LOGGED":
      return {
        ...state,
        riskFlags: [
          ...state.riskFlags,
          { category: String(p.category ?? "OTHER"), severity: String(p.severity ?? "LOW"), note: String(p.note ?? "") },
        ],
      };
    case "CAREER_EVENT_ADDED":
      return {
        ...state,
        currentCompany: String(p.companyNormalized ?? p.company ?? state.currentCompany ?? ""),
        currentRole: String(p.role ?? state.currentRole ?? ""),
      };
    default:
      return state;
  }
}
