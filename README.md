# Deploy on AKS

[![CI](https://github.com/sabbour/adaptive-ui-try-aks/actions/workflows/ci.yml/badge.svg)](https://github.com/sabbour/adaptive-ui-try-aks/actions/workflows/ci.yml)

A guided deployment experience for **AKS Automatic** — deploy production-ready, cloud-native applications to Azure Kubernetes Service, built with the [Adaptive UI Framework](https://github.com/sabbour/adaptive-ui-framework).

## What It Does

Deploy on AKS is a conversational AI agent specialized in deploying applications to AKS Automatic clusters with managed system node pools. It offers two deployment tracks:

### Web Application Track
Deploy containerized web frontends and APIs (Next.js, Flask, ASP.NET, Go, etc.):
1. **Discover** — Gathers app details: framework, database needs, scaling requirements
2. **Scaffold** — Generates Dockerfile, K8s manifests, Gateway API routing, Bicep IaC
3. **Validate** — Checks manifests against AKS Deployment Safeguards
4. **Deploy** — Creates GitHub Actions CI/CD pipeline, commits to repo

### Agentic Application Track
Deploy AI agents with tool-calling capabilities:
1. **Discover** — Agent framework, purpose, RAG needs, model selection
2. **Scaffold** — Generates agent container, Azure AI Foundry config, K8s manifests
3. **Wire** — Connects Azure OpenAI, AI Search, Cosmos DB via Workload Identity
4. **Deploy** — GitHub Actions pipeline with OIDC federated credentials

## Key Features

- **AKS Automatic only** — Managed system node pools (`hostedSystemProfile.enabled: true`), no node-level configuration
- **Gateway API** — Always uses `approuting-istio` GatewayClass via Application Routing add-on
- **Workload Identity** — All Azure service connections use federated identity credentials, never secrets
- **Deployment Safeguards** — Built-in validator checks manifests against AKS policies (resource limits, probes, security context, etc.)
- **Deterministic diagrams** — Architecture diagrams generated from actual Bicep and K8s artifacts, not LLM freehand
- **Monaco editor** — VS Code-like file editing with syntax highlighting
- **Folder tree sidebar** — Organized file hierarchy with Fluent icons

## Layout

Three-panel layout with Azure portal design language:

- **Left panel** — Session sidebar with collapsible folder tree showing generated files
- **Center panel** — Monaco editor for viewing/editing Dockerfiles, K8s manifests, Bicep, and architecture diagrams
- **Right panel** — Conversational chat with the deployment agent

## Packs Used

| Pack | Purpose |
|------|---------|
| [@sabbour/adaptive-ui-azure-pack](https://github.com/sabbour/adaptive-ui-azure-pack) | Azure sign-in, ARM API, resource pickers, AKS Automatic domain knowledge |
| [@sabbour/adaptive-ui-github-pack](https://github.com/sabbour/adaptive-ui-github-pack) | GitHub sign-in, repo management, creating PRs with generated code |

## Running Locally

```bash
npm install
npm run dev
```

Click the gear icon to connect your OpenAI-compatible LLM endpoint.

For local pack development, symlink local checkouts:

```bash
npm run link:packs
```

## License

MIT
