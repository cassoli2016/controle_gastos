<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Política de entrega

Todo PR que altera o app bumpa `version` no `package.json` (minor para feature, patch para fix/higiene) e adiciona a entrada correspondente em `lib/changelog.ts` (página /novidades, em linguagem de usuário) no mesmo commit. O teste `tests/changelog.test.ts` trava o sincronismo bump ↔ changelog.
