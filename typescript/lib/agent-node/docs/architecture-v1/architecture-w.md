Short version: in today’s A2A, **skills are for discovery and shaping expectations**, not a hard routing key in the wire API. A client typically sends a `message/send` (or `/stream`) and the **server routes to the right skill** internally. There isn’t a standard `skillId` field in `MessageSendParams`. ([a2a-protocol.org][1])

Here’s how to target a specific skill in practice:

1. **Pick the agent using its Agent Card (skills, input/output modes, tags).** You use skills to decide _which agent_ to call and how to format input. ([a2a-protocol.org][1])

2. **Let the server route** (default, spec-aligned). The protocol’s client calls don’t include a skill selector; the server’s executor chooses based on the request content. This is the current design expectation. ([a2a-protocol.org][2], [GitHub][3])

3. **If you really need to pinpoint a skill, use an extension pattern** (both are common and spec-compatible):
   - **Metadata hint:** put `skillId` (or similar) in the message’s **metadata**; servers can read it and dispatch. (Messages carry `metadata`, and extensibility via metadata is encouraged.) ([GitHub][4], [A2A Protocol][5])
   - **Structured part:** include a **DataPart** (JSON) like `{ "skill": "hello_world", "params": {...} }` and have the server route on it. Parts are designed for structured inputs. ([Google GitHub][6])

   Example request body (non-streaming), showing both options:

   ```json
   {
     "jsonrpc": "2.0",
     "id": "req-123",
     "method": "message/send",
     "params": {
       "message": {
         "role": "user",
         "messageId": "m-1",
         "metadata": { "skillId": "hello_world" },
         "parts": [
           { "kind": "text", "text": "Say hello to Mira." },
           { "kind": "data", "data": { "skill": "hello_world", "params": { "name": "Mira" } } }
         ]
       }
     }
   }
   ```

4. **Alternative deployment patterns** (trade-offs):
   - **One agent per skill (separate endpoints):** simple and explicit; discovery finds multiple agents, each with one skill. (Common in examples.) ([GitHub][3])
   - **Gateway maps skills → tools:** some MCP/A2A gateways expose **each A2A skill as a separate MCP tool** so the _caller_ can pick the skill explicitly; under the hood they still send a normal `message/send` and route internally. ([GitHub][7])

Why this is the answer:

- The **spec/tutorials show skills on the Agent Card** (id, name, input/output modes), but **client calls don’t take a `skillId`**; the “Interact with Server” examples only pass a `message`. ([a2a-protocol.org][1])
- Maintainers/community note that **skill selection is an internal concern**; if you want explicit selection, pass it in **payload/metadata** or split endpoints. ([GitHub][3])

If you want, I can sketch a tiny server-side router that checks `message.metadata.skillId` (or a JSON part) and dispatches to a specific executor, while remaining 100% protocol-compliant.

[1]: https://a2a-protocol.org/latest/tutorials/python/3-agent-skills-and-card/ 'Agent Skills & Agent Card - Agent2Agent (A2A) Protocol'
[2]: https://a2a-protocol.org/latest/tutorials/python/6-interact-with-server/ 'Interact with Server - Agent2Agent (A2A) Protocol'
[3]: https://github.com/a2aproject/A2A/issues/883 '[Feat]: Documenting Best Practices for Exposing Multi-Skill Agents as Unified External Services · Issue #883 · a2aproject/A2A · GitHub'
[4]: https://github.com/a2aproject/a2a-js 'GitHub - a2aproject/a2a-js: Official JavaScript SDK for the Agent2Agent (A2A) Protocol'
[5]: https://a2aprotocol.ai/blog/a2a-protocol-specification-python?utm_source=chatgpt.com 'A2A Protocol Specification (Python)'
[6]: https://google.github.io/A2A/topics/key-concepts/?utm_source=chatgpt.com 'Key Concepts - Agent2Agent Protocol (A2A)'
[7]: https://github.com/IBM/mcp-context-forge/issues/298?utm_source=chatgpt.com '[Feature Request]: A2A Initial Support - Add A2A Servers ...'
