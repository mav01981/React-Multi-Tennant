# ADR-0002: ASP.NET Core Identity Backend

- Status: Accepted
- Date: 2026-01-25

## Context

The API needs password hashing, lockout handling, role membership, user validation, and persistence integration without reimplementing identity primitives.

## Decision

Use ASP.NET Core 10 Minimal APIs with ASP.NET Core Identity and Entity Framework Core. Identity owns user and role management, password hashing, lockout behavior, and validation. Minimal API endpoint groups expose the versioned HTTP contract.

## Consequences

Security-sensitive identity behavior comes from maintained platform components, and endpoint handlers remain focused on application rules. The API follows .NET 10 package and runtime versions. Permission-level authorization remains an application responsibility until the role-permission model is introduced.

## Alternatives considered

- Custom user and password services: rejected because they increase security and maintenance risk.
- ASP.NET Core MVC controllers: valid, but Minimal APIs match the small endpoint surface and current implementation.
- External identity provider: deferred until deployment requirements justify the operational dependency.
