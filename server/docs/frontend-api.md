# RevealNotes API — Frontend Guide

Base URL (production): `http://45.55.80.161:3000`  
Base URL (dev): `http://localhost:3000`

Interactive docs with a live sandbox: `/docs`  
Machine-readable OpenAPI spec: `/openapi.json`

All request bodies are JSON (`Content-Type: application/json`).  
Protected endpoints require `Authorization: Bearer <token>`.

---

## Authentication

### Register

```
POST /auth/register
```

**Body**

| Field      | Type   | Rules          |
|------------|--------|----------------|
| `email`    | string | valid email    |
| `password` | string | ≥ 8 characters |

**Response 201**

```json
{
  "token": "eyJhbGci...",
  "user": { "id": 1, "email": "alice@uni.edu" }
}
```

Store the token (e.g. `localStorage`) and attach it to every protected request.

**Errors**: `409` email already in use · `422` validation failed

---

### Login

```
POST /auth/login
```

**Body**: same shape as register.

**Response 200**: same shape as register response.

**Errors**: `401` wrong credentials · `422` validation failed

---

### Get current user

```
GET /auth/me
```
_Protected_

**Response 200**

```json
{ "id": 1, "email": "alice@uni.edu" }
```

Use this on extension load to verify that a stored token is still valid.

**Errors**: `401` missing or invalid token

---

### Logout

```
POST /auth/logout
```
_Protected_ — invalidates the current token server-side.

**Response 200**

```json
{ "message": "Signed out" }
```

After logout, delete the stored token. Any future request with the same token will get `401 Token revoked`.

---

## Notes

A **note** is a short (≤ 500 chars) annotation attached to a URL. Notes are public — anyone can read them without signing in.

### Fetch notes for a page

```
GET /notes?url=<encoded-url>
```
_Public — no token required_

**Query param**: `url` — the full URL of the page (must be a valid URL).

**Response 200** — array, possibly empty

```json
[
  {
    "id": 3,
    "url": "https://example.com/article",
    "body": "The statistics cited here are from a retracted study.",
    "authorId": 2,
    "authorEmail": "bob@uni.edu",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "score": 4
  }
]
```

`score` is the net sum of all votes (+1 upvotes minus −1 downvotes).

**Errors**: `422` missing or invalid `url`

#### Extension use-case

Call this on every page navigation to show notes for the current tab:

```ts
async function loadNotes(pageUrl: string) {
  const res = await fetch(
    `/notes?url=${encodeURIComponent(pageUrl)}`
  );
  return res.json(); // Note[]
}
```

---

### Create a note

```
POST /notes
```
_Protected_

**Body**

| Field | Type   | Rules             |
|-------|--------|-------------------|
| `url` | string | valid URL         |
| `body`| string | 1–500 characters  |

**Response 201** — the created note (same shape as above, `score: 0`)

```json
{
  "id": 5,
  "url": "https://example.com/article",
  "body": "Missing context: the paper was not peer-reviewed.",
  "authorId": 1,
  "authorEmail": "alice@uni.edu",
  "createdAt": "2024-01-16T09:30:00.000Z",
  "score": 0
}
```

**Errors**: `401` not authenticated · `422` validation failed

#### Extension use-case

```ts
async function postNote(token: string, url: string, body: string) {
  const res = await fetch("/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url, body }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json(); // Note
}
```

---

### Delete a note

```
DELETE /notes/:id
```
_Protected — only the author can delete their own note_

**Response 200**

```json
{ "ok": true }
```

**Errors**: `401` not authenticated · `403` not the author · `404` note not found

---

## Votes

Each authenticated user can cast one vote per note (`+1` or `−1`). Voting again replaces the previous vote. Votes affect the `score` field returned with notes.

### Cast or update a vote

```
POST /notes/:id/vote
```
_Protected_

**Body**

| Field   | Type    | Rules           |
|---------|---------|-----------------|
| `value` | integer | must be `1` or `-1` |

**Response 200**

```json
{ "noteId": 3, "value": 1 }
```

Sending `POST` twice with different values replaces the first vote (upsert).

**Errors**: `401` not authenticated · `404` note not found · `422` invalid value

#### Extension use-case

```ts
async function vote(token: string, noteId: number, value: 1 | -1) {
  const res = await fetch(`/notes/${noteId}/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
}
```

---

### Remove a vote

```
DELETE /notes/:id/vote
```
_Protected_

**Response 200**

```json
{ "ok": true }
```

**Errors**: `401` not authenticated · `404` note not found or no vote to remove

---

## Common patterns

### Session management on extension startup

```ts
async function initSession(storage: Storage) {
  const token = storage.get("token");
  if (!token) return null;

  const res = await fetch("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    storage.remove("token"); // expired or revoked
    return null;
  }
  return res.json(); // { id, email }
}
```

### Show notes on the current page

```ts
async function renderNotes(pageUrl: string) {
  const notes = await fetch(
    `/notes?url=${encodeURIComponent(pageUrl)}`
  ).then((r) => r.json());

  // Sort highest score first
  notes.sort((a, b) => b.score - a.score);
  displayNotes(notes);
}
```

### Full vote toggle flow

```ts
// userVote is tracked locally: null | 1 | -1
async function toggleVote(
  token: string,
  noteId: number,
  newValue: 1 | -1,
  currentVote: 1 | -1 | null
) {
  if (currentVote === newValue) {
    // clicking the same button removes the vote
    await fetch(`/notes/${noteId}/vote`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return null;
  }
  // new vote or flipping direction
  await vote(token, noteId, newValue);
  return newValue;
}
```

---

## Error shape

All error responses share the same shape:

```json
{ "error": "Human-readable message" }
```

Common status codes:

| Status | Meaning                               |
|--------|---------------------------------------|
| `401`  | Missing, invalid, or revoked token    |
| `403`  | Authenticated but not authorized      |
| `404`  | Resource not found                    |
| `409`  | Conflict (e.g. duplicate email)       |
| `422`  | Request body / query failed validation|
