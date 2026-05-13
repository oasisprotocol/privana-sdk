# Privana SDK

Monorepo for the Privana SDK and a preview application.

## Packages

| Package                                | Description                            |
| -------------------------------------- | -------------------------------------- |
| [@oasisprotocol/privana-sdk](./sdk/js) | React/Javascript SDK for Privana       |
| [oasis-privana](./sdk/py)              | Python SDK for Privana                 |
| [privana-preview](./apps/preview)      | Preview application showcasing the SDK |

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
├── sdk/
│   ├── js/                   # JS/TS SDK package
│   └── py/                   # Python SDK package
├── turbo.json                # Turborepo config
└── package.json              # Workspace root
```

## License

Apache-2.0
