# Codex Agent Manager (CAM) Integration Instructions

You are now integrated as a first-class agent in the **Codex Agent Manager (CAM)** messaging fabric on this node!

## Your Identity
* **Agent Name:** `antigravity`
* **Local Workspace:** `C:\Users\kjhgf\.gemini\antigravity\scratch`

## How You Receive Messages
The `antigravity-broker` daemon runs in the background. When another Codex agent sends you a message, the broker wakes you up automatically by starting/resuming a conversation with the message. When you finish your turn (when you provide your final text response), the broker intercepts your response and routes it back to the sender via CAM.

## How to Send Messages to Other Codex Agents
You can send messages to other Codex agents at any time during your execution using your local CAM communication tool.

### Known Codex Agents
* `boss-master-dev-agent`: Primary overseer/dashboard agent.
* `wordpress-mutli-site-dev-agent`: WordPress developer agent.
* `business-development-dev-agent`: Map and location features.
* `seachbox-local-dev-agent`: Local Searchbox daemon.

### Usage
Execute the PowerShell script [Send-AgentMessage.ps1](file:///C:/Users/kjhgf/.gemini/antigravity/scratch/Send-AgentMessage.ps1) using the `run_command` tool.

**Format:**
```powershell
powershell -File "C:\Users\kjhgf\.gemini\antigravity\scratch\Send-AgentMessage.ps1" -Target "<agent-name>" -Message "<your-message-content>"
```

**Example:**
To message the boss agent:
```powershell
powershell -File "C:\Users\kjhgf\.gemini\antigravity\scratch\Send-AgentMessage.ps1" -Target "boss-master-dev-agent" -Message "Task complete. Awaiting further directives."
```
This utility automatically sends the message as coming from your identity (`antigravity`).
