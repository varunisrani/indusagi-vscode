import * as vscode from "vscode";
import { spawn } from "child_process";
import { SidebarProvider } from "./sidebarProvider";

let outputChannel: vscode.OutputChannel;
let indusagiProcess: ReturnType<typeof spawn> | null = null;
let config = vscode.workspace.getConfiguration("indusagi-vscode");
let sidebarProvider: SidebarProvider;

class IndusagiRPC {
  private messageId = 0;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();
  private responseBuffer = "";
  private isReady = false;
  private currentStreamText = "";
  private currentState: any = null;
  public onStateChanged?: (state: any) => void;

  async sendRequest<T>(command: string, params: object = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `req-${++this.messageId}`;
      this.pendingRequests.set(id, { resolve, reject });

      const request = {
        type: command,
        id,
        ...params,
      };

      this.ensureIndusagiRunning();
      if (indusagiProcess?.stdin) {
        indusagiProcess.stdin.write(JSON.stringify(request) + "\n");
        outputChannel.appendLine(`→ Sent: ${JSON.stringify(request)}`);
      } else {
        reject(new Error("Indusagi process not available"));
      }
    });
  }

  private ensureIndusagiRunning() {
    if (!indusagiProcess || indusagiProcess.killed) {
      this.startIndusagi();
    }
  }

  private startIndusagi() {
    const indusagiPath = config.get<string>("indusagiPath", "indusagi");
    
    outputChannel.appendLine(`Starting Indusagi: ${indusagiPath}`);
    
    const args = [
      "--mode", "rpc",
    ];

    indusagiProcess = spawn(indusagiPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    indusagiProcess.on("error", (error) => {
      outputChannel.appendLine(`Indusagi error: ${error.message}`);
      vscode.window.showErrorMessage(`Indusagi error: ${error.message}`);
    });

    indusagiProcess.stderr?.on("data", (data) => {
      outputChannel.appendLine(`Indusagi stderr: ${data.toString()}`);
    });

    indusagiProcess.stdout?.on("data", (data) => {
      this.handleResponse(data.toString());
    });
  }

  private handleResponse(data: string) {
    this.responseBuffer += data;
    const lines = this.responseBuffer.split("\n");
    
    // Keep last incomplete line in buffer
    this.responseBuffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          outputChannel.appendLine(`← Received: ${JSON.stringify(response).substring(0, 200)}...`);
          
          if (response.type === "agent_start") {
            this.isReady = true;
            outputChannel.appendLine("Indusagi RPC connected and ready");
            // Request initial state
            this.getState().then(state => {
              this.currentState = state;
              sidebarProvider?.sendMessageToWebview({
                type: "stateUpdate",
                state: state
              });
              this.onStateChanged?.(state);
            }).catch(() => {});
            continue;
          }

          // Handle state updates
          if (response.type === "state_update") {
            this.currentState = response.state;
            sidebarProvider?.sendMessageToWebview({
              type: "stateUpdate",
              state: response.state
            });
            this.onStateChanged?.(response.state);
            continue;
          }

          // Handle streaming responses
          if (response.type === "message_update") {
            const event = response.assistantMessageEvent;
            if (event?.type === "text_delta") {
              this.currentStreamText += event.delta || "";
              // Send to sidebar
              sidebarProvider?.sendMessageToWebview({
                type: "streamChunk",
                content: event.delta || "",
                model: this.currentState?.model
              });
            } else if (event?.type === "reasoning_delta") {
              // Handle reasoning if needed
              outputChannel.appendLine(`Reasoning: ${event.delta?.substring(0, 100)}...`);
            }
            continue;
          }

          if (response.type === "message_end") {
            // Send complete message to sidebar
            if (this.currentStreamText) {
              sidebarProvider?.sendMessageToWebview({
                type: "addMessage",
                content: this.currentStreamText,
                model: this.currentState?.model
              });
              this.currentStreamText = "";
            }
          }

          // Handle tool execution events
          if (response.type === "tool_execution_start") {
            sidebarProvider?.sendMessageToWebview({
              type: "toolEvent",
              phase: "start",
              toolName: response.toolName,
              args: response.args,
              toolCallId: response.toolCallId,
            });
            continue;
          }

          if (response.type === "tool_execution_update") {
            sidebarProvider?.sendMessageToWebview({
              type: "toolEvent",
              phase: "update",
              toolName: response.toolName,
              toolCallId: response.toolCallId,
              args: response.args,
              partialResult: response.partialResult,
            });
            continue;
          }

          if (response.type === "tool_execution_end") {
            sidebarProvider?.sendMessageToWebview({
              type: "toolEvent",
              phase: "end",
              toolName: response.toolName,
              toolCallId: response.toolCallId,
              result: response.result,
              isError: response.isError,
            });
            continue;
          }

          // Handle regular responses
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            if (response.error) {
              pending.reject(new Error(response.error));
            } else {
              pending.resolve(response);
            }
          }
        } catch (e) {
          outputChannel.appendLine(`Parse error: ${e}`);
        }
      }
    }
  }

  stop() {
    if (indusagiProcess && !indusagiProcess.killed) {
      indusagiProcess.kill("SIGTERM");
      indusagiProcess = null;
      this.isReady = false;
      outputChannel.appendLine("Indusagi stopped");
    }
  }

  private unwrapData<T>(response: any): T {
    return (response && typeof response === "object" && "data" in response)
      ? (response.data as T)
      : (response as T);
  }

  // Session management methods
  async getState(): Promise<any> {
    const res = await this.sendRequest("get_state", {});
    return this.unwrapData<any>(res);
  }

  async getMessages(): Promise<any[]> {
    const res = await this.sendRequest("get_messages", {});
    const data = this.unwrapData<any>(res);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.messages)) return data.messages;
    return [];
  }

  async newSession(): Promise<void> {
    await this.sendRequest("new_session", {});
  }

  async switchSession(sessionPath: string): Promise<void> {
    await this.sendRequest("switch_session", { sessionPath });
  }

  async getAvailableModels(): Promise<any[]> {
    const res = await this.sendRequest("get_available_models", {});
    const data = this.unwrapData<any>(res);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.models)) return data.models;
    return [];
  }

  async setModel(model: string | { provider?: string; modelId?: string; id?: string }): Promise<void> {
    if (!model) return;

    if (typeof model === "string") {
      // expected encoded format: provider::modelId
      const [provider, modelId] = model.split("::");
      if (provider && modelId) {
        await this.sendRequest("set_model", { provider, modelId });
        return;
      }
      // fallback: assume model string is id only, provider unknown
      throw new Error("Invalid model format. Expected provider::modelId");
    }

    const provider = model.provider;
    const modelId = model.modelId || model.id;
    if (!provider || !modelId) {
      throw new Error("Invalid model object. Missing provider/modelId");
    }

    await this.sendRequest("set_model", { provider, modelId });
  }

  async cycleModel(): Promise<void> {
    await this.sendRequest("cycle_model", {});
  }

  async setThinkingLevel(level: string): Promise<void> {
    await this.sendRequest("set_thinking_level", { level });
  }

  async cycleThinkingLevel(): Promise<void> {
    await this.sendRequest("cycle_thinking_level", {});
  }

  async getSessionStats(): Promise<any> {
    const res = await this.sendRequest("get_session_stats", {});
    return this.unwrapData<any>(res);
  }

  async exportHtml(): Promise<string> {
    const res = await this.sendRequest("export_html", {});
    const data = this.unwrapData<any>(res);
    return typeof data === "string" ? data : data?.path ?? "";
  }

  async compact(customInstructions?: string): Promise<any> {
    return this.sendRequest("compact", customInstructions ? { customInstructions } : {});
  }

  async setAutoCompaction(enabled: boolean): Promise<void> {
    await this.sendRequest("set_auto_compaction", { enabled });
  }

  async steer(message: string): Promise<void> {
    await this.sendRequest("steer", { message });
  }

  async followUp(message: string): Promise<void> {
    await this.sendRequest("follow_up", { message });
  }

  async abort(): Promise<void> {
    await this.sendRequest("abort", {});
  }

  async bash(command: string): Promise<any> {
    const res = await this.sendRequest("bash", { command });
    return this.unwrapData<any>(res);
  }

  async abortBash(): Promise<void> {
    await this.sendRequest("abort_bash", {});
  }

  async setAutoRetry(enabled: boolean): Promise<void> {
    await this.sendRequest("set_auto_retry", { enabled });
  }

  async abortRetry(): Promise<void> {
    await this.sendRequest("abort_retry", {});
  }

  async fork(entryId: string): Promise<any> {
    const res = await this.sendRequest("fork", { entryId });
    return this.unwrapData<any>(res);
  }

  async getForkMessages(): Promise<any[]> {
    const res = await this.sendRequest("get_fork_messages", {});
    const data = this.unwrapData<any>(res);
    return Array.isArray(data) ? data : (Array.isArray(data?.messages) ? data.messages : []);
  }

  async getLastAssistantText(): Promise<string> {
    const res = await this.sendRequest("get_last_assistant_text", {});
    const data = this.unwrapData<any>(res);
    return typeof data === "string" ? data : (data?.text || "");
  }

  getCurrentState(): any {
    return this.currentState;
  }
}

const rpc = new IndusagiRPC();

function formatModelLabel(model: any): string {
  if (!model) return "unknown";
  if (typeof model === "string") return model;
  return model.id || model.name || model.model || JSON.stringify(model);
}

function formatThinkingLabel(level: any): string {
  if (!level) return "unknown";
  if (typeof level === "string") return level;
  return level.level || level.name || JSON.stringify(level);
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Indusagi");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine("Indusagi extension activated");

  // Initialize sidebar provider
  sidebarProvider = new SidebarProvider(context.extensionUri);

  const SESSION_HISTORY_KEY = "indusagi.sessionHistory";
  const SESSION_ALIAS_KEY = "indusagi.sessionAliases";
  const MAX_SESSIONS = 50;

  const getSessionHistory = (): string[] => context.globalState.get<string[]>(SESSION_HISTORY_KEY, []);
  const getSessionAliases = (): Record<string, string> => context.globalState.get<Record<string, string>>(SESSION_ALIAS_KEY, {});

  const pushSessionToHistory = async (sessionFile?: string) => {
    if (!sessionFile) return;
    const current = getSessionHistory().filter((p) => p !== sessionFile);
    current.unshift(sessionFile);
    await context.globalState.update(SESSION_HISTORY_KEY, current.slice(0, MAX_SESSIONS));
  };

  const sendSessionHistoryToWebview = async (stateOverride?: any) => {
    const history = getSessionHistory();
    const aliases = getSessionAliases();
    const currentState = stateOverride ?? (await rpc.getState().catch(() => null));
    sidebarProvider.sendMessageToWebview({
      type: "sessionHistory",
      sessions: history.map((path) => ({ path, name: aliases[path] || path.split("/").pop() || path })),
      currentSession: currentState?.sessionFile,
    });
  };

  rpc.onStateChanged = async (state: any) => {
    await pushSessionToHistory(state?.sessionFile);
    await sendSessionHistoryToWebview(state);
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider
    )
  );

  // Register ask command (original)
  const askCommand = vscode.commands.registerCommand("indusagi.ask", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No editor open");
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection) || editor.document.getText();

    if (!selectedText) {
      vscode.window.showWarningMessage("No text selected");
      return;
    }

    outputChannel.appendLine(`Asking Indusagi about: ${selectedText.substring(0, 100)}...`);

    try {
      const result = await rpc.sendRequest("prompt", {
        message: selectedText,
        streamingBehavior: "followUp",
      });
      outputChannel.appendLine("Response: " + JSON.stringify(result));
      vscode.window.showInformationMessage("Request sent to Indusagi");
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed: ${error.message}`);
      outputChannel.appendLine(`Error: ${error.message}`);
    }
  });

  const handleSlashCommand = async (raw: string): Promise<boolean> => {
    if (!raw.startsWith("/")) return false;
    const [cmd, ...rest] = raw.trim().split(/\s+/);
    const argText = rest.join(" ").trim();

    const notSupported = (name: string, extra?: string) => {
      const msg = `⚠️ ${name} is not yet fully supported in VS Code extension.${extra ? "\n" + extra : ""}`;
      sidebarProvider.sendMessageToWebview({ type: "addMessage", content: msg });
    };

    try {
      switch (cmd.toLowerCase()) {
        case "/help":
          sidebarProvider.sendMessageToWebview({
            type: "addMessage",
            content: [
              "📘 Slash commands (VS Code)",
              "/new, /clear, /state, /session, /sessions, /switch <path>",
              "/models, /model provider::modelId, /thinking <level>",
              "/compact [instructions], /stats, /export",
              "/steer <msg>, /followup <msg>, /abort",
              "/bash <cmd>, /abort_bash",
              "/auto_compact on|off, /auto_retry on|off, /abort_retry",
              "/name <alias>, /last, /copy",
              "(CLI-only for now: /settings, /scoped-models, /share, /fork, /tree, /login, /logout, /resume, /reload, /changelog, /hotkeys)",
            ].join("\n"),
          });
          return true;
        case "/new":
        case "/clear":
          await vscode.commands.executeCommand("indusagi.newSession");
          return true;
        case "/state": {
          const state = await rpc.getState();
          sidebarProvider.sendMessageToWebview({ type: "stateUpdate", state });
          await sendSessionHistoryToWebview(state);
          return true;
        }
        case "/session":
          await vscode.commands.executeCommand("indusagi.getStats");
          return true;
        case "/models":
          await vscode.commands.executeCommand("indusagi.getModels");
          return true;
        case "/model":
          if (!argText) throw new Error("Usage: /model provider::modelId");
          await vscode.commands.executeCommand("indusagi.setModel", argText);
          return true;
        case "/thinking":
          if (!argText) throw new Error("Usage: /thinking off|minimal|low|medium|high|xhigh");
          await vscode.commands.executeCommand("indusagi.setThinking", argText);
          return true;
        case "/compact": {
          const result: any = await rpc.compact(argText || undefined);
          const data = result?.data ?? {};
          if (data?.summary) {
            sidebarProvider.sendMessageToWebview({ type: "addMessage", content: `📦 Compaction summary:\n${data.summary}` });
          }
          return true;
        }
        case "/stats":
          await vscode.commands.executeCommand("indusagi.getStats");
          return true;
        case "/export":
          await vscode.commands.executeCommand("indusagi.exportHtml");
          return true;
        case "/steer":
          if (!argText) throw new Error("Usage: /steer <message>");
          await rpc.steer(argText);
          return true;
        case "/followup":
        case "/follow_up":
          if (!argText) throw new Error("Usage: /followup <message>");
          await rpc.followUp(argText);
          return true;
        case "/abort":
          await rpc.abort();
          return true;
        case "/bash": {
          if (!argText) throw new Error("Usage: /bash <command>");
          const data = await rpc.bash(argText);
          sidebarProvider.sendMessageToWebview({ type: "addMessage", content: `💻 Bash (exit ${data?.exitCode ?? "?"}):\n${data?.output || ""}` });
          return true;
        }
        case "/abort_bash":
          await rpc.abortBash();
          return true;
        case "/auto_compact":
          await rpc.setAutoCompaction(argText === "on" || argText === "true" || argText === "1");
          return true;
        case "/auto_retry":
          await rpc.setAutoRetry(argText === "on" || argText === "true" || argText === "1");
          return true;
        case "/abort_retry":
          await rpc.abortRetry();
          return true;
        case "/sessions":
          await sendSessionHistoryToWebview();
          return true;
        case "/switch":
          if (!argText) throw new Error("Usage: /switch <sessionPath>");
          await vscode.commands.executeCommand("indusagi.switchSession", argText);
          return true;
        case "/name": {
          const state = await rpc.getState();
          if (!state?.sessionFile) throw new Error("No active session file");
          await vscode.commands.executeCommand("indusagi.setSessionAlias", { path: state.sessionFile, alias: argText });
          return true;
        }
        case "/last": {
          const text = await rpc.getLastAssistantText();
          sidebarProvider.sendMessageToWebview({ type: "addMessage", content: `🧾 Last assistant text:\n${text}` });
          return true;
        }
        case "/copy": {
          const text = await rpc.getLastAssistantText();
          await vscode.env.clipboard.writeText(text || "");
          sidebarProvider.sendMessageToWebview({ type: "addMessage", content: "📋 Copied last assistant message." });
          return true;
        }
        case "/settings":
        case "/scoped-models":
        case "/share":
        case "/fork":
        case "/tree":
        case "/login":
        case "/logout":
        case "/resume":
        case "/reload":
        case "/changelog":
        case "/hotkeys":
          notSupported(cmd);
          return true;
        default:
          return false;
      }
    } catch (error: any) {
      sidebarProvider.sendMessageToWebview({ type: "addMessage", content: `❌ Slash command error: ${error.message}` });
      return true;
    }
  };

  // Register chat command (for sidebar)
  const chatCommand = vscode.commands.registerCommand("indusagi.chat", async (message?: string) => {
    const editor = vscode.window.activeTextEditor;
    let codeContext = "";
    
    if (editor) {
      const selection = editor.selection;
      codeContext = editor.document.getText(selection) || "";
    }

    let userMessage = message;
    
    // If no message provided, prompt for input
    if (!userMessage) {
      userMessage = await vscode.window.showInputBox({
        prompt: "Ask Indusagi",
        placeHolder: "Type your question here..."
      });
    }

    if (!userMessage) {
      return;
    }

    // Handle slash commands (CLI-like controls)
    if (await handleSlashCommand(userMessage.trim())) {
      return;
    }

    // Include selected code if available
    const fullMessage = codeContext 
      ? `${userMessage}\n\nSelected code:\n\`\`\`\n${codeContext}\n\`\`\``
      : userMessage;

    outputChannel.appendLine(`Chat message: ${fullMessage.substring(0, 100)}...`);

    try {
      // Send to Indusagi
      await rpc.sendRequest("prompt", {
        message: fullMessage,
        streamingBehavior: "followUp",
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed: ${error.message}`);
      outputChannel.appendLine(`Error: ${error.message}`);
      sidebarProvider.sendMessageToWebview({
        type: "addMessage",
        content: `❌ Error: ${error.message}`
      });
    }
  });

  // Register clear command
  const clearCommand = vscode.commands.registerCommand("indusagi.clear", () => {
    rpc.stop();
    sidebarProvider.sendMessageToWebview({ type: "clearChat" });
    vscode.window.showInformationMessage("Indusagi context cleared");
  });

  // Register activate command
  const activateCommand = vscode.commands.registerCommand("indusagi.activate", () => {
    outputChannel.appendLine("Starting Indusagi manually");
    vscode.window.showInformationMessage("Indusagi started");
  });

  // Session management commands
  const newSessionCommand = vscode.commands.registerCommand("indusagi.newSession", async () => {
    try {
      await rpc.newSession();
      const [state, messages] = await Promise.all([
        rpc.getState().catch(() => null),
        rpc.getMessages().catch(() => []),
      ]);
      if (state?.sessionFile) {
        await pushSessionToHistory(state.sessionFile);
      }
      sidebarProvider.sendMessageToWebview({ type: "clearChat" });
      sidebarProvider.sendMessageToWebview({ type: "replaceMessages", messages });
      if (state) {
        sidebarProvider.sendMessageToWebview({ type: "stateUpdate", state });
      }
      await sendSessionHistoryToWebview(state);
      vscode.window.showInformationMessage("New session started");
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to start new session: ${error.message}`);
    }
  });

  const getSessionHistoryCommand = vscode.commands.registerCommand("indusagi.getSessionHistory", async () => {
    await sendSessionHistoryToWebview();
  });

  const switchSessionCommand = vscode.commands.registerCommand("indusagi.switchSession", async (sessionPath: string) => {
    if (!sessionPath) return;
    try {
      await rpc.switchSession(sessionPath);
      const [state, messages] = await Promise.all([
        rpc.getState().catch(() => null),
        rpc.getMessages().catch(() => []),
      ]);
      if (state?.sessionFile) {
        await pushSessionToHistory(state.sessionFile);
      }
      sidebarProvider.sendMessageToWebview({ type: "clearChat" });
      sidebarProvider.sendMessageToWebview({ type: "replaceMessages", messages });
      if (state) {
        sidebarProvider.sendMessageToWebview({ type: "stateUpdate", state });
      }
      await sendSessionHistoryToWebview(state);
      vscode.window.showInformationMessage(`Switched session: ${sessionPath.split('/').pop()}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to switch session: ${error.message}`);
    }
  });

  const setSessionAliasCommand = vscode.commands.registerCommand("indusagi.setSessionAlias", async (payload: { path: string; alias: string }) => {
    const path = payload?.path;
    const alias = (payload?.alias || "").trim();
    if (!path) return;
    const aliases = getSessionAliases();
    if (!alias) {
      delete aliases[path];
    } else {
      aliases[path] = alias;
    }
    await context.globalState.update(SESSION_ALIAS_KEY, aliases);
    await sendSessionHistoryToWebview();
  });

  const getStateCommand = vscode.commands.registerCommand("indusagi.getState", async () => {
    try {
      const state = await rpc.getState();
      vscode.window.showInformationMessage(`Model: ${formatModelLabel(state?.model)}, Messages: ${state?.messageCount || 0}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to get state: ${error.message}`);
    }
  });

  const cycleModelCommand = vscode.commands.registerCommand("indusagi.cycleModel", async () => {
    try {
      await rpc.cycleModel();
      const [state, models] = await Promise.all([
        rpc.getState(),
        rpc.getAvailableModels().catch(() => []),
      ]);
      sidebarProvider.sendMessageToWebview({
        type: "modelsList",
        models,
        currentModel: state?.model,
      });
      vscode.window.showInformationMessage(`Switched to model: ${formatModelLabel(state?.model)}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to cycle model: ${error.message}`);
    }
  });

  const getModelsCommand = vscode.commands.registerCommand("indusagi.getModels", async () => {
    try {
      const [models, state] = await Promise.all([
        rpc.getAvailableModels(),
        rpc.getState().catch(() => null),
      ]);
      sidebarProvider.sendMessageToWebview({
        type: "modelsList",
        models,
        currentModel: state?.model,
      });
    } catch (error: any) {
      outputChannel.appendLine(`Failed to get models: ${error.message}`);
    }
  });

  const setModelCommand = vscode.commands.registerCommand("indusagi.setModel", async (model: string) => {
    if (!model) return;
    try {
      await rpc.setModel(model);
      const state = await rpc.getState();
      sidebarProvider.sendMessageToWebview({ type: "stateUpdate", state });
      vscode.window.showInformationMessage(`Switched to model: ${formatModelLabel(state?.model)}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to set model: ${error.message}`);
    }
  });

  const cycleThinkingCommand = vscode.commands.registerCommand("indusagi.cycleThinking", async () => {
    try {
      await rpc.cycleThinkingLevel();
      const state = await rpc.getState();
      sidebarProvider.sendMessageToWebview({ type: "stateUpdate", state });
      vscode.window.showInformationMessage(`Thinking level: ${formatThinkingLabel(state?.thinkingLevel)}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to cycle thinking level: ${error.message}`);
    }
  });

  const getThinkingOptionsCommand = vscode.commands.registerCommand("indusagi.getThinkingOptions", async () => {
    try {
      const state = await rpc.getState();
      const levels = ["off", "minimal", "low", "medium", "high", "xhigh"];
      sidebarProvider.sendMessageToWebview({
        type: "thinkingOptions",
        levels,
        currentLevel: state?.thinkingLevel,
      });
    } catch (error: any) {
      outputChannel.appendLine(`Failed to get thinking options: ${error.message}`);
    }
  });

  const setThinkingCommand = vscode.commands.registerCommand("indusagi.setThinking", async (level: string) => {
    if (!level) return;
    try {
      await rpc.setThinkingLevel(level);
      const state = await rpc.getState();
      sidebarProvider.sendMessageToWebview({ type: "stateUpdate", state });
      vscode.window.showInformationMessage(`Thinking level: ${formatThinkingLabel(state?.thinkingLevel)}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to set thinking level: ${error.message}`);
    }
  });

  const getStatsCommand = vscode.commands.registerCommand("indusagi.getStats", async () => {
    try {
      const stats = await rpc.getSessionStats();
      const totalTokens = stats?.tokens?.total ?? 0;
      const cost = stats?.cost ?? 0;
      const totalMessages = stats?.totalMessages ?? stats?.messageCount ?? 0;
      const message = `Tokens: ${totalTokens}, Cost: $${Number(cost).toFixed(4)}, Messages: ${totalMessages}`;
      vscode.window.showInformationMessage(message);
      outputChannel.appendLine(`[stats] ${message}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to get stats: ${error.message}`);
    }
  });

  const exportHtmlCommand = vscode.commands.registerCommand("indusagi.exportHtml", async () => {
    try {
      const htmlPath = await rpc.exportHtml();
      if (!htmlPath) {
        vscode.window.showWarningMessage("Export completed but no file path was returned.");
        return;
      }
      const result = await vscode.window.showInformationMessage(`Exported to: ${htmlPath}`, "Open");
      if (result === "Open") {
        const uri = vscode.Uri.file(htmlPath);
        await vscode.env.openExternal(uri);
      }
      outputChannel.appendLine(`[export] ${htmlPath}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to export: ${error.message}`);
    }
  });

  const compactCommand = vscode.commands.registerCommand("indusagi.compact", async () => {
    try {
      const result: any = await rpc.sendRequest("compact", {});
      const data = result?.data ?? {};
      const tokensBefore = data?.tokensBefore;
      const summary = data?.summary;
      const state = await rpc.getState().catch(() => null);
      if (state) {
        sidebarProvider.sendMessageToWebview({ type: "stateUpdate", state });
      }
      const compactMsg = tokensBefore
        ? `Session compacted (tokensBefore: ${tokensBefore})`
        : "Session compacted";
      vscode.window.showInformationMessage(compactMsg);
      if (summary) {
        sidebarProvider.sendMessageToWebview({
          type: "addMessage",
          content: `📦 Compaction summary:\n${summary}`,
        });
      }
      outputChannel.appendLine(`[compact] success ${tokensBefore ? `(tokensBefore=${tokensBefore})` : ""}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to compact: ${error.message}`);
    }
  });

  // Configuration change listener
  const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("indusagi-vscode")) {
      config = vscode.workspace.getConfiguration("indusagi-vscode");
      outputChannel.appendLine("Configuration changed");
    }
  });

  // Register disposables
  context.subscriptions.push(
    askCommand, 
    chatCommand, 
    clearCommand, 
    activateCommand, 
    newSessionCommand,
    getSessionHistoryCommand,
    switchSessionCommand,
    setSessionAliasCommand,
    getStateCommand,
    cycleModelCommand,
    getModelsCommand,
    setModelCommand,
    cycleThinkingCommand,
    getThinkingOptionsCommand,
    setThinkingCommand,
    getStatsCommand,
    exportHtmlCommand,
    compactCommand,
    configDisposable
  );

  vscode.window.showInformationMessage("Indusagi VS Code extension is ready!");
}

export function deactivate() {
  rpc.stop();
  outputChannel?.appendLine("Indusagi extension deactivated");
}
