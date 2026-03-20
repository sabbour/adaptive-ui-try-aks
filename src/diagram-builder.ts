// ─── Diagram Builder ───
// Deterministically generates a Mermaid architecture diagram from
// generated Bicep and K8s manifest artifacts. Falls back to null
// if no parseable infrastructure artifacts exist.

import type { Artifact } from '@sabbour/adaptive-ui-core';

// ─── Resource extraction patterns ───

interface AzureResource {
  type: string;
  label: string;
  icon: string;
}

interface K8sResource {
  kind: string;
  name: string;
}

const BICEP_RESOURCE_RE = /resource\s+\w+\s+'(Microsoft\.[^'@]+)@/g;

const AZURE_ICON_MAP: Record<string, { label: string; icon: string }> = {
  'Microsoft.ContainerService/managedClusters': { label: 'AKS Automatic', icon: 'azure/aks' },
  'Microsoft.ContainerRegistry/registries': { label: 'Container Registry', icon: 'azure/acr' },
  'Microsoft.DocumentDB/databaseAccounts': { label: 'Cosmos DB', icon: 'azure/cosmos-db' },
  'Microsoft.DBforPostgreSQL/flexibleServers': { label: 'PostgreSQL', icon: 'azure/postgresql' },
  'Microsoft.Sql/servers': { label: 'Azure SQL', icon: 'azure/sql' },
  'Microsoft.Cache/redis': { label: 'Redis Cache', icon: 'azure/redis' },
  'Microsoft.KeyVault/vaults': { label: 'Key Vault', icon: 'azure/key-vault' },
  'Microsoft.Storage/storageAccounts': { label: 'Storage', icon: 'azure/storage' },
  'Microsoft.CognitiveServices/accounts': { label: 'Azure OpenAI', icon: 'azure/cognitive-services' },
  'Microsoft.MachineLearningServices/workspaces': { label: 'AI Foundry', icon: 'azure/cognitive-services' },
  'Microsoft.Search/searchServices': { label: 'AI Search', icon: 'azure/cognitive-services' },
  'Microsoft.OperationalInsights/workspaces': { label: 'Log Analytics', icon: 'azure/log-analytics' },
  'Microsoft.Insights/components': { label: 'App Insights', icon: 'azure/monitor' },
  'Microsoft.Network/virtualNetworks': { label: 'VNet', icon: 'azure/vnet' },
  'Microsoft.ManagedIdentity/userAssignedIdentities': { label: 'Managed Identity', icon: 'azure/subscription' },
};

const K8S_KIND_RE = /kind:\s*(\w+)/g;
const K8S_NAME_RE = /name:\s*["']?([a-z0-9-]+)["']?/;

function extractAzureResources(bicepContent: string): AzureResource[] {
  const resources: AzureResource[] = [];
  const seen = new Set<string>();
  let match;
  const re = new RegExp(BICEP_RESOURCE_RE.source, 'g');
  while ((match = re.exec(bicepContent)) !== null) {
    const type = match[1];
    if (seen.has(type)) continue;
    seen.add(type);
    const info = AZURE_ICON_MAP[type];
    if (info) {
      resources.push({ type, label: info.label, icon: info.icon });
    }
  }
  return resources;
}

function extractK8sResources(yamlContent: string): K8sResource[] {
  const resources: K8sResource[] = [];
  // Split by --- for multi-doc YAML
  const docs = yamlContent.split(/^---$/m);
  for (const doc of docs) {
    const kindMatch = doc.match(/kind:\s*(\w+)/);
    const nameMatch = doc.match(/metadata:\s*\n\s+name:\s*["']?([a-z0-9-]+)/);
    if (kindMatch) {
      resources.push({
        kind: kindMatch[1],
        name: nameMatch ? nameMatch[1] : kindMatch[1].toLowerCase(),
      });
    }
  }
  return resources;
}

/**
 * Build a Mermaid flowchart from generated artifacts.
 * Returns null if no infrastructure artifacts are found.
 */
export function buildDiagramFromArtifacts(artifacts: Artifact[]): string | null {
  const bicepArtifacts = artifacts.filter((a) => a.filename.endsWith('.bicep'));
  const k8sArtifacts = artifacts.filter((a) =>
    (a.filename.endsWith('.yaml') || a.filename.endsWith('.yml')) &&
    a.content.includes('apiVersion:')
  );

  if (bicepArtifacts.length === 0 && k8sArtifacts.length === 0) return null;

  // Extract resources
  const azureResources: AzureResource[] = [];
  for (const a of bicepArtifacts) {
    azureResources.push(...extractAzureResources(a.content));
  }

  const k8sResources: K8sResource[] = [];
  for (const a of k8sArtifacts) {
    k8sResources.push(...extractK8sResources(a.content));
  }

  if (azureResources.length === 0 && k8sResources.length === 0) return null;

  // Build Mermaid
  const lines: string[] = ['flowchart TD'];
  lines.push('  User(["Developer"])');

  // AKS cluster and its workloads
  const hasAKS = azureResources.some((r) => r.type === 'Microsoft.ContainerService/managedClusters');
  const deployments = k8sResources.filter((r) => r.kind === 'Deployment' || r.kind === 'StatefulSet');
  const gateways = k8sResources.filter((r) => r.kind === 'Gateway');
  const services = k8sResources.filter((r) => r.kind === 'Service');

  if (hasAKS || deployments.length > 0) {
    lines.push('  subgraph aks["%%icon:azure/aks%%AKS Automatic"]');

    if (gateways.length > 0) {
      lines.push('    GW["Gateway API"]');
    }

    for (const dep of deployments) {
      const id = dep.name.split('-').join('');
      lines.push('    ' + id + '["' + dep.name + '"]');
    }

    if (services.length > 0 && gateways.length > 0) {
      for (const dep of deployments) {
        const id = dep.name.split('-').join('');
        lines.push('    GW --> ' + id);
      }
    }

    lines.push('  end');
    lines.push('  User --> ' + (gateways.length > 0 ? 'GW' : (deployments.length > 0 ? deployments[0].name.split('-').join('') : 'aks')));
  }

  // External Azure services (non-AKS)
  const externalServices = azureResources.filter((r) =>
    r.type !== 'Microsoft.ContainerService/managedClusters' &&
    r.type !== 'Microsoft.ManagedIdentity/userAssignedIdentities'
  );

  if (externalServices.length > 0) {
    lines.push('  subgraph services["Azure Services"]');
    for (const svc of externalServices) {
      const id = svc.type.split('/').pop()!.split('.').join('').toLowerCase();
      lines.push('    ' + id + '["%%icon:' + svc.icon + '%%' + svc.label + '"]');
    }
    lines.push('  end');

    // Connect deployments to services
    if (deployments.length > 0) {
      const firstDep = deployments[0].name.split('-').join('');
      for (const svc of externalServices) {
        const id = svc.type.split('/').pop()!.split('.').join('').toLowerCase();
        lines.push('  ' + firstDep + ' --> ' + id);
      }
    }
  }

  // ACR connection
  const hasACR = azureResources.some((r) => r.type === 'Microsoft.ContainerRegistry/registries');
  if (hasACR && hasAKS) {
    lines.push('  registries --> aks');
  }

  return lines.join('\n');
}
