// Vite's `?raw` import used to inline schema.sql into the main bundle.
declare module '*.sql?raw' {
  const sql: string
  export default sql
}
