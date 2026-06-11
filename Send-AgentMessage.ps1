<#
.SYNOPSIS
    Sends a message to a Codex agent via the Codex Agent Manager (CAM) system.
.PARAMETER Target
    The friendly command alias of the target agent (e.g. boss-master-overseer-president).
.PARAMETER Message
    The message text to send to the target agent.
.EXAMPLE
    .\Send-AgentMessage.ps1 -Target "boss-master-overseer-president" -Message "Hello from Antigravity!"
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$Target,
    
    [Parameter(Mandatory=$true)]
    [string]$Message
)

$camPath = "C:\Users\kjhgf\OneDrive\Documents\New project\codex-agent-manager"
if (-not (Test-Path $camPath)) {
    Write-Error "Codex Agent Manager directory not found at: $camPath"
    return
}

Push-Location $camPath
try {
    # Execute the send command and parse the output JSON
    $output = .\codex-send.cmd $Target $Message --from antigravity
    Write-Output $output
}
catch {
    Write-Error "Failed to execute codex-send.cmd command: $_"
}
finally {
    Pop-Location
}
