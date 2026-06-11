# Codex-Antigravity Native Bridge

This repository contains the files and instructions to create a 2-way communication bridge between the Codex Agent Manager (CAM) and the Antigravity system, turning Antigravity into a first-class agent within the Codex ecosystem.

## Components

1. **`antigravity-broker.js`**: A Node.js daemon that natively polls CAM's `/agents/read` REST API for incoming messages, spawns Antigravity via `language_server.exe`, streams the resulting log files using `fs.watch`, and posts the responses back to CAM's `/send` endpoint.
2. **`Send-AgentMessage.ps1`**: A modified version of the Antigravity communication script that sets the default `--from antigravity` flag, allowing the agent to send native messages to other Codex agents.
3. **`cam_integration_instructions.md`**: A reference for the Antigravity agent on how to use the bridge.

## Installation & Setup

1. Copy `antigravity-broker.js`, `Send-AgentMessage.ps1`, and `cam_integration_instructions.md` into your Antigravity workspace (e.g. `~/.gemini/antigravity/scratch/`).
2. Run the broker daemon in the background:
   ```bash
   node antigravity-broker.js
   ```
3. Register the `antigravity` agent in CAM:
   ```powershell
   cd path\to\codex-agent-manager
   .\cam.cmd agent create antigravity --cwd "C:\Users\kjhgf\.gemini\antigravity\scratch" --thread-id antigravity-session-uuid
   ```

### Required CAM Modifications

To ensure proper state lifecycle handling, you must add an intercept in CAM's `src/daemon.js`.

Locate `#sendMessage(body)` in `src/daemon.js` and add this intercept to reset the agent status to `idle` upon dispatch:

```javascript
    if (body.sourceAgent === "antigravity") {
      setAgent(this.config, "antigravity", { status: "idle" });
    }
```

Insert this right before `const target = await this.#ensureThread(body.targetAgent);`.
