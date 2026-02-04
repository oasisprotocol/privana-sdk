# Flexvaults SDK

Monorepo for the Flexvaults SDK and preview application.

## Packages

| Package                                           | Description                            |
| ------------------------------------------------- | -------------------------------------- |
| [@oasisprotocol/flexvaults-sdk](./packages/sdk)   | React SDK for Flexvaults               |
| [flexvaults-preview](./apps/preview)              | Preview application showcasing the SDK |

## Development

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0.0
- Node.js >= 18

### Setup

```bash
# Install dependencies
bun install

# Start development
bun run dev

# Build all packages
bun run build

# Run linting
bun run lint

# Run type checking
bun run typecheck

# Format code
bun run format
```

## Project Structure

```
├── apps/
│   └── preview/              # Next.js preview app
├── packages/
│   └── sdk/                  # Publishable SDK package
├── turbo.json                # Turborepo config
└── package.json              # Workspace root
```

## License

Apache-2.0
