# Security Specification & Threat Model for Digital Bro

## 1. Data Invariants

- **User Profile Isolation**: A User profile `/users/{userId}` can only be read, created, or updated by the authenticated user whose `request.auth.uid == userId`.
- **Session Ownership Boundary**: A ChatSession `/users/{userId}/sessions/{sessionId}` is inherently tied to the user path. Actions (create, read, update, delete) must only be allowed if `request.auth.uid == userId`.
- **Message Integrity**: A Message under `/users/{userId}/sessions/{sessionId}/messages/{messageId}` must inherit access from the parent session ownership, meaning only the session's owner (`request.auth.uid == userId`) can read or write messages.
- **Strict Size/Type Constraints**: All fields must be constrained (e.g., model name must be safe, session title must be less than 200 characters, messages must not contain infinite characters).
- **Temporal Constraint**: Creation and update timestamps (`createdAt`, `updatedAt`, `timestamp`) must always be validated against `request.time` (the server value).

---

## 2. The "Dirty Dozen" Threat Payloads

These 12 scenarios illustrate malicious requests designed to breach integrity, which our `firestore.rules` must protect against:

1. **User Profiling Spoof (Identity)**: A user authenticated as `user_alice` attempts to create or write client records into `/users/user_bob`.
2. **Session Hijacking (Identity)**: A user authenticated as `user_alice` attempts to read `/users/user_bob/sessions/session_abc`.
3. **Session Spoof (Identity)**: A user authenticated as `user_alice` attempts to create a session under BOB's path: `/users/user_bob/sessions/session_123` with Alice's details.
4. **Shadow Session Invariant (Integrity)**: Creating a `ChatSession` where the model parameter is set to a malicious non-existent model name `"supermega-ultra-gpt-destroyer"`.
5. **Message Fabricator (Identity)**: Bob attempts to add an artificial assistant message in Alice's session: `/users/user_alice/sessions/session_123/messages/message_777`.
6. **Timestamps Poisoning (State)**: A client attempts to set `createdAt` directly into the past or the future (e.g., year 2099) instead of matching the current server timestamp `request.time`.
7. **Bypassing Attachment Type Safety (Data Poisoning)**: Injecting a message attachment with an invalid `mimeType` like `application/x-executable` or random scripts.
8. **Null Auth Leak (Authentication)**: An unauthenticated request attempts to read or search any workspace user profiles `/users/*`.
9. **No-Size String Injection (Denial of Wallet)**: Injecting a `title` field with a 10MB string to explode storage costs.
15. **Overwriting Immutables**: Attempting to alter a session's `id` or `userId` parameter during an update.
11. **Malicious ID Char Poisoning**: Using document ID paths containing dangerous punctuation characters like `../` or `%2f` or excessively long strings (over 128 characters).
12. **Blanket Query Scraping**: Attempting to query `/users` or `/users/{userId}/sessions` without a strict owner boundary constraint.

---

## 3. Security Tests Verification Outline

Our corresponding `firestore.rules` matches this spec precisely by:
- Authenticating every request.
- Matching path variable UIDs with `request.auth.uid`.
- Restricting payload keys via sizes, standard regexes (`isValidId`), and exact allowed keys.
- Enforcing server timestamps.
