import * as vscode from 'vscode';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'indusagi.chatView';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage': {
          let message = data.message || '';
          if (data.attachedFiles && data.attachedFiles.length > 0) {
            for (const filePath of data.attachedFiles as string[]) {
              try {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders?.length) {
                  const fullPath = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
                  const content = await vscode.workspace.fs.readFile(fullPath);
                  const text = new TextDecoder().decode(content);
                  message += '\n\nFile: ' + filePath + '\n```\n' + text + '\n```';
                }
              } catch (e) {
                console.error('Failed to read file ' + filePath + ': ' + e);
              }
            }
          }
          vscode.commands.executeCommand('indusagi.chat', message);
          break;
        }
        case 'clearChat':
          vscode.commands.executeCommand('indusagi.clear');
          this.sendMessageToWebview({ type: 'clearChat' });
          break;
        case 'newSession':
          vscode.commands.executeCommand('indusagi.newSession');
          break;
        case 'cycleModel':
          vscode.commands.executeCommand('indusagi.cycleModel');
          break;
        case 'cycleThinking':
          vscode.commands.executeCommand('indusagi.cycleThinking');
          break;
        case 'compact':
          vscode.commands.executeCommand('indusagi.compact');
          break;
        case 'exportHtml':
          vscode.commands.executeCommand('indusagi.exportHtml');
          break;
        case 'getStats':
          vscode.commands.executeCommand('indusagi.getStats');
          break;
        case 'getModels':
          vscode.commands.executeCommand('indusagi.getModels');
          break;
        case 'setModel':
          vscode.commands.executeCommand('indusagi.setModel', data.model);
          break;
        case 'getThinkingOptions':
          vscode.commands.executeCommand('indusagi.getThinkingOptions');
          break;
        case 'setThinking':
          vscode.commands.executeCommand('indusagi.setThinking', data.level);
          break;
        case 'getSessionHistory':
          vscode.commands.executeCommand('indusagi.getSessionHistory');
          break;
        case 'switchSession':
          vscode.commands.executeCommand('indusagi.switchSession', data.path);
          break;
        case 'setSessionAlias':
          vscode.commands.executeCommand('indusagi.setSessionAlias', { path: data.path, alias: data.alias });
          break;
        case 'copyMessage':
          vscode.env.clipboard.writeText(data.content || '');
          break;
      }
    });
  }

  public sendMessageToWebview(message: any) {
    this._view?.webview.postMessage(message);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this._nonce();
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Indusagi Chat</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      display: flex;
      flex-direction: column;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }
    .header { padding: 10px 12px; border-bottom: 1px solid var(--vscode-sideBar-border); font-weight: 600; }
    .state { padding: 6px 12px; font-size: 11px; border-bottom: 1px solid var(--vscode-sideBar-border); display:flex; gap:10px; }
    .toolbar { padding: 8px 12px; border-bottom: 1px solid var(--vscode-sideBar-border); display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
    select {
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border));
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
      border-radius: 6px;
      padding: 5px 8px;
      max-width: 220px;
    }
    .chat { flex: 1; overflow: auto; padding: 12px; }
    .input { padding: 10px; border-top: 1px solid var(--vscode-sideBar-border); }
    textarea {
      width: 100%;
      min-height: 70px;
      resize: vertical;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 6px;
      padding: 8px;
    }
    .row { margin-top: 8px; display:flex; gap:8px; flex-wrap: wrap; }
    .slash-menu {
      margin-top: 6px;
      border: 1px solid var(--vscode-sideBar-border);
      border-radius: 6px;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      max-height: 180px;
      overflow: auto;
      display: none;
    }
    .slash-item {
      padding: 6px 8px;
      font-size: 12px;
      cursor: pointer;
      border-bottom: 1px solid var(--vscode-sideBar-border);
    }
    .slash-item:last-child { border-bottom: 0; }
    .slash-item:hover { background: var(--vscode-list-hoverBackground); }
    .slash-cmd { font-weight: 600; margin-right: 6px; }
    .slash-desc { opacity: .8; }
    button {
      border: 0;
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .msg { margin-bottom: 10px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--vscode-sideBar-border); }
    .msg.user { background: var(--vscode-input-background); }
    .muted { opacity: .7; font-size: 11px; margin-bottom: 4px; }
    .tool-log { margin-bottom: 8px; border-radius: 6px; border: 1px dashed var(--vscode-sideBar-border); font-size: 12px; overflow: hidden; }
    .tool-log .tool-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 8px; background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background)); cursor:pointer; }
    .tool-log .tool-title { font-weight: 600; margin-bottom: 2px; }
    .tool-log .tool-meta { opacity: .85; font-size: 11px; }
    .tool-log .tool-chip { font-size: 10px; border-radius: 10px; padding: 2px 6px; border: 1px solid var(--vscode-sideBar-border); }
    .tool-log .chip-start { color:#4ea1ff; }
    .tool-log .chip-update { color:#e2b93d; }
    .tool-log .chip-end { color:#4caf50; }
    .tool-log .chip-error { color:#e85d75; }
    .tool-log .tool-body { display:none; padding:6px 8px; border-top:1px solid var(--vscode-sideBar-border); }
    .tool-log.expanded .tool-body { display:block; }
    .tool-log pre { margin: 6px 0 0; white-space: pre-wrap; word-break: break-word; max-height: 180px; overflow:auto; }
    .tool-actions { display:flex; gap:8px; margin-top:6px; }
    .tool-actions button { padding: 3px 8px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">Indusagi AI Assistant</div>
  <div class="state">
    <span>Model: <b id="model">-</b></span>
    <span>Thinking: <b id="thinking">-</b></span>
    <span>Msgs: <b id="msgCount">0</b></span>
    <span>Tools: <b id="toolCount">0</b></span>
    <span>Calls: <b id="toolCallCount">0</b></span>
  </div>
  <div class="toolbar">
    <button id="newSessionBtn">New</button>
    <select id="sessionSelect" title="Session History">
      <option value="" disabled selected>Sessions…</option>
    </select>
    <button id="nameSessionBtn" class="secondary">Name</button>
    <select id="modelSelect" title="Select Model">
      <option value="">Select model…</option>
    </select>
    <select id="thinkingSelect" title="Select Thinking Level">
      <option value="">Thinking…</option>
    </select>
    <button id="compactBtn">Compact</button>
    <button id="statsBtn">Stats</button>
  </div>
  <div class="chat" id="chat">
    <div class="msg"><div class="muted">System</div>Start a conversation.</div>
  </div>
  <div class="input">
    <textarea id="messageInput" placeholder="Ask Indusagi... (type / for commands)"></textarea>
    <div id="slashMenu" class="slash-menu"></div>
    <div class="row">
      <button id="sendButton">Send</button>
      <button id="clearButton" class="secondary">Clear Chat</button>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      const $ = (id) => document.getElementById(id);

      const chat = $('chat');
      const input = $('messageInput');
      const model = $('model');
      const thinking = $('thinking');
      const msgCount = $('msgCount');
      const toolCount = $('toolCount');
      const toolCallCount = $('toolCallCount');
      const sessionSelect = $('sessionSelect');
      const nameSessionBtn = $('nameSessionBtn');
      const modelSelect = $('modelSelect');
      const thinkingSelect = $('thinkingSelect');
      const slashMenu = $('slashMenu');

      function now() {
        return new Date().toISOString();
      }

      function logClick(name) {
        console.log('[indusagi-webview][' + now() + '] click:', name);
      }

      function postToExtension(type, extra = {}) {
        const payload = Object.assign({ type }, extra);
        console.log('[indusagi-webview][' + now() + '] → postMessage', payload);
        vscode.postMessage(payload);
      }

      function toLabel(value, fallback = '-') {
        if (value == null || value === '') return fallback;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
        return value.id || value.name || value.level || value.model || JSON.stringify(value);
      }

      function toModelId(value) {
        if (value == null || value === '') return '';
        if (typeof value === 'string') return value;
        const provider = value.provider || '';
        const id = value.modelId || value.id || value.model || '';
        if (provider && id) return provider + '::' + id;
        return id || '';
      }

      function updateModelDropdown(models, currentModel) {
        if (!modelSelect) return;
        const currentId = toModelId(currentModel);
        modelSelect.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = models && models.length ? 'Select model…' : 'No models';
        modelSelect.appendChild(placeholder);

        (models || []).forEach((m) => {
          const id = toModelId(m);
          const provider = (m && m.provider) ? String(m.provider) : '';
          const baseLabel = toLabel(m, id || 'unknown');
          const label = provider && !baseLabel.includes(provider) ? (provider + ' / ' + baseLabel) : baseLabel;
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = label;
          if (id && id === currentId) opt.selected = true;
          modelSelect.appendChild(opt);
        });

        if (!currentId) modelSelect.value = '';
      }

      function updateThinkingDropdown(levels, currentLevel) {
        if (!thinkingSelect) return;
        const current = toLabel(currentLevel, '');
        thinkingSelect.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Thinking…';
        thinkingSelect.appendChild(placeholder);

        (levels || []).forEach((lvl) => {
          const value = String(lvl);
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = value;
          if (value === current) opt.selected = true;
          thinkingSelect.appendChild(opt);
        });

        if (!current) thinkingSelect.value = '';
      }

      function updateSessionDropdown(sessions, currentSession) {
        if (!sessionSelect) return;
        sessionSelect.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = sessions && sessions.length ? 'Sessions…' : 'No sessions';
        placeholder.disabled = true;
        placeholder.selected = true;
        sessionSelect.appendChild(placeholder);

        (sessions || []).forEach((s) => {
          const path = s.path || '';
          const name = s.name || path;
          const opt = document.createElement('option');
          opt.value = path;
          opt.textContent = name;
          if (path && currentSession && path === currentSession) opt.selected = true;
          sessionSelect.appendChild(opt);
        });

        if (!currentSession) sessionSelect.value = '';
      }

      let streamWrap = null;
      let streamBody = null;
      let streamText = '';
      const seenTools = new Set();
      let totalToolCalls = 0;
      const toolRows = new Map();

      function addMsg(role, text) {
        const wrap = document.createElement('div');
        wrap.className = 'msg' + (role === 'user' ? ' user' : '');
        const h = document.createElement('div');
        h.className = 'muted';
        h.textContent = role === 'user' ? 'You' : 'Indusagi';
        const b = document.createElement('div');
        b.textContent = text || '';
        wrap.appendChild(h);
        wrap.appendChild(b);
        chat.appendChild(wrap);
        chat.scrollTop = chat.scrollHeight;
        return { wrap, body: b };
      }

      function ensureStreamMessage() {
        if (!streamWrap || !streamBody) {
          const msg = addMsg('assistant', '');
          streamWrap = msg.wrap;
          streamBody = msg.body;
          streamText = '';
        }
      }

      function resetStream() {
        streamWrap = null;
        streamBody = null;
        streamText = '';
      }

      function resetToolStats() {
        seenTools.clear();
        totalToolCalls = 0;
        toolRows.clear();
        if (toolCount) toolCount.textContent = '0';
        if (toolCallCount) toolCallCount.textContent = '0';
      }

      function recordToolEvent(toolName, phase) {
        if (toolName) seenTools.add(String(toolName));
        if (phase === 'start') totalToolCalls += 1;
        if (toolCount) toolCount.textContent = String(seenTools.size);
        if (toolCallCount) toolCallCount.textContent = String(totalToolCalls);
      }

      function ensureToolRow(toolCallId, toolName) {
        const key = toolCallId || ('tool-' + Date.now() + '-' + Math.random());
        if (toolRows.has(key)) return toolRows.get(key);
        const row = document.createElement('div');
        row.className = 'tool-log';
        row.innerHTML = '' +
          '<div class="tool-head">' +
            '<div>' +
              '<div class="tool-title">🔧 ' + (toolName || 'tool') + '</div>' +
              '<div class="tool-meta">starting...</div>' +
            '</div>' +
            '<span class="tool-chip chip-start">start</span>' +
          '</div>' +
          '<div class="tool-body">' +
            '<div class="tool-details"></div>' +
            '<pre class="tool-output"></pre>' +
            '<div class="tool-actions">' +
              '<button class="tool-toggle">Show more</button>' +
              '<button class="tool-copy">Copy</button>' +
            '</div>' +
          '</div>';

        const head = row.querySelector('.tool-head');
        head?.addEventListener('click', () => row.classList.toggle('expanded'));

        const toggleBtn = row.querySelector('.tool-toggle');
        toggleBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          row.classList.toggle('expanded');
          toggleBtn.textContent = row.classList.contains('expanded') ? 'Show less' : 'Show more';
          const outputEl = row.querySelector('.tool-output');
          const full = row.getAttribute('data-full-output') || '';
          outputEl.textContent = row.classList.contains('expanded') ? full : (full.length > 500 ? full.slice(0, 500) + ' …' : full);
        });

        const copyBtn = row.querySelector('.tool-copy');
        copyBtn?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const outputEl = row.querySelector('.tool-output');
          const text = outputEl ? (outputEl.textContent || '') : '';
          await navigator.clipboard.writeText(text);
        });

        chat.appendChild(row);
        chat.scrollTop = chat.scrollHeight;
        toolRows.set(key, row);
        return row;
      }

      function extractToolText(payload) {
        const blocks = payload?.content;
        if (!Array.isArray(blocks)) return '';
        return blocks
          .map((b) => (b?.type === 'text' ? (b.text || '') : ''))
          .filter(Boolean)
          .join('\\n')
          .trim();
      }

      function statusClass(phase, isError) {
        if (isError) return 'chip-error';
        if (phase === 'start') return 'chip-start';
        if (phase === 'update') return 'chip-update';
        return 'chip-end';
      }

      function summarizeTodoWrite(args) {
        const todos = Array.isArray(args?.todos) ? args.todos : [];
        if (!todos.length) return 'updated todo list';
        const done = todos.filter((t) => t?.status === 'completed').length;
        const inProgress = todos.filter((t) => t?.status === 'in_progress').length;
        const pending = todos.filter((t) => t?.status === 'pending').length;
        const titles = todos.slice(0, 3).map((t) => '- ' + (t?.content || 'item')).join(' | ');
        return 'todos: ' + done + ' done, ' + inProgress + ' in-progress, ' + pending + ' pending' + (titles ? (' | ' + titles) : '');
      }

      function toolTime() {
        return new Date().toLocaleTimeString();
      }

      function summarizeArgsLine(toolName, args) {
        if (!args) return '';
        if (toolName === 'bash' && args.command) return 'cmd: ' + args.command;
        if ((toolName === 'read' || toolName === 'write' || toolName === 'edit') && args.path) return 'path: ' + args.path;
        if (toolName === 'task' && args.description) return 'task: ' + args.description;
        if (toolName === 'todoread') return 'todo read';
        if (toolName === 'todowrite') return summarizeTodoWrite(args);
        return JSON.stringify(args).slice(0, 180);
      }

      function summarizeToolEvent(evt, fullOutput) {
        const toolName = evt.toolName || evt.tool || 'tool';
        const prefix = '[' + toolTime() + '] ';
        if (evt.phase === 'start') {
          const argsLine = summarizeArgsLine(toolName, evt.args);
          if (toolName === 'todoread') return prefix + 'reading todo list...';
          if (toolName === 'todowrite') return prefix + summarizeTodoWrite(evt.args || {});
          if (toolName === 'bash') return prefix + 'running shell command' + (argsLine ? ' | ' + argsLine : '...');
          if (toolName === 'read') return prefix + 'reading file' + (argsLine ? ' | ' + argsLine : '...');
          if (toolName === 'edit') return prefix + 'editing file' + (argsLine ? ' | ' + argsLine : '...');
          if (toolName === 'write') return prefix + 'writing file' + (argsLine ? ' | ' + argsLine : '...');
          return prefix + 'started' + (argsLine ? ' | ' + argsLine : '');
        }
        if (evt.phase === 'update') return prefix + 'running...';
        if (evt.isError) return prefix + 'failed';
        if (toolName === 'todoread' && fullOutput) return prefix + 'todo list loaded';
        if (toolName === 'todowrite' && (evt.args?.todos || fullOutput)) return prefix + summarizeTodoWrite(evt.args || {});
        return prefix + 'completed';
      }

      function updateToolRow(evt) {
        const toolName = evt.toolName || evt.tool || 'tool';
        const key = evt.toolCallId || (toolName + '-latest');
        const row = ensureToolRow(key, toolName);
        const title = row.querySelector('.tool-title');
        const meta = row.querySelector('.tool-meta');
        const chip = row.querySelector('.tool-chip');
        const details = row.querySelector('.tool-details');
        const outputEl = row.querySelector('.tool-output');

        const argsText = summarizeArgsLine(toolName, evt.args);
        const partialText = extractToolText(evt.partialResult);
        const resultText = extractToolText(evt.result);
        const fullOutput = resultText || partialText || '';
        const shortOutput = fullOutput.length > 500 ? (fullOutput.slice(0, 500) + ' …') : fullOutput;
        row.setAttribute('data-full-output', fullOutput);

        if (title) title.textContent = '🔧 ' + toolName;
        if (chip) {
          chip.className = 'tool-chip ' + statusClass(evt.phase, evt.isError);
          chip.textContent = evt.isError ? 'error' : (evt.phase || '?');
        }
        if (meta) {
          meta.textContent = summarizeToolEvent(evt, fullOutput);
        }
        if (details) {
          details.textContent = argsText ? ('details: ' + argsText) : '';
        }
        if (outputEl) {
          outputEl.textContent = row.classList.contains('expanded') ? fullOutput : shortOutput;
        }

        const toggleBtn = row.querySelector('.tool-toggle');
        if (toggleBtn) {
          toggleBtn.textContent = row.classList.contains('expanded') ? 'Show less' : 'Show more';
          toggleBtn.style.display = fullOutput.length > 500 ? 'inline-block' : 'none';
        }

        chat.scrollTop = chat.scrollHeight;
      }

      function extractMessageText(msg) {
        if (!msg) return '';
        const c = msg.content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) {
          return c
            .map((part) => {
              if (!part) return '';
              if (typeof part === 'string') return part;
              if (part.type === 'text') return part.text || '';
              if (part.type === 'thinking') return part.thinking || '';
              if (part.type === 'toolResult') return part.text || '';
              return '';
            })
            .filter(Boolean)
            .join('\\n');
        }
        return '';
      }

      function roleFromMessage(msg) {
        const role = (msg && msg.role) ? String(msg.role) : '';
        return role === 'user' ? 'user' : 'assistant';
      }

      function replaceMessages(messages) {
        chat.innerHTML = '';
        resetStream();
        const list = Array.isArray(messages) ? messages : [];
        if (!list.length) {
          const empty = document.createElement('div');
          empty.className = 'msg';
          empty.innerHTML = '<div class="muted">System</div>Start a conversation.';
          chat.appendChild(empty);
          return;
        }
        list.forEach((m) => {
          const role = roleFromMessage(m);
          const text = extractMessageText(m);
          if (text) addMsg(role, text);
        });
      }

      const slashCommands = [
        { cmd: '/help', desc: 'Show slash command help' },
        { cmd: '/new', desc: 'Start new session' },
        { cmd: '/clear', desc: 'Alias for /new' },
        { cmd: '/state', desc: 'Refresh state' },
        { cmd: '/session', desc: 'Show session stats summary' },
        { cmd: '/sessions', desc: 'Refresh session history' },
        { cmd: '/switch', desc: 'Switch session path' },
        { cmd: '/name', desc: 'Name current session' },
        { cmd: '/models', desc: 'Refresh model list' },
        { cmd: '/model', desc: 'Set model: /model provider::modelId' },
        { cmd: '/thinking', desc: 'Set thinking level' },
        { cmd: '/compact', desc: 'Compact context' },
        { cmd: '/stats', desc: 'Session stats' },
        { cmd: '/export', desc: 'Export session HTML' },
        { cmd: '/steer', desc: 'Steer running agent' },
        { cmd: '/followup', desc: 'Queue follow-up message' },
        { cmd: '/abort', desc: 'Abort current run' },
        { cmd: '/bash', desc: 'Run bash command' },
        { cmd: '/abort_bash', desc: 'Abort running bash' },
        { cmd: '/auto_compact', desc: 'Auto compact on/off' },
        { cmd: '/auto_retry', desc: 'Auto retry on/off' },
        { cmd: '/abort_retry', desc: 'Abort retry' },
        { cmd: '/last', desc: 'Show last assistant text' },
        { cmd: '/copy', desc: 'Copy last assistant text' },
        { cmd: '/settings', desc: 'CLI-only currently' },
        { cmd: '/scoped-models', desc: 'CLI-only currently' },
        { cmd: '/share', desc: 'CLI-only currently' },
        { cmd: '/fork', desc: 'CLI-only currently' },
        { cmd: '/tree', desc: 'CLI-only currently' },
        { cmd: '/login', desc: 'CLI-only currently' },
        { cmd: '/logout', desc: 'CLI-only currently' },
        { cmd: '/resume', desc: 'CLI-only currently' },
        { cmd: '/reload', desc: 'CLI-only currently' },
        { cmd: '/changelog', desc: 'CLI-only currently' },
        { cmd: '/hotkeys', desc: 'CLI-only currently' }
      ];

      function hideSlashMenu() {
        if (slashMenu) slashMenu.style.display = 'none';
      }

      function renderSlashMenu(query) {
        if (!slashMenu) return;
        const q = (query || '').toLowerCase();
        const filtered = slashCommands.filter((s) => s.cmd.includes(q));
        if (!filtered.length) {
          hideSlashMenu();
          return;
        }
        slashMenu.innerHTML = filtered
          .map((s) => '<div class="slash-item" data-cmd="' + s.cmd + '"><span class="slash-cmd">' + s.cmd + '</span><span class="slash-desc">' + s.desc + '</span></div>')
          .join('');
        slashMenu.style.display = 'block';

        slashMenu.querySelectorAll('.slash-item').forEach((el) => {
          el.addEventListener('click', () => {
            const cmd = el.getAttribute('data-cmd') || '';
            if (input) {
              input.value = cmd + ' ';
              input.focus();
            }
            hideSlashMenu();
          });
        });
      }

      function send() {
        const raw = input.value || '';
        const text = raw.trim();
        console.log('[indusagi-webview][' + now() + '] send pressed. rawLength=', raw.length, 'trimmedLength=', text.length);
        if (!text) {
          console.log('[indusagi-webview][' + now() + '] send ignored (empty message)');
          return;
        }
        console.log('[indusagi-webview][' + now() + '] user message -> model', {
          activeModelState: model ? model.textContent : '-',
          selectedModelDropdown: modelSelect ? modelSelect.value : '',
          textPreview: text.slice(0, 80)
        });
        addMsg('user', text);
        input.value = '';
        postToExtension('sendMessage', { message: text, attachedFiles: [] });
      }

      $('newSessionBtn')?.addEventListener('click', () => {
        logClick('newSession');
        console.log('[indusagi-webview][' + now() + '] action: requesting new session reset');
        postToExtension('newSession');
      });

      sessionSelect?.addEventListener('change', () => {
        const selected = sessionSelect.value;
        logClick('sessionSelect');
        console.log('[indusagi-webview][' + now() + '] action: switch session requested', selected);
        if (selected) postToExtension('switchSession', { path: selected });
      });

      nameSessionBtn?.addEventListener('click', () => {
        logClick('nameSession');
        const currentPath = sessionSelect?.value || '';
        if (!currentPath) {
          console.log('[indusagi-webview][' + now() + '] no current session path to name');
          return;
        }
        const alias = window.prompt('Session name', sessionSelect?.selectedOptions?.[0]?.textContent || '');
        if (alias !== null) {
          postToExtension('setSessionAlias', { path: currentPath, alias });
        }
      });

      modelSelect?.addEventListener('change', () => {
        const selected = modelSelect.value;
        logClick('modelSelect');
        console.log('[indusagi-webview][' + now() + '] action: set model requested', selected);
        if (selected) {
          postToExtension('setModel', { model: selected });
        }
      });

      thinkingSelect?.addEventListener('change', () => {
        const selected = thinkingSelect.value;
        logClick('thinkingSelect');
        console.log('[indusagi-webview][' + now() + '] action: set thinking requested', selected);
        if (selected) {
          postToExtension('setThinking', { level: selected });
        }
      });

      $('compactBtn')?.addEventListener('click', () => {
        logClick('compact');
        console.log('[indusagi-webview][' + now() + '] action: compact session requested');
        postToExtension('compact');
      });

      $('statsBtn')?.addEventListener('click', () => {
        logClick('stats');
        console.log('[indusagi-webview][' + now() + '] action: session stats requested');
        postToExtension('getStats');
      });

      $('sendButton')?.addEventListener('click', () => {
        logClick('send');
        send();
      });

      $('clearButton')?.addEventListener('click', () => {
        logClick('clear');
        console.log('[indusagi-webview][' + now() + '] action: clear chat requested');
        postToExtension('clearChat');
      });

      input?.addEventListener('input', () => {
        const v = (input.value || '').trimStart();
        if (v.startsWith('/')) {
          renderSlashMenu(v);
        } else {
          hideSlashMenu();
        }
      });

      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          hideSlashMenu();
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
          hideSlashMenu();
        }
      });

      window.addEventListener('message', (event) => {
        const m = event.data || {};
        console.log('[indusagi-webview][' + now() + '] ← message from extension', m.type, m);

        if (m.type === 'streamChunk') {
          ensureStreamMessage();
          const chunk = m.content || '';
          streamText += chunk;
          if (streamBody) streamBody.textContent = streamText;
          chat.scrollTop = chat.scrollHeight;
          console.log('[indusagi-webview][' + now() + '] stream updated. totalChars=', streamText.length, 'model=', toLabel(m.model, (model ? model.textContent : '-')));
          return;
        }

        if (m.type === 'addMessage') {
          const finalText = m.content || '';
          if (streamBody) {
            if (finalText && finalText !== streamText) {
              streamBody.textContent = finalText;
            }
            resetStream();
          } else {
            addMsg('assistant', finalText);
          }
          console.log('[indusagi-webview][' + now() + '] assistant message finalized. chars=', finalText.length, 'repliedByModel=', toLabel(m.model, (model ? model.textContent : '-')));
          return;
        }

        if (m.type === 'clearChat') {
          chat.innerHTML = '';
          resetStream();
          resetToolStats();
          console.log('[indusagi-webview][' + now() + '] chat cleared from extension');
          return;
        }

        if (m.type === 'modelsList') {
          updateModelDropdown(m.models || [], m.currentModel);
          console.log('[indusagi-webview][' + now() + '] models list updated. count=', (m.models || []).length);
          return;
        }

        if (m.type === 'thinkingOptions') {
          updateThinkingDropdown(m.levels || [], m.currentLevel);
          console.log('[indusagi-webview][' + now() + '] thinking options updated. count=', (m.levels || []).length);
          return;
        }

        if (m.type === 'sessionHistory') {
          updateSessionDropdown(m.sessions || [], m.currentSession);
          console.log('[indusagi-webview][' + now() + '] session history updated. count=', (m.sessions || []).length);
          return;
        }

        if (m.type === 'replaceMessages') {
          replaceMessages(m.messages || []);
          resetToolStats();
          console.log('[indusagi-webview][' + now() + '] replaced chat messages. count=', (m.messages || []).length);
          return;
        }

        if (m.type === 'toolEvent') {
          recordToolEvent(m.toolName || m.tool, m.phase);
          updateToolRow(m);
          console.log('[indusagi-webview][' + now() + '] tool event', {
            phase: m.phase,
            tool: m.toolName || m.tool,
            toolCallId: m.toolCallId,
            toolsSeen: seenTools.size,
            totalCalls: totalToolCalls,
          });
          return;
        }

        if (m.type === 'stateUpdate' && m.state) {
          model.textContent = toLabel(m.state.model, '-');
          thinking.textContent = toLabel(m.state.thinkingLevel, '-');
          msgCount.textContent = String(m.state.messageCount || 0);
          // keep dropdown in sync with active model
          if (modelSelect) {
            const currentId = toModelId(m.state.model);
            if (currentId) modelSelect.value = currentId;
          }
          if (thinkingSelect) {
            const level = toLabel(m.state.thinkingLevel, '');
            if (level) thinkingSelect.value = level;
          }
          if (sessionSelect && m.state.sessionFile) {
            sessionSelect.value = m.state.sessionFile;
          }
          console.log('[indusagi-webview][' + now() + '] state updated', {
            model: model.textContent,
            thinking: thinking.textContent,
            messageCount: msgCount.textContent,
          });
        }
      });

      resetToolStats();
      postToExtension('getModels');
      postToExtension('getThinkingOptions');
      postToExtension('getSessionHistory');
      console.log('[indusagi-webview][' + now() + '] initialized');
    })();
  </script>
</body>
</html>`;
  }

  private _nonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let i = 0; i < 16; i++) value += chars.charAt(Math.floor(Math.random() * chars.length));
    return value;
  }
}
