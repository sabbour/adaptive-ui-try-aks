import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerPackWithSkills, registerDiagramRenderer, setSessionScope, setArtifactsScope, registerComponent } from '@sabbour/adaptive-ui-core';
import { createAzurePack } from '@sabbour/adaptive-ui-azure-pack';
import { createGitHubPack } from '@sabbour/adaptive-ui-github-pack';
import { registerAzureDiagramIcons } from '@sabbour/adaptive-ui-azure-pack/diagram-icons';
import { ArchitectureDiagram } from './ArchitectureDiagram';
import { CostEstimateComponent, CompactCodeBlock } from './TryAksApp';
import '@sabbour/adaptive-ui-core/css/adaptive.css';
import './css/try-aks-theme.css';

// Configure Monaco to use local package instead of CDN (CSP blocks CDN scripts)
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

// Set scopes before React renders — avoids setState-during-render warnings
setSessionScope('try-aks');
setArtifactsScope('try-aks');

// Register packs
registerPackWithSkills(createAzurePack());
registerPackWithSkills(createGitHubPack());
registerAzureDiagramIcons();

// Register mermaid-based diagram renderer
registerDiagramRenderer(ArchitectureDiagram);

// Register cost estimate component — scans generated artifacts for cost breakdown
registerComponent('costEstimate', CostEstimateComponent);

// Override codeBlock to render as compact file chip — full code goes to file viewer
registerComponent('codeBlock', CompactCodeBlock);

import { TryAksApp } from './TryAksApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(React.StrictMode, null,
    React.createElement(TryAksApp)
  )
);
