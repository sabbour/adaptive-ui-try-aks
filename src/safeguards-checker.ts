// ─── Deployment Safeguards Checker ───
// App-level integration of the k8s-validator with LLM context injection.
// Validates K8s manifest artifacts and formats violations for the LLM.

import type { Artifact } from '@sabbour/adaptive-ui-core';
import { validateK8sManifest, formatViolationsMarkdown } from './k8s-validator';
import type { SafeguardViolation } from './k8s-validator';

/**
 * Validate all K8s YAML artifacts and return a combined violations report.
 */
export function validateAllManifests(artifacts: Artifact[]): SafeguardViolation[] {
  const allViolations: SafeguardViolation[] = [];

  for (const artifact of artifacts) {
    if (!artifact.filename.endsWith('.yaml') && !artifact.filename.endsWith('.yml')) continue;
    if (!artifact.content.includes('apiVersion:')) continue;

    const violations = validateK8sManifest(artifact.content);
    for (const v of violations) {
      allViolations.push({
        ...v,
        path: artifact.filename + ': ' + v.path,
      });
    }
  }

  return allViolations;
}

/**
 * Build a context string for the LLM about current safeguard violations.
 * Returns empty string if no violations found.
 */
export function buildSafeguardsContext(artifacts: Artifact[]): string {
  const violations = validateAllManifests(artifacts);
  return formatViolationsMarkdown(violations);
}
