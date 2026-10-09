// Re-export the shared domain module so function code can `import ... from "./shared"`.
// tsup bundles this into lib/ at build time.
export * from "../../shared/index";
