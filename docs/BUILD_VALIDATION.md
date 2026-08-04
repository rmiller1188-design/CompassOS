# M26 Build Validation

M26 is validated through `.github/workflows/validate-m26.yml` using:

- Node.js 22
- the public npm registry
- dependency installation
- TypeScript type checking
- ESLint
- a Next.js production build

The Node 24 message emitted by `actions/checkout` refers to GitHub's internal JavaScript action runtime. It is not the Compass application runtime. Compass declares Node.js 22 or newer in `package.json` and Render is configured with `NODE_VERSION=22`.
