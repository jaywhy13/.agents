# Personal Preferences

## Defaults
- Be concise in your responses. Prefer providing short high-level overviews and asking for direction/guidance to go deeper.
- Avoid acronyms, even when they are used in source material. Assume I'm not familiar with them. Say "Finite State Machine" instead of FSM.

## Teaching Style

When explaining code, concepts, or systems, use a Socratic approach: ask motivating questions before giving answers, guide me to discover insights rather than stating them directly, and build understanding incrementally through dialogue. Don't just answer — help me reason through it.

## Show Your Work

When answering questions that require searching or exploring the codebase, always include a brief "How I found this" section showing the key commands, search patterns, or tool calls used. This helps me learn to find similar information independently. For example, show the grep patterns, glob patterns, or file paths that led to the answer.

---

# Code Conventions

## Naming

- **No abbreviations.** Write `account_balance`, not `acct_bal`; `is_active`, not `ia`; `retry_count`, not `rc`.
- **Name with intent.** When a generic name would let several different meanings pass the type check, encode the specific intent in the name. The reader shouldn't have to scan the body to know what's special about this value.

  ```python
  # Generic — what's notable about this account? Have to read the body.
  account = Account.objects.create(name="Test")
  assert Invoice.objects.filter(account=account).count() == 0

  # Intentional — the name says what role this fixture plays.
  account_without_invoices = Account.objects.create(name="Test")
  assert Invoice.objects.filter(account=account_without_invoices).count() == 0
  ```

  Same rule applies to local variables, function parameters, and frontend state. If a reviewer would ask "what is this for?", the name is wrong — rename rather than add a comment.

## Comments

- Default to no comments. Add one only when the *why* is non-obvious — e.g. "the upstream API returns timestamps as Unix epoch but the display layer expects ISO 8601, so we convert here."
- Don't restate what the code does; rename the identifier instead.

## One level of abstraction per method

A method should read at a single level of abstraction. If the top of the method talks about high-level steps and the bottom is doing raw query construction or mutation details, split it: the outer method stays at the orchestration level and delegates each step to a helper that owns the details.

```python
# Mixes orchestration with query logic and mutation details
def archive_expired_records(batch):
    cutoff = batch.expires_at
    records = Record.objects.filter(batch=batch, created_at__lt=cutoff, archived=False)
    for record in records:
        record.archived = True
        record.archived_at = now()
        record.save()
        AuditLog.objects.create(record=record, action="archived")

# Each method reads at one level; details hide one level down
def archive_expired_records(batch):
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
      def setUp(self):
          self.user = UserFactory()
          self.order_with_items = OrderFactory(user=self.user)
          self.empty_order = OrderFactory(user=self.user)
          # ... many more declarations

  # Factory per test — data declared inline, tests are independent
  class TestOrderProcessing:
      def test_total_is_calculated_from_items(self):
          order = OrderFactory(items=[ItemFactory(price=10), ItemFactory(price=5)])
          assert order.total == 15

      def test_empty_order_has_zero_total(self):
          empty_order = OrderFactory(items=[])
          assert empty_order.total == 0
  ```

- **Centralize test abstractions.** When you need to fake or configure an external dependency (a repository, an email sender, a payment gateway), don't patch it inline at every call site. Build a dedicated fake or mock class with a clean API and reuse it. Inline patches scattered across hundreds of tests become a maintenance disaster the moment the dependency's interface changes — a centralized abstraction means one update propagates everywhere.

  ```python
  # Inline patch — breaks everywhere when the interface changes
  @patch('payments.gateway.charge')
  def test_order_charges_correct_amount(self, mock_charge):
      mock_charge.return_value = {"status": "ok"}
      ...
      mock_charge.assert_called_once_with(amount=15_00, currency="usd")

  # Centralized fake — interface changes require one update
  def test_order_charges_correct_amount(self):
      gateway = FakePaymentGateway()
      process_order(order, gateway=gateway)
      gateway.assert_charged(amount=15_00, currency="usd")
  ```

- **Write focused tests — one concern per test.** A test that asserts on the return value, the database state, the log output, and the metrics all at once has too many reasons to break and too many places to look when it does. Give each concern its own test. The footprint grows, but each test has a clear purpose, failures point directly at the broken behaviour, and changing one concern doesn't disturb the others.

- Prefer named-variable loops over compact comprehensions in assertions:

  ```python
  for expected_id in expected_ids:
      assert Record.objects.filter(id=expected_id).exists()
  ```

  reads better than a nested `all(...)` one-liner.
