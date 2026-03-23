// ─── Deployment Safeguards Checker ───
// App-level integration of the k8s-validator with LLM context injection.
// Validates K8s manifest artifacts and formats violations for the LLM.

import type { Artifact } from '@sabbour/adaptive-ui-core';
import { validateK8sManifest, formatViolationsMarkdown, fixK8sManifest } from './k8s-validator';
import type { SafeguardViolation, SafeguardFix } from './k8s-validator';

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

/**
 * Result of auto-fixing a single manifest.
 */
export interface ManifestFixResult {
  filename: string;
  fixedContent: string;
  fixes: SafeguardFix[];
  remainingViolations: SafeguardViolation[];
}

/**
 * Auto-fix all K8s YAML artifacts for Deployment Safeguard compliance.
 * Returns only artifacts that had fixable violations.
 */
export function fixAllManifests(artifacts: Artifact[]): ManifestFixResult[] {
  const results: ManifestFixResult[] = [];

  for (const artifact of artifacts) {
    if (!artifact.filename.endsWith('.yaml') && !artifact.filename.endsWith('.yml')) continue;
    if (!artifact.content.includes('apiVersion:')) continue;

    const { content: fixedContent, fixes } = fixK8sManifest(artifact.content);
    if (fixes.length === 0) continue;

    const remainingViolations = validateK8sManifest(fixedContent);
    results.push({ filename: artifact.filename, fixedContent, fixes, remainingViolations });
  }

  return results;
}
