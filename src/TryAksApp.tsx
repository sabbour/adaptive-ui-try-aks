import React, { useState, useCallback, useRef, useSyncExternalStore, useEffect } from 'react';
import { AdaptiveApp, registerApp, registerPackWithSkills, clearAllPacks, getActivePackScope, setActivePackScope, registerDiagramRenderer, SessionsSidebar, FileViewer, FileViewerPlaceholder, ResizeHandle, generateSessionId, saveSession, deleteSession, setSessionScope, upsertArtifact, getArtifacts, subscribeArtifacts, loadArtifactsForSession, saveArtifactsForSession, deleteArtifactsForSession, setArtifactsScope } from '@sabbour/adaptive-ui-core';
import type { AdaptiveUISpec } from '@sabbour/adaptive-ui-core';
import { createAzurePack } from '@sabbour/adaptive-ui-azure-pack';
import { createGitHubPack } from '@sabbour/adaptive-ui-github-pack';
import { registerAzureDiagramIcons } from '@sabbour/adaptive-ui-azure-pack/diagram-icons';
import { ArchitectureDiagram } from './ArchitectureDiagram';
import { buildDiagramFromArtifacts } from './diagram-builder';
import { validateAllManifests } from './safeguards-checker';
import { validateK8sManifest } from './k8s-validator';
import type { SafeguardViolation } from './k8s-validator';

// Lazy pack registration
function ensureTryAksPacks() {
  if (getActivePackScope() === 'try-aks') return;
  clearAllPacks();
  registerPackWithSkills(createAzurePack());
  registerPackWithSkills(createGitHubPack());
  registerAzureDiagramIcons();
  registerDiagramRenderer(ArchitectureDiagram);
  setActivePackScope('try-aks');
}

// ─── System Prompts ───

const BASE_SYSTEM_PROMPT = `You are Deploy on AKS — an expert Kubernetes deployment engineer specializing in AKS Automatic. You help users deploy production-ready, scalable, secure cloud-native applications to Azure Kubernetes Service.

TARGET PLATFORM: AKS Automatic with managed system node pools (hostedSystemProfile.enabled: true). No classic AKS. No user node pool configuration.

TRACK SELECTION:
When the user says "I want to deploy a web application", set state.deploymentTrack to "web-app" and begin web app discovery.
When the user says "I want to deploy an agentic application", set state.deploymentTrack to "agentic-app" and begin agentic app discovery.

═══ INFRASTRUCTURE APPROACH ═══
Ask the user which approach they prefer:
- Direct deployment: Use azureQuery to create Azure resources via ARM API
- Infrastructure as Code: Generate Bicep files
- Both: Generate Bicep AND apply directly
Default recommendation: Bicep + GitHub Actions for repeatable deployments.

═══ GATEWAY API (MANDATORY) ═══
ALWAYS use Gateway API via Application Routing add-on. NEVER use Ingress or nginx.
GatewayClass: "approuting-istio"
Generate both Gateway and HTTPRoute resources for every deployment.

═══ WORKLOAD IDENTITY (MANDATORY) ═══
For ALL Azure service connections:
1. Create a User-Assigned Managed Identity
2. Create a Federated Identity Credential (issuer = AKS OIDC issuer URL)
3. K8s ServiceAccount annotation: azure.workload.identity/client-id
4. Pod label: azure.workload.identity/use: "true"
5. Assign RBAC roles on target resources
NEVER use connection strings with secrets. NEVER use imagePullSecrets with passwords.

═══ DEPLOYMENT SAFEGUARDS (MANDATORY) ═══
AKS Automatic enforces Deployment Safeguards. Non-compliant manifests are REJECTED.
Every K8s manifest MUST comply:
- resources.requests AND resources.limits (CPU + memory) on every container
- livenessProbe and readinessProbe on every container
- runAsNonRoot: true in pod securityContext
- No hostNetwork, hostPID, hostIPC
- No privileged containers, allowPrivilegeEscalation: false
- No :latest image tags
- readOnlyRootFilesystem: true where possible
After generating K8s manifests, SELF-CHECK and fix violations before presenting.

═══ ACR INTEGRATION ═══
Default: create new ACR, attach to AKS. Offer option to use existing ACR.
Use AcrPull role assignment with kubelet managed identity.

═══ GITHUB ACTIONS CI/CD ═══
Generate .github/workflows/deploy.yml: build image, push to ACR, deploy to AKS.
Use OIDC federated credentials for GitHub to Azure auth.

═══ CODE GENERATION ═══
Generate as codeBlock components. label = filename (e.g., "k8s/deployment.yaml", "Dockerfile").
Use folder prefixes: k8s/, .github/workflows/, infra/

═══ DIAGRAM ═══
Include "diagram" when proposing architecture. Use %%icon:azure/*%% prefixes.
Only update when actual resource set changes.

═══ GUARDRAILS ═══
- AKS Automatic ONLY. Redirect other compute to Solution Architect.
- Refuse manifests violating Deployment Safeguards.
- Always Gateway API, never Ingress/nginx.
- Always Workload Identity, never connection strings.

═══ CONFIRMATION STYLE ═══
When summarizing discovery, write a short readable paragraph (2-4 sentences). Then show input fields for gaps.`;

const WEB_APP_ADDENDUM = `

═══ WEB APPLICATION TRACK ═══

DISCOVERY — ask about:
- Framework/language (Next.js, React, Flask, Django, Express, ASP.NET, Go, etc.)
- Backend API? Same container or separate?
- Existing repo URL or starting from scratch?
- Database needs (PostgreSQL, Cosmos DB, SQL, Redis?)
- Expected traffic & scaling
- Environment strategy (dev/staging/prod)?

SCAFFOLD (in this order):
1. Dockerfile — multi-stage build, non-root user, specific base image tags
2. k8s/namespace.yaml
3. k8s/deployment.yaml — Deployment Safeguards compliant
4. k8s/service.yaml — ClusterIP
5. k8s/gateway.yaml — Gateway (approuting-istio) + HTTPRoute
6. k8s/service-account.yaml — workload identity annotation (if Azure services needed)
7. infra/main.bicep — AKS (Automatic, hostedSystemProfile), ACR, databases, managed identity, federated credentials
8. infra/parameters.json
9. .github/workflows/deploy.yml`;

const AGENTIC_APP_ADDENDUM = `

═══ AGENTIC APPLICATION TRACK ═══

DISCOVERY — ask about:
- Agent framework: Azure AI Foundry SDK (default), Semantic Kernel, LangChain — let user pick
- Agent purpose and tools
- RAG needed? (Azure AI Search)
- Conversation history? (Cosmos DB)
- Existing model or new? (Azure AI Foundry + Azure OpenAI)
- REST API exposure? (FastAPI/Flask wrapper)
- Existing repo or scratch?

AZURE AI SERVICES:
- Azure AI Foundry hub + project
- Azure OpenAI + model deployment
- Azure AI Search (if RAG)
- Cosmos DB (if conversation history)
All via Workload Identity.

SCAFFOLD (in this order):
1. Dockerfile — Python agent container, non-root
2. k8s/namespace.yaml
3. k8s/deployment.yaml — workload identity labels, AZURE_CLIENT_ID env
4. k8s/service.yaml — ClusterIP
5. k8s/gateway.yaml — Gateway + HTTPRoute
6. k8s/service-account.yaml
7. infra/main.bicep — AKS, ACR, AI Foundry, OpenAI, AI Search, Cosmos DB, managed identity, federated credentials
8. infra/parameters.json
9. .github/workflows/deploy.yml
10. Application scaffold: main.py, requirements.txt

PATTERN: FastAPI serving agent as REST API, /healthz for probes, DefaultAzureCredential for all Azure auth.`;

// ─── Initial Spec ───

const initialSpec: AdaptiveUISpec = {
  version: '1',
  title: 'Deploy on AKS',
  agentMessage: "Welcome to **Deploy on AKS** \u2014 your guided experience for deploying production-ready applications to Azure Kubernetes Service.\n\nChoose your deployment track to get started:",
  state: {},
  layout: {
    type: 'columns',
    children: [
      {
        type: 'card',
        title: 'Web Application',
        children: [
          { type: 'text', content: 'Deploy containerized web frontends and APIs. Includes Dockerfile, Kubernetes manifests, Gateway API routing, and CI/CD pipeline.' },
          { type: 'button', label: 'Get Started', onClick: { type: 'sendPrompt', value: 'I want to deploy a web application' }, variant: 'primary' },
        ],
      },
      {
        type: 'card',
        title: 'Agentic Application',
        children: [
          { type: 'text', content: 'Deploy AI agents with tool-calling capabilities. Includes Azure AI Foundry, model deployment, RAG, and conversation history.' },
          { type: 'button', label: 'Get Started', onClick: { type: 'sendPrompt', value: 'I want to deploy an agentic application' }, variant: 'primary' },
        ],
      },
    ],
  } as any,
  diagram: 'flowchart TD\n  Dev(["Developer"])\n  subgraph aks["%%icon:azure/aks%%AKS Automatic"]\n    App["Your App"]\n  end\n  Dev --> aks',
};

// ─── Mermaid extraction ───
const MERMAID_RE = /^(flowchart\s+(TD|TB|BT|LR|RL)\b)/;

function extractMermaidFromLayout(node: any): string | null {
  if (!node) return null;
  if ((node.type === 'markdown' || node.type === 'md' || node.type === 'text' || node.type === 'tx') && typeof node.content === 'string') {
    if (MERMAID_RE.test(node.content.trim())) return node.content.trim();
  }
  if (typeof node.c === 'string' && MERMAID_RE.test(node.c.trim())) return node.c.trim();
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) {
    const found = extractMermaidFromLayout(child);
    if (found) return found;
  }
  if (Array.isArray(node.items)) {
    for (const item of node.items) {
      const found = extractMermaidFromLayout(item);
      if (found) return found;
    }
  }
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      if (tab.children) {
        for (const child of tab.children) {
          const found = extractMermaidFromLayout(child);
          if (found) return found;
        }
      }
    }
  }
  return null;
}

// ─── Code block extraction ───
interface CodeBlock { code: string; language: string; label?: string; }

function extractCodeBlocksFromLayout(node: any): CodeBlock[] {
  if (!node) return [];
  const blocks: CodeBlock[] = [];
  if ((node.type === 'codeBlock' || node.type === 'cb') && typeof node.code === 'string') {
    blocks.push({ code: node.code, language: node.language || '', label: node.label });
  }
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) {
    blocks.push(...extractCodeBlocksFromLayout(child));
  }
  if (Array.isArray(node.items)) {
    for (const item of node.items) {
      blocks.push(...extractCodeBlocksFromLayout(item));
    }
  }
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      if (tab.children) {
        for (const child of tab.children) {
          blocks.push(...extractCodeBlocksFromLayout(child));
        }
      }
    }
  }
  return blocks;
}

const LANG_EXT: Record<string, string> = {
  bicep: 'bicep', json: 'json', yaml: 'yaml', yml: 'yaml',
  typescript: 'ts', javascript: 'js', python: 'py',
  bash: 'sh', shell: 'sh', dockerfile: 'Dockerfile',
  markdown: 'md', html: 'html', css: 'css', sql: 'sql',
  hcl: 'tf', terraform: 'tf', helm: 'yaml', xml: 'xml',
};

const seenFilenames = new Set<string>();

function buildFilename(block: CodeBlock): string {
  const ext = LANG_EXT[block.language] || block.language || 'txt';
  if (block.label) {
    if (block.label.includes('.')) return block.label;
    const base = block.label.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/-+$/, '');
    return base + '.' + ext;
  }
  return 'artifact.' + ext;
}

function codeBlockToFilename(block: CodeBlock): string {
  let filename = buildFilename(block);
  if (seenFilenames.has(filename)) {
    let counter = 2;
    const dotIdx = filename.lastIndexOf('.');
    const base = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
    const extension = dotIdx >= 0 ? filename.slice(dotIdx) : '';
    while (seenFilenames.has(base + '-' + counter + extension)) counter++;
    filename = base + '-' + counter + extension;
  }
  seenFilenames.add(filename);
  return filename;
}

// ─── Safeguards validation banner ───

function SafeguardsBanner({ violations }: { violations: SafeguardViolation[] }) {
  const [expanded, setExpanded] = useState(false);
  if (violations.length === 0) return null;

  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warning');

  return React.createElement('div', {
    style: {
      padding: '8px 16px',
      backgroundColor: errors.length > 0 ? '#fef2f2' : '#fffbeb',
      borderBottom: '1px solid ' + (errors.length > 0 ? '#fecaca' : '#fed7aa'),
      fontSize: '13px', cursor: 'pointer',
    },
    onClick: () => setExpanded(!expanded),
  },
    React.createElement('div', {
      style: { fontWeight: 600, color: errors.length > 0 ? '#991b1b' : '#92400e' },
    }, (errors.length > 0 ? errors.length + ' error(s)' : '') +
       (errors.length > 0 && warnings.length > 0 ? ', ' : '') +
       (warnings.length > 0 ? warnings.length + ' warning(s)' : '') +
       ' — Deployment Safeguards'),
    expanded && React.createElement('div', { style: { marginTop: '6px' } },
      violations.map((v, i) =>
        React.createElement('div', {
          key: i,
          style: {
            padding: '2px 0', fontSize: '12px',
            color: v.severity === 'error' ? '#991b1b' : '#92400e',
          },
        }, '[' + v.ruleId + '] ' + v.message + ' (' + v.path + ')')
      )
    )
  );
}

// ─── Main App ───

export function TryAksApp() {
  setSessionScope('try-aks');
  setArtifactsScope('try-aks');
  ensureTryAksPacks();

  const [sessionId, setSessionId] = useState(() => {
    try {
      return localStorage.getItem('adaptive-ui-active-session-try-aks') || generateSessionId();
    } catch { return generateSessionId(); }
  });

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [deploymentTrack, setDeploymentTrack] = useState<string | null>(null);
  const [currentViolations, setCurrentViolations] = useState<SafeguardViolation[]>([]);
  const artifacts = useSyncExternalStore(subscribeArtifacts, getArtifacts);
  const sendPromptRef = useRef<((prompt: string) => void) | null>(null);

  // Load artifacts for initial session
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadArtifactsForSession(sessionId);
      const loaded = getArtifacts();
      if (loaded.length === 0 && initialSpec.diagram) {
        upsertArtifact('architecture.mmd', initialSpec.diagram, 'mermaid', 'Architecture');
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve file selection
  const resolvedFileId = (selectedFileId && artifacts.some((a) => a.id === selectedFileId))
    ? selectedFileId
    : artifacts[0]?.id ?? null;
  const selectedArtifact = resolvedFileId
    ? artifacts.find((a) => a.id === resolvedFileId) ?? null
    : null;

  useEffect(() => {
    if (resolvedFileId !== selectedFileId) setSelectedFileId(resolvedFileId);
  }, [resolvedFileId, selectedFileId]);

  // Compute violations for selected artifact
  useEffect(() => {
    if (selectedArtifact && (selectedArtifact.filename.endsWith('.yaml') || selectedArtifact.filename.endsWith('.yml'))) {
      setCurrentViolations(validateK8sManifest(selectedArtifact.content));
    } else {
      setCurrentViolations([]);
    }
  }, [selectedArtifact?.id, selectedArtifact?.content]);

  const handleCreatePR = useCallback(() => {
    if (sendPromptRef.current) {
      sendPromptRef.current('Create a pull request with the generated files');
    }
  }, []);

  // Resizable panels
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatWidth, setChatWidth] = useState(480);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(160, Math.min(400, w + delta)));
  }, []);
  const handleChatResize = useCallback((delta: number) => {
    setChatWidth((w) => Math.max(320, Math.min(700, w - delta)));
  }, []);

  // Build system prompt with track addendum
  const systemPrompt = BASE_SYSTEM_PROMPT +
    (deploymentTrack === 'web-app' ? WEB_APP_ADDENDUM : '') +
    (deploymentTrack === 'agentic-app' ? AGENTIC_APP_ADDENDUM : '');

  const handleSpecChange = useCallback((spec: AdaptiveUISpec) => {
    // Detect track selection from state
    const track = (spec as any).state?.deploymentTrack;
    if (track && track !== deploymentTrack) {
      setDeploymentTrack(track);
    }

    // Auto-save code blocks as artifacts
    seenFilenames.clear();
    const codeBlocks = extractCodeBlocksFromLayout(spec.layout);
    const generatedFilenames: string[] = [];
    for (const block of codeBlocks) {
      const filename = codeBlockToFilename(block);
      generatedFilenames.push(filename);
      upsertArtifact(filename, block.code, block.language, block.label);
    }
    if (generatedFilenames.length > 0 && !selectedFileId) {
      const firstFilename = generatedFilenames[0];
      const arts = getArtifacts();
      const match = arts.find((a) => a.filename === firstFilename);
      if (match) setSelectedFileId(match.id);
    }

    // Diagram: try deterministic build from artifacts, fallback to LLM
    const currentArtifacts = getArtifacts();
    const builtDiagram = buildDiagramFromArtifacts(currentArtifacts);
    const llmDiagram = spec.diagram || extractMermaidFromLayout(spec.layout);
    const diagram = builtDiagram || llmDiagram;
    if (diagram) {
      const art = upsertArtifact('architecture.mmd', diagram, 'mermaid', 'Architecture');
      setSelectedFileId((prev) => prev || art.id);
    }

    // Validate K8s manifests and store context for LLM
    const violations = validateAllManifests(currentArtifacts);
    setCurrentViolations(violations);
  }, [selectedFileId, deploymentTrack]);

  const handleNewSession = useCallback(() => {
    saveArtifactsForSession(sessionId);
    try {
      const raw = localStorage.getItem('adaptive-ui-turns-' + sessionId);
      if (raw) {
        const { turns } = JSON.parse(raw);
        if (turns && turns.length > 1) {
          const name = turns[turns.length - 1]?.agentSpec?.title || 'Session';
          saveSession(sessionId, name, turns);
        }
      }
    } catch {}

    const newId = generateSessionId();
    setSessionId(newId);
    setDeploymentTrack(null);
    try { localStorage.setItem('adaptive-ui-active-session-try-aks', newId); } catch {}
    saveSession(newId, 'New session', []);
    setSelectedFileId(null);
    loadArtifactsForSession(newId);
    if (initialSpec.diagram) {
      const art = upsertArtifact('architecture.mmd', initialSpec.diagram, 'mermaid', 'Architecture');
      setSelectedFileId(art.id);
    }
  }, [sessionId]);

  const handleSelectSession = useCallback((id: string) => {
    saveArtifactsForSession(sessionId);
    setSessionId(id);
    setSelectedFileId(null);
    setDeploymentTrack(null);
    loadArtifactsForSession(id);
    try { localStorage.setItem('adaptive-ui-active-session-try-aks', id); } catch {}
  }, [sessionId]);

  const handleDeleteSession = useCallback((id: string) => {
    deleteSession(id);
    deleteArtifactsForSession(id);
    if (id === sessionId) {
      const newId = generateSessionId();
      setSessionId(newId);
      setSelectedFileId(null);
      setDeploymentTrack(null);
      saveSession(newId, 'New session', []);
      loadArtifactsForSession(newId);
      try { localStorage.setItem('adaptive-ui-active-session-try-aks', newId); } catch {}
      if (initialSpec.diagram) {
        const art = upsertArtifact('architecture.mmd', initialSpec.diagram, 'mermaid', 'Architecture');
        setSelectedFileId(art.id);
      }
    }
  }, [sessionId]);

  const handleSpecChangeWithSave = useCallback((spec: AdaptiveUISpec) => {
    handleSpecChange(spec);
    const name = spec.title || spec.agentMessage?.slice(0, 50) || 'Untitled session';
    try {
      const raw = localStorage.getItem('adaptive-ui-turns-' + sessionId);
      if (raw) {
        const { turns } = JSON.parse(raw);
        saveSession(sessionId, name, turns);
      }
    } catch {}
  }, [sessionId, handleSpecChange]);

  // Validation banner for FileViewer
  const validationBanner = currentViolations.length > 0
    ? React.createElement(SafeguardsBanner, { violations: currentViolations })
    : null;

  return React.createElement('div', {
    style: {
      display: 'flex', height: '100%', width: '100%', overflow: 'hidden',
    } as React.CSSProperties,
  },
    // Left: Sessions sidebar with folder tree
    React.createElement('div', {
      style: {
        width: sidebarCollapsed ? '36px' : sidebarWidth + 'px',
        flexShrink: 0, height: '100%', overflow: 'hidden',
        transition: 'width 0.15s ease',
      } as React.CSSProperties,
    },
      React.createElement(SessionsSidebar, {
        activeSessionId: sessionId,
        onSelectSession: handleSelectSession,
        onNewSession: handleNewSession,
        onDeleteSession: handleDeleteSession,
        selectedFileId: resolvedFileId,
        onSelectFile: setSelectedFileId,
        onCreatePR: handleCreatePR,
        collapsed: sidebarCollapsed,
        onToggleCollapse: setSidebarCollapsed,
        fileTreeMode: true,
      })
    ),

    // Resize handle: sidebar <-> center
    !sidebarCollapsed && React.createElement(ResizeHandle, { direction: 'vertical', onResize: handleSidebarResize }),

    // Center: File viewer
    React.createElement('div', {
      style: { flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' } as React.CSSProperties,
    },
      selectedArtifact
        ? React.createElement(FileViewer, {
            artifact: selectedArtifact,
            editorMode: 'monaco',
            validationBanner,
          })
        : React.createElement(FileViewerPlaceholder)
    ),

    // Resize handle: center <-> chat
    React.createElement(ResizeHandle, { direction: 'vertical', onResize: handleChatResize }),

    // Right: Chat
    React.createElement('div', {
      style: {
        width: chatWidth + 'px', flexShrink: 0, height: '100%',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      } as React.CSSProperties,
    },
      React.createElement(AdaptiveApp, {
        key: sessionId,
        initialSpec,
        persistKey: sessionId,
        systemPromptSuffix: systemPrompt,
        sendPromptRef,
        visiblePacks: ['azure', 'github'],
        theme: {
          primaryColor: '#0078d4',
          backgroundColor: '#f3f2f1',
          surfaceColor: '#ffffff',
        },
        onSpecChange: handleSpecChangeWithSave,
        onError: (error: Error) => console.error('Try AKS error:', error),
      })
    )
  );
}

// Self-register
registerApp({
  id: 'try-aks',
  name: 'Deploy on AKS',
  description: 'Deploy production-ready applications to AKS Automatic',
  component: TryAksApp,
});
