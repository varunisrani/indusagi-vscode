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
  </style>
</head>
<body>
  <div class="header">Indusagi AI Assistant</div>
  <div class="state">
    <span>Model: <b id="model">-</b></span>
    <span>Thinking: <b id="thinking">-</b></span>
    <span>Msgs: <b id="msgCount">0</b></span>
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
    <textarea id="messageInput" placeholder="Ask Indusagi..."></textarea>
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
      const sessionSelect = $('sessionSelect');
      const nameSessionBtn = $('nameSessionBtn');
      const modelSelect = $('modelSelect');
      const thinkingSelect = $('thinkingSelect');

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

      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
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
          console.log('[indusagi-webview][' + now() + '] replaced chat messages. count=', (m.messages || []).length);
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
