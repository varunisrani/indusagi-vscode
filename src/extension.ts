import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";

// Extension configuration
let outputChannel: vscode.OutputChannel;
let indusagiProcess: ReturnType<typeof spawn> | null = null;
const config = vscode.workspace.getConfiguration("indusagi-vscode");

// Indusagi RPC protocol implementation
class IndusagiRPC {
  private messageId = 0;

  async sendRequest<T>(command: string, params: object = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const request = {
        type: command,
        id: `req-${id}`,
        ...params,
      };

      try {
        const result = await this.executeCommand(command, request);
        resolve(result as T);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async executeCommand(command: string, request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!indusagiProcess || indusagiProcess.killed) {
        // Start Indusagi if not running
        this.startIndusagi();
        // Wait for it to be ready
        await new Promise(r => setTimeout(r, 500));
      }

      // Send request to Indusagi
      indusagiProcess.stdin.write(JSON.stringify(request) + "\n");

      // Read response line by line
      let response: any;
      let buffer = "";

      const responseHandler = (data: string) => {
        buffer += data;
        const lines = buffer.split("\n");

        for (const line of lines) {
          if (line.trim()) {
            try {
              response = JSON.parse(line);

              // Check if this is our response
              if (response.id === (request as any).id) {
                indusagiProcess.stdin.destroy();
                resolve(response);
                indusagiProcess.removeAllListeners("data");
                return;
              }
            } catch {
              // Not JSON or not our response, continue
            }
          }
        }
      };

      indusagiProcess.stdout.on("data", responseHandler);
      indusagiProcess.stdout.on("end", () => {
        // Flush remaining buffer
        if (buffer.trim()) {
          try {
            const response = JSON.parse(buffer);
            if (response.id === (request as any).id) {
              resolve(response);
              indusagiProcess.stdin.destroy();
              return;
            }
          } catch {
            reject(new Error("Invalid response format"));
          }
        }
      });

      // Timeout handling
      const timeout = setTimeout(() => {
        indusagiProcess.stdin.destroy();
        reject(new Error("Request timeout"));
      }, 30000); // 30 seconds
    });
  }

  private startIndusagi() {
    const indusagiPath = config.get<string>("indusagiPath", "indusagi");
    
    outputChannel.appendLine(`Starting Indusagi: ${indusagiPath}`);
    
    // Get API key if provided
    const apiKey = config.get<string>("apiKey", "");
    
    const args = [
      "indusagi",
      "--mode", "rpc",
      "--no-session",
    ];

    if (apiKey) {
      // Set via environment variable
      args.push("--provider", "openai", "--model", config.get<string>("model", "gpt-4o-mini"));
    }

    indusagiProcess = spawn(indusagiPath, args, {
      stdio: ["pipe", "pipe"],
    });

    indusagiProcess.on("error", (error) => {
      outputChannel.appendLine(`Indusagi error: ${error.message}`);
      vscode.window.showErrorMessage(`Indusagi error: ${error.message}`);
    });

    // Wait for agent_start event to indicate ready state
    indusagiProcess.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line);
            if (event.type === "agent_start") {
              outputChannel.appendLine("Indusagi RPC connected and ready");
              break;
            }
          } catch {
            // Ignore non-JSON lines
          }
        }
      }
    });
  }

  private stopIndusagi() {
    if (indusagiProcess && !indusagiProcess.killed) {
      indusagiProcess.kill("SIGTERM");
      indusagiProcess = null;
      outputChannel.appendLine("Indusagi stopped");
    }
  }

  // Clean up on deactivation
  context.subscriptions.push(
    vscode.Disposable.from(context.subscriptions),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      // Update context based on selected file
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        outputChannel.appendLine(`Active editor: ${editor.document.fileName}`);
      }
    })
  );

  // Register commands
  const askCommand = vscode.commands.registerCommand("indusagi.ask", async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    const selectedText = editor.document.getText(selection) || editor.document.getText();

    if (!selectedText) {
      vscode.window.showWarningMessage("No text selected. Please select code first.");
      return;
    }

    outputChannel.appendLine(`Asking Indusagi about: ${selectedText.substring(0, 100)}...`);

    try {
      const result = await rpc.sendRequest("prompt", {
        message: selectedText,
      });

      // Show response in output channel
      if (result.type === "response" && result.command === "prompt") {
        outputChannel.appendLine("✅ Request sent");
      }

    } catch (error) {
      vscode.window.showErrorMessage(`Failed to ask Indusagi: ${error.message}`);
      outputChannel.appendLine(`❌ Error: ${error.message}`);
    }
  });

  const clearCommand = vscode.commands.registerCommand("indusagi.clear", () => {
    stopIndusagi();
    outputChannel.appendLine("Indusagi context cleared");
    vscode.window.showInformationMessage("Indusagi context cleared");
  });

  // Configuration
  const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    outputChannel.appendLine("Configuration changed");
  });

  // Activate command
  vscode.commands.registerCommand("indusagi.activate", () => {
    startIndusagi();
    vscode.window.showInformationMessage("Indusagi started");
  });

  function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("Indusagi");
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine("Indusagi extension activated");
    
    // Auto-start Indusagi on activation
    startIndusagi();

    vscode.window.showInformationMessage("Indusagi VS Code extension is ready!");
  }

  function deactivate() {
    stopIndusagi();
  outputChannel.appendLine("Indusagi extension deactivated");
  }
}

export function activate(context: vscode.ExtensionContext) {
  activate(context);
}

export function deactivate() {
  deactivate();
}
