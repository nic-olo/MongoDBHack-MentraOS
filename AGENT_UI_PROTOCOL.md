# Agent UI Protocol Documentation

## Overview
This document describes the communication protocol between the frontend UI and the Master Agent backend API. The UI expects specific data structures and response formats to properly display agent responses, code blocks, file modifications, and progress updates.

---

## API Endpoints

### 1. Submit Query
**Endpoint:** `POST /api/master-agent/query`

**Request Body:**
```json
{
  "userId": "string",
  "query": "string"
}
```

**Response:**
```json
{
  "success": true,
  "task_id": "string",
  "status": "processing",
  "message": "string",
  "userId": "string"
}
```

---

### 2. Get Task Status
**Endpoint:** `GET /api/master-agent/task/:taskId?userId=:userId`

**Response (Processing):**
```json
{
  "id": "string",
  "query": "string",
  "status": "processing",
  "created_at": "ISO8601 timestamp",
  "userId": "string"
}
```

**Response (Completed):**
```json
{
  "id": "string",
  "query": "string",
  "status": "completed",
  "result": {
    "query": "string",
    "tools_used": ["string"],
    "tool_results": {},
    "synthesis": "string (markdown formatted)",
    "timestamp": "ISO8601 timestamp"
  },
  "created_at": "ISO8601 timestamp",
  "completed_at": "ISO8601 timestamp",
  "userId": "string"
}
```

**Response (Failed):**
```json
{
  "id": "string",
  "query": "string",
  "status": "failed",
  "error": "string (error message)",
  "created_at": "ISO8601 timestamp",
  "userId": "string"
}
```

---

## UI Response Parsing

### What the UI Expects in `synthesis` Field

The `synthesis` field should contain markdown-formatted text that can include:

#### 1. **Plain Text Responses**
Simple text responses for general queries:
```
The user's request has been processed successfully.
```

#### 2. **Markdown Formatting**
The UI supports standard markdown:

```markdown
# Main Heading
## Sub Heading
### Section Heading

**Bold text** for emphasis
`inline code` for code references

- Bullet point 1
- Bullet point 2
- Bullet point 3
```

**How UI Renders It:**
- Headings: Uppercase with `>>` prefix
- Bold: Black bold text
- Inline code: Black text with light background and border
- Lists: Black text with arrow `→` prefix

---

#### 3. **Code Blocks**
Code blocks should use triple backticks with language identifier:

```markdown
Here's the updated function:

\`\`\`typescript
function handleRequest(req: Request): Response {
  // Process the request
  return new Response('Success');
}
\`\`\`
```

**UI Code Block Features:**
- White background with black 2px border and rounded corners
- Black terminal-style dots in header
- Language label (e.g., "TYPESCRIPT")
- Copy button
- Black monospace text

---

#### 4. **File Path References**
The UI automatically detects and highlights file paths in the response:

**Pattern Detection:**
- `path/to/file.ts`
- `src/components/Button.tsx`
- `/absolute/path/to/file.js`

**How to Include File Edits:**
```markdown
I've updated the following files:

\`\`\`typescript
// src/components/Button.tsx
export function Button() {
  return <button>Click me</button>;
}
\`\`\`

The changes have been applied to src/components/Button.tsx
```

**UI Files Modified Section:**
- Extracts file paths from text
- Shows in dedicated "FILES MODIFIED" section
- White background with black borders
- Checkmark icons next to each file

---

#### 5. **Combined Example Response**

Here's what an ideal `synthesis` response looks like:

```markdown
## Summary
Successfully implemented the user authentication feature.

## Key Changes

I've updated the authentication system with the following changes:

\`\`\`typescript
// src/auth/login.ts
export async function login(email: string, password: string) {
  const user = await authenticateUser(email, password);
  const token = generateJWT(user);
  return { user, token };
}
\`\`\`

\`\`\`typescript
// src/middleware/auth.ts
export function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
\`\`\`

## Files Modified
- src/auth/login.ts
- src/middleware/auth.ts

## Next Steps
**Test the authentication flow** by running the integration tests:

\`bash
npm test auth
\`

## Confidence Level
High (95%) - All authentication tests are passing.
```

---

## Progress Updates

### Polling Mechanism
The UI polls every 2 seconds for task completion and displays contextual progress messages:

**Progress Message Sequence:**
1. "Analyzing your request..."
2. "Exploring the codebase..."
3. "Deploying specialist agents..."
4. "Executing sub-agents..."
5. "Gathering results..."
6. "Synthesizing findings..."
7. "Finalizing response..."

**UI Progress Display:**
- White card with black borders
- Black progress bar (animated)
- Terminal-style `$` and `>` prefixes
- Rounded corners throughout

---

## Response Formatting Best Practices

### ✅ DO:
1. **Use markdown headings** for structure
2. **Include code blocks** with language identifiers
3. **Mention file paths** explicitly when files are modified
4. **Use bullet points** for lists
5. **Add bold text** for emphasis
6. **Include inline code** for variable/function names
7. **Provide clear summaries** at the start

### ❌ DON'T:
1. Return raw JSON in synthesis
2. Use HTML tags (except in special cases)
3. Forget language identifiers in code blocks
4. Use colors or special formatting
5. Include excessive whitespace
6. Return undefined or null

---

## Error Handling

### Error Response Format
```json
{
  "status": "failed",
  "error": "Descriptive error message explaining what went wrong"
}
```

**UI Error Display:**
Shows error in a white card with black border:
```
Error: [error message]
```

---

## Special UI Features

### 1. **Smart Code Detection**
The UI automatically:
- Detects if response is primarily code vs text
- Shows code with syntax highlighting
- Extracts file paths from context

### 2. **Copy to Clipboard**
All code blocks include a copy button that:
- Changes to "COPIED" when clicked
- Resets after 2 seconds
- Copies entire code block

### 3. **Responsive Design**
- Desktop: Centered 3xl max-width
- Mobile: Full width with adjusted padding
- Rounded corners: `rounded-2xl` for cards, `rounded-lg` for buttons

### 4. **Async Session Indicator**
When agent is processing:
- White banner at top
- Black animated dot (pulse + ping)
- Real-time progress message
- Spinning icon

---

## TypeScript Types

```typescript
// Frontend expects this structure
interface TaskResponse {
  id: string;
  query: string;
  status: 'processing' | 'completed' | 'failed';
  result?: {
    query: string;
    tools_used: string[];
    tool_results: Record<string, any>;
    synthesis: string;  // MARKDOWN FORMATTED
    timestamp: string;
  };
  error?: string;
  created_at: string;
  completed_at?: string;
  userId: string;
}
```

---

## Testing Your Response

### Example Test Cases

**Test 1: Simple Text**
```json
{
  "synthesis": "Hello! How can I help you today?"
}
```

**Test 2: Code Response**
```json
{
  "synthesis": "Here's the function you requested:\n\n```typescript\nfunction greet(name: string) {\n  return `Hello, ${name}!`;\n}\n```"
}
```

**Test 3: File Modification**
```json
{
  "synthesis": "## Summary\nUpdated the login component.\n\n```tsx\n// src/components/Login.tsx\nexport function Login() {\n  return <form>Login Form</form>;\n}\n```\n\nModified: src/components/Login.tsx"
}
```

---

## Common Mistakes to Avoid

1. **Forgetting Language Identifier**
   ```
   ❌ ```
   ✅ ```typescript
   ```

2. **Not Mentioning Files**
   ```
   ❌ "I updated the code"
   ✅ "I updated src/auth/login.ts"
   ```

3. **Plain Text Instead of Markdown**
   ```
   ❌ "Error occurred"
   ✅ "## Error\n**Authentication failed** - Invalid credentials"
   ```

4. **No Structure**
   ```
   ❌ Long paragraph of text without formatting
   ✅ Use headings, bullets, code blocks for structure
   ```

---

## Summary

The UI expects:
- **Markdown-formatted text** in `synthesis` field
- **Code blocks** with language identifiers
- **File paths** mentioned explicitly
- **Structured responses** with headings and lists
- **Clear error messages** when things fail
- **Progress updates** via polling

Follow this protocol to ensure perfect rendering in the UI! 🎨
