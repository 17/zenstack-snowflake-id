# ZenStack Snowflake ID Plugin

A ZenStack plugin that provides automatic Snowflake ID generation for database models. This plugin allows you to mark fields with `@snowflake` attribute to automatically generate distributed unique identifiers.

## Installation

```bash
npm install zenstack-snowflake-id
```

## Usage

### 1. Enable the Plugin in Your Schema

Add the plugin to your `schema.zmodel` file:

```zmodel
plugin snowflake {
    provider = 'zenstack-snowflake-id'
}
```

### 2. Mark Fields with @snowflake Attribute

Use the `@snowflake` attribute on `Int` or `BigInt` fields:

```zmodel
model User {
    id      BigInt @id @snowflake(workerId: 1) @default(0)
    email   String @unique
    name    String
    
    @@map("users")
}

model Post {
    id      BigInt @id @snowflake(epoch: 1738080000000) @default(0)
    title   String
    content String
    userId  BigInt
    user    User  @relation(fields: [userId], references: [id])
    
    @@map("posts")
}
```

**Important Note**: Fields using the `@snowflake` attribute **must** also include `@default(0)` default value. This is because the plugin uses the `onKyselyQuery` interface for ID generation, and without a default value, field validation will intercept the request before the plugin can process it.

The plugin provides a `placeholder` configuration option, which defaults to `0`. If your business needs require a different default value, you can adjust it through configuration:

```typescript
// Customize placeholder when creating the plugin
const db = new ZenStackClient(schema, {
  dialect: new SqlJsDialect({ sqlJs: new SQL.Database() }),
  plugins: [new SnowflakePlugin({ placeholder: -1 })], // Use -1 as placeholder
});
```

Then use the corresponding default value in your schema:
```zmodel
model User {
    id BigInt @id @snowflake @default(-1) // Must match placeholder configuration
    // ...
}
```

### 3. Configure the ORM Client

When creating your ZenStack client, include the Snowflake ID plugin:

```typescript
import { ZenStackClient } from "@zenstackhq/orm";
import { SqlJsDialect } from "@zenstackhq/orm/dialects/sql.js";
import initSqlJs from "sql.js";
import { SnowflakePlugin } from "./plugins/snowflake-id";
import { schema } from "./zenstack/schema";

async function main() {
  const SQL = await initSqlJs();

  const db = new ZenStackClient(schema, {
    dialect: new SqlJsDialect({ sqlJs: new SQL.Database() }),
    plugins: [new SnowflakePlugin()],
  });

  // Push database schema
  await db.$pushSchema();

  // Create a user - ID will be automatically generated
  const user = await db.user.create({
    data: {
      email: "user@example.com",
      name: "John Doe",
    },
  });
  
  console.log("User created with Snowflake ID:", user.id);
}

main();
```

## Configuration Options

### Plugin Options (in schema.zmodel)

- `workerId` (optional, default: 0): Default worker ID (0-1023 for 63-bit mode, 0-7 for 53-bit mode)
- `epoch` (optional, default: 2026-02-28): Custom epoch timestamp in milliseconds

### Runtime Plugin Options (when creating ZenStackClient)

- `workerId` (optional, default: 0): Default worker ID
- `epoch` (optional, default: 2026-02-28): Custom epoch timestamp
- `mode` (optional, default: 63): ID generation mode - 53 or 63 bits
- `placeholder` (optional, default: 0): Placeholder value that triggers ID generation

### Field-level Options

- `workerId` (optional): Override the default worker ID for this specific field
- `epoch` (optional): Override the default epoch for this specific field

## Snowflake ID Structure

### 63-bit Mode (Default)
- **41 bits**: Timestamp (milliseconds since epoch) - ~69 years lifespan
- **10 bits**: Worker ID (0-1023) - supports up to 1024 worker nodes
- **12 bits**: Sequence number (0-4095) - 4096 IDs per millisecond per worker

### 53-bit Mode
- **40 bits**: Timestamp (milliseconds since epoch) - ~34.8 years lifespan  
- **3 bits**: Worker ID (0-7) - supports up to 8 worker nodes
- **10 bits**: Sequence number (0-1023) - 1024 IDs per millisecond per worker

### SnowflakePlugin Class

```typescript
class SnowflakePlugin implements RuntimePlugin {
  constructor(options?: {
    workerId?: number;
    epoch?: number;
    mode?: 53 | 63;
    placeholder?: 0
  });
}
```

## License

MIT