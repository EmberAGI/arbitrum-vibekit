# Testing Architecture

This document defines the testing strategy for the project. Tests should verify **behavior** (WHAT the system does), not **implementation** (HOW it does it).

---

## 1. **Unit Tests First**

- **Purpose:** Fast feedback, test logic in isolation, easy to run on every save/commit.
- **When to start:** Immediately, even during prototyping.
- **Style:** Test core functions, utilities, and anything with lots of branching logic.
- **File naming:** Use `*.unit.test.ts` for unit tests.
- **Placement:** Keep them next to the code they cover (e.g., `src/foo/foo.ts` and `src/foo/foo.unit.test.ts`).
- **Mocks in unit tests:** Mock surgically: non-deterministic (time, randomness), expensive (DB, API), or irrelevant dependencies. Pure helpers can be used directly.
- **MSW usage:** Avoid MSW here—it’s overkill. Use inline mocks/spies (e.g., `vi.mock`) to isolate functions instead.
- **Anvil usage:** Avoid here. Instead, mock your wallet/provider/client directly with `vi.mock`.
- **Rule of thumb:** If a bug would embarrass you in production but can be caught by a cheap unit test, write it.

---

## 2. **Integration Tests (Always Use MSW for External HTTP, Use Anvil for EVM)**

- **Purpose:** Validate contracts between modules/services.
- **Approach:**
  - Always use **MSW** to mock external HTTP services and any SDKs that make HTTP calls under the hood.
  - Always use **Anvil** as the local blockchain node for all on-chain interactions. Deploy test contracts, impersonate accounts, control balances, and time-travel deterministically.
  - Use real local infrastructure components (databases, caches, queues) in test containers (e.g., with Docker + Testcontainers).
  - Cover "happy path" and "failure mode" flows.
- **Test infrastructure:**
  - Test utilities: `tests/utils/` (mock builders, helpers)
  - Mock data: `tests/mocks/data/[service]/` (recorded API responses)

- **File naming:** Use `*.int.test.ts` for integration tests.
- **Placement:** Keep them in a flat top-level `tests/` directory.
- **Naming strategy:**
  - Component tests match source files: `src/adapters/squid.ts` → `tests/squid.int.test.ts`
  - BDD scenario tests match feature files: `features/cross-chain-swap.feature` → `tests/cross-chain-swap.int.test.ts`
  - System integration tests use descriptive names: `tests/plugin-registry.int.test.ts`
- **Benefit:** By mocking HTTP with MSW and running blockchain logic against Anvil, you catch drift between your code and external contracts/services while keeping tests reliable and fast.

**Mock Decision Tree:**

- Makes HTTP calls? → Use MSW handlers
- Pure logic/utilities? → Use `vi.mock()` for surgical mocking

---

## 3. **End-to-End Tests (Live, but Thin)**

- **Purpose:** Ensure the whole system works from user input → backend → storage → response.
- **How much:** Keep it light (a handful of smoke tests). You don’t want an army of brittle Selenium/Playwright scripts.
- **When to run:**
  - **NOT in feature branch CI** — Skip for faster feedback
  - **Required before merging to main** — Final validation gate
  - Periodically against staging environments
- **File naming:** Use `*.e2e.test.ts` for end-to-end tests.
- **Placement:** Keep them in the `tests/` directory as well.
- **MSW usage:** Avoid MSW here—prefer hitting real HTTP services.
- **Anvil usage:** Avoid here—prefer a real staging/testnet chain to validate the full wallet/provider flow. Anvil fork can be used in CI for deterministic smoke tests.
- **Rule of thumb:** E2E tests are like fire alarms, not microscopes—they should alert you that _something_ broke, not tell you exactly where.

---

## 4. **BDD Mapping (Gherkin)**

- Treat `.feature` files in Gherkin as human-readable contracts (written by stakeholders, read by testers).
- Implement most scenarios as **service/API integration tests** (MSW for HTTP, Anvil for EVM).
- Use **Scenario Outlines** for input variation instead of duplicating tests.
- Keep scenarios focused on behavior; push fine-grained logic to unit tests.
- Tag scenarios (e.g., `@api`, `@evm`, `@e2e`, `@id:PAY-001`) to map them to the right test level and maintain traceability.
- Thin E2E tests cover only critical journeys against real services/testnets; avoid MSW/Anvil here.

---

## 5. **Avoiding Duplicate Coverage**

Each test layer has a distinct purpose—avoid testing the same behavior at multiple layers:

- **Unit tests** → Pure logic, calculations, transformations
- **Integration tests** → Component interactions, adapter contracts, error handling
- **E2E tests** → Critical user journeys only

**Guidelines:**

- If it can be tested as pure logic → Unit test
- If it requires multiple components → Integration test
- If it's a critical end-to-end flow → E2E test

**Red flags:**

- Same assertion appearing in both unit and integration tests
- Integration tests covering pure logic (belongs in unit tests)
- E2E tests covering error cases (belongs in integration tests)

**When duplication is acceptable:** Different perspectives on mission-critical behavior (e.g., calculation correctness in unit tests, calculation usage in integration tests).

---

## 6. **CI Testing Strategy**

The project uses a **two-tier CI approach** to balance speed and thoroughness:

### **Feature Branch CI (Fast Feedback)**

- **Runs:** Unit tests + Integration tests only
- **Goal:** Quick validation of changes (< 5 minutes)
- **Command:** `pnpm test:ci`
- **Includes:**
  - Linting and type checking
  - Unit tests (`*.unit.test.ts`)
  - Integration tests (`*.int.test.ts`)
  - Build verification

### **Main Branch CI (Comprehensive Validation)**

- **Runs:** Full test suite including E2E tests
- **Goal:** Final validation before production
- **Command:** `pnpm test:ci:main`
- **Includes:**
  - Everything from feature branch CI
  - End-to-end tests (`*.e2e.test.ts`)
  - Additional smoke tests against staging

### **Local Development Guidelines**

- Run tests relevant to your changes: `pnpm test:unit` or `pnpm test:int`
- Use `pnpm test:watch` for TDD workflow
- Run `pnpm test:ci` before pushing to validate CI will pass
- E2E tests are optional locally unless working on critical paths

---

⚖️ **Philosophy:**

- Don't chase 100% coverage. Chase **confidence with minimum friction**.
- **Test behavior (WHAT), not implementation (HOW)**: Focus on user-visible outcomes, not internal mechanics. Ask: "Would this test break if I refactored without changing behavior?" If yes, you're testing implementation.
- Treat mocks as _surgical tools_, not the default—except for external HTTP in integration tests (always MSW) and blockchain calls in integration tests (always Anvil).

**Getting Started:**

1. Start with unit tests for core logic (cheap, fast)
2. Add integration tests that always use MSW for external HTTP/SDKs and Anvil for EVM calls, plus real local infra via containers
3. For feature branches: Focus on unit + integration tests for rapid iteration
4. For main branch: Add a few end-to-end tests as final validation
5. Implement BDD scenarios at the service/API layer wherever possible
6. Let coverage and bug history guide where to expand
