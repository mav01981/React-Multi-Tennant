# E2E smoke test for multi-tenancy.
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
function ErrCode($resp) { try { ($resp.Body | ConvertFrom-Json).error.code } catch { '' } }

$suffix = [Guid]::NewGuid().ToString('N')
$password = 'ChangeMe-Tenant-1!'

# ── [1] Login without X-Tenant-Id → 400 ─────────────────────
Write-Output '[1] POST /auth/login without X-Tenant-Id'
$r = Send-Api '/auth/login' 'POST' (@{ email = 'tenant-admin@acme.test'; password = $password } | ConvertTo-Json)
if ($r.Status -ne 400) { throw "Expected 400 VALIDATION_FAILED, got $($r.Status) $(ErrCode $r)." }
Write-Output '    -> 400 VALIDATION_FAILED'

# ── [2] Unknown tenant slug → 404 ────────────────────────────
Write-Output '[2] POST /auth/login with unknown tenant slug'
$r = Send-Api '/auth/login' 'POST' (@{ email = 'x@example.com'; password = $password } | ConvertTo-Json) @{ 'X-Tenant-Id' = 'nope-' + $suffix }
if ($r.Status -ne 404) { throw "Expected 404 TENANT_NOT_FOUND, got $($r.Status) $(ErrCode $r)." }
Write-Output '    -> 404 TENANT_NOT_FOUND'

# ── [3] Tenant-scoped login into seeded demo tenant ─────────
Write-Output '[3] POST /auth/login as acme tenant admin'
$acmeLogin = Send-Api '/auth/login' 'POST' (@{ email = 'tenant-admin@acme.test'; password = 'ChangeMe-Admin-1!' } | ConvertTo-Json) @{ 'X-Tenant-Id' = 'acme' }
if ($acmeLogin.Status -ne 200) { throw "Expected 200, got $($acmeLogin.Status): $($acmeLogin.Body)" }
$acme = ($acmeLogin.Body | ConvertFrom-Json)
if (-not $acme.user.tenantId) { throw 'UserDto must expose tenantId.' }
if ($acme.user.roles -notcontains 'Admin') { throw 'Acme seed admin must hold Admin role.' }
$acmeHeaders = @{ Authorization = "Bearer $($acme.accessToken)" }
Write-Output "    -> 200 tenantId=$($acme.user.tenantId)"

# ── [4] Per-tenant email uniqueness ─────────────────────────
Write-Output '[4] POST /users with an email that already exists in ANOTHER tenant (must succeed)'
$r = Send-Api '/users' 'POST' (@{ email = 'admin@example.com'; firstName = 'Dup'; lastName = 'Email'; password = $password; roles = @('Manager') } | ConvertTo-Json) $acmeHeaders
if ($r.Status -ne 201) { throw "Expected 201 (email unique per tenant), got $($r.Status): $($r.Body)" }
$dupUser = ($r.Body | ConvertFrom-Json)
Write-Output "    -> 201 created $($dupUser.id)"

# Same email twice within acme → conflict
$r = Send-Api '/users' 'POST' (@{ email = 'admin@example.com'; firstName = 'Dup'; lastName = 'Email2'; password = $password; roles = @('ReadOnly') } | ConvertTo-Json) $acmeHeaders
if ($r.Status -eq 201) { throw 'Duplicate email within one tenant must NOT be allowed.' }
Write-Output "    -> duplicate-in-tenant rejected ($($r.Status))"

# ── [5] Cross-tenant isolation on GET /users ────────────────
Write-Output '[5] GET /users scoped to caller tenant only'
$r = Send-Api '/users?page=1&pageSize=100' 'GET' $null $acmeHeaders
if ($r.Status -ne 200) { throw "Expected 200, got $($r.Status)" }
$list = ($r.Body | ConvertFrom-Json)
if ($list.items | Where-Object { $_.tenantId -ne $acme.user.tenantId }) { throw "User list leaked another tenant's users." }
Write-Output "    -> $($list.totalCount) users, all tenantId=$($acme.user.tenantId)"

# Roles list is also tenant-scoped (PlatformAdmin role lives in platform tenant only)
$r = Send-Api '/roles' 'GET' $null $acmeHeaders
$roleNames = (($r.Body | ConvertFrom-Json) | ForEach-Object { $_.name })
if ($roleNames -contains 'PlatformAdmin') { throw 'Roles list leaked PlatformAdmin from platform tenant.' }
Write-Output "    -> roles scoped: $($roleNames -join ',')"

# ── [6] Tenants endpoints are PlatformAdmin-only ────────────
Write-Output "[6] Acme admin: GET /tenants (no tenants.read -> 403)"
$r = Send-Api '/tenants' 'GET' $null $acmeHeaders
if ($r.Status -ne 403) { throw "Expected 403, got $($r.Status)." }
Write-Output '    -> 403'

# Platform super-admin login
$platLogin = Send-Api '/auth/login' 'POST' (@{ email = 'admin@example.com'; password = 'ChangeMe-Admin-1!' } | ConvertTo-Json) @{ 'X-Tenant-Id' = 'platform' }
if ($platLogin.Status -ne 200) { throw "Platform admin login failed: $($platLogin.Status) $($platLogin.Body)" }
$plat = ($platLogin.Body | ConvertFrom-Json)
$platHeaders = @{ Authorization = "Bearer $($plat.accessToken)" }

Write-Output '[7] PlatformAdmin: POST /tenants (creates + seeds default roles)'
$slug = "t-$suffix"
$r = Send-Api '/tenants' 'POST' (@{ name = 'Tenant E2E'; displayName = 'Tenant E2E Inc'; slug = $slug } | ConvertTo-Json) $platHeaders
if ($r.Status -ne 201) { throw "Expected 201, got $($r.Status): $($r.Body)" }
$newTenant = ($r.Body | ConvertFrom-Json)

# Reserved + duplicate slugs rejected
$r2 = Send-Api '/tenants' 'POST' (@{ name = 'X'; slug = 'platform' } | ConvertTo-Json) $platHeaders

# ── [8] Suspend tenant → logins rejected; reactivate ────────
Write-Output '[8] PUT /tenants/{id} suspend, then login -> 422 TENANT_SUSPENDED'
$r = Send-Api "/tenants/$($newTenant.id)" 'PUT' (@{ status = 'suspended' } | ConvertTo-Json) $platHeaders
if ($r.Status -ne 200) { throw "Suspend failed: $($r.Status) $($r.Body)" }
$r = Send-Api '/auth/login' 'POST' (@{ email = 'a@b.co'; password = $password } | ConvertTo-Json) @{ 'X-Tenant-Id' = $slug }
if ($r.Status -ne 422) { throw "Expected 422 TENANT_SUSPENDED, got $($r.Status) $(ErrCode $r)." }

# Platform tenant itself cannot be suspended
$platformTenant = ((Send-Api '/tenants' 'GET' $null $platHeaders).Body | ConvertFrom-Json) | Where-Object { $_.slug -eq 'platform' }
$r = Send-Api "/tenants/$($platformTenant.id)" 'PUT' (@{ status = 'suspended' } | ConvertTo-Json) $platHeaders
if ($r.Status -ne 400) { throw "Suspending platform tenant must 400, got $($r.Status)." }

# Reactivate the e2e tenant for cleanliness
Send-Api "/tenants/$($newTenant.id)" 'PUT' (@{ status = 'active' } | ConvertTo-Json) $platHeaders | Out-Null
Write-Output '    -> suspension enforced; platform tenant protected; reactivated'

# ── [9] Delete tenant (soft-delete) → hidden from list; logins 404 ─
Write-Output '[9] DELETE /tenants/{id}'
$r = Send-Api "/tenants/$($newTenant.id)" 'DELETE' $null $platHeaders
if ($r.Status -ne 204) { throw "Delete must 204, got $($r.Status) $($r.Body)." }
$list = (Send-Api '/tenants' 'GET' $null $platHeaders).Body | ConvertFrom-Json
if ($list.items | Where-Object { $_.id -eq $newTenant.id }) { throw 'Deleted tenant still listed.' }
$r = Send-Api "/tenants/$($newTenant.id)" 'DELETE' $null $platHeaders
if ($r.Status -ne 404) { throw "Re-delete must 404, got $($r.Status)." }
$r = Send-Api "/tenants/$($platformTenant.id)" 'DELETE' $null $platHeaders
if ($r.Status -ne 400) { throw "Deleting platform tenant must 400, got $($r.Status)." }
Write-Output '    -> 204 soft-delete; hidden from list; re-delete 404; platform protected'

Write-Output 'Multi-tenancy smoke test passed.'

if ($r2.Status -ne 409) { throw "Reserved slug must 409 SLUG_EXISTS, got $($r2.Status) $(ErrCode $r2)." }
$r2 = Send-Api '/tenants' 'POST' (@{ name = 'X'; slug = $slug } | ConvertTo-Json) $platHeaders
if ($r2.Status -ne 409) { throw "Duplicate slug must 409, got $($r2.Status)." }
Write-Output '    -> 201 created; reserved & duplicate slugs 409'

