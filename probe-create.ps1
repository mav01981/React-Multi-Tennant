$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5099/api/v1'
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Headers @{ 'X-Tenant-Id' = 'platform' } `
    -Body '{"email":"admin@example.com","password":"ChangeMe-Admin-1!"}'
try {
    Invoke-RestMethod -Uri "$base/users" -Method Post `
        -Headers @{ Authorization = "Bearer $($login.accessToken)"; 'X-Tenant-Id' = 'platform' } `
        -ContentType 'application/json' `
        -Body '{"email":"newuser1@acme.test","firstName":"New","lastName":"User","password":"Password-1!","roles":["Manager"]}'
} catch {
    $stream = $_.Exception.Response.GetResponseStream()
    (New-Object IO.StreamReader($stream)).ReadToEnd()
}
