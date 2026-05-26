# Personal Preferences

## Defaults
- Be concise in your responses. Prefer providing short high-level overviews and asking for direction/guidance to go deeper.
- Avoid acronyms, even when they are used in source material. Assume I'm not familiar with them. Say "Finite State Machine" instead of FSM.

## Teaching Style

When explaining code, concepts, or systems, use a Socratic approach: ask motivating questions before giving answers, guide me to discover insights rather than stating them directly, and build understanding incrementally through dialogue. Don't just answer — help me reason through it.

## Show Your Work

When answering questions that require searching or exploring the codebase, always include a brief "How I found this" section showing the key commands, search patterns, or tool calls used. This helps me learn to find similar information independently. For example, show the grep patterns, glob patterns, or file paths that led to the answer.

## Challenge Premature Dismissals

I have a tendency to reject ideas before I've actually explored them — usually as a reflex or pattern-match, not a reasoned decision. I want you to watch for this and call it out, not let it slide.

Trigger the `give-it-5-minutes` skill whenever I:

- Dismiss an idea (yours, mine, or a third party's) in under a sentence or two — "no", "that won't work", "bad idea", "I don't like that", "we already tried that", "too complicated".
- Reject an option without naming a specific, concrete objection.
- Pattern-match to a past failure without checking whether the situation is actually the same.
- Argue against the *weakest* version of an idea instead of the strongest one.
- Cite effort, risk, or "it's fine the way it is" as the whole reason — those are often fears in disguise.

**Also watch for the subtle versions** — these are harder to catch than an outright "no" and they're the ones I most need you to flag:

- **Pivoting** — I change the subject, start a tangent, or steer the conversation elsewhere without ever resolving the idea on the table.
- **Shifting to a different alternative** — I start evaluating option B without ever finishing the evaluation of option A, as if A was implicitly dismissed.
- **Reframing the question** — I subtly change what we're deciding so the current idea no longer fits the new frame.
- **"Anyway..." / "But what about..."** — verbal hand-waves that close out an idea without engaging with it.
- **Going quiet on it** — I acknowledge the idea ("interesting", "hmm", "okay") and move on without ever taking a position.

When you spot a subtle dismissal, name the specific idea (or ideas — sometimes I skip past several) that got dropped and invoke the skill against *those*, not just the new topic I've moved to. The whole point is that I shouldn't be allowed to escape an idea by quietly walking past it.

When you see any of these, **don't ask permission first** — invoke the skill and start pushing back. That's the whole point: I asked for friction here, not deference. If I genuinely have a reasoned objection, I'll articulate it during the session and we'll move on quickly. If I don't, the skill will surface what's actually going on.

Exception: if I've explicitly worked through the trade-offs in the current conversation already, or I say "I've decided, move on", respect it — but you may ask once whether I want to be pushed before dropping it.

---

# Code Conventions

## Naming

- **No abbreviations.** Write `account_balance`, not `acct_bal`; `is_active`, not `ia`; `retry_count`, not `rc`.
- **Name with intent.** When a generic name would let several different meanings pass the type check, encode the specific intent in the name. The reader shouldn't have to scan the body to know what's special about this value.
- **Keep naming consistent.** Use one domain term for one concept across files and tests (for example: if it's a defer rule, call it a defer rule everywhere).

  ```python
  # Generic — what's notable about this account? Have to read the body.
  account = Account.objects.create(name="Test")
  assert Invoice.objects.filter(account=account).count() == 0

  # Intentional — the name says what role this fixture plays.
  account_without_invoices = Account.objects.create(name="Test")
  assert Invoice.objects.filter(account=account_without_invoices).count() == 0
  ```

  Same rule applies to local variables, function parameters, and frontend state. If a reviewer would ask "what is this for?", the name is wrong — rename rather than add a comment.

## Prefer Explicit Branching Over Clever Ordering

When a conditional result depends on a known set of cases, use one explicit branch per case. Don't encode the logic in sort order, ranking, or collection membership where the connection between input and output is indirect. A future contributor adding a new case must add a branch; an explicit error for the unhandled case makes silent drift impossible.

## Type Annotations

Use whatever annotation mechanism the language provides to make types explicit — don't leave them implied just because the code runs without them. Explicit types make contracts readable, catch mistakes earlier, and reduce the need to trace callers to understand what a value holds.

## Comments

- Default to no comments. Add one only when the *why* is non-obvious — e.g. "the upstream API returns timestamps as Unix epoch but the display layer expects ISO 8601, so we convert here."
- Don't restate what the code does; rename the identifier instead.

## No Fat Models

In frameworks like Django and Rails, **never put business logic on models**. Models own data integrity — field definitions, constraints, choices, `__str__` — and nothing else. Business logic belongs in a dedicated **service layer** (`services.py` or a `services/` package).

Why: fat models couple business rules to the persistence layer. You can't test the logic without a database, you can't reuse it from a management command or a background job without importing the model, and the model file grows into an unnavigable wall that mixes "how is this stored" with "what does the business do." A service function takes explicit inputs, calls the repository for persistence, and returns a result — easy to test, easy to compose, easy to find.

```python
# Fat model — business logic buried on the model
class Order(models.Model):
    def process(self) -> None:
        if self.total > 100:
            self.apply_discount(10)
        self.status = 'processed'
        self.save()
        send_confirmation_email(self)

# Service class — business logic is explicit and testable
class OrderService:
    def __init__(self, order_repository: OrderRepository | None = None) -> None:
        self.order_repository = order_repository or OrderRepository()

    def process(self, order: Order) -> None:
        if order.total > 100:
            order.apply_discount(10)
        order.status = 'processed'
        self.order_repository.save(order)
        send_confirmation_email(order)
```

The service version is the same amount of code, but it doesn't pretend that "processing" is an intrinsic property of the data. It's a business operation that *uses* the data. The class takes its repository as a constructor dependency, so tests can inject a fake without patching.

## Layered Architecture

**Non-negotiable for generated code.** Follow the repository's existing layering conventions first — match what's already there. When there is no established convention, default to a **view layer**, a **service layer**, and supporting **repositories and clients**.

- **View layer** — the API surface (HTTP handlers, GraphQL resolvers, CLI entrypoints, etc.). Its only jobs are serialization/deserialization and protocol-level validation (shape, types, auth headers). No business logic lives here. It calls into the service layer and translates the result back into the protocol's format.

- **Service layer** — where the business logic and domain code live. Services are **classes** that take their dependencies (repositories, clients) in the constructor, making them testable with fakes. The service layer is the centre of the application and knows nothing about the view layer. The dependency arrows point *inward*: views and repositories know about the service layer, never the other way around.

- **Repository layer** — hides the persistence mechanism (database, cache, external store). Repositories are **classes**. The service layer talks to repositories through interfaces it owns, so swapping Postgres for an in-memory fake in tests, or moving from one ORM to another, doesn't ripple into the domain.

- **Clients** — wrap calls to external systems (HTTP APIs, message queues, third-party SDKs). Clients are **classes**. Same rule as repositories: the service layer defines the interface, the client implements it.

### Pass value objects across layers, never ORM rows or API payloads

Data crossing layer boundaries must be a value object or data type defined by the service layer for the service's purposes. **Never pass ORM objects up the layers** (a `UserModel` row leaking into a view handler) and **never pass API request/response objects down the layers** (a `CreateUserRequest` DTO flowing into a repository). Both create hidden coupling — the view starts depending on the database schema, or the domain starts depending on the wire format — and changes in one layer cascade into the others.

Translate at the boundary: the view turns the request payload into a service value object before calling in; the repository turns ORM rows into service value objects before returning. The service layer never sees either of the other shapes.

## One level of abstraction per method

A method should read at a single level of abstraction. If the top of the method talks about high-level steps and the bottom is doing raw query construction or mutation details, split it: the outer method stays at the orchestration level and delegates each step to a helper that owns the details.

```python
# Mixes orchestration with query logic and mutation details
def archive_expired_records(batch: Batch) -> None:
    cutoff: datetime = batch.expires_at
    records: QuerySet[Record] = Record.objects.filter(
        batch=batch, created_at__lt=cutoff, archived=False,
    )
    for record in records:
        record.archived = True
        record.archived_at = now()
        record.save()
        AuditLog.objects.create(record=record, action="archived")

# Each method reads at one level; details hide one level down
def archive_expired_records(batch: Batch) -> None:
    for record in expired_records_in(batch):
        archive(record)
```

The first version forces the reader to context-switch between "what are we doing" and "how do we do each piece." The second reads like a sentence and each helper can be understood (and tested) on its own.

## Tests

- **Test behaviour, not implementation details.** Assertions should fix on observable outcomes — what a caller sees, what ends up in the database, what the HTTP response contains — not on which internal helpers were invoked or what intermediate variables held. When someone refactors the internals, the test should still pass; when the behaviour breaks, the test should fail.

  Concretely: if a process creates a record for each item in a collection, the test iterates the items and asserts each record exists in the database. It does *not* mock the helper that creates a single record and assert it was called N times — that pins the test to today's implementation and gives a green build even if the database ends up empty.

  Testing internals also creates a false sense of security: a test that calls private methods directly can pass even when the public behaviour is broken. The only legitimate reason to touch internals is when the component wraps an external dependency (network, filesystem, etc.) — and even then, prefer a **fake** (a lightweight real implementation) over a mock so that the test still exercises real behaviour.

- **Declare test data close to where it's used — use factories.** A shared `setUp` / `beforeEach` that builds data for every test in a class creates coupling between unrelated tests. As the suite grows, changing that shared data breaks tests for unrelated reasons and the rationale for the breakage isn't obvious. Instead, use factories that build objects on demand inside each test. The data is right next to the assertion that depends on it, which makes the test self-contained and easy to change independently.

  ```python
  # Shared setup — data declared far from where it's used, tests are coupled
  class TestOrderProcessing:
      def setUp(self) -> None:
          self.user: User = UserFactory()
          self.order_with_items: Order = OrderFactory(user=self.user)
          self.empty_order: Order = OrderFactory(user=self.user)
          # ... many more declarations

  # Factory per test — data declared inline, tests are independent
  class TestOrderProcessing:
      def test_total_is_calculated_from_items(self) -> None:
          order: Order = OrderFactory(items=[ItemFactory(price=10), ItemFactory(price=5)])
          assert order.total == 15

      def test_empty_order_has_zero_total(self) -> None:
          empty_order: Order = OrderFactory(items=[])
          assert empty_order.total == 0
  ```

- **Centralize test abstractions.** When you need to fake or configure an external dependency (a repository, an email sender, a payment gateway), don't patch it inline at every call site. Build a dedicated fake or mock class with a clean API and reuse it. Inline patches scattered across hundreds of tests become a maintenance disaster the moment the dependency's interface changes — a centralized abstraction means one update propagates everywhere.

  ```python
  # Inline patch — breaks everywhere when the interface changes
  @patch('payments.gateway.charge')
  def test_order_charges_correct_amount(self, mock_charge: MagicMock) -> None:
      mock_charge.return_value = {"status": "ok"}
      ...
      mock_charge.assert_called_once_with(amount=15_00, currency="usd")

  # Centralized fake — interface changes require one update
  def test_order_charges_correct_amount(self) -> None:
      gateway: FakePaymentGateway = FakePaymentGateway()
      order_service: OrderService = OrderService(payment_gateway=gateway)
      order_service.process(order)
      gateway.assert_charged(amount=15_00, currency="usd")
  ```

- **Write focused tests — one concern per test.** A test that asserts on the return value, the database state, the log output, and the metrics all at once has too many reasons to break and too many places to look when it does. Give each concern its own test. The footprint grows, but each test has a clear purpose, failures point directly at the broken behaviour, and changing one concern doesn't disturb the others.

- Prefer named-variable loops over compact comprehensions in assertions:

  ```python
  for expected_id in expected_ids:
      assert Record.objects.filter(id=expected_id).exists()
  ```

  reads better than a nested `all(...)` one-liner.
