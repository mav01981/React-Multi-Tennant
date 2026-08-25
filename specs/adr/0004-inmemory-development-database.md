# ADR-0004: In-Memory Database for the Runnable Demo

- Status: Accepted
- Date: 2026-08-25

## Context

The repository needs a zero-setup local demo for authentication and user-management workflows. Production persistence still requires relational durability, migrations, and operational controls.

## Decision

Use EF Core InMemory for the runnable development/demo backend. Keep the data-access boundary compatible with EF Core and document PostgreSQL as the production target.

## Consequences

A developer can run the API without installing or configuring a database, which keeps smoke tests quick and repeatable. Data is process-local and non-durable, and the provider does not reproduce relational database behavior; it is not a production deployment choice.

## Alternatives considered

- PostgreSQL from the start: better production fidelity, but adds setup and infrastructure to the zero-setup demo.
- SQLite: durable local data with broader relational behavior, but still adds file lifecycle and differs from the intended production topology.
