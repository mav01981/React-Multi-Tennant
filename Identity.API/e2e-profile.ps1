# E2E smoke test for feat-03 profile self-service.
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

$oldPassword = 'ChangeMe-Admin-1!'
$newPassword = 'ChangeMe-Profile-1!'
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ email = 'admin@example.com'; password = $oldPassword } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.accessToken)" }

Write-Output '[1] GET /users/me (token-bound profile)'
$profile = Invoke-RestMethod -Uri "$base/users/me" -Headers $headers
if ($profile.email -ne 'admin@example.com') { throw 'Profile identity resolution failed.' }
Write-Output "    -> 200, $($profile.email)"

Write-Output '[2] PUT /users/me (name update)'
$updated = Invoke-RestMethod -Uri "$base/users/me" -Method Put -Headers $headers -ContentType 'application/json' `
    -Body (@{ firstName = 'Profile'; lastName = 'Updated' } | ConvertTo-Json)
if ($updated.firstName -ne 'Profile' -or $updated.lastName -ne 'Updated') { throw 'Profile update failed.' }
Write-Output '    -> 200, names updated'

Write-Output '[3] POST /users/me/password (wrong current password)'
$wrong = Send-Api '/users/me/password' 'POST' `
    (@{ currentPassword = 'Wrong-Password-1!'; newPassword = $newPassword } | ConvertTo-Json) $headers
if ($wrong.Status -ne 401) { throw "Expected 401, got $($wrong.Status)." }
Write-Output '    -> 401 INVALID_CREDENTIALS'

Write-Output '[4] POST /users/me/password (successful change)'
$changed = Send-Api '/users/me/password' 'POST' `
    (@{ currentPassword = $oldPassword; newPassword = $newPassword } | ConvertTo-Json) $headers
if ($changed.Status -ne 204) { throw "Expected 204, got $($changed.Status)." }
Write-Output '    -> 204, existing session retained'

Write-Output '[5] POST /auth/login (new password)'
$newLogin = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ email = 'admin@example.com'; password = $newPassword } | ConvertTo-Json)
Write-Output "    -> 200, $($newLogin.user.email)"

Write-Output 'Feature 03 profile self-service smoke test passed.'