import type { ValidationResult } from "../types";

export async function validateDocuments(files: File[]): Promise<ValidationResult> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }

  const res = await fetch("/api/validate", { method: "POST", body: form });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail ?? "Validation request failed");
  }

  return res.json() as Promise<ValidationResult>;
}
