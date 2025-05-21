# Implementation Manual: Configuring `ON DELETE CASCADE` and `ON DELETE SET NULL` with TypeORM + SQLite (Electron + Angular)

---

## Table of Contents
1. Introduction
2. Prerequisites & Environment
3. Enabling Foreign Keys in SQLite
4. Entity Design Patterns
   4.1 `ON DELETE CASCADE` (keep DB clean)
   4.2 `ON DELETE SET NULL` (orphan but preserve child)
   4.3 Notes on Many‑to‑Many relations
5. Creating & Running Migrations
6. Testing Deletion Behaviours
7. Troubleshooting & FAQ
8. References

---

## 1  Introduction
`ON DELETE CASCADE` and `ON DELETE SET NULL` are **database‑level** referential actions. They differ from TypeORM’s own `cascade` option, which performs JavaScript‑side saves/removals. Using DB‑level rules is faster and guarantees integrity even if your code crashes.

| Action | Effect |
|--------|--------|
| **CASCADE** | Deleting the parent automatically deletes children. |
| **SET NULL** | Deleting the parent sets the child’s FK column to `NULL`. Child rows survive. |

## 2  Prerequisites & Environment
* **Electron main process** (Node ≥ 20) runs TypeORM.
* **SQLite** driver: `better-sqlite3` (preferred) or `sqlite3`.
* **TypeORM** ≥ 0.3.x.
* DB file lives next to `userData` or in a writable path.

Install:
```bash
npm i typeorm reflect-metadata better-sqlite3
```
Add `"emitDecoratorMetadata": true` in `tsconfig.json`.

## 3  Enabling Foreign Keys in SQLite
SQLite disables FK enforcement by default. Enable it **once per connection**:
```ts
// datasource.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Author, Book } from './entities';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'app.db',
  entities: [Author, Book],
  synchronize: false, // use migrations in prod
});

await AppDataSource.initialize();
await AppDataSource.query('PRAGMA foreign_keys = ON;');
```
TypeORM’s SQLite driver normally issues this PRAGMA automatically, but the explicit call guarantees it during tests.

## 4  Entity Design Patterns
### 4.1  `ON DELETE CASCADE`
Parent → Child (delete parent, delete child):
```ts
@Entity()
export class Author {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => Book, b => b.author)
  books: Book[];
}

@Entity()
export class Book {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @ManyToOne(() => Author, a => a.books, {
    onDelete: 'CASCADE',  // DB‑level
  })
  @JoinColumn({ name: 'authorId' })
  author: Author;
}
```
**Key points**
* Place `onDelete: 'CASCADE'` on the **owning side** (`@ManyToOne`).
* No need for `cascade: ['remove']` unless you also want ORM‑side removal when you call `bookRepo.remove()`.

### 4.2  `ON DELETE SET NULL`
Parent deletion preserves children but disassociates them.
```ts
@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @OneToMany(() => OrderItem, i => i.order)
  items: OrderItem[];
}

@Entity()
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productName: string;

  @ManyToOne(() => Order, o => o.items, {
    nullable: true,  // FK column must allow NULL
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'orderId' })
  order: Order | null;
}
```
If `nullable: true` is omitted, SQLite throws an error when trying to set the column to `NULL`.

### 4.3  Many‑to‑Many
```ts
@ManyToMany(() => Tag, t => t.posts)
@JoinTable({
  name: 'post_tags',
  onDelete: 'CASCADE', // acts on junction rows
})
```

## 5  Creating & Running Migrations
```bash
# generate after changing entities
npx typeorm migration:generate src/migrations/AddCascade --dataSource src/datasource.ts
# run
npx typeorm migration:run -d src/datasource.ts
```
SQLite cannot `ALTER TABLE` to add FK clauses; migrations usually recreate tables:
```ts
await queryRunner.renameTable('book', 'book_tmp');
// create new book with proper FK → copy data → drop tmp
```
Plan cascade behaviour early to avoid data moves.

## 6  Testing Deletion Behaviours
```ts
const author = await authorRepo.save({
  name: 'JK',
  books: [{ title: 'A' }, { title: 'B' }],
});
await authorRepo.delete(author.id);
console.assert(await bookRepo.count() === 0, 'Cascade failed');

const order = await orderRepo.save({ code: 'X' });
const item = await itemRepo.save({ productName: 'Widget', order });
await orderRepo.remove(order);
const reloaded = await itemRepo.findOneBy({ id: item.id });
console.assert(reloaded?.order === null, 'Set‑null failed');
```

## 7  Troubleshooting & FAQ
| Symptom | Cause & Fix |
|---------|------------|
| Child rows remain after parent delete | `PRAGMA foreign_keys` not `ON` **or** `onDelete` missing/typo. |
| `SQLITE_CONSTRAINT_NOTNULL` on delete | Using `SET NULL` but FK column is `NOT NULL`. Set `nullable: true`. |
| Migration won’t alter FK | SQLite limitation. Recreate table or use `PRAGMA foreign_key_check` then copy data. |
| Deleting child deletes parent | Normal; FK only cascades **from parent to child**. |
| Need soft delete | Use `@DeleteDateColumn` plus cascades, or handle in service layer; SQLite has no `ON DELETE SOFT`. |

## 8  References
* **SQLite** – Foreign Key Constraints (docs)
* **TypeORM Docs** – Relations / `onDelete`
* Better‑SQLite3 driver FAQ
* Official Electron security / file path guidelines
