# `@adaptive-world/security`

Runtime-agnostic security primitives for Adaptive World. It uses Web Crypto,
stores only SHA-256 token hashes, requires atomic one-time redemption, enforces
exact scopes, emits minimal audit metadata, and creates an allowlisted Gym
projection that excludes identity, medications, labs, and documents.

The plaintext context token is a bearer credential. Return it once, never log
it, never include it in analytics, and exchange it over HTTPS within five
minutes. A database adapter must implement `consume` as one atomic conditional
update.
