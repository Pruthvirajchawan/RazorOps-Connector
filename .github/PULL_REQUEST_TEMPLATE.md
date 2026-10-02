## Description
Briefly explain the changes introduced in this pull request and the merchant operational problem it addresses.

## Type of Change
- [ ] ⚡ New operational primitive / MCP tool
- [ ] 🛡️ Security or boundary enhancement (SSRF, PII masking, rate limiting)
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] 🧪 Test suite additions
- [ ] 📝 Documentation update

## Verification & Testing
- [ ] `npm test` passes 100% (40/40 tests)
- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm run test:e2e` passes (48/48 assertions)
- [ ] `npm run test:live` verified against local server

## Security Checklist
- [ ] Zero credentials or customer PII committed
- [ ] Read-only invariants strictly preserved (no state mutation endpoints added)
