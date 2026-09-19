import frontend from "./frontend/eslint.config.mjs";

// Root checks cover the isolated preview; the canonical Next repository has its
// own ESLint configuration and is checked independently with `yarn lint`.
export default [
  { ignores: ["hourops/**", "artifacts/**", "test_reports/**", "frontend/node_modules/**", "frontend/build/**", "frontend/public/**", "frontend/plugins/**", "frontend/src/components/ui/**"] },
  ...frontend.filter(config => config.files).map(config => ({
    ...config,
    files: config.files.flatMap(pattern => [pattern, `frontend/${pattern}`]),
  })),
];