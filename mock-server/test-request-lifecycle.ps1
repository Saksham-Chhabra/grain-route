# Test script to verify request lifecycle integration
# Prerequisites: Server running on port 3001, mock-server on port 5001, MongoDB running

Write-Host "=== Testing Request Lifecycle Integration ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create an NGO first
Write-Host "1. Creating test NGO..." -ForegroundColor Yellow
$ngoBody = @{
    name = "Test NGO"
    address = "123 Test St, Mumbai"
    contactInfo = @{
        contactPerson = "John Doe"
        email = "test@ngo.org"
        phone = "1234567890"
    }
} | ConvertTo-Json

$ngoResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/ngo" -Method POST -Body $ngoBody -ContentType "application/json"
$ngoId = $ngoResponse.data._id
Write-Host "   NGO created with ID: $ngoId" -ForegroundColor Green
Write-Host ""

# Step 2: Start a minimal scenario with just requests
Write-Host "2. Starting scenario..." -ForegroundColor Yellow
$timestamp = [int][double]::Parse((Get-Date -UFormat %s))
$scenarioBody = @{
    name = "LifecycleTest-$timestamp"
    seed = "test-seed-123"
    startDate = "2025-11-01T00:00:00Z"
    batchSize = 1
    intervalMs = 2000
    durationMinutes = 1
    probabilities = @{
        farm = 0
        request = 1
    }
    regions = @("Maharashtra")
} | ConvertTo-Json

$scenarioResponse = Invoke-RestMethod -Uri "http://localhost:5001/api/scenario/start" -Method POST -Body $scenarioBody -ContentType "application/json"
$scenarioId = $scenarioResponse.scenarioId
Write-Host "   Scenario started with ID: $scenarioId" -ForegroundColor Green
Write-Host ""

# Step 3: Wait for scenario to complete
Write-Host "3. Waiting 65 seconds for scenario to run..." -ForegroundColor Yellow
Start-Sleep -Seconds 65

Write-Host ""
Write-Host "4. Stopping scenario..." -ForegroundColor Yellow
$stopBody = @{ scenarioId = $scenarioId } | ConvertTo-Json
$stopResponse = Invoke-RestMethod -Uri "http://localhost:5001/api/scenario/stop" -Method POST -Body $stopBody -ContentType "application/json"
$stopResponse | ConvertTo-Json -Depth 3

Write-Host ""
Write-Host "5. Fetching scenario events..." -ForegroundColor Yellow
$events = Invoke-RestMethod -Uri "http://localhost:5001/api/scenario/$scenarioId/events?limit=20"
$events | ForEach-Object {
    [PSCustomObject]@{
        type = $_.type
        timestamp = $_.timestamp
        requestId = $_.payload.requestId
        status = $_.payload.status
    }
} | Format-Table -AutoSize

Write-Host ""
Write-Host "6. Fetching requests from Server..." -ForegroundColor Yellow
$requests = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/request/all"
$requests.data | ForEach-Object {
    [PSCustomObject]@{
        requestID = $_.requestID
        status = $_.status
        createdOn = $_.createdOn
        approvedOn = $_.approvedOn
        fullFilledOn = $_.fullFilledOn
    }
} | Format-Table -AutoSize

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
