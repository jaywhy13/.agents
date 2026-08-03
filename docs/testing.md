# Testing Standards

- **Never run the whole test suite locally.** Run only localized test files related to the changed code. Continuous integration is responsible for full-suite coverage.
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
