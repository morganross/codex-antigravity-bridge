import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";

// Dynamic Configuration paths
const CAM_HOME = path.join(os.homedir(), ".codex-agent-manager");
const CONFIG_FILE = path.join(CAM_HOME, "config.json");
const TOKEN_FILE = path.join(CAM_HOME, "secrets", "local-api-token");
const SCRATCH_DIR = path.join(os.homedir(), ".gemini", "antigravity", "scratch");
const MAPPINGS_FILE = path.join(SCRATCH_DIR, "broker_mappings.json");
const BRAIN_DIR = path.join(os.homedir(), ".gemini", "antigravity", "brain");

const AGENT_NAME = "antigravity";
let lastProcessedMessageId = null;
let isProcessing = false;

// Auto-Discovery of AGY Path
function resolveAgyPath() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const agyExePath = path.join(localAppData, "Programs", "Antigravity", "resources", "bin", "language_server.exe");
  if (fs.existsSync(agyExePath)) return agyExePath;
  return "language_server.exe"; // Fallback to system PATH
}

const AGY_EXE = resolveAgyPath();

// Bootstrap / Auto-Discovery / OAuth Phase
function bootstrapEnvironment() {
  console.log(`\n==================================================`);
  console.log(`[BOOTSTRAP] Verifying Codex and Antigravity Environments...`);
  console.log(`==================================================`);

  // 1. Verify Antigravity CLI (agy)
  try {
    execSync('agy --version', { stdio: 'ignore' });
  } catch (e) {
    console.error(`[BOOTSTRAP] Antigravity CLI ('agy') not found in PATH.`);
    console.log(`[BOOTSTRAP] Please download the Antigravity Desktop App and ensure 'agy' is added to your PATH.`);
    console.log(`[BOOTSTRAP] Make sure the language server exists at: ${AGY_EXE}`);
  }

  // 2. Verify Antigravity Auth
  try {
    console.log(`[BOOTSTRAP] Checking Antigravity OAuth...`);
    const agyStatus = execSync('agy status', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (agyStatus.toLowerCase().includes('unauthenticated') || agyStatus.toLowerCase().includes('login required')) {
      throw new Error("Needs login");
    }
  } catch (e) {
    console.log(`[BOOTSTRAP] Antigravity OAuth missing or expired. Prompting login...`);
    try {
      execSync('agy login', { stdio: 'inherit' });
    } catch (loginErr) {
      console.warn(`[BOOTSTRAP] WARNING: 'agy login' failed or was cancelled. Broker may fail to route messages.`);
    }
  }

  // 3. Verify Codex CLI
  try {
    console.log(`[BOOTSTRAP] Checking Codex CLI...`);
    execSync('codex --version', { stdio: 'ignore' });
  } catch (e) {
    console.error(`[BOOTSTRAP] Codex CLI ('codex') not found in PATH.`);
    console.log(`[BOOTSTRAP] To install, run: npm install -g @openai/codex-cli`);
  }

  // 4. Verify Codex Auth
  try {
    console.log(`[BOOTSTRAP] Checking Codex OAuth...`);
    execSync('codex whoami', { stdio: 'ignore' });
  } catch (e) {
    console.log(`[BOOTSTRAP] Codex OAuth missing or expired. Prompting login...`);
    try {
      execSync('codex login', { stdio: 'inherit' });
    } catch (loginErr) {
      console.warn(`[BOOTSTRAP] WARNING: 'codex login' failed. CAM integration may fail.`);
    }
  }

  // 5. Inject CAM Skills for Antigravity
  console.log(`[BOOTSTRAP] Injecting CAM messaging skills into Antigravity global directory...`);
  installAntigravitySkills();

  // 6. Verify CAM CLI
  try {
    console.log(`[BOOTSTRAP] Checking Codex Agent Manager (CAM) CLI...`);
    execSync('cam --version', { stdio: 'ignore' });
  } catch (e) {
    console.warn(`[BOOTSTRAP] WARNING: CAM CLI ('cam') not found in PATH.`);
    console.warn(`[BOOTSTRAP] Please ensure you have downloaded and run the Codex Agent Manager Windows Installer.`);
    console.warn(`[BOOTSTRAP] The broker will continue polling, but injection may fail until CAM is installed.`);
  }

  // 7. Auto-Register Antigravity Agent
  try {
    console.log(`[BOOTSTRAP] Registering Antigravity with CAM...`);
    // Fallback logic for development environments where cam is not globally installed
    const devCamPath = path.join(os.homedir(), "OneDrive", "Documents", "New project", "codex-agent-manager", "cam.cmd");
    const camCmd = fs.existsSync(devCamPath) ? `"${devCamPath}"` : 'cam';
    
    execSync(`${camCmd} agent create antigravity --cwd "${SCRATCH_DIR}" --thread-id antigravity-session-uuid`, { stdio: 'ignore' });
    console.log(`[BOOTSTRAP] Antigravity successfully registered with CAM.`);
  } catch (e) {
    console.warn(`[BOOTSTRAP] WARNING: Failed to auto-register agent with CAM. It may already exist or CAM CLI is unreachable.`);
  }

  // 8. Verify CAM Daemon Status
  try {
    console.log(`[BOOTSTRAP] Checking CAM Daemon status...`);
    const devCamPath = path.join(os.homedir(), "OneDrive", "Documents", "New project", "codex-agent-manager", "cam.cmd");
    const camCmd = fs.existsSync(devCamPath) ? `"${devCamPath}"` : 'cam';

    const camStatus = execSync(`${camCmd} daemon status`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (camStatus.toLowerCase().includes('stopped') || camStatus.toLowerCase().includes('not running')) {
      console.log(`[BOOTSTRAP] CAM Daemon is stopped. Attempting to start it...`);
      execSync(`${camCmd} daemon start`, { stdio: 'ignore' });
    }
  } catch (e) {
    console.warn(`[BOOTSTRAP] WARNING: Could not verify CAM daemon status. Make sure the CAM daemon is running in the background.`);
  }

  console.log(`[BOOTSTRAP] Environment Verification Complete!\n`);
}

function installAntigravitySkills() {
  const skillsDir = path.join(os.homedir(), ".gemini", "antigravity", "skills");
  const camSkillDir = path.join(skillsDir, "codex-cam-messaging");
  
  if (!fs.existsSync(camSkillDir)) {
    fs.mkdirSync(camSkillDir, { recursive: true });
  }

  const sourcePs1 = path.join(SCRATCH_DIR, "Send-AgentMessage.ps1");
  const destPs1 = path.join(camSkillDir, "Send-AgentMessage.ps1");

  if (fs.existsSync(sourcePs1)) {
    fs.copyFileSync(sourcePs1, destPs1);
  } else {
    const defaultPs1 = `
param (
    [string]$TargetAgent,
    [string]$MessageText
)

$tokenFile = "$env:USERPROFILE\\.codex-agent-manager\\secrets\\local-api-token"
$configFile = "$env:USERPROFILE\\.codex-agent-manager\\config.json"

if (-not (Test-Path $tokenFile)) {
    Write-Error "CAM token file not found at $tokenFile"
    exit 1
}

$token = (Get-Content $tokenFile -Raw).Trim()
$port = 37631
if (Test-Path $configFile) {
    $config = Get-Content $configFile -Raw | ConvertFrom-Json
    if ($config.port) { $port = $config.port }
}

$body = @{
    targetAgent = $TargetAgent
    message = $MessageText
    sourceAgent = "antigravity"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://127.0.0.1:$port/send" -Method Post -Headers @{ Authorization = "Bearer $token" } -Body $body -ContentType "application/json"
$response | ConvertTo-Json -Depth 5
`;
    fs.writeFileSync(destPs1, defaultPs1.trim(), "utf8");
  }

  const skillDef = {
    name: "cam_send_message",
    description: "Send a message to another Codex agent via the Codex Agent Manager (CAM) protocol. Use this to respond to incoming requests from other agents.",
    entrypoint: "pwsh.exe -File .\\Send-AgentMessage.ps1 -TargetAgent \"{{TargetAgent}}\" -MessageText \"{{MessageText}}\"",
    parameters: {
      type: "object",
      properties: {
        TargetAgent: { type: "string", description: "The name of the target Codex agent to send the message to." },
        MessageText: { type: "string", description: "The text body of the message." }
      },
      required: ["TargetAgent", "MessageText"]
    }
  };

  fs.writeFileSync(path.join(camSkillDir, "skill.json"), JSON.stringify(skillDef, null, 2), "utf8");
  console.log(`[BOOTSTRAP] Skill 'cam_send_message' successfully installed at ${camSkillDir}`);

  // Install Check Inbox Skill
  const inboxSkillDir = path.join(skillsDir, "codex-cam-inbox");
  if (!fs.existsSync(inboxSkillDir)) {
    fs.mkdirSync(inboxSkillDir, { recursive: true });
  }

  const inboxPs1 = `
$tokenFile = "$env:USERPROFILE\\.codex-agent-manager\\secrets\\local-api-token"
$configFile = "$env:USERPROFILE\\.codex-agent-manager\\config.json"

if (-not (Test-Path $tokenFile)) {
    Write-Error "CAM token file not found at $tokenFile"
    exit 1
}

$token = (Get-Content $tokenFile -Raw).Trim()
$port = 37631
if (Test-Path $configFile) {
    $config = Get-Content $configFile -Raw | ConvertFrom-Json
    if ($config.port) { $port = $config.port }
}

$response = Invoke-RestMethod -Uri "http://127.0.0.1:$port/inbox?agent=antigravity" -Method Get -Headers @{ Authorization = "Bearer $token" }
$response | ConvertTo-Json -Depth 5
`;
  
  fs.writeFileSync(path.join(inboxSkillDir, "Check-AgentMessages.ps1"), inboxPs1.trim(), "utf8");

  const inboxSkillDef = {
    name: "cam_check_inbox",
    description: "Check your Codex Agent Manager (CAM) inbox for any pending messages from other agents.",
    entrypoint: "pwsh.exe -File .\\Check-AgentMessages.ps1",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  };

  fs.writeFileSync(path.join(inboxSkillDir, "skill.json"), JSON.stringify(inboxSkillDef, null, 2), "utf8");
  console.log(`[BOOTSTRAP] Skill 'cam_check_inbox' successfully installed at ${inboxSkillDir}`);
}

// Helpers to get CAM config and token
function getCamConfig() {
  try {
    const data = fs.readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return { port: 37631 };
  }
}

function getCamToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch (e) {
    return "";
  }
}

// Load/Save mappings
function loadMappings() {
  try {
    if (!fs.existsSync(SCRATCH_DIR)) fs.mkdirSync(SCRATCH_DIR, { recursive: true });
    if (fs.existsSync(MAPPINGS_FILE)) {
      return JSON.parse(fs.readFileSync(MAPPINGS_FILE, "utf8"));
    }
  } catch (e) {}
  return {};
}

function saveMappings(mappings) {
  try {
    if (!fs.existsSync(SCRATCH_DIR)) fs.mkdirSync(SCRATCH_DIR, { recursive: true });
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2), "utf8");
  } catch (e) {}
}

// Run language_server.exe
function runAgyCommand(args) {
  return new Promise((resolve, reject) => {
    const fullArgs = ["agentapi", ...args];
    console.log(`[AGY CLI] Running ${AGY_EXE} ${fullArgs.join(" ")}`);
    const child = spawn(AGY_EXE, fullArgs, {
      cwd: SCRATCH_DIR,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Exit code ${code}. Stderr: ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse response JSON: ${e.message}. Raw: ${stdout}`));
      }
    });
  });
}

// Watch transcript.jsonl natively
async function pollAgyTranscript(conversationId, startByte = 0) {
  const logDir = path.join(BRAIN_DIR, conversationId, ".system_generated", "logs");
  const logFile = path.join(logDir, "transcript.jsonl");
  console.log(`[BROKER] Watching transcript: ${logFile} from byte ${startByte}`);

  let attempts = 0;
  while (!fs.existsSync(logDir) && attempts < 20) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  if (!fs.existsSync(logDir)) {
    throw new Error(`Directory ${logDir} was never created.`);
  }

  return new Promise((resolve, reject) => {
    let watcher;
    const timeout = setTimeout(() => {
      if (watcher) watcher.close();
      reject(new Error("Timeout waiting for Antigravity response"));
    }, 120000); // 2 min timeout

    if (fs.existsSync(logFile)) {
      const currentSize = fs.statSync(logFile).size;
      if (currentSize > startByte) {
        const buffer = Buffer.alloc(currentSize - startByte);
        const fd = fs.openSync(logFile, "r");
        fs.readSync(fd, buffer, 0, buffer.length, startByte);
        fs.closeSync(fd);
        
        startByte = currentSize; // update startByte
        
        const text = buffer.toString("utf8");
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const step = JSON.parse(line);
            if (step.source === "MODEL" && step.type === "PLANNER_RESPONSE" && step.status === "DONE") {
              clearTimeout(timeout);
              console.log(`[BROKER] Found Antigravity response: "${step.content}"`);
              resolve(step.content);
              return;
            }
          } catch (e) {}
        }
      }
    }

    watcher = fs.watch(logDir, (eventType, filename) => {
      if (filename !== "transcript.jsonl") return;
      if (!fs.existsSync(logFile)) return;

      const currentSize = fs.statSync(logFile).size;
      if (currentSize > startByte) {
        const buffer = Buffer.alloc(currentSize - startByte);
        const fd = fs.openSync(logFile, "r");
        fs.readSync(fd, buffer, 0, buffer.length, startByte);
        fs.closeSync(fd);
        
        startByte = currentSize;
        
        const text = buffer.toString("utf8");
        const lines = text.split(/\r?\n/).filter(Boolean);
        
        for (const line of lines) {
          try {
            const step = JSON.parse(line);
            if (step.source === "MODEL" && step.type === "PLANNER_RESPONSE" && step.status === "DONE") {
              clearTimeout(timeout);
              watcher.close();
              console.log(`[BROKER] Found Antigravity response: "${step.content}"`);
              resolve(step.content);
              return;
            }
          } catch (e) {}
        }
      }
    });
  });
}

// Send message natively to CAM via REST
async function sendCamResponse(targetAgent, messageText) {
  const config = getCamConfig();
  const token = getCamToken();
  const url = `http://localhost:${config.port}/send`;

  console.log(`[CAM API] Sending reply back to ${targetAgent}...`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      targetAgent: targetAgent,
      message: messageText,
      sourceAgent: AGENT_NAME
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to send response via API: ${response.status} ${err}`);
  }
  
  const json = await response.json();
  console.log(`[CAM API] Successfully delivered message!`);
  return json;
}

// Process an incoming Codex message
async function processMessage(msg) {
  isProcessing = true;
  console.log(`\n--- [NEW INCOMING MESSAGE] ---`);
  console.log(`ID: ${msg.messageId}`);
  console.log(`From: ${msg.sourceAgent} @ ${msg.sourceNode}`);
  console.log(`Body: "${msg.body}"`);
  console.log(`-----------------------------`);

  try {
    const mappings = loadMappings();
    let conversationId = mappings[msg.sourceAgent];
    let startByte = 0;

    if (conversationId) {
      console.log(`[BROKER] Reusing conversation: ${conversationId}`);
      const logFile = path.join(BRAIN_DIR, conversationId, ".system_generated", "logs", "transcript.jsonl");
      if (fs.existsSync(logFile)) startByte = fs.statSync(logFile).size;
      
      await runAgyCommand(["send-message", conversationId, msg.body]);
    } else {
      console.log(`[BROKER] Creating new conversation...`);
      const result = await runAgyCommand(["new-conversation", msg.body]);
      conversationId = result.response.newConversation.conversationId;
      console.log(`[BROKER] Created conversation: ${conversationId}`);
      mappings[msg.sourceAgent] = conversationId;
      saveMappings(mappings);
    }

    const reply = await pollAgyTranscript(conversationId, startByte);
    await sendCamResponse(msg.sourceAgent, reply);

  } catch (error) {
    console.error(`[BROKER] Error processing message:`, error.message);
  } finally {
    isProcessing = false;
  }
}

// Main polling function natively calling /agents/read
async function checkInbox() {
  if (isProcessing) return;

  try {
    const config = getCamConfig();
    const token = getCamToken();
    const url = `http://localhost:${config.port}/agents/read?name=${AGENT_NAME}`;

    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      console.error("[BROKER] Fetch error:", res.status, await res.text());
      return;
    }
    
    const data = await res.json();
    if (!data.agent || !data.agent.lastDelivery) return;

    const msg = data.agent.lastDelivery;

    if (lastProcessedMessageId === null) {
      lastProcessedMessageId = msg.messageId;
      console.log(`[BROKER] Initialized baseline messageId to: ${msg.messageId}`);
      return;
    }

    if (msg.messageId !== lastProcessedMessageId) {
      lastProcessedMessageId = msg.messageId;
      await processMessage(msg);
    }

  } catch (e) {
    console.error("[BROKER] Fetch error:", e.message);
  }
}

console.log(`\n==================================================`);
console.log(`[BROKER] Antigravity-Codex Broker Daemon starting (Bootstrapper Mode)...`);
console.log(`==================================================\n`);

// Run the bootstrapper logic
bootstrapEnvironment();

// Perform initial check to set baseline
checkInbox();

// Poll every 1.5 seconds
setInterval(checkInbox, 1500);
