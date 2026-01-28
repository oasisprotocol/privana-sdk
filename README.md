# Flexvaults SDK

Monorepo for the Flexvaults SDK and demo application.

## Packages

| Package                                         | Description                         |
| ----------------------------------------------- | ----------------------------------- |
| [@oasisprotocol/flexvaults-sdk](./packages/sdk) | React SDK for Flexvaults            |
| [flexvaults-demo](./apps/demo)                  | Demo application showcasing the SDK |

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
│   └── demo/                 # Next.js demo app
├── packages/
│   └── sdk/                  # Publishable SDK package
├── .changeset/               # Changesets for versioning
├── turbo.json                # Turborepo config
└── package.json              # Workspace root
```

## Publishing

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
# Create a changeset
bun run changeset

# Version packages
bun run version-packages

# Build and publish
bun run release
```

## License

MIT
