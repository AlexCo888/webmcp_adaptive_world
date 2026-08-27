import type { ModelContext } from "./types";

declare global {
  interface Document {
    /** Experimental WebMCP imperative API (canonical location in current Chrome). */
    readonly modelContext?: ModelContext;
  }

  interface Navigator {
    /** Compatibility only for early WebMCP prototypes. Prefer document.modelContext. */
    readonly modelContext?: ModelContext;
  }
}

export {};
