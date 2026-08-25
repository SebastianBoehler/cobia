# Security policy

Cobia's production trust and authority boundaries are documented in the
[security model](docs/architecture/security-model.md). That document describes
the intended controls; it is not an audit report.

## Supported version

Only the current `main` branch and the deployed production version are
supported. Historical commits, local modifications, test deployments, and fork
rehearsals are outside the supported security-update boundary.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/SebastianBoehler/cobia/security/advisories/new).
Do not include secrets, private keys, or exploit details in a public issue.

Include the affected route or component, expected impact, reproduction steps,
and a minimal proof of concept when possible. Reports are acknowledged as soon
as practical; remediation timing depends on severity and whether production
credentials or user funds could be affected.

Never use real wallet funds, publish an exploit, access data that is not yours,
degrade the service, or test against another user's wallet while reproducing a
report. Prefer a local environment, disposable fork, or wallet you control.

## Useful report details

- affected commit, URL, API route, contract, chain, or component;
- required wallet, solver, verifier, or operator role;
- expected and observed behavior;
- the smallest safe reproduction and its preconditions;
- potential impact on authorization, assets, privacy, integrity, or availability;
- suggested containment, if known.

Do not send private keys, seed phrases, bearer credentials, database contents,
or credential-bearing RPC URLs. Redact secrets from traces and screenshots.

## Disclosure

Please allow time to reproduce, contain, remediate, and deploy a fix before
public disclosure. Cobia does not currently advertise a paid bug bounty or a
guaranteed response-time SLA.
