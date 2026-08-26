# E2E happy-path smoke test for feat-01 authentication.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5099/api/v1/auth'

function Send-Api {
    param($Path, $Method, $JsonBody, $Headers = @{})
    try {
        $params = @{ Uri = $base + $Path; Method = $Method; Headers = $Headers; UseBasicParsing = $true }
        if ($Method -ne 'GET') { $params.ContentType = 'application/json'; $params.Body = $JsonBody }
        $r = Invoke-WebRequest @params
        return [PSCustomObject]@{ Status = [int]$r.StatusCode; Body = $r.Content }
    } catch {
        $sc = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        return [PSCustomObject]@{ Status = $sc; Body = $_.ErrorDetails.Message }
    }
}

Write-Output '[1] POST /auth/login (valid)'
$login = Invoke-RestMethod -Uri "$base/login" -Method Post -ContentType 'application/json' -Body '{"email":"admin@example.com","password":"ChangeMe-Admin-1!"}'
Write-Output ("    -> 200 OK, expiresIn=$($login.expiresIn), roles=$($login.user.roles -join ',')")
$access   = $login.accessToken
$refresh  = $login.refreshToken
$pairJson = @{ accessToken = $access; refreshToken = $refresh } | ConvertTo-Json

Write-Output '[2] GET /auth/me (Bearer)'
$me = Invoke-RestMethod -Uri "$base/me" -Method Get -Headers @{ Authorization = "Bearer $access" }
Write-Output ("    -> 200 OK, $($me.email) ($($me.firstName) $($me.lastName)), status=$($me.status)")

Write-Output '[3] GET /auth/me (bad token, 401 expected)'
$r = Send-Api '/me' 'GET' $null @{ Authorization = 'Bearer invalid.token.here' }
Write-Output ("    -> $($r.Status) $($r.Body)")

Write-Output '[4] POST /auth/login (bad password, 401 expected)'
$r = Send-Api '/login' 'POST' '{"email":"admin@example.com","password":"wrongpass-1!"}'
Write-Output ("    -> $($r.Status) $($r.Body)")

Write-Output '[5] POST /auth/refresh (rotate -> new pair)'
$r = Invoke-RestMethod -Uri "$base/refresh" -Method Post -ContentType 'application/json' -Body $pairJson
$rotated = $r.refreshToken -ne $refresh
Write-Output ("    -> 200, rotated=$rotated, newAccessLen=$($r.accessToken.Length)")
$newAccess     = $r.accessToken
$rotatedRefresh = $r.refreshToken

Write-Output '[6] reuse OLD refresh (family revoked, 401 expected)'
$r = Send-Api '/refresh' 'POST' (@{ accessToken = 'x'; refreshToken = $refresh } | ConvertTo-Json)
Write-Output ("    -> $($r.Status) $($r.Body)")

Write-Output '[7] POST /auth/logout (Bearer new, expect 204)'
$r = Send-Api '/logout' 'POST' $null @{ Authorization = "Bearer $newAccess" }
Write-Output ("    -> $($r.Status)")

Write-Output '[8] refresh AFTER logout with the post-login token (expect 401)'
$newErr = Send-Api '/refresh' 'POST' (@{ accessToken = 'x'; refreshToken = $rotatedRefresh } | ConvertTo-Json)
Write-Output ("    -> $($newErr.Status) $($newErr.Body)")