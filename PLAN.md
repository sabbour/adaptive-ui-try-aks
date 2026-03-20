# Try AKS — Implementation Plan

**App slug:** `try-aks`
**App dir:** `adaptive-ui-try-aks`
**App label:** "Deploy on AKS" (tagline: *Cloud-native apps, production-ready from day one*)
**Location:** `demos/adaptive-ui-try-aks/`
**Packs:** Azure Pack, GitHub Pack
**Repo:** Separate git repo (`sabbour/adaptive-ui-try-aks`), added as a submodule under `demos/`

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Core Framework Enhancements](#2-core-framework-enhancements)
3. [Azure Pack Enhancements](#3-azure-pack-enhancements)
4. [Demo App Scaffold](#4-demo-app-scaffold)
5. [System Prompt Design](#5-system-prompt-design)
6. [Landing Experience & Sub-Experiences](#6-landing-experience--sub-experiences)
7. [Deployment Safeguards & Validation](#7-deployment-safeguards--validation)
8. [Diagram Anchoring](#8-diagram-anchoring)
9. [Workspace Integration](#9-workspace-integration)
10. [Submodule Setup](#10-submodule-setup)
11. [Implementation Order](#11-implementation-order)

---

## 1. Product Vision

An Azure-portal-branded landing experience optimized for deploying applications to **AKS Automatic** clusters with managed system node pools. Two sub-specialized tracks:

| Track | Target | Scaffolds |
|---|---|---|
| **Web Application** | Containerized web frontends + APIs (Next.js, Flask, ASP.NET, Go, etc.) | Dockerfile, K8s Deployment/Service, Gateway API (Gateway + HTTPRoute), GitHub Actions CI/CD pipeline, optional Bicep for Azure infra |
| **Agentic Application** | AI agents with tool-calling (Azure AI Foundry SDK, Semantic Kernel, LangChain) | Dockerfile, K8s Deployment/Service, Gateway API, Azure AI Foundry project/model config, Azure AI Search for RAG, Cosmos DB for conversation history, GitHub Actions CI/CD pipeline |

**Key constraints:**
- AKS Automatic only — no classic AKS, no user node pool configuration
- Managed system node pools with `hostedSystemProfile.enabled: true`
- Always use Gateway API via Application Routing add-on (`approuting-istio` GatewayClass)
- Enforce AKS Deployment Safeguards (the agent validates its own K8s manifests AND validates user edits)
- Workload Identity + Federated Identity Credentials for all Azure service connections
- Sub-experience is locked per session (picked via card-based UI upfront)
- All generated K8s manifests must be Deployment Safeguards compliant out of the box
- Use Fluent icons throughout the UI — no emoji icons
- Use Azure service logos in architecture diagrams (via `%%icon:azure/*%%` prefixes)
- Use latest ARM API versions (e.g., `2025-03-01` for AKS)
- Don't create unnecessary pickers — only use azurePicker when the user needs to select from existing resources

---

## 2. Core Framework Enhancements

### 2A. Folder Tree View in SessionsSidebar

**File:** `adaptive-ui-framework/packs/core/src/components/SessionsSidebar.tsx`

The current files section is a flat list. Enhance it to display a collapsible **folder tree** inferred from artifact filenames (e.g., `k8s/deployment.yaml` → `k8s/` folder node → `deployment.yaml` leaf).

**Implementation:**
- Add a `buildFileTree(artifacts: Artifact[])` utility that groups artifacts by path segments
- Tree node type: `{ name: string; fullPath: string; isFolder: boolean; children: TreeNode[]; artifact?: Artifact }`
- Render folders as collapsible rows with Fluent chevron icons (`chevron-right.svg` / `chevron-down.svg`)
- Folders default to expanded; remember collapsed state in component state
- File items indented per depth level (16px per level)
- Folder icons: Fluent `folder.svg` (closed) / `folder-open.svg` (open). File icons: Fluent `document.svg` (generic), `document-yml.svg` (YAML), `document-js.svg` (JS/TS), `document-py.svg` (Python), `code.svg` (Dockerfile/Bicep)
- Clicking a file calls `onSelectFile(artifact.id)` as before
- Clicking a folder toggles expand/collapse
- **Add a new prop** `fileTreeMode?: boolean` (default `false` for backwards compatibility). When `true`, render folder tree instead of flat list. Solution Architect and Trip Notebook remain unchanged.

**New exports from core:**
- No new exports needed — internal enhancement to existing `SessionsSidebar`

### 2B. Monaco Editor in FileViewer

**File:** `adaptive-ui-framework/packs/core/src/components/FileViewer.tsx`

Replace the plain `<textarea>` edit mode and Prism.js read-only view with **Monaco Editor** for a VS Code-like editing experience.

**Implementation:**
- Add `monaco-editor` as a dependency of `@sabbour/adaptive-ui-core`
- Add `@monaco-editor/react` wrapper for React integration
- Keep the current Prism.js-based viewer as a **fallback** if Monaco fails to load
- **Edit mode**: Monaco editor with full syntax highlighting, intellisense for JSON/YAML, minimap, line numbers
- **View mode**: Monaco in read-only mode (replaces the `<pre>` + Prism.js highlight)
- Map artifact `language` to Monaco language IDs (bicep → bicep, yaml → yaml, json → json, typescript → typescript, python → python, dockerfile → dockerfile, etc.)
- **Ctrl+S** triggers save (calls `upsertArtifact` same as current)
- **Ctrl+Z** undo supported natively by Monaco
- Keep the header bar (filename badge + Edit/Save/Cancel/Copy/Download buttons) unchanged
- Mermaid `.mmd` files still use the diagram renderer (no Monaco)
- **Add a new prop** `editorMode?: 'prism' | 'monaco'` (default `'prism'` for backwards compatibility). Try AKS sets `'monaco'`.
- Theme: use `vs-dark` theme to match the current dark code background

**New dependencies for `@sabbour/adaptive-ui-core`:**
```json
"monaco-editor": "^0.52.0",
"@monaco-editor/react": "^4.7.0"
```

### 2C. Deployment Safeguards Validator (in core)

**File:** `adaptive-ui-framework/packs/core/src/k8s-validator.ts` (new file)

A lightweight client-side K8s manifest validator that checks for common Deployment Safeguards violations. Used by the FileViewer to show inline warnings and by the agent to self-check generated manifests.

**Validation rules (based on AKS Deployment Safeguards):**

| ID | Rule | Severity |
|---|---|---|
| DS001 | Containers must define `resources.requests` and `resources.limits` (CPU + memory) | Error |
| DS002 | Containers must define `livenessProbe` | Warning |
| DS003 | Containers must define `readinessProbe` | Warning |
| DS004 | `runAsNonRoot: true` must be set in pod `securityContext` | Error |
| DS005 | `hostNetwork: false` (or absent) — no host networking | Error |
| DS006 | `hostPID: false` (or absent) — no host PID namespace | Error |
| DS007 | `hostIPC: false` (or absent) — no host IPC namespace | Error |
| DS008 | `privileged: false` (or absent) in container `securityContext` | Error |
| DS009 | Container images must not use `:latest` tag | Warning |
| DS010 | `replicas` should be >= 2 for production workloads | Warning |
| DS011 | `allowPrivilegeEscalation: false` in container `securityContext` | Error |
| DS012 | `readOnlyRootFilesystem: true` recommended | Warning |
| DS013 | Containers should not mount service account tokens unless needed (`automountServiceAccountToken: false`) | Warning |

**API:**
```typescript
interface SafeguardViolation {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  path: string;       // e.g., "spec.template.spec.containers[0].resources"
  line?: number;       // line in the YAML if parseable
}

function validateK8sManifest(yamlContent: string): SafeguardViolation[];
function formatViolationsMarkdown(violations: SafeguardViolation[]): string;
```

**Integration with FileViewer:**
- When a `.yaml` or `.yml` artifact is open, run `validateK8sManifest()` on content
- Show violations as a banner below the header bar (collapsible): "{N} Deployment Safeguard issues"
- Red for errors, yellow for warnings
- Clicking a violation scrolls Monaco to the relevant line
- Re-validate on every save (edit mode)

**Integration with the system prompt:**
- The `formatViolationsMarkdown()` output is injected into the LLM context so it can self-correct
- The Try AKS app's `onSpecChange` callback runs the validator on K8s codeBlock artifacts and stores violations in state for the LLM to see

**New export from core:**
```typescript
export { validateK8sManifest, formatViolationsMarkdown } from './k8s-validator';
export type { SafeguardViolation } from './k8s-validator';
```

**New dependency:**
```json
"yaml": "^2.6.0"
```
(For parsing YAML manifests. Lightweight, no heavy K8s schema dependency.)

---

## 3. Azure Pack Enhancements

### 3A. AKS Automatic Skills Injection

**File:** `packs/adaptive-ui-azure-pack/src/skills-resolver.ts`

Add dedicated AKS Automatic domain knowledge that gets injected when the conversation is about AKS.

**New content injected when keywords match `aks|kubernetes|aks automatic|managed cluster`:**

```
AKS AUTOMATIC — DOMAIN KNOWLEDGE:

CLUSTER CREATION:
- Use Microsoft.ContainerService/managedClusters with sku.name="Automatic" and sku.tier="Standard"
- Managed system node pools: set "hostedSystemProfile": { "enabled": true } — do NOT specify agentPoolProfiles for system pools
- API version: 2025-03-01 (latest with hostedSystemProfile support)
- Required properties for Application Routing with Gateway API (Istio):
  "ingressProfile": {
    "webAppRouting": {
      "enabled": true,
      "nginx": { "defaultIngressControllerType": "None" },
      "defaultDomain": { "enabled": true },
      "gatewayAPIImplementations": {
        "appRoutingIstio": { "mode": "Enabled" }
      }
    },
    "gatewayAPI": { "installation": "Standard" }
  }
- OIDC issuer and Workload Identity are enabled by default on AKS Automatic

GATEWAY API:
- GatewayClass: "approuting-istio"
- Always generate Gateway + HTTPRoute resources (no Ingress, no nginx)
- Gateway example:
  apiVersion: gateway.networking.k8s.io/v1
  kind: Gateway
  metadata:
    name: app-gateway
  spec:
    gatewayClassName: approuting-istio
    listeners:
    - name: http
      port: 80
      protocol: HTTP
      allowedRoutes:
        namespaces:
          from: Same
- HTTPRoute example:
  apiVersion: gateway.networking.k8s.io/v1
  kind: HTTPRoute
  metadata:
    name: app-route
  spec:
    parentRefs:
    - name: app-gateway
    rules:
    - backendRefs:
      - name: app-service
        port: 80

WORKLOAD IDENTITY:
- AKS Automatic has OIDC + Workload Identity enabled by default
- For Azure service connections (Cosmos DB, Azure SQL, Key Vault, AI Foundry, ACR, etc.):
  1. Create a User-Assigned Managed Identity
  2. Create a Federated Identity Credential linking the K8s ServiceAccount to the Managed Identity
  3. Create a K8s ServiceAccount with azure.workload.identity/client-id annotation
  4. Set pod label azure.workload.identity/use: "true"
  5. Assign RBAC roles to the Managed Identity on target resources
- NEVER use connection strings with secrets for Azure services — always use Workload Identity

DEPLOYMENT SAFEGUARDS:
- AKS Automatic enforces Deployment Safeguards (Azure Policy)
- All pods MUST have: resource requests/limits, liveness/readiness probes, runAsNonRoot, no privileged, no hostNetwork/PID/IPC
- Images must not use :latest tag
- Set allowPrivilegeEscalation: false
- Set readOnlyRootFilesystem: true where possible
- Violations will BLOCK deployment — the cluster will reject non-compliant manifests

ACR INTEGRATION:
- Default: create a new ACR and attach to AKS (az aks update --attach-acr or kubeletIdentity role assignment)
- Offer option to use existing ACR
- Use managed identity (AcrPull role) — never imagePullSecrets with passwords
```

### 3B. ARM Resource Type Trigger for AKS Automatic

**File:** `packs/adaptive-ui-azure-pack/src/skills-resolver.ts`

Update the `RESOURCE_TYPE_TRIGGERS` map to include a more specific trigger for AKS Automatic that fetches the right API version and ARM schema:

```typescript
'aks automatic|aks auto': {
  resourceType: 'Microsoft.ContainerService/managedClusters',
  apiVersion: '2025-03-01',  // Latest API version with Automatic SKU + hostedSystemProfile support
},
```

### 3C. Picker Usage Guidelines

Do NOT create unnecessary pickers. Only use `azurePicker` when the user needs to **select from existing resources** (e.g., "use an existing ACR" or "use an existing resource group"). When creating new resources, just ask for names via input fields — no picker needed.

**Pickers ONLY when selecting existing resources:**
- Existing ACR (only if user chose "use existing"): `azurePicker` with `api="/subscriptions/{{state.__azureSubscription}}/providers/Microsoft.ContainerRegistry/registries?api-version=2023-11-01-preview"`
- Existing resource group: use the standard RG picker from the Azure pack
- Region: use the standard region picker from the Azure pack

**NOT a picker — use input fields or defaults:**
- New cluster name → text input
- New ACR name → text input
- New resource group name → text input
- New managed identity name → auto-generated based on app name

---

## 4. Demo App Scaffold

### 4A. File Structure

```
demos/adaptive-ui-try-aks/
├── .npmrc
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── vite-env.d.ts
    ├── TryAksApp.tsx          # Main app component (self-registers)
    ├── ArchitectureDiagram.tsx # Mermaid diagram renderer (copied from Solution Architect)
    ├── diagram-builder.ts     # Deterministic diagram generation from artifacts
    ├── safeguards-checker.ts  # App-level integration of k8s-validator with LLM context
    └── css/
        └── try-aks-theme.css  # Azure portal design language
```

### 4B. package.json

```json
{
  "name": "@sabbour/adaptive-ui-try-aks",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "link:packs": "npm link @sabbour/adaptive-ui-core @sabbour/adaptive-ui-azure-pack @sabbour/adaptive-ui-github-pack",
    "unlink:packs": "npm unlink @sabbour/adaptive-ui-core @sabbour/adaptive-ui-azure-pack @sabbour/adaptive-ui-github-pack && npm install"
  },
  "dependencies": {
    "@sabbour/adaptive-ui-core": "^0.1.0",
    "@sabbour/adaptive-ui-azure-pack": "^0.1.0",
    "@sabbour/adaptive-ui-github-pack": "^0.1.0",
    "@mermaid-js/layout-elk": "^0.2.1",
    "mermaid": "^11.13.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.6.2",
    "vite": "^6.0.0"
  }
}
```

### 4C. vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/try-aks/',
  plugins: [react()],
  server: {
    host: true,
    open: true,
    proxy: {
      '/auth-proxy': {
        target: 'https://login.microsoftonline.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/auth-proxy/, ''),
      },
      '/github-oauth/device/code': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: () => '/login/device/code',
      },
      '/github-oauth/access_token': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: () => '/login/oauth/access_token',
      },
    },
  },
});
```

### 4D. CSS Theme — Azure Portal Design Language

**File:** `src/css/try-aks-theme.css`

```css
:root {
  /* Azure brand colors */
  --azure-blue: #0078d4;
  --azure-blue-hover: #106ebe;
  --azure-blue-dark: #004578;
  --azure-bg: #f3f2f1;
  --azure-surface: #ffffff;
  --azure-text: #323130;
  --azure-text-secondary: #605e5c;
  --azure-border: #edebe9;
  --azure-success: #107c10;
  --azure-warning: #ffb900;
  --azure-error: #d13438;

  /* Map to adaptive UI CSS variables */
  --adaptive-primary: var(--azure-blue);
  --adaptive-bg: var(--azure-bg);
  --adaptive-surface: var(--azure-surface);
  --adaptive-text: var(--azure-text);
  --adaptive-text-secondary: var(--azure-text-secondary);
  --adaptive-border: var(--azure-border);

  /* Typography — Segoe UI (Azure standard) */
  font-family: "Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--azure-text);
  background-color: var(--azure-bg);
}

body {
  margin: 0;
  padding: 0;
  height: 100vh;
  overflow: hidden;
}

#root {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
```

### 4E. index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; font-src 'self' https:; worker-src 'self' blob:;" />
    <title>Deploy on AKS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Note: CSP includes `blob:` for script-src and worker-src because Monaco Editor uses web workers loaded from blob URLs.

### 4F. main.tsx

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerPackWithSkills, registerDiagramRenderer } from '@sabbour/adaptive-ui-core';
import { createAzurePack } from '@sabbour/adaptive-ui-azure-pack';
import { createGitHubPack } from '@sabbour/adaptive-ui-github-pack';
import { registerAzureDiagramIcons } from '@sabbour/adaptive-ui-azure-pack/diagram-icons';
import { ArchitectureDiagram } from './ArchitectureDiagram';
import '@sabbour/adaptive-ui-core/css/adaptive.css';
import './css/try-aks-theme.css';

// Register packs
registerPackWithSkills(createAzurePack());
registerPackWithSkills(createGitHubPack());
registerAzureDiagramIcons();

// Register mermaid-based diagram renderer
registerDiagramRenderer(ArchitectureDiagram);

// Import the app (self-registers via registerApp)
import './TryAksApp';

import { AppRouter } from '@sabbour/adaptive-ui-core';

ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(React.StrictMode, null,
    React.createElement(AppRouter)
  )
);
```

---

## 5. System Prompt Design

The system prompt is split into a **base prompt** (always active) and a **track-specific addendum** injected after the user picks Web App or Agentic App.

### 5A. Base System Prompt

```
You are Deploy on AKS — an expert Kubernetes deployment engineer specializing in AKS Automatic. You help users deploy production-ready, scalable, secure cloud-native applications to Azure Kubernetes Service.

TARGET PLATFORM: AKS Automatic with managed system node pools. No classic AKS. No user node pool configuration.

═══ WORKFLOW ═══
1. User picks deployment track (Web Application or Agentic Application) via card UI
2. DISCOVER — gather app details over 2-3 turns (stack, repo, database needs, scaling)
3. SCAFFOLD — generate all deployment artifacts: Dockerfiles, K8s manifests, Bicep/ARM, CI/CD pipeline
4. VALIDATE — check generated K8s manifests against Deployment Safeguards
5. CONNECT — sign into Azure & GitHub, select/create resources
6. DEPLOY — commit to GitHub repo, deploy via pipeline or direct ARM
7. VERIFY — guide post-deployment verification

═══ INFRASTRUCTURE APPROACH ═══
Ask the user which approach they prefer:
- **Direct deployment**: Use azureQuery to create Azure resources via ARM API directly
- **Infrastructure as Code**: Generate Bicep files for all Azure resources
- **Both**: Generate Bicep AND apply directly
Default recommendation: Bicep + GitHub Actions for repeatable deployments.

═══ GATEWAY API (MANDATORY) ═══
ALWAYS use Gateway API via Application Routing add-on. NEVER use Ingress or nginx.
GatewayClass: "approuting-istio"
Generate both Gateway and HTTPRoute resources for every deployment.

AKS cluster must have:
- webAppRouting.enabled = true
- nginx.defaultIngressControllerType = "None"
- defaultDomain.enabled = true
- gatewayAPIImplementations.appRoutingIstio.mode = "Enabled"
- gatewayAPI.installation = "Standard"

═══ WORKLOAD IDENTITY (MANDATORY) ═══
For ALL Azure service connections (Cosmos DB, Azure SQL, PostgreSQL, Key Vault, Azure AI Foundry, ACR, Azure AI Search, Redis, Storage):
1. Create a User-Assigned Managed Identity
2. Create a Federated Identity Credential linking K8s ServiceAccount → Managed Identity (use the AKS OIDC issuer URL)
3. K8s ServiceAccount with annotation: azure.workload.identity/client-id: "<client-id>"
4. Pod label: azure.workload.identity/use: "true"
5. Assign RBAC roles on target resources
NEVER use connection strings with secrets. NEVER use imagePullSecrets with passwords.

═══ DEPLOYMENT SAFEGUARDS (MANDATORY) ═══
AKS Automatic enforces Deployment Safeguards via Azure Policy. Non-compliant manifests are REJECTED by the cluster.
Every K8s manifest MUST comply:
- resources.requests AND resources.limits (CPU + memory) on every container
- livenessProbe and readinessProbe on every container
- runAsNonRoot: true in pod securityContext
- No hostNetwork, hostPID, hostIPC
- No privileged containers
- allowPrivilegeEscalation: false
- No :latest image tags — always use specific version tags or SHA digests
- readOnlyRootFilesystem: true where possible

After generating any K8s manifest, SELF-CHECK against these rules. List any violations and fix them before presenting to the user.
If the user edits a manifest, re-validate and warn about violations.

═══ ACR INTEGRATION ═══
Default: create a new Azure Container Registry and attach to the AKS cluster.
Offer the user the option to select an existing ACR via azurePicker.
Use AcrPull role assignment with the kubelet managed identity — never imagePullSecrets.

═══ GITHUB ACTIONS CI/CD ═══
Always generate a GitHub Actions workflow (.github/workflows/deploy.yml) that:
1. Builds the Docker image
2. Pushes to ACR
3. Deploys K8s manifests to AKS (using kubelogin + az aks get-credentials)
4. Uses OIDC federated credentials for GitHub → Azure authentication (no secrets)

═══ DATABASE & SERVICES ═══
Offer ALL database options based on workload needs:
- Azure PostgreSQL Flexible Server (relational, web apps)
- Azure Cosmos DB (NoSQL, globally distributed)
- Azure SQL Database (SQL Server workloads)
- Azure Cache for Redis (caching, session store)
- Azure Key Vault (secrets, certificates)
- Azure Service Bus (messaging)
- Azure Storage (blobs, queues)
Wire each with Workload Identity — no connection strings.

═══ CODE GENERATION ═══
Generate as codeBlock components. label = filename (e.g., "k8s/deployment.yaml", "Dockerfile"). Unique labels — duplicates overwrite. Auto-saved as downloadable files.
Use folder prefixes to organize: k8s/, .github/workflows/, infra/ (for Bicep).

═══ DIAGRAM ═══
Include "diagram" field when proposing architecture or after generating/changing resources. The diagram should reflect EXACTLY the resources in your generated Bicep and K8s manifests — no more, no less.
Syntax: "flowchart TD", subgraph id["Label"]...end, A-->B, %%icon:NAME%% prefix for Azure icons.
Stabilize the diagram: only update it when the actual resource set changes, not on every conversational turn.

═══ GUARDRAILS ═══
- This experience is ONLY for AKS Automatic. If the user asks for App Service, Container Apps, VMs, or other compute — politely redirect: "This experience is optimized for AKS Automatic. For other compute options, check out Solution Architect."
- Refuse to generate manifests that violate Deployment Safeguards.
- Refuse to use Ingress/nginx — always Gateway API.
- Refuse to use connection strings/passwords for Azure services — always Workload Identity.

═══ CONFIRMATION STYLE ═══
When summarizing discovery, write a short readable paragraph (2-4 sentences) weaving in collected details — no tables or key-value lists. Then show input fields for gaps.
```

### 5B. Web Application Track Addendum

Injected into system prompt when `state.deploymentTrack === 'web-app'`:

```
═══ WEB APPLICATION TRACK ═══

DISCOVERY — ask about:
- Framework/language (Next.js, React, Angular, Flask, Django, Express, ASP.NET, Go, etc.)
- Does the app have a backend API? Same container or separate?
- Existing repo URL or starting from scratch?
- Database needs (PostgreSQL, Cosmos DB, SQL, Redis?)
- Expected traffic & scaling (RPS, geographic distribution)
- Custom domain needed?
- Environment strategy (dev/staging/prod)?

SCAFFOLD (in this order):
1. Dockerfile — multi-stage build, distroless or alpine base, non-root user
2. k8s/namespace.yaml — dedicated namespace
3. k8s/deployment.yaml — Deployment Safeguards compliant
4. k8s/service.yaml — ClusterIP service
5. k8s/gateway.yaml — Gateway (approuting-istio) + HTTPRoute
6. k8s/service-account.yaml — with workload identity annotation (if Azure services needed)
7. infra/main.bicep — AKS cluster, ACR, databases, managed identity, role assignments, federated credentials
8. infra/parameters.json — parameterized values
9. .github/workflows/deploy.yml — Build, push, deploy pipeline

DOCKERFILE BEST PRACTICES:
- Multi-stage build: build stage → runtime stage
- Use specific base image tags (e.g., node:20-alpine, python:3.12-slim, golang:1.22-alpine)
- Non-root user (USER 1000 or create appuser)
- .dockerignore file
- HEALTHCHECK instruction matching the K8s probes
- Minimal layers, cache-friendly ordering
```

### 5C. Agentic Application Track Addendum

Injected into system prompt when `state.deploymentTrack === 'agentic-app'`:

```
═══ AGENTIC APPLICATION TRACK ═══

DISCOVERY — ask about:
- Agent framework preference: Azure AI Foundry SDK (recommended), Semantic Kernel (Python/.NET), LangChain (Python/JS) — default to Azure AI Foundry SDK with Python
- Agent purpose: what tools does it call? What data does it access?
- Does it need RAG? (→ Azure AI Search)
- Does it need conversation history? (→ Cosmos DB)
- Existing model/deployment or new? (→ Azure AI Foundry + Azure OpenAI)
- Expected concurrency & scaling
- Does it expose a REST API? (→ FastAPI/Flask wrapper)
- Existing repo URL or starting from scratch?

AZURE AI SERVICES TO SCAFFOLD:
- Azure AI Foundry hub + project (for model management)
- Azure OpenAI resource + model deployment (GPT-4o or user preference)
- Azure AI Search (if RAG needed)
- Cosmos DB (if conversation history needed, use vCore with MongoDB API or serverless SQL)

ALL connected via Workload Identity — no API keys in environment variables.

SCAFFOLD (in this order):
1. Dockerfile — Python/Node/C# agent container, non-root
2. k8s/namespace.yaml
3. k8s/deployment.yaml — with workload identity labels & env vars for Azure SDK (AZURE_CLIENT_ID, etc.)
4. k8s/service.yaml — ClusterIP
5. k8s/gateway.yaml — Gateway + HTTPRoute
6. k8s/service-account.yaml — azure.workload.identity/client-id annotation
7. infra/main.bicep — AKS, ACR, AI Foundry, OpenAI, AI Search, Cosmos DB, managed identity, role assignments, federated credentials
8. infra/parameters.json
9. .github/workflows/deploy.yml
10. Application scaffold: main.py (or equivalent), requirements.txt, agent configuration

AGENT APPLICATION PATTERN:
- Entry point: FastAPI (Python) or Express (Node) serving the agent as a REST API
- Health endpoint at /healthz for K8s probes
- Azure SDK DefaultAzureCredential for all Azure service auth (works with Workload Identity automatically)
- Structured logging (JSON format) for Azure Monitor integration
```

---

## 6. Landing Experience & Sub-Experiences

### 6A. Initial Spec (Card-Based Picker)

The `initialSpec` renders two clickable cards as the first interaction. No chat input until a track is selected.

```typescript
const initialSpec: AdaptiveUISpec = {
  version: '1',
  title: 'Deploy on AKS',
  agentMessage: "Welcome to **Deploy on AKS** — your guided experience for deploying production-ready applications to Azure Kubernetes Service.\n\nChoose your deployment track to get started:",
  state: {},
  layout: {
    type: 'columns',
    columns: [
      {
        children: [
          {
            type: 'card',
            title: 'Web Application',
            children: [
              { type: 'text', content: 'Deploy containerized web frontends and APIs. Includes Dockerfile, Kubernetes manifests, Gateway API routing, and CI/CD pipeline.' },
              { type: 'button', label: 'Get Started', onClick: { type: 'sendPrompt', value: 'I want to deploy a web application' }, variant: 'primary' }
            ]
          }
        ]
      },
      {
        children: [
          {
            type: 'card',
            title: 'Agentic Application',
            children: [
              { type: 'text', content: 'Deploy AI agents with tool-calling capabilities. Includes Azure AI Foundry, model deployment, RAG, and conversation history.' },
              { type: 'button', label: 'Get Started', onClick: { type: 'sendPrompt', value: 'I want to deploy an agentic application' }, variant: 'primary' }
            ]
          }
        ]
      }
    ]
  },
  diagram: 'flowchart TD\n  Dev(["Developer"])\n  subgraph aks["%%icon:azure/aks%%AKS Automatic"]\n    App["Your App"]\n  end\n  Dev --> aks',
};

Note: Card titles use plain text — no emojis. The cards will be styled with Fluent icons imported as SVGs in the component code (e.g., `globe.svg` for Web App, `brain-circuit.svg` for Agentic App).
```

### 6B. Track Selection Logic

In `TryAksApp.tsx`, the `onSpecChange` callback detects when `state.deploymentTrack` is set (by the LLM's first response after the user clicks a card) and injects the track-specific system prompt addendum.

The LLM is instructed (in the base system prompt) to:
1. Recognize "I want to deploy a web application" → set `state.deploymentTrack = "web-app"`
2. Recognize "I want to deploy an agentic application" → set `state.deploymentTrack = "agentic-app"`
3. Once set, begin discovery for that track

### 6C. Session Lock

The sub-experience is locked once `state.deploymentTrack` is set. Users can:
- Start a new session from the SessionsSidebar to pick a different track
- Switch between sessions that have different tracks

---

## 7. Deployment Safeguards & Validation

### 7A. Agent Self-Validation

The system prompt instructs the LLM to self-check every K8s manifest it generates against the Deployment Safeguards rules. It must list any violations and fix them before presenting.

### 7B. Client-Side Validation (FileViewer Integration)

When the user views/edits a `.yaml`/`.yml` artifact in the FileViewer:
1. Parse YAML, detect if it's a K8s resource (has `apiVersion` + `kind`)
2. Run `validateK8sManifest()` from `k8s-validator.ts`
3. Display violations as a banner in the FileViewer header
4. Monaco Editor: add squiggly underline decorations on violation lines

### 7C. LLM Re-Validation on User Edits

When the user edits a K8s manifest and saves:
1. Run `validateK8sManifest()` on the new content
2. If violations found, store them in adaptive state (e.g., `state.__k8sViolations`)
3. The LLM sees these violations in the next turn and warns the user / offers fixes

---

## 8. Diagram Anchoring

### 8A. Approach

The LLM provides the initial diagram sketch when proposing architecture. After that, the `TryAksApp` component **derives** the diagram deterministically from the generated artifacts:

**File:** `src/diagram-builder.ts`

```typescript
function buildDiagramFromArtifacts(artifacts: Artifact[]): string | null
```

**Logic:**
1. Scan Bicep artifacts (`infra/*.bicep`) for resource declarations — extract resource types and names using regex patterns:
   - `resource \w+ 'Microsoft.ContainerService/managedClusters@...'` → AKS node
   - `resource \w+ 'Microsoft.ContainerRegistry/registries@...'` → ACR node
   - `resource \w+ 'Microsoft.DocumentDB/databaseAccounts@...'` → Cosmos DB node
   - etc.
2. Scan K8s artifacts (`k8s/*.yaml`) for:
   - `kind: Deployment` → application pod node
   - `kind: Service` → service connection
   - `kind: Gateway` → gateway node
   - `kind: HTTPRoute` → route connection
3. Build a Mermaid flowchart string with:
   - Azure icon prefixes (`%%icon:azure/aks%%`)
   - Subgraphs for AKS cluster internals vs external Azure services
   - Arrows for connections (pod → service → gateway, pod → database, etc.)
4. If no artifacts exist, return `null` (use the LLM's diagram)

### 8B. Integration

In `TryAksApp.tsx`:
- After `onSpecChange` extracts code blocks and saves as artifacts, call `buildDiagramFromArtifacts()`
- If it returns a non-null diagram, use that instead of the LLM's diagram
- If it returns null (no parseable infra), fall through to the LLM's diagram from the spec
- This means the diagram is stable — it only changes when actual files change, not on every conversational turn

---

## 9. Workspace Integration

### 9A. Update `build-all.sh`

Add before the `# ── Done ──` section:

```bash
echo ""
echo "=== adaptive-ui-try-aks ==="
cd "$BASE/demos/adaptive-ui-try-aks"
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm link @sabbour/adaptive-ui-core @sabbour/adaptive-ui-azure-pack @sabbour/adaptive-ui-github-pack
npx tsc -b
npx vite build
echo "✓ try-aks build passed"
```

### 9B. Update `start-app.sh`

Add to the `APPS` array:

```bash
"try-aks:demos/adaptive-ui-try-aks"
```

### 9C. Update `adaptive-ui.code-workspace`

Add task:

```json
{
  "label": "Start: Deploy on AKS",
  "type": "shell",
  "command": "bash start-app.sh try-aks",
  "isBackground": true,
  "problemMatcher": {
    "pattern": { "regexp": "^$" },
    "background": {
      "activeOnStart": true,
      "beginsPattern": "^Starting",
      "endsPattern": "Local:\\s+http"
    }
  },
  "presentation": {
    "reveal": "always",
    "panel": "dedicated"
  }
}
```

Add launch configuration:

```json
{
  "name": "Launch: Deploy on AKS",
  "type": "chrome",
  "request": "launch",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/demos/adaptive-ui-try-aks/src",
  "preLaunchTask": "Start: Deploy on AKS"
}
```

---

## 10. Submodule Setup

Each demo is a separate git repository added as a submodule. The new app needs:

### 10A. Create GitHub Repository

```bash
# Create the repo on GitHub (the user will do this manually or via gh CLI)
gh repo create sabbour/adaptive-ui-try-aks --private --description "Deploy on AKS — AKS Automatic deployment experience"
```

### 10B. Initialize and Add as Submodule

```bash
# From the parent adaptive-ui/ directory
cd /home/asabbour/Git/adaptive-ui

# Initialize the demo directory as a git repo, push to GitHub
cd demos/adaptive-ui-try-aks
git init
git remote add origin https://github.com/sabbour/adaptive-ui-try-aks.git
git add .
git commit -m "Initial scaffold: Deploy on AKS demo app"
git push -u origin main

# Go back to parent and add as submodule
cd /home/asabbour/Git/adaptive-ui
# Remove the directory first (git submodule add needs it clean)
# Then add as submodule
git submodule add https://github.com/sabbour/adaptive-ui-try-aks.git demos/adaptive-ui-try-aks
```

### 10C. Update `.gitmodules`

After `git submodule add`, `.gitmodules` will have:

```ini
[submodule "demos/adaptive-ui-try-aks"]
	path = demos/adaptive-ui-try-aks
	url = https://github.com/sabbour/adaptive-ui-try-aks.git
```

### 10D. CI Workflow

Create `.github/workflows/ci.yml` inside the demo repo (same pattern as other demos — runs `tsc -b` and `vite build` on push).

---

## 11. Implementation Order

### Phase 1 — Core Framework Enhancements
1. **[CORE]** Add `yaml` dependency to core `package.json`
2. **[CORE]** Create `k8s-validator.ts` — Deployment Safeguards validation engine
3. **[CORE]** Add Monaco Editor dependencies (`monaco-editor`, `@monaco-editor/react`) to core
4. **[CORE]** Update `FileViewer.tsx` — add `editorMode` prop, Monaco editor integration, safeguards banner
5. **[CORE]** Update `SessionsSidebar.tsx` — add `fileTreeMode` prop, folder tree view with Fluent icons (`folder.svg`, `folder-open.svg`, `document.svg`, `chevron-right.svg`, `chevron-down.svg`)
6. **[CORE]** Replace emoji file icons in existing `SessionsSidebar` file list with Fluent icons (`document.svg` for files, `diagram.svg` for `.mmd`)
7. **[CORE]** Update `index.ts` — export new `validateK8sManifest`, `formatViolationsMarkdown`, `SafeguardViolation`
8. **[CORE]** Build and verify core framework compiles

### Phase 2 — Azure Pack Enhancements
9. **[AZURE-PACK]** Update `skills-resolver.ts` — add AKS Automatic domain knowledge including:
    - `hostedSystemProfile.enabled: true` for managed system node pools
    - Gateway API with `approuting-istio` GatewayClass
    - Workload Identity + Federated Identity Credentials patterns
    - Deployment Safeguards compliance rules
    - API version `2025-03-01` for AKS
10. **[AZURE-PACK]** Add `aks automatic` trigger to `RESOURCE_TYPE_TRIGGERS` with `2025-03-01`
11. **[AZURE-PACK]** Build and verify Azure pack compiles

### Phase 3 — Demo App Scaffold
12. **[APP]** Create `demos/adaptive-ui-try-aks/` directory with all scaffold files (package.json, tsconfig, vite.config, index.html, .npmrc)
13. **[APP]** Create `src/css/try-aks-theme.css` — Azure portal design language (Segoe UI, #0078d4, Fluent styling)
14. **[APP]** Create `src/vite-env.d.ts`
15. **[APP]** Create `src/ArchitectureDiagram.tsx` — copy from Solution Architect (diagrams use Azure logos via `%%icon:azure/*%%`)
16. **[APP]** Create `src/diagram-builder.ts` — deterministic diagram from artifacts (uses `%%icon:azure/*%%` for all Azure services)
17. **[APP]** Create `src/safeguards-checker.ts` — app-level validation integration
18. **[APP]** Create `src/TryAksApp.tsx` — main app component with:
    - Card-based track picker using Fluent icons (no emojis)
    - Track-specific system prompt injection
    - Folder tree FileViewer with Monaco (`fileTreeMode: true`, `editorMode: 'monaco'`)
    - Diagram anchoring via `diagram-builder.ts`
    - Safeguards validation on spec change
    - Session management (same pattern as Solution Architect)
19. **[APP]** Create `src/main.tsx` — entry point

### Phase 4 — Workspace Integration
20. **[WORKSPACE]** Update `build-all.sh`
21. **[WORKSPACE]** Update `start-app.sh`
22. **[WORKSPACE]** Update `adaptive-ui.code-workspace` (tasks + launch config)

### Phase 5 — Submodule Setup
23. **[SUBMODULE]** Create GitHub repo `sabbour/adaptive-ui-try-aks`
24. **[SUBMODULE]** Initialize git in `demos/adaptive-ui-try-aks/`, push to GitHub
25. **[SUBMODULE]** Add as submodule from parent repo
26. **[SUBMODULE]** Create `.github/workflows/ci.yml` for the demo repo

### Phase 6 — Build & Verify
27. **[BUILD]** Run "Build All" task, fix any compilation errors
28. **[VERIFY]** Start the app, verify:
    - Landing page renders with two track cards (Fluent icons, no emojis)
    - Clicking a card starts the correct track conversation
    - FileViewer shows Monaco editor with syntax highlighting
    - Sidebar shows folder tree with Fluent folder/document icons
    - Architecture diagram renders with Azure logos (`%%icon:azure/*%%`)
    - K8s validator catches intentional violations
    - Generated AKS Bicep includes `hostedSystemProfile.enabled: true`

---

## Open Items / Future Work

- **TLS for Gateway API**: Add Let's Encrypt + cert-manager when ready
- **HealthCheckPolicy / BackendTLSPolicy**: Add when patterns are finalized
- **GitOps (Flux/ArgoCD)**: Add as alternative to GitHub Actions push-based deployment
- **Custom domain setup**: DNS zone + Gateway API TLS termination
- **Azure Monitor integration**: Prometheus + Grafana dashboards on AKS
- **Cost estimation**: Monthly cost breakdown for selected Azure services

---

## Design Principles (Cross-Cutting)

- **Fluent icons everywhere**: All UI icons use Fluent SVGs from `adaptive-ui-framework/packs/core/src/icons/fluent/`. No emoji icons in the sidebar, file tree, cards, or badges. Import as `?url` SVG imports.
- **Azure logos in diagrams**: Architecture diagrams use `%%icon:azure/*%%` prefixes for all Azure services (AKS, ACR, Cosmos DB, PostgreSQL, Key Vault, etc.). The icon registry from `registerAzureDiagramIcons()` maps these to the Azure pack's icon set.
- **Latest API versions**: Always use the most recent stable ARM API versions. AKS: `2025-03-01`. ACR: `2023-11-01-preview`. Cosmos DB: `2024-02-15-preview`. AI Foundry: `2024-10-01`.
- **No unnecessary pickers**: Only use `azurePicker` when the user explicitly chooses to select an existing resource. For creating new resources, use text input fields with sensible defaults.
- **Submodule convention**: Like all demos, this is a separate git repo added as a submodule. It has its own CI workflow, npm publish setup (if needed), and independent version history.
