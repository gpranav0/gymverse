# GymVerse ER model

`../gymverse_er_model.xml` is the conceptual ER model of the whole GymVerse database, saved in
TerraER's native file format. `../gymverse_er_model.png` is the same diagram rendered to an image.

| | |
|---|---|
| Entities | 29 (14 strong, 10 weak, 5 associative) |
| Relationships | 29 (10 identifying, 14 ordinary, 5 carried by associative entities) |
| Attributes | 219 |
| Opens in | TerraER 2.23, 2.24beta, 3.01beta, 3.1 and 3.14 (all tested) |

## Opening it

1. Get TerraER from <https://www.terraer.com.br> or the `terraer_project/dist/` folder of
   <https://github.com/rterrabh/TerraER> (Java required).
2. Run `java -jar TerraER3.14.jar`, then **File → Open** and choose `gymverse_er_model.xml`.
3. The canvas is about 10,000 × 5,400 px: zoom out to see it whole. Every figure is connected,
   so you can drag entities and their lines follow.

## How to read it

| Figure | Meaning | Example |
|---|---|---|
| Rectangle | Strong entity | `MEMBER` |
| Double rectangle | Weak entity: cannot exist without its owner | `ATTENDANCE` |
| Rectangle with a diamond inside | Associative entity: an M:N relationship that has its own attributes | `SUBSCRIPTION` |
| Diamond | Relationship | `HAS_ROLE` |
| Double diamond | Identifying relationship of a weak entity | `CHECKS_IN` |
| Underlined bold attribute | Primary key | `member_id` |
| Bold attribute on a weak entity | Partial key | `attendance_date` |
| Dashed ellipse | Derived attribute | `bmi` |
| `1` / `N` / `M` on a line | Cardinality at that end | a `MEMBER` (1) has many `ATTENDANCE` rows (N) |

The diagram is laid out by area: accounts and security along the top, `MEMBER` in the centre
with its activity around it, `TRAINER` below with workouts and classes, and diet, equipment
and payments on the left.

## Modelling decisions

The model follows `database/01_schema.sql` plus the later columns and tables
(`users.status`, `users.token_version`, `users.email_verified_at`, `auth_tokens`,
`revoked_tokens`). Where a conceptual model differs from the tables, it is on purpose:

- **Junction tables are associative entities.** `subscriptions`, `trainer_assignments`,
  `member_workouts`, `workout_plan_exercises` and `class_bookings` link two entities M:N and carry
  their own attributes, so each is drawn as one associative entity rather than a table.
- **Weak entities are the rows that only make sense under an owner** and are deleted with it
  (`ON DELETE CASCADE`): attendance, progress records, notifications, feedback and workout
  sessions under a member; payments under a subscription; meals under a diet plan; schedules
  under a class; maintenance records under equipment; auth tokens under a user. Their surrogate
  `*_id` columns are left out and a partial key identifies each one under its owner.
- **Derived attributes are only ones the database really computes:** `bmi` is a generated
  column on `progress_records`, and `available_seats` is computed in the class schedule view.
- **Left out on purpose:**
  - `created_at` / `updated_at`: every table has them, so they add clutter and no meaning. The
    exceptions are `AUDIT_LOG.created_at` and `REVOKED_TOKEN.revoked_at`, which are the event times.
  - `payments.member_id`: it can be derived through the subscription. It is stored only to make
    queries faster.
  - `schema_migrations`: it tracks which SQL files have run and is not part of the data model.
  - The foreign-key columns themselves: relationships show them.
- **`exercises.equipment_required` is a plain attribute**, not a relationship to `EQUIPMENT`: it
  is free text, with no foreign key.
- **Attribute types are approximate.** TerraER offers only five types, so the mapping is
  whole numbers and booleans → `NUMBER`, money and measurements → `NUMBER(9,2)`, dates and
  timestamps → `DATE`, fixed-length hashes → `CHAR(128)`, and all other text (including `TIME`
  and `JSONB`) → `VARCHAR2(128)`. The SQL files remain the source of truth for exact types.

## Regenerating and checking

The XML is generated, so edit the model in `build_er_model.py`, not by hand:

```sh
python er_model_src/build_er_model.py
```

To check the file with TerraER's own code, without opening the app (use `:` instead of `;` in
the classpath on macOS/Linux):

```sh
cd er_model_src
javac -cp TerraER3.14.jar LoadTest.java Render.java
# Loads the file and saves it again, as File > Open then File > Save would
java -cp "TerraER3.14.jar;." LoadTest ../gymverse_er_model.xml roundtrip.xml
# Renders the whole drawing to PNG (arguments: input, output, scale)
java -Xmx2g -cp "TerraER3.14.jar;." Render ../gymverse_er_model.xml ../gymverse_er_model.png 1.0
```

`Render` also takes a crop in drawing coordinates after the scale, `x y width height`, to
inspect one area closely.

### Format notes for editing the generator

- Element names come from TerraER's `DrawFigureFactory`. Attribute links use `lcf` rather than
  `lcaf`. TerraER 3.1+ treats the two as the same, but versions before 3.1 only know `lcf` and
  refuse the whole file otherwise.
- `attributeType` must be exactly one of `CHAR(128)`, `VARCHAR2(128)`, `NUMBER`, `NUMBER(9,2)`,
  `DATE`. Any other value loads as null and makes TerraER fail the next time it saves.
- TerraER does not reapply a figure's default styling when it opens a file. The generator
  therefore writes each style out explicitly: the double stroke of weak entities and
  identifying relationships, and the dashes of derived attributes.
- Figure ids are sequential hexadecimal, and a line may only refer to figures written before it.
