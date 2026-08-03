# Coding Standards

## Naming

- **No abbreviations.** Write `account_balance`, not `acct_bal`; `is_active`, not `ia`; `retry_count`, not `rc`.
- **Name with intent.** When a generic name would let several different meanings pass the type check, encode the specific intent in the name. The reader shouldn't have to scan the body to know what's special about this value.
- **Name methods after the business question, not the mechanism.** Method names should say what decision or business concern is being handled, while implementation details stay inside the method body.

  ```ruby
  # Mechanism name
  def apply_defer_rules; end

  # Business-question name
  def check_if_job_should_be_deferred; end
  ```

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

- **Don't coin a second word for a concept that already has a name.** If the domain calls it an invoice, don't introduce "bill" alongside it; if it's a record, don't also call it an entry. A synonym forces every reader to confirm the two words mean the same thing, and the answer is sometimes "not quite," which is worse. One concept, one term — including in tests and local variables.

- **Avoid placeholder names that describe nothing.** `extracted`, `result`, `data`, `temp`, `item` (when something more specific is true) make the reader scan the body to learn the role. Name the role: a list of ids about to be deleted is `order_ids_to_delete`, not `extracted`; the parsed request is `create_request`, not `data`. If a generic name is genuinely the only honest description, that's a hint the value is doing too many things.

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

### The boundary violations frameworks make convenient

The layering rules above are framework-neutral, which is exactly why they fail to fire: a framework's most idiomatic, best-documented feature is often the thing that wires two layers together and skips the one in the middle. The rules are abstract; the trap is concrete and has a friendly name. So name the traps explicitly and treat reaching for them as the signal to stop, regardless of how standard they are in the framework's community.

- **A "model-bound serializer/schema" couples the view layer straight to the ORM.** Django's `ModelSerializer`, a Pydantic schema with `from_attributes`/`orm_mode`, an ActiveModelSerializer bound to a record — these read and write model fields directly, so the view layer talks to the database with no service or repository in between. This is common practice in those ecosystems and still a violation here. Define the serializer/schema over plain fields, hand validated data to a service, and serialize the value object the service returns. The serializer must not import or reference a model.

- **"Auto-CRUD view" base classes wire the whole stack together behind your back.** Django's `ModelViewSet`, a generic `RetrieveUpdateDestroy` view, a scaffolded Rails controller, a framework's "resource" router — these generate create/read/update/delete handlers that call the ORM directly and bypass both the service and the repository. They also generate several write verbs (`create`, `update`, `partial_update`, `destroy`) that all apply the same configured behaviour uniformly, so any check or transformation you add by overriding a single verb is silently absent from the rest (an authorization guard wired into one path but missing from another, for instance). Prefer explicit handlers that deserialize, call a service method, and serialize the result.

- **Returning a `QuerySet`, lazy query, or model instance from a repository is an ORM leak even when it type-checks.** A repository method that returns rows hands the ORM up to the service, so the service can accidentally trigger queries, mutate rows, or follow relations — and a change of ORM or schema then ripples upward. Returning a value object is not optional politeness; it is the boundary. Convert rows to value objects inside the repository before returning.

The unifying tell: if a single framework construct lets you go from the wire format to the database without an explicit service call in between, it has collapsed your layers. Recognize it by name and don't use it, however idiomatic it is.

### Repository methods are vanilla CRUD with consistent filter arguments

Repositories expose persistence as generic create/read/update/delete operations — `list`, `get`, `create`, `update`, `delete` — and nothing shaped by a business use case. Reads accept **optional filter arguments** (`user_id`, `name`, `status`, …); because they're optional and named for the column, it's understood they narrow the query. Use the **same argument name for the same concept across every method** (`name` in `create` and `name` in `list`, never `name` one place and `name_search` another).

Do not give repository methods business-flavoured names like `for_user`, `owned_by`, `active_for_account`, or `name_search`. Those names bake a business rule into the persistence layer, which is where it becomes invisible and untestable. **Per-user scoping and ownership enforcement are business logic and live in the service layer** — the service decides to call `list(user_id=current_user.id)` and decides what to do when a row isn't owned by the caller. The repository just runs the filter it was handed.

```python
# Business-flavoured repository — scoping baked into the method name
class OrderRepository:
    def for_user(self, user): ...
    def name_search(self, name_search): ...   # inconsistent arg name, business intent

# Vanilla CRUD — optional filters, consistent names; scoping moves up to the service
class OrderRepository:
    def list(self, user_id: int | None = None, name: str | None = None) -> list[Order]: ...
    def create(self, user_id: int, name: str) -> Order: ...   # returns a value object, not an ORM row

class OrderService:
    def list_for_current_user(self, user_id: int) -> list[Order]:
        return self.order_repository.list(user_id=user_id)   # scoping is a service decision
```

A bonus: cross-cutting checks — authorization, validation, invariants (for example, "you may only touch your own records") — belong in the service, not in a repository method or a per-route hook. Put a check in the service and it is defined once and inherited by every entry point that calls through it. Reimplement it per route or per verb and the paths drift: one of them inevitably gets missed. The service raises a domain error; the view layer catches it and maps it to the right protocol response.

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

### Decompose for reuse, not just for shorter methods

Splitting a long method into private helpers makes the parent shorter but can leave the pieces just as coupled — each helper still depends on the parent's state and can't be called from anywhere else. That is decomposition in appearance only. Aim for helpers that are **independently reusable**: prefer public methods with explicit parameters over private ones that read shared fields, and keep per-call scratch state (caches, accumulators, running maps) **local to the orchestrating method** rather than threaded through every helper's signature. If a helper only makes sense as step three of one specific parent, it hasn't been decomposed — it's been hidden. A good test: could another caller use this method on its own? If not, rework the seam.

### Split a service the moment it grows a second concept

A service that keeps accreting logic — several private helpers, a chunk of state passed around, a cluster of methods that all serve one sub-task — is usually two services wearing one coat. When a region of a service starts to read like a distinct domain concept (generation, scheduling, pricing, reconciliation), extract it into its own dedicated service with its own dependencies. Don't wait for a hard rule to force the split; actively watch for the crowding and separate concerns early, while the seam is still cheap to cut. The signal is qualitative: "this part is really about a different thing" is enough reason to extract.

### Let value objects carry pure computed accessors

A value object isn't limited to raw fields. It can expose **accessors that re-shape its own data** — a settings object that offers `enabled_types` instead of making every caller filter the raw flags, a date range that offers `length_in_days`. These are pure: they compute only from data already on the object, make no queries and reach no external state, and exist to give callers a more convenient view. Pushing this presentation logic onto the value object shrinks every service that would otherwise repeat the same derivation, and it stays honest because it can't touch the database. This is distinct from the "no fat models" rule: a fat model hangs *business operations and persistence* off a record; a value-object accessor only re-shapes or derives data the object already holds.
