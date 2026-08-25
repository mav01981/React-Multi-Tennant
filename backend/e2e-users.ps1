# E2E smoke test for feat-02 admin user management.
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

$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ email = 'admin@example.com'; password = 'ChangeMe-Admin-1!' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.accessToken)" }

Write-Output '[1] GET /users (admin list + pagination)'
$list = Invoke-RestMethod -Uri "$base/users?page=1&pageSize=10&search=admin&status=active" -Headers $headers
if ($list.page -ne 1 -or $list.pageSize -ne 10 -or $list.totalCount -lt 1) { throw 'User list contract failed.' }
Write-Output "    -> 200, items=$($list.items.Count), total=$($list.totalCount)"

$suffix = [Guid]::NewGuid().ToString('N')
$body = @{ email = "e2e-$suffix@example.com"; firstName = 'E2E'; lastName = 'User'; password = 'ChangeMe-E2E-1!'; roles = @('User') } | ConvertTo-Json
Write-Output '[2] POST /users (create)'
$created = Invoke-RestMethod -Uri "$base/users" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
Write-Output "    -> 201, id=$($created.id)"

Write-Output '[3] PUT /users/{id} (update)'
$updated = Invoke-RestMethod -Uri "$base/users/$($created.id)" -Method Put -Headers $headers -ContentType 'application/json' `
    -Body (@{ firstName = 'Updated'; roles = @('Manager') } | ConvertTo-Json)
if ($updated.firstName -ne 'Updated' -or $updated.roles -notcontains 'Manager') { throw 'User update contract failed.' }
Write-Output '    -> 200, profile and role updated'

Write-Output '[4] DELETE /users/{id} (soft delete)'
$deleted = Send-Api "/users/$($created.id)" 'DELETE' $null $headers
if ($deleted.Status -ne 204) { throw "Expected 204, got $($deleted.Status)." }
$disabled = Invoke-RestMethod -Uri "$base/users/$($created.id)" -Headers $headers
if ($disabled.status -ne 'disabled') { throw 'Delete was not a soft delete.' }
Write-Output '    -> 204, status=disabled'

Write-Output '[5] DELETE sole active admin (guardrail)'
$adminId = $list.items | Where-Object { $_.email -eq 'admin@example.com' } | Select-Object -First 1 -ExpandProperty id
$guard = Send-Api "/users/$adminId" 'DELETE' $null $headers
if ($guard.Status -ne 409) { throw "Expected 409 LAST_ACTIVE_ADMIN, got $($guard.Status)." }
Write-Output '    -> 409 LAST_ACTIVE_ADMIN'

Write-Output 'Feature 02 user-management smoke test passed.'