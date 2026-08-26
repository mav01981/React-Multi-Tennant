# E2E smoke test for feat-04 role & permissions enforcement.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5099/api/v1'

function Send-Api {
    param($Path, $Method, $JsonBody, $Headers = @{})
    try {
        $params = @{ Uri = $base + $Path; Method = $Method; Headers = $Headers; UseBasicParsing = $true }
        if ($Method -ne 'GET') { $params.ContentType = 'application/json'; $params.Body = $JsonBody }
        $r = Invoke-WebRequest @params
        return [PSCustomObject]@{ Status = [int]$r.StatusCode; Body = $r.Content }
    } catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        return [PSCustomObject]@{ Status = $status; Body = $_.ErrorDetails.Message }
    }
}

$suffix = [Guid]::NewGuid().ToString('N')

# ── Admin login ──────────────────────────────────────────────
$adminLogin = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Headers @{ 'X-Tenant-Id' = 'platform' } `
    -Body (@{ email = 'admin@example.com'; password = 'ChangeMe-Admin-1!' } | ConvertTo-Json)
$adminHeaders = @{ Authorization = "Bearer $($adminLogin.accessToken)" }

Write-Output '[1] GET /roles (admin, roles.read satisfied)'
$roles = Invoke-RestMethod -Uri "$base/roles" -Headers $adminHeaders
$admin    = $roles | Where-Object { $_.name -eq 'Admin' }
$manager  = $roles | Where-Object { $_.name -eq 'Manager' }
$userRole = $roles | Where-Object { $_.name -eq 'User' }
if (-not $admin.permissions.Contains('users.delete') -or -not $admin.permissions.Contains('roles.read')) { throw 'Admin role missing expected permissions.' }
if ($manager.permissions.Contains('users.delete')) { throw 'Manager must NOT have users.delete.' }
if (-not $userRole.permissions.Contains('profile.read')) { throw 'User role missing profile.read.' }
Write-Output "    -> 200, Admin=$($admin.permissions -join ','); Manager=$($manager.permissions -join ',')"

# ── Seed a Manager and a plain User ─────────────────────────
$managerEmail = "mgr-$suffix@example.com"
$userEmail    = "usr-$suffix@example.com"
$managerPass  = 'ChangeMe-Roles-1!'

Write-Output '[2] POST /users (create Manager + User)'
$mgr = Invoke-RestMethod -Uri "$base/users" -Method Post -Headers $adminHeaders -ContentType 'application/json' `
    -Body (@{ email = $managerEmail; firstName = 'Role'; lastName = 'Manager'; password = $managerPass; roles = @('Manager') } | ConvertTo-Json)
$usr = Invoke-RestMethod -Uri "$base/users" -Method Post -Headers $adminHeaders -ContentType 'application/json' `
    -Body (@{ email = $userEmail; firstName = 'Role'; lastName = 'User'; password = $managerPass; roles = @('User') } | ConvertTo-Json)
Write-Output "    -> 201 Manager=$($mgr.id), User=$($usr.id)"

Write-Output '[3] Manager: GET /users (users.read satisfied -> allowed)'
$mgrLogin = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Headers @{ 'X-Tenant-Id' = 'platform' } `
    -Body (@{ email = $managerEmail; password = $managerPass } | ConvertTo-Json)
$mgrHeaders = @{ Authorization = "Bearer $($mgrLogin.accessToken)" }
$mgrList = Invoke-RestMethod -Uri "$base/users?page=1&pageSize=10" -Headers $mgrHeaders
if ($mgrList.totalCount -lt 1) { throw 'Manager expected to list users.' }
Write-Output "    -> 200, total=$($mgrList.totalCount)"

Write-Output '[4] Manager: DELETE /users/{id} (no users.delete -> 403)'
$forbidden = Send-Api "/users/$($usr.id)" 'DELETE' $null $mgrHeaders
if ($forbidden.Status -ne 403) { throw "Expected 403 FORBIDDEN, got $($forbidden.Status)." }
$forbiddenCode = try { ($forbidden.Body | ConvertFrom-Json).error.code } catch { 'FORBIDDEN' }
Write-Output "    -> 403 $forbiddenCode"

Write-Output '[5] Manager: GET /roles (no roles.read -> 403)'
$noRolesRead = Send-Api '/roles' 'GET' $null $mgrHeaders
if ($noRolesRead.Status -ne 403) { throw "Expected 403 FORBIDDEN, got $($noRolesRead.Status)." }
$noRolesReadCode = try { ($noRolesRead.Body | ConvertFrom-Json).error.code } catch { 'FORBIDDEN' }
Write-Output "    -> 403 $noRolesReadCode"

Write-Output '[6] User: GET /users (no users.read -> 403)'
$usrLogin = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Headers @{ 'X-Tenant-Id' = 'platform' } `
    -Body (@{ email = $userEmail; password = $managerPass } | ConvertTo-Json)
$usrHeaders = @{ Authorization = "Bearer $($usrLogin.accessToken)" }
$usrBlocked = Send-Api '/users' 'GET' $null $usrHeaders
if ($usrBlocked.Status -ne 403) { throw "Expected 403 FORBIDDEN, got $($usrBlocked.Status)." }
$usrBlockedCode = try { ($usrBlocked.Body | ConvertFrom-Json).error.code } catch { 'FORBIDDEN' }
Write-Output "    -> 403 $usrBlockedCode"

Write-Output 'Feature 04 role & permission enforcement smoke test passed.'