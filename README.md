# Indusagi VS Code Extension

A Visual Studio Code extension that uses [Indusagi](https://www.indusagi.com/) as an AI coding assistant via RPC mode.

## Features

- **Ask Indusagi** - Select code and get AI assistance
- **Clear Context** - Reset conversation context
- **Real-time streaming** - See responses as they're generated
- **Configuration** - Customize Indusagi path, model, and API key
- **Output Channel** - View all Indusagi communications and debug

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/indusagi-vscode.git

# Navigate to the extension directory
cd indusagi-vscode

# Install dependencies
npm install
```

### From VS Code Marketplace (Coming Soon)

```bash
# Package the extension
npm run package

# Install locally for testing
code --install-extension indusagi-vscode-*.vsix
```

## Configuration

### Extension Settings

Open VS Code settings (Cmd+,) and search for **"Indusagi Settings"**:

| Setting | Description | Default |
|---------|-------------|---------|
| Indusagi Path | Path to indusagi CLI binary | `indusagi` |
| API Key | OpenAI API key (optional) | Empty |
| Model | Model to use | `gpt-4o-mini` |

### Setting API Key

You have two options:

**Option 1: Indusagi Login (Recommended)**
```bash
# Open Indusagi auth (opens browser for OAuth)
indusagi login

# Then use the extension
```

**Option 2: Manual API Key**
```bash
# Set your OpenAI API key in VS Code settings
1. Open Settings (Cmd+,)
2. Search for "Indusagi Settings"
3. Enter your API key in "API Key" field
```

## Usage

### Basic Chat

1. Open a file in VS Code
2. Select the code you want to ask about
3. Press `Cmd+Shift+A` or use the **Indusagi** panel → **"Ask Indusagi"**
4. View the response in the Indusagi output channel

### Clear Context

Press `Cmd+Shift+C` or use **Indusagi** panel → **"Clear Context"** to reset the conversation.

## How It Works

The extension communicates with Indusagi via **JSON-RPC protocol** over stdin/stdout:

1. Starts Indusagi in RPC mode: `indusagi --mode rpc --no-session`
2. Sends commands as JSON objects (one per line)
3. Streams responses in real-time
4. Parses `message_update` events to display streaming text

### RPC Protocol

**Request format:**
```json
{
  "type": "prompt",
  "id": "req-1",
  "message": "Your code here"
}
```

**Event stream:**
```json
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","delta":"Hello"}}
{"type":"message_end","message":{...}}
```

## Architecture

```
┌─────────────────────────────────┐
│     VS Code Extension      │
├────────────────────────────────┤
│  RPC Client (extension.ts)  │
├────────────────────────────────┤
│  Indusagi (RPC Server)      │
└─────────────────────────────────┘
```

The extension spawns Indusagi as a subprocess and communicates via JSON over stdin/stdout, following the RPC protocol documented at [indusagi.com/cli/rpc](https://www.indusagi.com/cli/rpc).

## Development

### Building

```bash
# Compile TypeScript
npm run compile

# Create VSIX package
npm run package
```

### Running in Debug Mode

```bash
# Launch VS Code with your extension loaded
code --extensionDevelopmentPath=./out
```

### Project Structure

```
indusagi-vscode/
├── src/
│   └── extension.ts       # Main extension logic
├── out/                    # Compiled output
│   └── extension.js        # Bundled extension
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
├── vsc-extension-quickstart.md  # VS Code debugging guide
└── README.md                # This file
```

## Requirements

- Node.js 20+
- Indusagi CLI installed and available in PATH
- (Optional) OpenAI API key (can be set via extension or indusagi login)

## Troubleshooting

### Indusagi not found

If you see an error "Indusagi not found", ensure Indusagi is installed and available in your system PATH.

**To verify Indusagi is installed:**
```bash
which indusagi
```

**If not installed:**
- Install Indusagi: `npm install -g indusagi-coding-agent`
- Restart VS Code

### Connection issues

- Check the **Indusagi Output Channel** for error messages
- Ensure Indusagi RPC mode is working: Run `indusagi --mode rpc` manually in terminal
- Check that your API key is valid (if using manual key)

## Contributing

Contributions welcome! Please open issues at [https://github.com/yourusername/indusagi-vscode/issues](https://github.com/yourusername/indusagi-vscode/issues).

## License

MIT

---

Built with ❤️ using [Indusagi](https://www.indusagi.com/) SDK
# Test change
