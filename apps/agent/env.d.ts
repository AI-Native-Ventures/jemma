declare module 'cloudflare:test' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}

declare module '*.md' {
  const text: string
  export default text
}
