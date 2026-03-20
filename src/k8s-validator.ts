// ─── Kubernetes Manifest Validator ───
// Validates K8s manifests against AKS Deployment Safeguards policies.
// Runs client-side to catch violations before deployment.

import YAML from 'yaml';

export interface SafeguardViolation {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  path: string;
  line?: number;
}

// ─── Validation Rules ───

function checkResources(container: any, containerPath: string): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];
  const res = container.resources;
  if (!res || !res.requests || !res.limits) {
    violations.push({
      ruleId: 'DS001',
      severity: 'error',
      message: 'Container must define resources.requests and resources.limits (CPU + memory)',
      path: containerPath + '.resources',
    });
  } else {
    if (!res.requests.cpu || !res.requests.memory) {
      violations.push({
        ruleId: 'DS001',
        severity: 'error',
        message: 'Container resources.requests must include both cpu and memory',
        path: containerPath + '.resources.requests',
      });
    }
    if (!res.limits.cpu || !res.limits.memory) {
      violations.push({
        ruleId: 'DS001',
        severity: 'error',
        message: 'Container resources.limits must include both cpu and memory',
        path: containerPath + '.resources.limits',
      });
    }
  }
  return violations;
}

function checkProbes(container: any, containerPath: string): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];
  if (!container.livenessProbe) {
    violations.push({
      ruleId: 'DS002',
      severity: 'warning',
      message: 'Container should define a livenessProbe',
      path: containerPath + '.livenessProbe',
    });
  }
  if (!container.readinessProbe) {
    violations.push({
      ruleId: 'DS003',
      severity: 'warning',
      message: 'Container should define a readinessProbe',
      path: containerPath + '.readinessProbe',
    });
  }
  return violations;
}

function checkSecurityContext(podSpec: any, basePath: string): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];
  const sc = podSpec.securityContext;
  if (!sc || sc.runAsNonRoot !== true) {
    violations.push({
      ruleId: 'DS004',
      severity: 'error',
      message: 'Pod securityContext must set runAsNonRoot: true',
      path: basePath + '.securityContext.runAsNonRoot',
    });
  }
  return violations;
}

function checkHostNamespaces(podSpec: any, basePath: string): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];
  if (podSpec.hostNetwork === true) {
    violations.push({
      ruleId: 'DS005',
      severity: 'error',
      message: 'hostNetwork must not be enabled',
      path: basePath + '.hostNetwork',
    });
  }
  if (podSpec.hostPID === true) {
    violations.push({
      ruleId: 'DS006',
      severity: 'error',
      message: 'hostPID must not be enabled',
      path: basePath + '.hostPID',
    });
  }
  if (podSpec.hostIPC === true) {
    violations.push({
      ruleId: 'DS007',
      severity: 'error',
      message: 'hostIPC must not be enabled',
      path: basePath + '.hostIPC',
    });
  }
  return violations;
}

function checkContainerSecurity(container: any, containerPath: string): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];
  const sc = container.securityContext;
  if (sc && sc.privileged === true) {
    violations.push({
      ruleId: 'DS008',
      severity: 'error',
      message: 'Container must not run as privileged',
      path: containerPath + '.securityContext.privileged',
    });
  }
  if (!sc || sc.allowPrivilegeEscalation !== false) {
    violations.push({
      ruleId: 'DS011',
      severity: 'error',
      message: 'Container securityContext must set allowPrivilegeEscalation: false',
      path: containerPath + '.securityContext.allowPrivilegeEscalation',
    });
  }
  if (!sc || sc.readOnlyRootFilesystem !== true) {
    violations.push({
      ruleId: 'DS012',
      severity: 'warning',
      message: 'Container securityContext should set readOnlyRootFilesystem: true',
      path: containerPath + '.securityContext.readOnlyRootFilesystem',
    });
  }
  return violations;
}

function checkImageTag(container: any, containerPath: string): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];
  const image: string = container.image || '';
  if (image) {
    const tag = image.includes(':') ? image.split(':').pop() || '' : '';
    if (!tag || tag === 'latest') {
      violations.push({
        ruleId: 'DS009',
        severity: 'warning',
        message: 'Container image should not use :latest tag — use a specific version or SHA digest',
        path: containerPath + '.image',
      });
    }
  }
  return violations;
}

function checkReplicas(spec: any, basePath: string): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];
  if (spec.replicas !== undefined && spec.replicas < 2) {
    violations.push({
      ruleId: 'DS010',
      severity: 'warning',
      message: 'Deployment replicas should be >= 2 for production workloads',
      path: basePath + '.replicas',
    });
  }
  return violations;
}

function checkAutoMountToken(podSpec: any, basePath: string): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];
  if (podSpec.automountServiceAccountToken === true) {
    violations.push({
      ruleId: 'DS013',
      severity: 'warning',
      message: 'Consider setting automountServiceAccountToken: false unless the pod needs API access',
      path: basePath + '.automountServiceAccountToken',
    });
  }
  return violations;
}

// ─── Resource-type validators ───

const WORKLOAD_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob']);

function validateWorkload(doc: any): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];
  const kind: string = doc.kind || '';

  let podSpec: any;
  let basePath: string;

  if (kind === 'CronJob') {
    podSpec = doc.spec?.jobTemplate?.spec?.template?.spec;
    basePath = 'spec.jobTemplate.spec.template.spec';
  } else if (kind === 'Job') {
    podSpec = doc.spec?.template?.spec;
    basePath = 'spec.template.spec';
  } else {
    podSpec = doc.spec?.template?.spec;
    basePath = 'spec.template.spec';
    if (kind === 'Deployment' || kind === 'StatefulSet') {
      violations.push(...checkReplicas(doc.spec || {}, 'spec'));
    }
  }

  if (!podSpec) return violations;

  violations.push(...checkSecurityContext(podSpec, basePath));
  violations.push(...checkHostNamespaces(podSpec, basePath));
  violations.push(...checkAutoMountToken(podSpec, basePath));

  const containers: any[] = podSpec.containers || [];
  containers.forEach((c, i) => {
    const cp = basePath + '.containers[' + i + ']';
    violations.push(...checkResources(c, cp));
    violations.push(...checkProbes(c, cp));
    violations.push(...checkContainerSecurity(c, cp));
    violations.push(...checkImageTag(c, cp));
  });

  const initContainers: any[] = podSpec.initContainers || [];
  initContainers.forEach((c, i) => {
    const cp = basePath + '.initContainers[' + i + ']';
    violations.push(...checkResources(c, cp));
    violations.push(...checkContainerSecurity(c, cp));
    violations.push(...checkImageTag(c, cp));
  });

  return violations;
}

// ─── Public API ───

/**
 * Validate a YAML string containing one or more K8s manifests against
 * AKS Deployment Safeguards policies.
 */
export function validateK8sManifest(yamlContent: string): SafeguardViolation[] {
  const violations: SafeguardViolation[] = [];

  let docs: any[];
  try {
    docs = YAML.parseAllDocuments(yamlContent).map((d) => d.toJSON());
  } catch {
    return violations;
  }

  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    const kind: string = doc.kind || '';
    const apiVersion: string = doc.apiVersion || '';

    if (!apiVersion || !kind) continue;

    if (WORKLOAD_KINDS.has(kind)) {
      violations.push(...validateWorkload(doc));
    }
    if (kind === 'Pod') {
      const podSpec = doc.spec;
      if (podSpec) {
        const basePath = 'spec';
        violations.push(...checkSecurityContext(podSpec, basePath));
        violations.push(...checkHostNamespaces(podSpec, basePath));
        violations.push(...checkAutoMountToken(podSpec, basePath));
        const containers: any[] = podSpec.containers || [];
        containers.forEach((c, i) => {
          const cp = basePath + '.containers[' + i + ']';
          violations.push(...checkResources(c, cp));
          violations.push(...checkProbes(c, cp));
          violations.push(...checkContainerSecurity(c, cp));
          violations.push(...checkImageTag(c, cp));
        });
      }
    }
  }

  return violations;
}

/**
 * Format violations as a markdown string suitable for LLM context injection.
 */
export function formatViolationsMarkdown(violations: SafeguardViolation[]): string {
  if (violations.length === 0) return '';

  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warning');

  const lines: string[] = ['--- DEPLOYMENT SAFEGUARD VIOLATIONS ---'];
  if (errors.length > 0) {
    lines.push('ERRORS (' + errors.length + '):');
    errors.forEach((v) => {
      lines.push('- [' + v.ruleId + '] ' + v.message + ' (at ' + v.path + ')');
    });
  }
  if (warnings.length > 0) {
    lines.push('WARNINGS (' + warnings.length + '):');
    warnings.forEach((v) => {
      lines.push('- [' + v.ruleId + '] ' + v.message + ' (at ' + v.path + ')');
    });
  }
  lines.push('Fix all ERRORS before deploying. Warnings are recommended improvements.');
  return lines.join('\n');
}
